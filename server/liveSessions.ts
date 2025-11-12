import express from "express";
import { isAuthenticated } from "./customAuth.js";
import { IVSRealTimeClient, CreateParticipantTokenCommand, GetStageCommand } from '@aws-sdk/client-ivs-realtime';
import { nanoid } from 'nanoid';
import { storage } from "./storage.js";
import { db } from "./db.js";
import { events, teams, invites } from "@shared/schema.js";
import { eq, sql, desc } from "drizzle-orm";
import { getStageManager } from "./stageManager.js";

// Function to extract region from IVS Stage ARN
function getRegionFromStageArn(stageArn: string): string {
  // Format: arn:aws:ivs:us-east-1:123456789012:stage/abc123...
  const arnParts = stageArn.split(':');
  return arnParts[3] || process.env.AWS_REGION || 'us-east-1';
}

// Initialize IVS Real-Time client - will be recreated per request with correct region

// Caster interface for type safety
interface SessionCaster {
  id: string;
  name: string;
  role: 'host' | 'cohost' | 'guest';
  joinedAt: number;
}

// In-memory storage for live sessions
export const live = new Map<string, {
  eventId: string;
  casterId: string;
  casterName: string;
  perspective: string;
  mode: string;
  tones: string[];
  stageArn?: string;
  startedAt: number;
  lastSeen: number;
  version: number; // Monotonic version for caster updates
  casters: SessionCaster[]; // Array of active casters
}>(); 

const TTL_MS = 60_000; // consider a session live if heartbeat <60s old (survive browser throttling)
const CASTER_HEARTBEAT_TIMEOUT_MS = 20_000; // 20 seconds grace period for caster heartbeats
const router = express.Router();

// Privacy-safe name resolution utility
function getDisplayName(user: any): string {
  // Use displayName or username, fall back to User-#### pattern
  if (user.displayName) return user.displayName;
  if (user.screenname) return user.screenname;
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  if (user.firstName) return user.firstName;
  
  // Generate stable fallback using last 4 chars of user ID
  const suffix = user.id?.slice(-4) || Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `User-${suffix}`;
}

// WebSocket caster update emitter - will be set by routes.ts
let websocketEmitter: ((eventId: string, message: any) => void) | null = null;

export function setWebSocketEmitter(emitter: (eventId: string, message: any) => void) {
  websocketEmitter = emitter;
}

// Emit caster update event to all participants in the session
function emitCasterUpdate(sessionId: string, session: any) {
  if (!websocketEmitter) return;
  
  const casterUpdateEvent = {
    type: 'session.casters.updated',
    sessionId,
    version: session.version,
    casters: session.casters,
    timestamp: new Date().toISOString()
  };
  
  console.log(`[CASTERS] Broadcasting update for session ${sessionId}, version ${session.version}:`, session.casters);
  
  // Broadcast to the event room
  websocketEmitter(session.eventId, casterUpdateEvent);
}

// Helper function to add caster to session and emit update
function addCasterToSession(sessionId: string, userId: string, userName: string, role: 'host' | 'cohost' | 'guest') {
  const session = live.get(sessionId);
  if (!session) return null;
  
  // Dedupe by userId
  const existingIndex = session.casters.findIndex(c => c.id === userId);
  if (existingIndex >= 0) {
    console.log(`[CASTERS] User ${userId} already in session ${sessionId}, ignoring duplicate`);
    return session;
  }
  
  // Add new caster
  const newCaster: SessionCaster = {
    id: userId,
    name: userName,
    role,
    joinedAt: Date.now()
  };
  
  session.casters.push(newCaster);
  session.version += 1; // Increment version
  
  live.set(sessionId, session);
  
  // Emit update
  emitCasterUpdate(sessionId, session);
  
  return session;
}

// Helper function to remove caster from session and emit update
function removeCasterFromSession(sessionId: string, userId: string) {
  const session = live.get(sessionId);
  if (!session) return null;
  
  const initialLength = session.casters.length;
  session.casters = session.casters.filter(c => c.id !== userId);
  
  if (session.casters.length < initialLength) {
    session.version += 1; // Increment version
    live.set(sessionId, session);
    
    // Emit update
    emitCasterUpdate(sessionId, session);
    
    console.log(`[CASTERS] Removed user ${userId} from session ${sessionId}, version ${session.version}`);
  }
  
  return session;
}

// Remove caster from all sessions when they disconnect
export function removeCasterFromSessions(userId: string, reason: string) {
  console.log(`[CASTER:DISCONNECT] Removing user ${userId} from all sessions (reason: ${reason})`);
  
  let removedCount = 0;
  for (const [sessionId, session] of Array.from(live.entries())) {
    if (session.casters) {
      const initialLength = session.casters.length;
      session.casters = session.casters.filter((c: SessionCaster) => c.id !== userId);
      
      if (session.casters.length !== initialLength) {
        // Caster was removed, increment version and emit update
        session.version = (session.version || 0) + 1;
        emitCasterUpdate(sessionId, session);
        removedCount++;
        
        console.log(`[CASTER:REMOVE] Removed ${userId} from session ${sessionId}, remaining: ${session.casters.length}`);
        
        // If the removed caster was the host (only caster), end the session
        if (session.casters.length === 0) {
          console.log(`[SESSION:END] Session ${sessionId} ended - no casters remaining`);
          live.delete(sessionId);
        }
      }
    }
  }
  
  console.log(`[CASTER:DISCONNECT] Removed user ${userId} from ${removedCount} sessions`);
}

// Heartbeat timeout detection - remove inactive casters
function cleanupInactiveCasters() {
  const now = Date.now();
  let totalRemovedCount = 0;
  
  for (const [sessionId, session] of Array.from(live.entries())) {
    if (!session.casters || session.casters.length === 0) continue;
    
    const initialLength = session.casters.length;
    const activeThreshold = now - CASTER_HEARTBEAT_TIMEOUT_MS;
    
    // Remove casters that haven't been seen recently (except the host)
    session.casters = session.casters.filter((caster: SessionCaster) => {
      // Host gets special treatment - use session lastSeen if available
      if (caster.role === 'host') {
        const lastSeen = session.lastSeen || caster.joinedAt || 0;
        return lastSeen > activeThreshold;
      }
      
      // For co-hosts and guests, they need their own heartbeat mechanism
      // For now, we'll be lenient and not remove them via heartbeat
      // This can be enhanced when we add caster-specific heartbeat tracking
      return true;
    });
    
    if (session.casters.length !== initialLength) {
      session.version = (session.version || 0) + 1;
      emitCasterUpdate(sessionId, session);
      const removedCount = initialLength - session.casters.length;
      totalRemovedCount += removedCount;
      
      console.log(`[CASTER:HEARTBEAT_TIMEOUT] Removed ${removedCount} inactive casters from session ${sessionId}`);
      
      // If no casters remain, end the session
      if (session.casters.length === 0) {
        console.log(`[SESSION:END] Session ${sessionId} ended - no active casters`);
        live.delete(sessionId);
      }
    }
  }
  
  if (totalRemovedCount > 0) {
    console.log(`[CASTER:CLEANUP] Removed ${totalRemovedCount} inactive casters total`);
  }
}

// Start periodic cleanup for inactive casters (every 10 seconds)
setInterval(cleanupInactiveCasters, 10_000);

// Backend hardening: Decode all sessionId path params to handle URL encoding (%3A -> :)
router.param('sessionId', (req, _res, next, id) => {
  try {
    req.params.sessionId = decodeURIComponent(id);
  } catch {
    // if already decoded or bad input, keep as-is
    req.params.sessionId = id;
  }
  next();
});

// Metadata validation - MUST match database enum values in schema.ts
const MODE = new Set(['play-by-play', 'expert-analysis', 'fantasy-focus']);
const TONE = new Set(['serious', 'comedy', 'pg13']);
const PERSP = new Set(['home', 'away', 'neutral']);

function sanitizeMeta({ mode, perspective, tones }: any) {
  return {
    mode: MODE.has(mode) ? mode : undefined,
    perspective: PERSP.has(perspective) ? perspective : undefined,
    tones: Array.isArray(tones) ? (tones as string[]).filter((t) => TONE.has(t)) : [],
  };
}

// Health check endpoint
router.get("/health", (req, res) => res.send("ok"));

// Debug endpoint - AWS connectivity and config
router.get("/debug/aws", async (req, res) => {
  try {
    const region = process.env.AWS_REGION;
    const stageArn = process.env.IVS_STAGE_ARN;
    
    if (!region || !stageArn) {
      return res.status(500).json({ 
        ok: false, 
        error: "Missing environment variables",
        region: region || "missing",
        stageArn: stageArn ? "set" : "missing"
      });
    }

    const ivsrt = new IVSRealTimeClient({ region });
    
    // Test stage existence
    await ivsrt.send(new GetStageCommand({ arn: stageArn }));
    
    res.json({
      ok: true,
      region,
      stageArn,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    res.status(500).json({ 
      ok: false, 
      name: e?.name, 
      message: e?.message,
      region: process.env.AWS_REGION,
      stageArn: process.env.IVS_STAGE_ARN ? "set" : "missing"
    });
  }
});

// Debug endpoint - current live sessions
router.get("/debug/live", (req, res) => {
  const now = Date.now();
  const sessions = [];
  
  for (const [id, session] of Array.from(live.entries())) {
    sessions.push({
      id,
      eventId: session.eventId,
      casterId: session.casterId,
      casterName: session.casterName,
      stageArn: session.stageArn,
      lastSeen: session.lastSeen,
      age: now - session.lastSeen,
      isStale: now - session.lastSeen > TTL_MS,
      startedAt: session.startedAt
    });
  }
  
  res.json({
    totalSessions: sessions.length,
    activeSessions: sessions.filter(s => !s.isStale).length,
    staleSessions: sessions.filter(s => s.isStale).length,
    sessions,
    currentEnvArn: process.env.IVS_STAGE_ARN,
    timestamp: new Date().toISOString()
  });
});

// Start a new live session
router.post("/sessions/start", express.json(), isAuthenticated, async (req: any, res) => {
  try {
    console.log("[START SESSION] body=", req.body);
    const { eventId, perspective, mode, tones } = req.body;
    const casterId = req.user.id;
    const casterName = getDisplayName(req.user);
    
    if (!eventId) {
      return res.status(400).json({ message: "Missing required fields: eventId" });
    }
    
    // Server guard (keep data clean) - MUST match database enum values
    if (!['home','away','neutral'].includes(perspective)) {
      return res.status(400).json({ message: 'perspective is required (home|away|neutral)' });
    }
    if (!['play-by-play','expert-analysis','fantasy-focus'].includes(mode)) {
      return res.status(400).json({ message: 'mode is required (play-by-play|expert-analysis|fantasy-focus)' });
    }
    if (!Array.isArray(tones) || tones.length < 1) {
      return res.status(400).json({ message: 'at least one tone is required' });
    }
    
    const meta = sanitizeMeta(req.body);
    
    // Create unique session ID
    const sessionId = `${eventId}:${casterId}:${Date.now()}`;
    const now = Date.now();
    
    // Get or create unique IVS Stage for this host on this event
    let stageArn: string;
    try {
      const stageManager = getStageManager();
      const stage = await stageManager.getOrCreateStage(String(eventId), casterId, casterName);
      stageArn = stage.stageArn;
      
      console.log(`[SESSIONS] Created session with unique stage:`, {
        sessionId,
        stageKey: stage.stageKey,
        stageArn: stageArn.substring(stageArn.length - 20), // Last 20 chars
        caster: casterName,
        eventId
      });
    } catch (error) {
      console.error(`[SESSIONS] ERROR: Failed to create/get stage for host ${casterId} on event ${eventId}:`, error);
      return res.status(500).json({ 
        message: "Failed to create IVS Stage for broadcast",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
    
    // Store session in memory with version and initial caster
    live.set(sessionId, { 
      eventId: String(eventId), 
      casterId, 
      casterName,
      ...meta,
      stageArn,
      startedAt: now, 
      lastSeen: now,
      version: 1, // Start with version 1
      casters: [{
        id: casterId,
        name: casterName,
        role: 'host',
        joinedAt: now
      }]
    });
    
    console.log(`[LIVE SESSIONS] Started session ${sessionId} for caster ${casterName} on event ${eventId}`);
    console.log(`[LIVE SESSIONS] Active sessions: ${live.size}`);
    
    // Create/update event_casters database record so share links work
    try {
      await storage.upsertEventCaster({
        eventId: String(eventId),
        casterId,
        perspective: meta.perspective as 'home' | 'away' | 'neutral',
        mode: meta.mode as 'play-by-play' | 'expert-analysis' | 'fantasy-focus',
        tones: meta.tones as ('serious' | 'comedy' | 'pg13')[],
        isLive: true
      });
      console.log(`[LIVE SESSIONS] Created/updated event_casters record for ${casterName}`);
    } catch (dbError) {
      console.error(`[LIVE SESSIONS] Warning: Failed to create event_casters record:`, dbError);
      // Don't fail the session start if database update fails
    }
    
    res.status(201).json({ sessionId });
  } catch (error) {
    console.error("Error starting live session:", error);
    res.status(500).json({ message: "Failed to start live session" });
  }
});

// Heartbeat to keep session alive
router.post("/sessions/:sessionId/heartbeat", express.json(), isAuthenticated, async (req: any, res) => {
  try {
    const { sessionId } = req.params;
    const casterId = req.user.id;
    
    const session = live.get(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }
    
    // Verify session belongs to this caster
    if (session.casterId !== casterId) {
      return res.status(403).json({ message: "Unauthorized - session belongs to different caster" });
    }
    
    // Update last seen timestamp
    session.lastSeen = Date.now();
    live.set(sessionId, session);
    
    res.sendStatus(204);
  } catch (error) {
    console.error("Error updating heartbeat:", error);
    res.status(500).json({ message: "Failed to update heartbeat" });
  }
});

// Get viewer token for joining a live session
router.get('/sessions/:sessionId/viewerToken', isAuthenticated, async (req: any, res) => {
  try {
    const { sessionId } = req.params;
    const session = live.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not live' });
    }
    
    // Check if session is still active
    const now = Date.now();
    if (now - session.lastSeen > TTL_MS) {
      return res.status(404).json({ message: 'Session expired' });
    }
    
    // Use the session's unique stage ARN (created per host)
    const stageArn = session.stageArn;
    if (!stageArn) {
      console.error(`[VIEWER TOKEN] ERROR: Session ${sessionId} has no stageArn!`);
      return res.status(500).json({ message: 'Session missing stage ARN' });
    }
    
    try {
      // Create IVS Real-Time client with the correct region from the Stage ARN
      const region = getRegionFromStageArn(stageArn);
      const ivsrt = new IVSRealTimeClient({ region });
      
      console.log('[VIEWER TOKEN] === BACKEND TOKEN GENERATION DEBUG ===');
      console.log('[VIEWER TOKEN] SessionId:', sessionId);
      console.log('[VIEWER TOKEN] User ID:', req.user.id);
      console.log('[VIEWER TOKEN] Region:', region);
      console.log('[VIEWER TOKEN] StageArn (last 20 chars):', stageArn.substring(stageArn.length - 20));
      console.log('[VIEWER TOKEN] Event ID:', session.eventId);
      console.log('[VIEWER TOKEN] Host ID:', session.casterId.substring(0, 8) + '...');
      
      // Quick sanity: does this stage exist in this region/account?
      await ivsrt.send(new GetStageCommand({ arn: stageArn }));
      console.log('[VIEWER TOKEN] Stage verified to exist');
      
      const tokenInput = {
        stageArn,
        userId: `viewer-${req.user.id}-${Date.now()}`,
        // Viewer/subscriber role - CRITICAL: Use array format for capabilities
        capabilities: ["SUBSCRIBE"],  // AWS IVS requires array format, not object
        duration: 3600  // 1 hour TTL
      };
      
      console.log('[VIEWER TOKEN] CreateParticipantTokenCommand input:', JSON.stringify(tokenInput, null, 2));
      
      const cmd = new CreateParticipantTokenCommand(tokenInput as any);
      const out = await ivsrt.send(cmd);
      
      console.log('[VIEWER TOKEN] AWS IVS Response:', {
        hasToken: !!out.participantToken?.token,
        tokenLength: out.participantToken?.token?.length,
        participantId: out.participantToken?.participantId,
        expirationTime: out.participantToken?.expirationTime,
        rawResponse: JSON.stringify(out, null, 2)
      });
      
      const token = out.participantToken?.token;
      
      if (!token) {
        console.error('[VIEWER TOKEN] ERROR: No token in AWS response!');
        return res.status(500).json({ message: 'no token returned from AWS' });
      }
      
      console.log('[VIEWER TOKEN] SUCCESS - Token generated for user:', req.user.id);
      console.log('[VIEWER TOKEN] Token (first 30 chars):', token.substring(0, 30));
      console.log('[VIEWER TOKEN] === END BACKEND TOKEN GENERATION DEBUG ===');
      
      res.json({ token, stageArn });
    } catch (e: any) {
      // Return detailed error so we know exactly what's wrong
      console.error('viewerToken error:', {
        name: e?.name,
        message: e?.message,
        code: e?.$metadata?.httpStatusCode,
        region: process.env.AWS_REGION,
        envStageArn: process.env.IVS_STAGE_ARN,
        usedStageArn: stageArn
      });
      res.status(500).json({ 
        message: 'viewer token failed',
        aws: { name: e?.name, message: e?.message, code: e?.$metadata?.httpStatusCode }
      });
    }
  } catch (error) {
    console.error("Error generating viewer token:", error);
    res.status(500).json({ message: "Failed to generate viewer token" });
  }
});

// Get host/publisher token for caster to publish to stage
router.get('/sessions/:sessionId/hostToken', isAuthenticated, async (req: any, res) => {
  try {
    const { sessionId } = req.params;
    const session = live.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not live' });
    }
    
    // Only the caster who owns the session can get a host token
    if (session.casterId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized - not session owner' });
    }
    
    // Check if session is still active
    const now = Date.now();
    if (now - session.lastSeen > TTL_MS) {
      return res.status(404).json({ message: 'Session expired' });
    }
    
    // Use the session's unique stage ARN (created per host)
    const stageArn = session.stageArn;
    if (!stageArn) {
      console.error(`[HOST TOKEN] ERROR: Session ${sessionId} has no stageArn!`);
      return res.status(500).json({ message: 'Session missing stage ARN' });
    }
    
    try {
      // Create IVS Real-Time client with the correct region from the Stage ARN
      const region = getRegionFromStageArn(stageArn);
      const ivsrt = new IVSRealTimeClient({ region });
      console.log(`[HOST TOKEN] Using unique stage for host ${req.user.id.substring(0, 8)}... on event ${session.eventId}:`, {
        region,
        stageArn: stageArn.substring(stageArn.length - 20)
      });
      
      // Quick sanity: does this stage exist in this region/account?
      await ivsrt.send(new GetStageCommand({ arn: stageArn }));
      
      const cmd = new CreateParticipantTokenCommand({
        stageArn,
        userId: `host-${req.user.id}-${Date.now()}`,
        // Host/publisher role - can both publish and subscribe
        capabilities: ['PUBLISH', 'SUBSCRIBE'],
        // (optional) durationSeconds: 3600
      } as any); // (types lag on some SDK versions; the shape above is correct)
      
      const out = await ivsrt.send(cmd);
      const token = out.participantToken?.token;
      
      if (!token) {
        return res.status(500).json({ message: 'no token returned from AWS' });
      }
      
      console.log(`[HOST TOKEN] ✓ Generated host token for session ${sessionId}`);
      res.json({ token, stageArn });
    } catch (e: any) {
      // Return detailed error so we know exactly what's wrong
      console.error('[HOST TOKEN] Error:', {
        name: e?.name,
        message: e?.message,
        code: e?.$metadata?.httpStatusCode,
        sessionId: sessionId.split(':')[0],
        stageArn: stageArn.substring(stageArn.length - 20)
      });
      res.status(500).json({ 
        message: 'host token failed',
        aws: { name: e?.name, message: e?.message, code: e?.$metadata?.httpStatusCode }
      });
    }
  } catch (error) {
    console.error("Error generating host token:", error);
    res.status(500).json({ message: "Failed to generate host token" });
  }
});

// Stop a live session
router.post("/sessions/:sessionId/stop", express.json(), isAuthenticated, async (req: any, res) => {
  try {
    const { sessionId } = req.params;
    const casterId = req.user.id;
    
    const session = live.get(sessionId);
    if (session && session.casterId !== casterId) {
      return res.status(403).json({ message: "Unauthorized - session belongs to different caster" });
    }
    
    // Update event_casters record to set isLive = false
    if (session) {
      try {
        await storage.updateEventCasterLiveStatus(session.eventId, casterId, false);
        console.log(`[LIVE SESSIONS] Updated event_casters isLive=false for ${casterId}`);
      } catch (dbError) {
        console.error(`[LIVE SESSIONS] Warning: Failed to update event_casters live status:`, dbError);
        // Don't fail the session stop if database update fails
      }
    }
    
    live.delete(sessionId);
    console.log(`[LIVE SESSIONS] Stopped session ${sessionId} for caster ${casterId}`);
    console.log(`[LIVE SESSIONS] Active sessions: ${live.size}`);
    
    res.sendStatus(204);
  } catch (error) {
    console.error("Error stopping live session:", error);
    res.status(500).json({ message: "Failed to stop live session" });
  }
});

// Get all active live sessions (raw data for debugging)
router.get("/sessions/active", (req, res) => {
  const now = Date.now();
  const activeSessions = [];
  
  for (const [sessionId, session] of Array.from(live.entries())) {
    if (now - session.lastSeen < TTL_MS) {
      activeSessions.push({ 
        sessionId, 
        ...session, 
        status: "live",
        isStale: false 
      });
    } else {
      activeSessions.push({ 
        sessionId, 
        ...session, 
        status: "stale",
        isStale: true,
        staleSince: now - session.lastSeen 
      });
    }
  }
  
  res.json(activeSessions);
});

// Cleanup stale sessions (called periodically)
export function cleanupStaleSessions() {
  const now = Date.now();
  let removedCount = 0;
  
  for (const [sessionId, session] of Array.from(live.entries())) {
    if (now - session.lastSeen > TTL_MS * 2) { // Give extra buffer before cleanup
      live.delete(sessionId);
      removedCount++;
    }
  }
  
  if (removedCount > 0) {
    console.log(`[LIVE SESSIONS] Cleaned up ${removedCount} stale sessions. Active: ${live.size}`);
  }
}

// Per-event live casters list (with multi-caster display support)
router.get('/events/:eventId/live', (req, res) => {
  const { eventId } = req.params;
  const now = Date.now();
  
  // Group sessions by stageArn to handle edge cases where there might be multiple sessions per stage
  const stageGroups = new Map<string, any>();
  
  for (const [sessionId, session] of Array.from(live)) {
    if (now - session.lastSeen < TTL_MS && String(session.eventId) === String(eventId)) {
      const stageKey = session.stageArn || sessionId; // Use stageArn for grouping, fallback to sessionId
      
      const existingEntry = stageGroups.get(stageKey);
      
      // Determine if this session is the host session
      const isHostSession = session.casters?.some(c => c.id === session.casterId && c.role === 'host');
      
      // Always prefer the host session, or use first session if no host found yet
      if (!existingEntry || (isHostSession && !existingEntry.isHostSession)) {
        // Collect all unique casters from both sessions if merging
        let allCasters = session.casters || [];
        if (existingEntry && existingEntry.casters) {
          // Merge casters, deduplicating by id
          const casterMap = new Map();
          [...existingEntry.casters, ...allCasters].forEach(c => {
            casterMap.set(c.id, c);
          });
          allCasters = Array.from(casterMap.values());
        }
        
        stageGroups.set(stageKey, {
          id: sessionId, // Keep original sessionId for connection/cleanup
          ...session,
          status: 'live',
          isHostSession, // Track whether this is the host session
          // Ensure casters array is properly formatted with names
          casters: allCasters.map(c => ({
            id: c.id,
            name: c.name,
            role: c.role
          }))
        });
      } else if (existingEntry) {
        // Merge casters from this session into existing entry
        const casterMap = new Map();
        [...existingEntry.casters, ...(session.casters || [])].forEach(c => {
          casterMap.set(c.id, c);
        });
        existingEntry.casters = Array.from(casterMap.values()).map(c => ({
          id: c.id,
          name: c.name,
          role: c.role
        }));
      }
    }
  }
  
  // Remove the isHostSession flag before returning (internal use only)
  const out = Array.from(stageGroups.values()).map(({ isHostSession, ...rest }) => rest);
  res.json(out);
});

// Aggregated "live events" (unique by eventId, with counts)
router.get('/events/live', (_req, res) => {
  const now = Date.now();
  const groups = new Map<string, { count: number; first: number }>();
  for (const [, s] of Array.from(live)) {
    if (now - s.lastSeen < TTL_MS) {
      const key = String(s.eventId);
      const g = groups.get(key) || { count: 0, first: s.startedAt };
      g.count += 1;
      if (s.startedAt < g.first) g.first = s.startedAt;
      groups.set(key, g);
    }
  }
  const out = Array.from(groups.entries()).map(([eventId, g]) => ({
    eventId, liveCasterCount: g.count, firstStartedAt: g.first,
  }));
  res.json(out);
});

// Tonight's schedule with live counts
function tonightWindow() {
  const now = new Date();
  const start = new Date(now); start.setHours(16, 0, 0, 0);          // 16:00 today
  const end = new Date(now); end.setDate(end.getDate() + 1); end.setHours(2, 0, 0, 0); // 02:00 tomorrow
  return { from: start, to: end };
}

// Fetch actual scheduled and live events from the database
async function fetchScheduledEvents(from: Date, to: Date) {
  // Get all scheduled and live events
  const allEvents = await db.select({
    eventId: events.id,
    sport: events.sport,
    status: events.status,
    homeTeamId: events.homeTeamId,
    awayTeamId: events.awayTeamId,
    homeTeam: events.homeTeam,
    awayTeam: events.awayTeam,
    startAt: events.startTime,
    title: events.title,
    description: events.description,
    tags: events.tags
  })
  .from(events);

  // Enrich with team names
  const enrichedEvents = [];
  for (const event of allEvents) {
    let homeName = event.homeTeam; // Use manual team name if available
    let awayName = event.awayTeam;
    
    // Only look up team data if IDs are provided and manual names aren't
    if (event.homeTeamId && !homeName) {
      const [homeTeam] = await db.select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, event.homeTeamId));
      homeName = homeTeam?.name;
    }
    
    if (event.awayTeamId && !awayName) {
      const [awayTeam] = await db.select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, event.awayTeamId));
      awayName = awayTeam?.name;
    }

    const league = event.sport === 'football' ? 'NFL' 
      : event.sport === 'basketball' ? 'NBA'
      : event.sport === 'baseball' ? 'MLB'
      : event.sport === 'hockey' ? 'NHL'
      : event.sport === 'golf' ? 'Golf'
      : event.sport === 'racing' ? 'F1'
      : event.sport === 'tennis' ? 'Tennis'
      : String(event.sport).toUpperCase();

    enrichedEvents.push({
      eventId: event.eventId,
      league,
      home: homeName || 'Unknown',
      away: awayName || 'Unknown',
      startAt: event.startAt.toISOString(),
      status: event.status,
      title: event.title,
      description: event.description,
      tags: event.tags || []
    });
  }

  return enrichedEvents;
}

router.get('/events/schedule', async (req, res) => {
  const { from, to } = tonightWindow(); // ignore query for now; keep simple
  const events = await fetchScheduledEvents(from, to);

  const now = Date.now();
  const counts = new Map<string, number>();
  for (const [, s] of Array.from(live)) {
    if (now - s.lastSeen < TTL_MS) {
      const k = String(s.eventId);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }

  const out = events.map((e: any) => ({
    eventId: String(e.eventId),
    league: e.league,
    home: e.home,
    away: e.away,
    startAt: e.startAt, // ISO
    liveCasterCount: counts.get(String(e.eventId)) || 0,
    title: e.title,
    description: e.description,
    tags: e.tags || []
  }));
  res.json(out);
});


// Get session metadata for listener room
router.get('/sessions/:sessionId/meta', async (req, res) => {
  const { sessionId } = req.params;
  const session = live.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ message: 'Session not found' });
  }
  
  // Check if session is still active
  const now = Date.now();
  if (now - session.lastSeen > TTL_MS) {
    return res.status(404).json({ message: 'Session expired' });
  }
  
  // Fetch the actual event title from database
  let eventTitle = `Event #${session.eventId}`;
  try {
    const event = await storage.getEvent(session.eventId);
    if (event?.title) {
      eventTitle = event.title;
    }
  } catch (error) {
    console.warn(`Failed to fetch event title for ${session.eventId}:`, error);
  }
  
  res.json({
    ok: true,
    data: {
      sessionId: sessionId,
      eventId: session.eventId,
      eventTitle: eventTitle,
      hostUserId: session.casterId,
      casterName: session.casterName,
      startedAt: session.startedAt,
      version: session.version,
      casters: session.casters,
      prefs: {
        tone: session.tones?.[0] || 'neutral', // Use first tone or default
        mode: session.mode,
        perspective: session.perspective
      }
    }
  });
});

// Start cleanup interval
setInterval(cleanupStaleSessions, 30000); // Clean up every 30 seconds

// Create invite link for co-caster (caster A)
router.post("/sessions/:sessionId/invites", express.json(), isAuthenticated, async (req: any, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    
    console.log(`[INVITE:CREATE] User ${userId} attempting to create invite for session ${sessionId}`);
    
    // Validate expiration time bounds (60 seconds to 1 hour)
    const { expiresInSec = 900 } = req.body; // 15 minutes to match UI
    const boundedExpiresInSec = Math.max(60, Math.min(3600, expiresInSec));
    
    const session = live.get(sessionId);
    if (!session) {
      console.log(`[INVITE:SESSION_NOT_FOUND] Session ${sessionId} not found in live sessions`);
      // Log available sessions for debugging
      const availableSessions = Array.from(live.keys());
      console.log(`[INVITE:DEBUG] Available live sessions: ${availableSessions.join(', ')}`);
      return res.status(404).json({ message: 'Session not found' });
    }
    
    // Only the caster who owns the session can create invites
    if (session.casterId !== userId) {
      console.log(`[INVITE:FORBIDDEN] User ${userId} is not the caster of session ${sessionId} (actual caster: ${session.casterId})`);
      return res.status(403).json({ message: 'Unauthorized - not session owner' });
    }
    
    // Generate secure invite token
    const code = nanoid(20);
    const expiresAt = new Date(Date.now() + (boundedExpiresInSec * 1000));
    
    // Save invite to database
    await storage.createInvite({
      sessionId,
      token: code,
      expiresAt,
      invitedByUserId: userId,
    });
    
    // Create public join URL
    const joinUrl = `${req.protocol}://${req.get('host')}/cohost/j/${code}`;
    
    // Telemetry logging with both session IDs
    const appSessionId = req.headers['x-app-session-id'] || 'unknown';
    console.log(`[INVITE:TELEMETRY] invite_created: {
      appSessionId: "${appSessionId}",
      callSessionId: "${sessionId}",
      userId: "${userId}",
      inviteCode: "${code}",
      expiresAt: "${expiresAt.toISOString()}",
      outcome: "success"
    }`);
    
    // Enhanced creation logging with timing details
    const now = new Date();
    const expiresInMs = expiresAt.getTime() - now.getTime();
    console.log(`[INVITE:CREATION] {code: "${code}", expiresAt: "${expiresAt.toISOString()}", now: "${now.toISOString()}", ttlSec: ${boundedExpiresInSec}, expiresInMs: ${expiresInMs}}`);
    
    res.setHeader('Content-Type', 'application/json');
    return res.status(201).json({
      joinUrl,
      token: code,
      expiresAt: expiresAt.toISOString()
    });
    
  } catch (error) {
    const { sessionId } = req.params;
    const userId = req.user?.id || 'unknown';
    const e = error as any;
    
    console.error(`[INVITES][CREATE] failed`, {
      message: e?.message, 
      code: e?.code, 
      stack: e?.stack,
      sessionId,
      userId
    });
    
    // Telemetry for failed creation  
    console.log(`[INVITE:TELEMETRY] invite_failed: {
      appSessionId: "unknown",
      callSessionId: "${sessionId}",
      userId: "${userId}",
      error: "${e?.message}",
      outcome: "error"
    }`);
    
    res.setHeader('Content-Type', 'application/json');
    return res.status(e?.statusCode ?? 500).json({
      error: true,
      code: e?.code ?? 'INVITE_CREATE_FAILED',
      message: e?.message ?? 'Failed to create cohost invite'
    });
  }
});

// Validate invite and return token (GET - validates and returns token but marks as used only after successful token creation)
router.get("/cohost/invites/validate", async (req: any, res) => {
  const { code } = req.query; // Move outside try block for catch access
  
  try {
    if (!code) {
      return res.status(400).json({ reason: 'bad_request', message: 'Missing invite code' });
    }

    // Check authentication - return 401 with next URL for proper redirect flow
    if (!req.user) {
      console.log(`[INVITE:AUTH] Unauthenticated attempt to validate invite ${code}`);
      return res.status(401).json({ 
        message: "auth_required", 
        next: req.originalUrl 
      });
    }
    
    console.log(`[INVITE:VALIDATE] User ${req.user.id} validating invite ${code} via query param`);
    
    // Get invite from database
    const invite = await storage.getInvite(code);
    if (!invite) {
      console.log(`[INVITE:VALIDATION] ❌ REASON: not_found - Invite ${code} not found in database`);
      return res.status(404).json({ reason: 'not_found', message: 'Invite code not found' });
    }
    
    // Enhanced validation logging with clock skew tolerance
    const now = new Date();
    const expiresAt = new Date(invite.expiresAt);
    const deltaMs = expiresAt.getTime() - now.getTime();
    const skewMs = 90_000; // 90 second grace period for clock skew
    const decision = deltaMs + skewMs <= 0 ? 'expired' : (invite.consumedAt ? 'used' : 'valid');
    
    console.log(`[INVITE:VALIDATE] {code: "${code}", now: "${now.toISOString()}", expiresAt: "${expiresAt.toISOString()}", deltaMs: ${deltaMs}, usedAt: ${invite.consumedAt ? `"${invite.consumedAt.toISOString()}"` : 'null'}, decision: "${decision}"}`);
    
    if (deltaMs + skewMs <= 0) {
      console.log(`[INVITE:VALIDATION] ❌ REASON: expired - Invite ${code} expired ${Math.abs(deltaMs)}ms ago (with ${skewMs}ms grace)`);
      return res.status(410).json({ reason: 'expired', message: 'Invite has expired' });
    }
    
    if (invite.consumedAt !== null) {
      console.log(`[INVITE:VALIDATION] ❌ REASON: used - Invite ${code} already used at ${invite.consumedAt}`);
      return res.status(409).json({ reason: 'used', message: 'Invite has already been used' });
    }
    
    // Check if session is still live
    const session = live.get(invite.sessionId);
    if (!session) {
      console.log(`[INVITE:VALIDATION] ❌ REASON: session_mismatch - Session ${invite.sessionId} for invite ${code} no longer live`);
      return res.status(404).json({ reason: 'session_mismatch', message: 'Live session is no longer active' });
    }
    
    // Get event details (we already validated session exists above)
    const event = await storage.getEvent(session.eventId);
    if (!event) {
      console.log(`[INVITE:EVENT_NOT_FOUND] Event ${session.eventId} for invite ${code} not found`);
      return res.status(404).json({ message: 'event_not_found' });
    }
    
    // Create IVS Real-Time participant token with contributor role
    // Use the session's unique stage ARN (created per host)
    const stageArn = session.stageArn;
    if (!stageArn) {
      console.error(`[INVITE:TOKEN] ERROR: Session ${invite.sessionId} has no stageArn!`);
      return res.status(500).json({ message: 'Session missing stage ARN' });
    }
    
    const region = getRegionFromStageArn(stageArn);
    const ivsrt = new IVSRealTimeClient({ region });
    
    console.log(`[INVITE:TOKEN] Creating co-host token for session ${invite.sessionId}:`, {
      stageArn: stageArn.substring(stageArn.length - 20),
      region
    });
    
    try {
      const cmd = new CreateParticipantTokenCommand({
        stageArn,
        userId: `contributor-${req.user.id}-${Date.now()}`,
        capabilities: ['PUBLISH', 'SUBSCRIBE'], // Contributor can both publish and subscribe
        attributes: { 
          role: 'contributor', 
          eventId: session.eventId,
          inviteCode: code 
        },
        durationSeconds: 900, // 15 minutes
      } as any);
      
      const out = await ivsrt.send(cmd);
      const participantToken = out.participantToken?.token;
      
      if (!participantToken) {
        console.log(`[INVITE:TOKEN_FAILED] Failed to create participant token for invite ${code}`);
        return res.status(500).json({ message: 'Failed to create participant token' });
      }
      
      // 🎯 ONLY mark invite as used AFTER successful token creation
      await storage.markInviteAsUsed(code);
      
      console.log(`[INVITE:VALIDATE] ✅ Token created and invite ${code} marked as used`);
      
      res.json({
        ok: true,
        event: {
          id: event.id,
          title: event.title,
          startTime: event.startTime,
        },
        stageArn,
        participantToken,
        sessionId: invite.sessionId,
      });
      
    } catch (ivsError: any) {
      console.error(`[INVITE:IVS_ERROR] IVS token creation failed for invite ${code}:`, ivsError);
      return res.status(500).json({ message: 'Failed to create broadcast token' });
    }
    
  } catch (error) {
    console.error(`[INVITE:VALIDATE_ERROR] Error validating invite ${code}:`, error);
    res.status(500).json({ message: "Failed to validate invite" });
  }
});

// NEW: Peek invite endpoint (non-consuming validation) 
router.get("/cohost/invites/peek", async (req: any, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ 
        valid: false, 
        reason: 'bad_request',
        message: 'Missing invite code' 
      });
    }

    const userId = req.user?.id || 'anonymous';
    console.log(`[INVITE:PEEK] Non-consuming peek for invite ${code} by user ${userId}`);
    
    // Use new storage method for non-consuming peek
    const peekResult = await storage.peekInviteByCode(code);
    
    // Log requested format: {code, sessionId, userId, action: peek|consume, result}
    const sessionId = peekResult.valid ? peekResult.invite?.sessionId : 'unknown';
    const result = peekResult.valid ? 'success' : peekResult.reason;
    console.log(`[INVITE:LOG] {code: "${code}", sessionId: "${sessionId}", userId: "${userId}", action: "peek", result: "${result}"}`);
    
    if (!peekResult.valid) {
      const statusCode = 
        peekResult.reason === 'not_found' ? 404 :
        peekResult.reason === 'expired' ? 410 :
        peekResult.reason === 'used' ? 409 :
        peekResult.reason === 'session_mismatch' ? 404 : 
        400;
        
      console.log(`[INVITE:PEEK] ❌ REASON: ${peekResult.reason}`);
      return res.status(statusCode).json(peekResult);
    }
    
    console.log(`[INVITE:PEEK] ✅ Valid invite found for event: ${peekResult.invite?.event.title}`);
    
    res.json({
      valid: true,
      invite: {
        sessionId: peekResult.invite!.sessionId,
        expiresAt: peekResult.invite!.expiresAt,
        event: {
          id: peekResult.invite!.event.id,
          title: peekResult.invite!.event.title,
          startTime: peekResult.invite!.event.startTime,
        },
      },
    });
    
  } catch (error) {
    console.error(`[INVITE:PEEK] Error peeking invite:`, error);
    res.status(500).json({
      valid: false,
      reason: 'server_error',
      message: 'Failed to peek invite',
    });
  }
});

// NEW: Consume invite endpoint (consuming with idempotency)
router.post("/cohost/invites/consume", express.json(), async (req: any, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ 
        success: false,
        reason: 'bad_request', 
        message: 'Missing invite code' 
      });
    }

    // Check authentication
    if (!req.user) {
      console.log(`[INVITE:CONSUME_NEW] Unauthenticated attempt to consume invite ${code}`);
      return res.status(401).json({ 
        success: false,
        reason: 'auth_required',
        message: "Authentication required", 
        next: req.originalUrl 
      });
    }
    
    const userId = req.user.id;
    console.log(`[INVITE:CONSUME_NEW] User ${userId} consuming invite ${code} via new endpoint`);
    
    // First, peek at the invite to get sessionId and retrieve the unique stageArn
    const peekResult = await storage.peekInviteByCode(code);
    if (!peekResult.valid || !peekResult.invite) {
      console.log(`[INVITE:CONSUME_NEW] ❌ REASON: ${peekResult.reason} - Cannot peek invite`);
      const statusCode = 
        peekResult.reason === 'not_found' ? 404 :
        peekResult.reason === 'expired' ? 410 :
        peekResult.reason === 'used' ? 409 :
        peekResult.reason === 'session_mismatch' ? 404 :
        400;
      return res.status(statusCode).json({ success: false, reason: peekResult.reason });
    }
    
    // Get the live session to retrieve its unique stageArn
    const liveSession = live.get(peekResult.invite.sessionId);
    if (!liveSession || !liveSession.stageArn) {
      console.log(`[INVITE:CONSUME_NEW] ❌ Session ${peekResult.invite.sessionId} not found or missing stageArn`);
      return res.status(404).json({ 
        success: false, 
        reason: 'session_mismatch',
        message: 'Live session is no longer active or missing stage' 
      });
    }
    
    // Now consume the invite with the session's unique stageArn
    const consumeResult = await storage.consumeInvite(code, userId, liveSession.stageArn);
    
    // Log requested format: {code, sessionId, userId, action: peek|consume, result}
    const sessionId = consumeResult.success ? consumeResult.data?.sessionId : 'unknown';
    const result = consumeResult.success ? 'success' : consumeResult.reason;
    console.log(`[INVITE:LOG] {code: "${code}", sessionId: "${sessionId}", userId: "${userId}", action: "consume", result: "${result}"}`);
    
    if (!consumeResult.success) {
      const statusCode = 
        consumeResult.reason === 'not_found' ? 404 :
        consumeResult.reason === 'expired' ? 410 :
        consumeResult.reason === 'used' ? 409 :
        consumeResult.reason === 'session_mismatch' ? 404 :
        consumeResult.reason === 'auth_required' ? 401 :
        400;
        
      console.log(`[INVITE:CONSUME_NEW] ❌ REASON: ${consumeResult.reason}`);
      return res.status(statusCode).json(consumeResult);
    }
    
    console.log(`[INVITE:CONSUME_NEW] ✅ Successfully consumed invite for event: ${consumeResult.data?.event.title}`);
    
    // Telemetry logging
    const appSessionId = req.headers['x-app-session-id'] || 'unknown';
    console.log(`[INVITE:TELEMETRY_NEW] invite_consumed: {
      appSessionId: "${appSessionId}",
      callSessionId: "${consumeResult.data?.sessionId}",
      userId: "${req.user.id}",
      inviteCode: "${code}",
      outcome: "success"
    }`);
    
    // Get session data for prefs (co-host inherits host's settings)
    const sessionForPrefs = live.get(consumeResult.data!.sessionId);
    const prefs = sessionForPrefs ? {
      tone: sessionForPrefs.tones?.[0] || 'neutral',
      mode: sessionForPrefs.mode,
      perspective: sessionForPrefs.perspective
    } : null;

    // Log co-host join event
    console.log(`[COHOST:JOIN] { sessionId: "${consumeResult.data!.sessionId}", cohostId: "${req.user.id}", prefs: ${JSON.stringify(prefs)} }`);

    // Add co-host to session casters and emit update
    const session = live.get(consumeResult.data!.sessionId);
    if (session) {
      // Add co-host to casters array (deduped by userId)
      const existingCasterIndex = session.casters?.findIndex(c => c.id === req.user.id);
      if (existingCasterIndex === -1 || existingCasterIndex === undefined) {
        if (!session.casters) session.casters = [];
        session.casters.push({
          id: req.user.id,
          name: getDisplayName(req.user),
          role: 'cohost',
          joinedAt: Date.now()
        });
        
        // Increment version and emit update
        session.version = (session.version || 0) + 1;
        emitCasterUpdate(consumeResult.data!.sessionId, session);
        
        console.log(`[CASTER:ADD] Added co-host ${req.user.id} to session ${consumeResult.data!.sessionId}, new count: ${session.casters.length}`);
      } else {
        console.log(`[CASTER:ADD] Co-host ${req.user.id} already in session ${consumeResult.data!.sessionId} casters`);
      }
    }

    res.json({
      success: true,
      data: {
        sessionId: consumeResult.data!.sessionId,
        participantToken: consumeResult.data!.participantToken,
        stageArn: consumeResult.data!.stageArn,
        event: {
          id: consumeResult.data!.event.id,
          title: consumeResult.data!.event.title,
          startTime: consumeResult.data!.event.startTime,
        },
        prefs: prefs,
        casters: session?.casters || [],
        version: session?.version || 0
      },
    });
    
  } catch (error) {
    console.error(`[INVITE:CONSUME_NEW] Error consuming invite:`, error);
    res.status(500).json({
      success: false,
      reason: 'server_error',
      message: 'Failed to consume invite',
    });
  }
});

// Consume invite and get participant token for co-caster (caster B)
router.post("/cohost/invites/:code/consume", async (req: any, res) => {
  try {
    const { code } = req.params;
    
    // Check authentication - return 401 with next URL for proper redirect flow
    if (!req.user) {
      console.log(`[INVITE:AUTH] Unauthenticated attempt to consume invite ${code}`);
      return res.status(401).json({ 
        message: "auth_required", 
        next: req.originalUrl 
      });
    }
    
    console.log(`[INVITE:CONSUME] User ${req.user.id} attempting to consume invite ${code}`);
    
    // Get invite from database
    const invite = await storage.getInvite(code);
    if (!invite) {
      console.log(`[INVITE:CONSUME] ❌ REASON: not_found - Invite ${code} not found in database`);
      return res.status(404).json({ reason: 'not_found', message: 'Invite code not found' });
    }
    
    // Enhanced validation logging with clock skew tolerance
    const now = new Date();
    const expiresAt = new Date(invite.expiresAt);
    const deltaMs = expiresAt.getTime() - now.getTime();
    const skewMs = 90_000; // 90 second grace period for clock skew
    const decision = deltaMs + skewMs <= 0 ? 'expired' : (invite.consumedAt ? 'used' : 'valid');
    
    console.log(`[INVITE:CONSUME] {code: "${code}", now: "${now.toISOString()}", expiresAt: "${expiresAt.toISOString()}", deltaMs: ${deltaMs}, usedAt: ${invite.consumedAt ? `"${invite.consumedAt.toISOString()}"` : 'null'}, decision: "${decision}"}`);
    
    if (deltaMs + skewMs <= 0) {
      console.log(`[INVITE:CONSUME] ❌ REASON: expired - Invite ${code} expired ${Math.abs(deltaMs)}ms ago (with ${skewMs}ms grace)`);
      return res.status(410).json({ reason: 'expired', message: 'Invite has expired' });
    }
    
    if (invite.consumedAt !== null) {
      console.log(`[INVITE:CONSUME] ❌ REASON: used - Invite ${code} already used at ${invite.consumedAt}`);
      return res.status(409).json({ reason: 'used', message: 'Invite has already been used' });
    }
    
    // Check if session is still live
    const session = live.get(invite.sessionId);
    if (!session) {
      console.log(`[INVITE:CONSUME] ❌ REASON: session_mismatch - Session ${invite.sessionId} for invite ${code} no longer live`);
      return res.status(404).json({ reason: 'session_mismatch', message: 'Live session is no longer active' });
    }
    
    // Get event details (we already validated session exists above)
    const event = await storage.getEvent(session.eventId);
    if (!event) {
      console.log(`[INVITE:EVENT_NOT_FOUND] Event ${session.eventId} for invite ${code} not found`);
      return res.status(404).json({ message: 'event_not_found' });
    }
    
    // Create IVS Real-Time participant token with contributor role
    // Use the session's unique stage ARN (created per host)
    const stageArn = session.stageArn;
    if (!stageArn) {
      console.error(`[INVITE:CONSUME] ERROR: Session ${invite.sessionId} has no stageArn!`);
      return res.status(500).json({ message: 'Session missing stage ARN' });
    }
    
    const region = getRegionFromStageArn(stageArn);
    const ivsrt = new IVSRealTimeClient({ region });
    
    console.log(`[INVITE:CONSUME] Creating co-host token for session ${invite.sessionId}:`, {
      stageArn: stageArn.substring(stageArn.length - 20),
      region
    });
    
    try {
      const cmd = new CreateParticipantTokenCommand({
        stageArn,
        userId: `contributor-${req.user.id}-${Date.now()}`,
        capabilities: ['PUBLISH', 'SUBSCRIBE'], // Contributor can both publish and subscribe
        attributes: { 
          role: 'contributor', 
          eventId: session.eventId,
          inviteCode: code 
        },
        durationSeconds: 900, // 15 minutes
      } as any);
      
      const out = await ivsrt.send(cmd);
      const participantToken = out.participantToken?.token;
      
      if (!participantToken) {
        console.log(`[INVITE:TOKEN_FAILED] Failed to create participant token for invite ${code}`);
        console.log(`[INVITE:CONSUME] {code: "${code}", decision: "failed", tokenCreated: false}`);
        return res.status(500).json({ message: 'Failed to create participant token' });
      }
      
      // 🎯 ONLY mark invite as used AFTER successful token creation
      await storage.markInviteAsUsed(code);
      
      console.log(`[INVITE:CONSUME] {code: "${code}", decision: "success", tokenCreated: true}`);
      
      res.json({
        event: {
          id: event.id,
          title: event.title,
          startTime: event.startTime,
        },
        stageArn,
        participantToken,
        sessionId: invite.sessionId,
      });
      
    } catch (ivsError: any) {
      console.log(`[INVITE:CONSUME] {code: "${code}", decision: "failed", tokenCreated: false}`);
      console.error(`[INVITE:IVS_ERROR] IVS token creation failed for invite ${code}:`, ivsError);
      return res.status(500).json({ message: 'Failed to create broadcast token' });
    }
    
  } catch (error) {
    console.error(`[INVITE:CONSUME_ERROR] Error consuming invite ${req.params.code}:`, error);
    res.status(500).json({ message: "Failed to consume invite" });
  }
});

// Get current live call session for authenticated user
router.get("/sessions/current-call", async (req: any, res) => {
  try {
    // Check authentication
    if (!req.user) {
      console.log(`[CURRENT-CALL:AUTH] Unauthenticated request for current call`);
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.id;
    console.log(`[CURRENT-CALL:REQUEST] User ${userId} requesting current call session`);

    // Find the user's active live session (where they are the host/caster)
    let activeSession = null;
    
    for (const [sessionId, sessionData] of Array.from(live.entries())) {
      if (sessionData.casterId === userId) {
        activeSession = {
          sessionId,
          role: 'host',
          region: getRegionFromStageArn(sessionData.stageArn || process.env.IVS_STAGE_ARN!),
          eventId: sessionData.eventId,
          startedAt: sessionData.startedAt,
          stageArn: sessionData.stageArn
        };
        console.log(`[CURRENT-CALL:FOUND] User ${userId} has active session ${sessionId}`);
        break;
      }
    }

    if (!activeSession) {
      console.log(`[CURRENT-CALL:NONE] No active session found for user ${userId}`);
      // Return null session instead of 404 as per spec
      return res.json({ 
        sessionId: null, 
        role: null, 
        region: null 
      });
    }

    // Check if user is actually the host (additional security)
    if (activeSession.role !== 'host') {
      console.log(`[CURRENT-CALL:FORBIDDEN] User ${userId} is not host of session ${activeSession.sessionId}`);
      return res.status(403).json({ message: "Only hosts can access call session details" });
    }

    res.json({
      sessionId: activeSession.sessionId,
      role: activeSession.role,
      region: activeSession.region
    });

  } catch (error) {
    console.error(`[CURRENT-CALL:ERROR] Error getting current call for user ${req.user?.id}:`, error);
    res.status(500).json({ message: "Failed to get current call session" });
  }
});

// Debug endpoint to see what sessions are live
router.get("/debug/live", (req, res) => {
  const list = Array.from(live.keys()).map(id => {
    const s = live.get(id)!;
    return { 
      sessionId: id, 
      eventId: s.eventId, 
      casterId: s.casterId,
      casterName: s.casterName,
      startedAt: s.startedAt, 
      stageArn: s.stageArn?.slice(-8) + '...' 
    };
  });
  res.json({ count: list.length, sessions: list });
});

// Debug endpoint to see recent invites (dev-only)
router.get("/debug/invites", async (req, res) => {
  try {
    // Clean up expired invites first
    await storage.cleanupExpiredInvites();
    
    // This is a simple debug endpoint - in production you'd want pagination
    // For now, we'll show recent invites by querying all and filtering by recent timestamps
    const recentInvites = await db.select().from(invites)
      .orderBy(desc(invites.createdAt))
      .limit(20);
    
    const inviteList = recentInvites.map(invite => ({
      code: invite.token,
      sessionId: invite.sessionId,
      createdBy: invite.invitedByUserId,
      expiresAt: invite.expiresAt,
      isExpired: invite.expiresAt < new Date(),
    }));
    
    res.json({ count: inviteList.length, invites: inviteList });
  } catch (error) {
    console.error("Error fetching debug invites:", error);
    res.status(500).json({ message: "Failed to fetch invites" });
  }
});

export default router;