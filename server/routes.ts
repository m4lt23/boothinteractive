import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, toPublicUser } from "./customAuth";
import { ivsService } from "./ivsService";
import { getStageManager } from "./stageManager";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import liveSessionsRouter, { setWebSocketEmitter, removeCasterFromSessions } from "./liveSessions.js";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Mount live sessions router
  app.use('/api', liveSessionsRouter);

  // Note: Auth routes (register, login, logout, user) are now handled in customAuth.ts

  // Self-promotion to admin (for app owner to bootstrap their account)
  // Only the email matching ADMIN_EMAIL env var can promote themselves
  app.post('/api/promote-to-admin', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const userEmail = req.user.email;
      
      console.log(`[ADMIN_PROMOTION] User ${userEmail} (${userId}) requesting admin promotion`);
      
      // Security: Only allow the designated admin email to self-promote
      const adminEmail = process.env.ADMIN_EMAIL;
      if (!adminEmail) {
        console.error("[ADMIN_PROMOTION] ADMIN_EMAIL environment variable not set");
        return res.status(500).json({ message: "Admin promotion not configured" });
      }
      
      if (userEmail.toLowerCase() !== adminEmail.toLowerCase()) {
        console.warn(`[ADMIN_PROMOTION] Unauthorized promotion attempt by ${userEmail}`);
        return res.status(403).json({ message: "You are not authorized to promote to admin" });
      }
      
      // Update user role to admin in database
      await db
        .update(users)
        .set({ role: 'admin' })
        .where(eq(users.id, userId));
      
      // Update session with new role
      req.user.role = 'admin';
      
      console.log(`[ADMIN_PROMOTION] Successfully promoted ${userEmail} to admin`);
      res.json({ message: 'Successfully promoted to admin', user: req.user });
    } catch (error) {
      console.error("[ADMIN_PROMOTION] Error promoting to admin:", error);
      res.status(500).json({ message: "Failed to promote to admin" });
    }
  });

  // Admin analytics routes
  app.get('/api/admin/stats/users', isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const days = parseInt(req.query.days as string) || 30;
      const stats = await storage.getUserRegistrationStats(days);
      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching user registration stats:", error);
      res.status(500).json({ message: error.message || "Internal server error" });
    }
  });

  app.get('/api/admin/stats/casting', isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const stats = await storage.getCastingStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching casting stats:", error);
      res.status(500).json({ message: error.message || "Internal server error" });
    }
  });

  app.get('/api/admin/stats/platform', isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const stats = await storage.getPlatformMetrics();
      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching platform metrics:", error);
      res.status(500).json({ message: error.message || "Internal server error" });
    }
  });

  app.get('/api/admin/users', isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const users = await storage.getAllUsersWithCastingStats();
      res.json(users);
    } catch (error: any) {
      console.error("Error fetching users with casting stats:", error);
      res.status(500).json({ message: error.message || "Internal server error" });
    }
  });

  // User profile routes
  app.put('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Validate request body
      const profileUpdateSchema = z.object({
        bio: z.string().optional(),
        screenname: z.union([
          z.string()
            .min(3, "Screenname must be at least 3 characters")
            .max(32, "Screenname cannot exceed 32 characters")
            .regex(/^[a-zA-Z0-9_-]+$/, "Screenname can only contain letters, numbers, underscores, and hyphens"),
          z.null(),
        ]).optional(),
      });
      
      const validatedData = profileUpdateSchema.parse(req.body);
      
      // Check if screenname is already taken (if provided and not null) - case insensitive
      if (validatedData.screenname) {
        const existingUser = await db.select().from(users)
          .where(sql`lower(${users.screenname}) = lower(${validatedData.screenname})`)
          .limit(1);
        if (existingUser.length > 0 && existingUser[0].id !== userId) {
          return res.status(409).json({ 
            message: "This screenname is already taken", 
            type: "uniqueness_conflict"
          });
        }
      }
      
      // Update user profile
      await storage.updateUserProfile(userId, validatedData);
      const updatedUser = await storage.getUser(userId);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found after update" });
      }
      
      // Return only safe PublicUser data
      res.json(toPublicUser(updatedUser));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid input", 
          errors: error.errors.map(e => e.message),
          type: "validation_error"
        });
      }
      
      // Handle database unique constraint violations
      if (error && typeof error === 'object' && 'code' in error) {
        const dbError = error as any;
        if (dbError.code === '23505' && dbError.message?.includes('users_screenname_lower_unique')) {
          return res.status(409).json({ 
            message: "This screenname is already taken", 
            type: "uniqueness_conflict"
          });
        }
      }
      
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post('/api/user/request-casting', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // For now, automatically approve casting requests
      // In production, this might go through an approval process
      await storage.enableCasting(userId);
      const updatedUser = await storage.getUser(userId);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found after enabling casting" });
      }
      
      // Return only safe PublicUser data
      res.json({ message: "Casting capabilities enabled", user: toPublicUser(updatedUser) });
    } catch (error) {
      console.error("Error enabling casting:", error);
      res.status(500).json({ message: "Failed to enable casting" });
    }
  });

  app.post('/api/user/agree-caster-warning', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Update the hasAgreedCasterWarning flag
      await db
        .update(users)
        .set({ hasAgreedCasterWarning: true })
        .where(eq(users.id, userId));
      
      // Get updated user data
      const updatedUser = await storage.getUser(userId);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found after update" });
      }
      
      // Update session data
      req.user.hasAgreedCasterWarning = true;
      
      // Return only safe PublicUser data
      res.json({ message: "Caster warning accepted", user: toPublicUser(updatedUser) });
    } catch (error) {
      console.error("Error accepting caster warning:", error);
      res.status(500).json({ message: "Failed to accept caster warning" });
    }
  });

  // IVS streaming routes
  app.post('/api/user/setup-ivs-channel', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!user.canCast) {
        return res.status(403).json({ message: "User does not have casting permissions" });
      }

      // Check if user already has an IVS channel
      if (user.ivsChannelArn) {
        return res.json({
          message: "IVS channel already exists",
          playbackUrl: user.ivsPlaybackUrl,
          hasStreamKey: !!user.ivsStreamKey // Only indicate if stream key exists, don't expose values
          // Note: channelArn, streamKey, and ingestEndpoint are sensitive and not exposed
        });
      }
      
      if (!ivsService.isConfigured()) {
        return res.status(503).json({ 
          message: "IVS service not configured. Please set AWS credentials." 
        });
      }
      
      // Use screenname for channel name
      const channelName = user.screenname || `User ${userId.slice(-8)}`;
      
      // Set up IVS channel
      const channelData = await storage.setupIVSChannel(userId, channelName);
      
      res.json({
        message: "IVS channel created successfully",
        playbackUrl: channelData.playbackUrl,
        hasStreamKey: true // Only indicate that setup was successful
        // Note: channelArn, streamKey, and ingestEndpoint are sensitive and not exposed
      });
    } catch (error) {
      console.error("Error setting up IVS channel:", error);
      res.status(500).json({ message: "Failed to set up IVS channel" });
    }
  });

  // Refresh IVS channel credentials
  app.post('/api/user/refresh-ivs-channel', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!user.canCast) {
        return res.status(403).json({ message: "User does not have casting permissions" });
      }

      if (!ivsService.isConfigured()) {
        return res.status(503).json({ 
          message: "IVS service not configured. Please set AWS credentials." 
        });
      }

      // Use screenname for channel name
      const channelName = user.screenname || `User ${userId.slice(-8)}`;
      
      // Create a fresh IVS channel (this will replace the old one)
      const channelData = await storage.setupIVSChannel(userId, channelName);
      
      console.log(`[ROUTE] IVS channel refreshed for user ${userId.substring(0, 8)}...`);
      
      res.json({
        message: "IVS channel credentials refreshed successfully",
        playbackUrl: channelData.playbackUrl,
        hasStreamKey: true
      });
    } catch (error) {
      console.error("Error refreshing IVS channel:", error);
      res.status(500).json({ message: "Failed to refresh IVS channel credentials" });
    }
  });

  app.get('/api/user/ivs-channel-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        console.warn(`[ROUTE] IVS channel status requested for non-existent user: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!user.ivsChannelArn) {
        console.log(`[ROUTE] User ${userId.substring(0, 8)}... has no IVS channel`);
        return res.json({ hasChannel: false });
      }
      
      console.log(`[ROUTE] Getting IVS channel status for user ${userId.substring(0, 8)}...`);
      
      // Get current stream status from IVS with enhanced logging
      const streamStatus = await ivsService.getStreamStatus(user.ivsChannelArn, { 
        userId: userId,
        validateConsistency: true 
      });
      
      // Perform consistency validation if user has stream credentials
      let consistencyCheck = null;
      if (user.ivsStreamKey && user.ivsIngestEndpoint) {
        console.log(`[ROUTE] Performing consistency check for user ${userId.substring(0, 8)}...`);
        consistencyCheck = await ivsService.validateChannelConsistency(
          user.ivsChannelArn,
          user.ivsStreamKey,
          user.ivsIngestEndpoint,
          userId
        );
        
        if (!consistencyCheck.isValid) {
          console.warn(`[ROUTE] Consistency issues found for user ${userId.substring(0, 8)}:`, consistencyCheck.issues);
        }
      }
      
      // Check if credentials might need refresh
      const needsRefresh = await ivsService.shouldRefreshCredentials(user.ivsChannelArn, userId);
      
      // Enhanced response with debugging information
      const response = {
        hasChannel: true,
        playbackUrl: user.ivsPlaybackUrl, // Public playback URL is safe to expose
        streamStatus,
        // Add debugging information for development (but keep sensitive data private)
        debug: {
          hasStreamKey: !!user.ivsStreamKey,
          hasIngestEndpoint: !!user.ivsIngestEndpoint,
          consistencyValid: consistencyCheck?.isValid ?? null,
          consistencyIssues: consistencyCheck?.issues ?? null,
          needsCredentialRefresh: needsRefresh,
          channelId: user.ivsChannelArn.split('/').pop()?.substring(0, 8) + '...',
          timestamp: new Date().toISOString()
        }
        // Note: channelArn, streamKey, and ingestEndpoint are sensitive and should not be exposed to clients
      };
      
      console.log(`[ROUTE] IVS channel status response for user ${userId.substring(0, 8)}:`, {
        state: streamStatus.state,
        health: streamStatus.health,
        consistencyValid: consistencyCheck?.isValid,
        needsRefresh
      });
      
      res.json(response);
    } catch (error) {
      const userId = req.user?.id;
      console.error(`[ROUTE] Error getting IVS channel status for user ${userId?.substring(0, 8)}:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).json({ 
        message: "Failed to get channel status",
        debug: {
          timestamp: new Date().toISOString(),
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        }
      });
    }
  });

  app.get('/api/user/stream-key', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!user.canCast) {
        return res.status(403).json({ message: "User does not have casting permissions" });
      }
      
      if (!user.ivsStreamKey) {
        return res.status(404).json({ message: "No stream key found. Please set up IVS channel first." });
      }
      
      res.json({
        streamKey: user.ivsStreamKey,
        ingestEndpoint: user.ivsIngestEndpoint
      });
    } catch (error) {
      console.error("Error getting stream key:", error);
      res.status(500).json({ message: "Failed to get stream key" });
    }
  });

  // Caster routes
  app.get('/api/casters', async (req, res) => {
    try {
      // Parse and validate query parameters for filtering
      const filters: {
        league?: string;
        perspective?: "home" | "away" | "neutral";
        mode?: "play-by-play" | "expert-analysis" | "fantasy-focus";
        tones?: ("serious" | "comedy" | "pg13")[];
        isLive?: boolean;
        searchQuery?: string;
      } = {};

      // Validate league
      if (req.query.league) {
        const league = req.query.league as string;
        const validLeagues = ["nfl", "nba", "mlb", "nhl", "college_football", "college_basketball", "soccer"];
        if (!validLeagues.includes(league)) {
          return res.status(400).json({ message: "Invalid league. Must be one of: " + validLeagues.join(", ") });
        }
        filters.league = league;
      }

      // Validate perspective
      if (req.query.perspective) {
        const perspective = req.query.perspective as string;
        if (!["home", "away", "neutral"].includes(perspective)) {
          return res.status(400).json({ message: "Invalid perspective. Must be home, away, or neutral" });
        }
        filters.perspective = perspective as "home" | "away" | "neutral";
      }

      // Validate mode
      if (req.query.mode) {
        const mode = req.query.mode as string;
        if (!["play-by-play", "expert-analysis", "fantasy-focus"].includes(mode)) {
          return res.status(400).json({ message: "Invalid mode. Must be play-by-play, expert-analysis, or fantasy-focus" });
        }
        filters.mode = mode as "play-by-play" | "expert-analysis" | "fantasy-focus";
      }

      // Validate tones (can be array)
      if (req.query.tones) {
        const tonesParam = req.query.tones;
        const tones = Array.isArray(tonesParam) ? tonesParam : [tonesParam];
        const validTones = ["serious", "comedy", "pg13"];
        
        for (const tone of tones) {
          if (!validTones.includes(tone as string)) {
            return res.status(400).json({ message: "Invalid tone. Must be serious, comedy, or pg13" });
          }
        }
        filters.tones = tones as ("serious" | "comedy" | "pg13")[];
      }

      // Validate isLive
      if (req.query.isLive !== undefined) {
        const isLive = req.query.isLive as string;
        if (!["true", "false"].includes(isLive)) {
          return res.status(400).json({ message: "Invalid isLive. Must be true or false" });
        }
        filters.isLive = isLive === "true";
      }

      // Search query
      if (req.query.searchQuery) {
        filters.searchQuery = req.query.searchQuery as string;
      }

      const casters = await storage.getCasters(filters);
      res.json(casters);
    } catch (error) {
      console.error("Error fetching casters:", error);
      res.status(500).json({ message: "Failed to fetch casters" });
    }
  });

  // Event routes
  app.get('/api/events', async (req, res) => {
    try {
      const events = await storage.getEvents();
      res.json(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // Note: /api/events/schedule is handled in liveSessions.ts router

  app.get('/api/events/live', async (req, res) => {
    try {
      // Import the live sessions map from the live sessions module
      const { live } = await import('./liveSessions.js');
      
      const now = Date.now();
      const TTL_MS = 60_000; // Same TTL as in liveSessions.ts (updated for browser throttling)
      const activeEventIds = new Set<string>();
      const eventCasters = new Map<string, any[]>();
      
      // Get all active sessions and group by eventId
      for (const [sessionId, session] of Array.from(live.entries())) {
        if (now - session.lastSeen < TTL_MS) {
          activeEventIds.add(session.eventId);
          
          if (!eventCasters.has(session.eventId)) {
            eventCasters.set(session.eventId, []);
          }
          
          eventCasters.get(session.eventId)!.push({
            id: session.casterId,
            screenname: session.casterName,
            perspective: session.perspective,
            mode: session.mode,
            tones: session.tones,
            isLive: true,
            listenerCount: 0, // TODO: Implement real listener counting
          });
        }
      }
      
      // If no active sessions, return empty array
      if (activeEventIds.size === 0) {
        return res.json([]);
      }
      
      // Get event details for all live events
      const liveEvents = [];
      for (const eventId of Array.from(activeEventIds)) {
        try {
          const event = await storage.getEvent(eventId);
          if (event) {
            // Use the first caster as the primary caster for display
            const casters = eventCasters.get(eventId) || [];
            const primaryCaster = casters[0];
            
            liveEvents.push({
              ...event,
              status: 'live', // Override status to 'live' since we have active sessions
              caster: primaryCaster || null,
              listenerCount: Math.max(1, casters.reduce((sum, c) => sum + (c.listenerCount || 0), 0)), // At least 1 for display
              activeCasters: casters.length,
            });
          }
        } catch (error) {
          console.warn(`Failed to fetch event ${eventId}:`, error);
          // Continue with other events
        }
      }
      
      console.log(`[LIVE EVENTS] Found ${liveEvents.length} live events from ${activeEventIds.size} active sessions`);
      res.json(liveEvents);
    } catch (error) {
      console.error("Error fetching live events:", error);
      res.status(500).json({ message: "Failed to fetch live events" });
    }
  });

  app.get('/api/events/:eventId', async (req, res) => {
    console.log(`[DEBUG] Individual event route hit for eventId: ${req.params.eventId}`);
    try {
      const { eventId } = req.params;
      
      // Query database for the event
      const eventResult = await storage.getEvent(eventId);
      console.log(`[DEBUG] Database result for eventId "${eventId}":`, eventResult);
      
      if (!eventResult) {
        console.log(`[DEBUG] Event not found in database for eventId: ${eventId}`);
        return res.status(404).json({ message: "Event not found" });
      }

      // Transform to expected format for Broadcaster
      const transformed = {
        id: eventResult.id,
        eventId: eventResult.id,
        title: eventResult.title,
        homeTeamId: eventResult.homeTeamId,
        awayTeamId: eventResult.awayTeamId,
        homeTeam: eventResult.homeTeam,
        awayTeam: eventResult.awayTeam,
        homeTeamData: eventResult.homeTeamData,
        awayTeamData: eventResult.awayTeamData,
        startAt: eventResult.startTime.toISOString(),
        sport: eventResult.sport,
        status: eventResult.status
      };
      
      console.log(`[DEBUG] Returning transformed event:`, transformed);
      res.json(transformed);
    } catch (error) {
      console.error("Error fetching event:", error);
      res.status(500).json({ message: "Failed to fetch event" });
    }
  });

  app.get('/api/events/:eventId/casters', async (req, res) => {
    try {
      const { eventId } = req.params;
      
      // Validate eventId exists
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      // Parse and validate query parameters
      const filters: {
        perspective?: "home" | "away" | "neutral";
        mode?: "play-by-play" | "expert-analysis" | "fantasy-focus";
        tones?: ("serious" | "comedy" | "pg13")[];
        isLive?: boolean;
      } = {};
      
      // Validate perspective
      if (req.query.perspective) {
        const perspective = req.query.perspective as string;
        if (!["home", "away", "neutral"].includes(perspective)) {
          return res.status(400).json({ message: "Invalid perspective. Must be home, away, or neutral" });
        }
        filters.perspective = perspective as "home" | "away" | "neutral";
      }
      
      // Validate mode
      if (req.query.mode) {
        const mode = req.query.mode as string;
        if (!["play-by-play", "expert-analysis", "fantasy-focus"].includes(mode)) {
          return res.status(400).json({ message: "Invalid mode. Must be play-by-play, expert-analysis, or fantasy-focus" });
        }
        filters.mode = mode as "play-by-play" | "expert-analysis" | "fantasy-focus";
      }
      
      // Validate tones (can be array)
      if (req.query.tones) {
        const tonesParam = req.query.tones;
        const tones = Array.isArray(tonesParam) ? tonesParam : [tonesParam];
        const validTones = ["serious", "comedy", "pg13"];
        
        for (const tone of tones) {
          if (!validTones.includes(tone as string)) {
            return res.status(400).json({ message: "Invalid tone. Must be serious, comedy, or pg13" });
          }
        }
        filters.tones = tones as ("serious" | "comedy" | "pg13")[];
      }
      
      // Validate isLive
      if (req.query.isLive !== undefined) {
        const isLive = req.query.isLive as string;
        if (!["true", "false"].includes(isLive)) {
          return res.status(400).json({ message: "Invalid isLive. Must be true or false" });
        }
        filters.isLive = isLive === "true";
      }
      
      const eventCasters = await storage.getEventCasters(eventId, filters);
      res.json(eventCasters);
    } catch (error) {
      console.error("Error fetching event casters:", error);
      res.status(500).json({ message: "Failed to fetch event casters" });
    }
  });

  app.post('/api/events', isAuthenticated, async (req: any, res) => {
    try {
      const eventData = { 
        ...req.body, 
        casterId: req.user.id,
        startTime: new Date(req.body.startTime) // Convert ISO string to Date object
      };
      const event = await storage.createEvent(eventData);
      res.json(event);
    } catch (error) {
      console.error("Error creating event:", error);
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  // Team routes
  app.get('/api/teams', async (req, res) => {
    try {
      const teams = await storage.getTeams();
      res.json(teams);
    } catch (error) {
      console.error("Error fetching teams:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // PARTNERSHIP ROUTES
  
  // Create a partnership invitation
  app.post('/api/partnerships/invitations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const invitationData = {
        ...req.body,
        fromCasterId: userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      };
      const invitation = await storage.createPartnershipInvitation(invitationData);
      res.json(invitation);
    } catch (error) {
      console.error("Error creating partnership invitation:", error);
      res.status(400).json({ message: "Failed to create invitation" });
    }
  });

  // Get partnership invitations for user
  app.get('/api/partnerships/invitations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const invitations = await storage.getInvitationsByUserId(userId);
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ message: "Failed to get invitations" });
    }
  });

  // Accept/decline partnership invitation
  app.patch('/api/partnerships/invitations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user.id;
      
      // Verify user is the recipient of the invitation
      const invitation = await storage.getInvitationById(id);
      if (!invitation || invitation.toCasterId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const updatedInvitation = await storage.updateInvitationStatus(id, status);
      
      // If accepted, create the partnership
      if (status === "accepted" && updatedInvitation && invitation) {
        const partnershipData = {
          caster1Id: invitation.fromCasterId,
          caster2Id: invitation.toCasterId,
          name: invitation.partnershipName,
        };
        await storage.createPartnership(partnershipData);
      }
      
      res.json(updatedInvitation);
    } catch (error) {
      console.error("Error updating invitation:", error);
      res.status(400).json({ message: "Failed to update invitation" });
    }
  });

  // Get user's partnerships
  app.get('/api/partnerships', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const partnerships = await storage.getPartnershipsByUserId(userId);
      res.json(partnerships);
    } catch (error) {
      console.error("Error fetching partnerships:", error);
      res.status(500).json({ message: "Failed to get partnerships" });
    }
  });

  // Create partnership event (co-casting for a specific event)
  app.post('/api/partnerships/:partnershipId/events', isAuthenticated, async (req: any, res) => {
    try {
      const { partnershipId } = req.params;
      const userId = req.user.id;
      
      // Verify user is part of the partnership
      const partnership = await storage.getPartnershipById(partnershipId);
      if (!partnership || (partnership.caster1Id !== userId && partnership.caster2Id !== userId)) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const partnershipEventData = {
        ...req.body,
        partnershipId,
      };
      const partnershipEvent = await storage.createPartnershipEvent(partnershipEventData);
      res.json(partnershipEvent);
    } catch (error) {
      console.error("Error creating partnership event:", error);
      res.status(400).json({ message: "Invalid partnership event data" });
    }
  });

  // Get partnership events for an event
  app.get('/api/events/:eventId/partnerships', async (req, res) => {
    try {
      const { eventId } = req.params;
      const partnershipEvents = await storage.getPartnershipEventsByEventId(eventId);
      res.json(partnershipEvents);
    } catch (error) {
      console.error("Error fetching partnership events:", error);
      res.status(500).json({ message: "Failed to get partnership events" });
    }
  });

  // LINK-BASED CO-CASTING INVITATIONS
  
  // Generate a co-casting invite link
  app.post('/api/streaming/invite-link', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { eventId, streamId } = req.body;
      
      // Create a temporary invite token (in production, store this in database with expiration)
      const inviteToken = `invite_${streamId}_${Date.now()}`;
      const inviteLink = `${req.protocol}://${req.get('host')}/join-stream/${inviteToken}`;
      
      // TODO: Store invite token in database with expiration
      // For now, return the generated link
      res.json({ 
        inviteLink,
        inviteToken,
        eventId,
        streamId,
        invitedBy: userId
      });
    } catch (error) {
      console.error("Error generating invite link:", error);
      res.status(500).json({ message: "Failed to generate invite link" });
    }
  });

  // Join a stream via invite link
  app.get('/api/streaming/join/:inviteToken', async (req, res) => {
    try {
      const { inviteToken } = req.params;
      
      // TODO: Validate invite token and get stream details from database
      // For now, return mock stream details
      const streamDetails = {
        eventId: inviteToken.split('_')[1] || 'default-event',
        streamId: inviteToken.split('_')[1] || 'default-stream',
        inviteToken,
        status: 'active'
      };
      
      res.json(streamDetails);
    } catch (error) {
      console.error("Error joining stream:", error);
      res.status(500).json({ message: "Failed to join stream" });
    }
  });

  // CO-HOST INVITE ENDPOINTS

  // Peek at invite details without consuming it
  app.get('/api/cohost/invites/peek', async (req, res) => {
    try {
      const code = req.query.code as string;
      
      if (!code) {
        return res.status(400).json({ valid: false, reason: 'missing_code' });
      }

      const result = await storage.peekInviteByCode(code);
      res.json(result);
    } catch (error) {
      console.error('[ROUTE] Error peeking invite:', error);
      res.status(500).json({ valid: false, reason: 'server_error' });
    }
  });

  // Consume co-host invite and get participant token
  app.post('/api/cohost/invites/consume', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({ success: false, reason: 'missing_code' });
      }

      console.log(`[ROUTE] Consuming invite ${code} for user ${userId.substring(0, 8)}...`);

      const result = await storage.consumeInvite(code, userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('[ROUTE] Error consuming invite:', error);
      res.status(500).json({ success: false, reason: 'server_error' });
    }
  });

  // LISTENER TOKEN ENDPOINT

  // Get viewer/listener token for an event session
  app.get('/api/sessions/:sessionId/viewerToken', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      console.log(`[ROUTE] Generating viewer token for session: ${sessionId.split(':')[0]}`);

      // Parse sessionId to get eventId and hostUserId
      // Format: eventId:hostUserId
      const [eventId, hostUserId] = sessionId.split(':');
      
      if (!eventId || !hostUserId) {
        return res.status(400).json({ error: 'Invalid session ID format' });
      }

      // Get the Stage ARN for this session
      const stageManager = getStageManager();
      const stageInfo = await stageManager.getOrCreateStage(eventId, hostUserId, 'host');
      
      if (!stageInfo || !stageInfo.stageArn) {
        return res.status(404).json({ error: 'Stage not found for this session' });
      }

      // Create a listener token with SUBSCRIBE-only capability
      // Use a temporary ID for unauthenticated listeners
      const listenerId = `listener-${Date.now()}`;
      const { participantToken } = await ivsService.createParticipantToken(
        stageInfo.stageArn,
        sessionId,
        listenerId,
        'listener'  // This ensures SUBSCRIBE-only capability
      );

      console.log(`[ROUTE] Created viewer token for session ${sessionId.split(':')[0]}, listener: ${listenerId.slice(-8)}`);

      res.json({ token: participantToken });
    } catch (error) {
      console.error('[ROUTE] Error generating viewer token:', error);
      res.status(500).json({ error: 'Failed to generate viewer token' });
    }
  });

  // Create or update event caster with settings
  app.post('/api/events/:eventId/casters', isAuthenticated, async (req: any, res) => {
    try {
      const { eventId } = req.params;
      const { perspective, mode, tones, isLive } = req.body;
      const userId = req.user.id;
      
      // Validate required fields (perspective is optional, will default to neutral)
      if (!mode || !tones || !Array.isArray(tones)) {
        return res.status(400).json({ 
          message: "Missing required fields: mode and tones are required" 
        });
      }
      
      // Validate with Zod schema
      const createEventCasterSchema = z.object({
        perspective: z.enum(['home', 'away', 'neutral']).optional().default('neutral'),
        mode: z.enum(['play-by-play', 'expert-analysis', 'fantasy-focus']),
        tones: z.array(z.enum(['serious', 'comedy', 'pg13'])).min(1),
        isLive: z.boolean().optional()
      });
      
      const validationResult = createEventCasterSchema.safeParse({
        perspective,
        mode,
        tones,
        isLive
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid input", 
          errors: validationResult.error.errors 
        });
      }
      
      // Use validated data with default values
      const validatedData = validationResult.data;
      
      // Create or update event caster (upsert to prevent duplicates)
      const eventCaster = await storage.upsertEventCaster({
        eventId,
        casterId: userId,
        perspective: validatedData.perspective,
        mode: validatedData.mode,
        tones: validatedData.tones,
        isLive: validatedData.isLive || false
      });
      
      res.json(eventCaster);
    } catch (error) {
      console.error("Error creating/updating event caster:", error);
      res.status(500).json({ message: "Failed to create/update event caster" });
    }
  });

  // Update caster live status
  app.patch('/api/events/:eventId/casters/:casterId/live-status', isAuthenticated, async (req: any, res) => {
    try {
      const { eventId, casterId } = req.params;
      const { isLive } = req.body;
      const userId = req.user.id;
      
      // Verify the user is the caster
      if (casterId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      // Validate request body
      const updateLiveStatusSchema = z.object({
        isLive: z.boolean()
      });
      
      const validationResult = updateLiveStatusSchema.safeParse({ isLive });
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid input", 
          errors: validationResult.error.errors 
        });
      }
      
      // If trying to go live, verify IVS stream is actually broadcasting
      if (isLive) {
        try {
          const ivsStatus = await ivsService.getStreamStatus(userId);
          console.log('[ROUTE] Verifying IVS stream status before marking live:', {
            userId,
            ivsStatus: ivsStatus.state,
            requestedLive: isLive
          });
          
          // Only allow isLive=true if IVS stream is actually LIVE
          if (ivsStatus.state !== 'LIVE') {
            console.log('[ROUTE] Rejecting live status - IVS stream not broadcasting');
            return res.status(400).json({ 
              message: "Cannot go live - broadcast stream is not active. Please start broadcasting first.",
              streamStatus: ivsStatus.state
            });
          }
          console.log('[ROUTE] IVS stream confirmed LIVE, allowing live status update');
        } catch (error) {
          console.log('[ROUTE] IVS stream check failed, rejecting live status:', error);
          return res.status(400).json({ 
            message: "Cannot go live - unable to verify broadcast stream is active",
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      // Update the event caster's live status in database
      const updatedEventCaster = await storage.updateEventCasterLiveStatus(eventId, userId, isLive);
      
      if (!updatedEventCaster) {
        // Event caster record not found (e.g., database was reseeded, event deleted)
        // Return success anyway since the broadcast ending is what matters
        console.log(`[ROUTE] Event caster record not found for user ${userId} in event ${eventId} - likely due to database changes`);
        return res.json({ 
          message: "Live status updated successfully", 
          note: "Event caster record not found - this can happen after database changes"
        });
      }
      
      res.json(updatedEventCaster);
    } catch (error) {
      console.error("Error updating live status:", error);
      res.status(500).json({ message: "Failed to update live status" });
    }
  });

  const httpServer = createServer(app);

  // Enhanced WebSocket server for real-time chat with authentication and rate limiting
  interface AuthenticatedWebSocket extends WebSocket {
    userId?: string;
    eventId?: string;
    isAuthenticated?: boolean;
    user?: { id: string; screenname: string; avatarUrl: string | null };
  }

  // Store rooms as Map<eventId, Set<WebSocket>>
  const chatRooms = new Map<string, Set<AuthenticatedWebSocket>>();

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Set up caster update emitter for liveSessions
  setWebSocketEmitter((eventId: string, message: any) => {
    const room = chatRooms.get(eventId);
    if (room) {
      room.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });
    }
  });
  
  // Helper function to create public user object (only safe fields)
  const toPublicUser = (u: any) => ({
    id: u.id,
    screenname: u.screenname,               // <- the only display name
    avatarUrl: u.profileImageUrl ?? null,   // optional
  });

  // Helper function to authenticate WebSocket connection
  async function authenticateWebSocket(ws: AuthenticatedWebSocket, token: string): Promise<boolean> {
    try {
      // This is a simplified authentication - in production, you'd verify the token properly
      // For now, we'll assume the token is the user ID from the session
      if (token && token.length > 0) {
        const user = await storage.getUser(token);
        if (user) {
          ws.userId = user.id;
          ws.isAuthenticated = true;
          ws.user = toPublicUser(user);           // <-- ADD THIS LINE
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('WebSocket authentication error:', error);
      return false;
    }
  }

  // Helper function to broadcast message to event room
  function broadcastToRoom(eventId: string, message: any, excludeWs?: AuthenticatedWebSocket) {
    const room = chatRooms.get(eventId);
    if (room) {
      room.forEach((client) => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });
    }
  }

  // Helper function to join a chat room
  function joinRoom(ws: AuthenticatedWebSocket, eventId: string) {
    // Leave previous room if any
    if (ws.eventId) {
      leaveRoom(ws, ws.eventId);
    }

    // Join new room
    ws.eventId = eventId;
    if (!chatRooms.has(eventId)) {
      chatRooms.set(eventId, new Set());
    }
    chatRooms.get(eventId)!.add(ws);
    
    console.log(`User ${ws.userId} joined room ${eventId}`);
  }

  // Helper function to leave a chat room
  function leaveRoom(ws: AuthenticatedWebSocket, eventId: string) {
    const room = chatRooms.get(eventId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        chatRooms.delete(eventId);
      }
    }
    console.log(`User ${ws.userId} left room ${eventId}`);
  }
  
  wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
    console.log('[WS] connect', req.url);
    
    // Send initial authentication request
    ws.send(JSON.stringify({
      type: 'auth_required',
      message: 'Please authenticate to use chat'
    }));
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle authentication first
        if (!ws.isAuthenticated && message.type !== 'authenticate') {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Authentication required'
          }));
          return;
        }
        
        // Handle different message types
        switch (message.type) {
          case 'authenticate': {
            const { token } = message;
            const isAuthenticated = await authenticateWebSocket(ws, token);
            
            if (isAuthenticated) {
              // Load full user once so we can attach public identity to the socket
              const u = await storage.getUser(ws.userId!);
              ws.user = toPublicUser(u);            // <- attach public user object

              ws.send(JSON.stringify({
                type: 'authenticated',
                userId: ws.userId,
                user: ws.user,                      // optional, helpful for clients
              }));
            } else {
              ws.send(JSON.stringify({
                type: 'auth_failed',
                message: 'Invalid authentication token'
              }));
              ws.close();
            }
            break;
          }

          case 'join_event':
            const { eventId } = message;
            
            if (!eventId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Event ID is required'
              }));
              return;
            }

            // Verify event exists
            const event = await storage.getEvent(eventId);
            if (!event) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Event not found'
              }));
              return;
            }

            joinRoom(ws, eventId);
            
            // Send recent chat messages
            const recentMessages = await storage.getChatMessages(eventId, undefined, {
              limit: 20,
              onlyVisible: true
            });

            // Keep only the safe fields in recentMessages (no spreading to avoid leaks)
            const recentSafe = recentMessages.map((m: any) => ({
              id: m.id,
              eventId: m.eventId,
              casterId: m.casterId ?? null,
              message: m.message,
              type: m.type,                           // e.g., "chat"
              createdAt: m.createdAt,
              user: {
                id: m.user?.id,
                screenname: m.user?.screenname ?? m.user?.username ?? "user",
                avatarUrl: m.user?.avatarUrl ?? m.user?.profileImageUrl ?? null,
              },
            }));

            ws.send(JSON.stringify({
              type: 'joined_event',
              eventId,
              recentMessages: recentSafe.reverse() // Reverse to show oldest first
            }));
            
            // Notify room about new user
            broadcastToRoom(eventId, {
              type: 'user_joined',
              eventId,
              user: {
                id: ws.user?.id ?? ws.userId,
                screenname: ws.user?.screenname ?? undefined,
                avatarUrl: ws.user?.avatarUrl ?? null,
              }
            }, ws);
            break;

          case 'send_message':
            if (!ws.eventId || !ws.userId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Must join an event first'
              }));
              return;
            }

            const { message: text, casterId } = message;
            
            if (!text || text.trim().length === 0) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Message text is required'
              }));
              return;
            }

            if (text.length > 500) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Message too long (max 500 characters)'
              }));
              return;
            }

            // Check rate limiting
            const rateLimitCheck = await storage.checkRateLimit(ws.userId, ws.eventId);
            if (!rateLimitCheck.allowed) {
              ws.send(JSON.stringify({
                type: 'rate_limited',
                message: 'Please wait before sending another message',
                nextAllowedTime: rateLimitCheck.nextAllowedTime
              }));
              return;
            }

            // Save message to database
            try {
              const chatMessage = await storage.createChatMessage({
                eventId: ws.eventId,
                casterId: casterId || null,
                userId: ws.userId,
                message: text.trim(),
                type: 'chat'
              });

              // Get user info for broadcasting
              const user = await storage.getUser(ws.userId);
              
              // Broadcast message to all clients in the room
              const broadcastMessage = {
                type: 'new_message',
                message: {
                  id: chatMessage.id,
                  eventId: chatMessage.eventId,
                  casterId: chatMessage.casterId,
                  userId: chatMessage.userId,
                  message: chatMessage.message,
                  type: chatMessage.type,
                  createdAt: chatMessage.createdAt,
                  user: {
                    id: ws.user?.id ?? user?.id,
                    screenname: ws.user?.screenname ?? user?.screenname ?? 'user',
                    avatarUrl: ws.user?.avatarUrl ?? user?.profileImageUrl ?? null,
                    // DO NOT include firstName/lastName/username/email
                  },
                }
              };

              // Send to all clients including sender
              broadcastToRoom(ws.eventId, broadcastMessage);
              const count = chatRooms.get(ws.eventId)?.size ?? 0;
              
            } catch (error) {
              console.error('Error saving chat message:', error);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to send message'
              }));
            }
            break;

          case 'sync_offset':
            // Handle audio sync offset updates
            if (ws.eventId) {
              broadcastToRoom(ws.eventId, {
                type: 'sync_updated',
                offset: message.offset,
                userId: ws.userId
              }, ws);
            }
            break;

          case 'ping':
            // Respond to heartbeat ping with pong
            ws.send(JSON.stringify({
              type: 'pong',
              timestamp: Date.now()
            }));
            break;

          default:
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Unknown message type'
            }));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log('[WS] close', code, reason.toString());
      if (ws.eventId) {
        leaveRoom(ws, ws.eventId);
        
        // Notify room about user leaving
        broadcastToRoom(ws.eventId, {
          type: 'user_left',
          eventId: ws.eventId,
          userId: ws.userId
        });
        
        // Check if the disconnecting user is a caster and remove them from all sessions
        if (ws.userId) {
          removeCasterFromSessions(ws.userId, 'websocket_disconnect');
        }
      }
    });

    ws.on('error', (error) => {
      console.log('[WS] error', error?.message);
    });
  });

  return httpServer;
}
