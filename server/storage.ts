import {
  users,
  events,
  eventCasters,
  teams,
  streamSessions,
  markers,
  tips,
  follows,
  castingPartnerships,
  partnershipInvitations,
  partnershipEvents,
  chatMessages,
  invites,
  stages,
  type User,
  type PublicUser,
  type InsertAuthUser,
  type Event,
  type EventCaster,
  type EventCasterWithCaster,
  type InsertEventCaster,
  type Team,
  type StreamSession,
  type InsertEvent,
  type InsertStreamSession,
  type InsertMarker,
  type InsertTip,
  type InsertFollow,
  type Marker,
  type Tip,
  type Follow,
  type CastingPartnership,
  type PartnershipInvitation,
  type PartnershipEvent,
  type PartnershipEventWithPartnership,
  type PartnershipInvitationWithCasters,
  type InsertCastingPartnership,
  type InsertPartnershipInvitation,
  type InsertPartnershipEvent,
  type ChatMessage,
  type InsertChatMessage,
  type Invite,
  type InsertInvite,
  type Stage,
  type InsertStage,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, sql, count } from "drizzle-orm";
import { ivsService } from "./ivsService";

// Interface for storage operations
export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(userData: InsertAuthUser): Promise<User>;
  updateUserProfile(userId: string, data: { bio?: string; screenname?: string | null }): Promise<void>;
  enableCasting(userId: string): Promise<void>;
  
  // Event operations
  getEvents(): Promise<Event[]>;
  getEvent(eventId: string): Promise<Event | undefined>;
  getLiveEvents(): Promise<Event[]>;
  getEventsByTeam(teamSlug: string): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEventStatus(eventId: string, status: "scheduled" | "live" | "ended"): Promise<void>;
  
  // Event caster operations
  getEventCasters(eventId: string, filters?: {
    perspective?: "home" | "away" | "neutral";
    mode?: "play-by-play" | "expert-analysis" | "fantasy-focus";
    tones?: ("serious" | "comedy" | "family-friendly")[];
    isLive?: boolean;
  }): Promise<EventCasterWithCaster[]>;
  createEventCaster(eventCaster: InsertEventCaster): Promise<EventCaster>;
  upsertEventCaster(eventCaster: InsertEventCaster): Promise<EventCaster>;
  updateEventCasterLiveStatus(eventId: string, casterId: string, isLive: boolean): Promise<EventCaster | null>;
  
  // Team operations
  getTeams(): Promise<Team[]>;
  getTeamBySlug(slug: string): Promise<Team | undefined>;
  
  // Stream operations
  createStreamSession(session: InsertStreamSession): Promise<StreamSession>;
  endStreamSession(sessionId: string): Promise<void>;
  getStreamSession(sessionId: string): Promise<StreamSession | undefined>;
  
  // Marker operations
  createMarker(marker: InsertMarker): Promise<Marker>;
  getMarkersBySession(sessionId: string): Promise<Marker[]>;
  
  // Tip operations
  createTip(tip: InsertTip): Promise<Tip>;
  getTipsBySession(sessionId: string): Promise<Tip[]>;
  
  // Follow operations
  followCaster(follow: InsertFollow): Promise<Follow>;
  unfollowCaster(followerId: string, casterId: string): Promise<void>;
  getFollowing(userId: string): Promise<Follow[]>;

  // Caster operations
  getCasters(filters?: {
    league?: string;
    perspective?: "home" | "away" | "neutral";
    mode?: "play-by-play" | "expert-analysis" | "fantasy-focus";  
    tones?: ("serious" | "comedy" | "family-friendly")[];
    isLive?: boolean;
    searchQuery?: string;
  }): Promise<(User & { 
    currentLiveEvents: (EventCaster & { event: Event & { homeTeam: Team; awayTeam: Team } })[]; 
    totalListeners: number;
  })[]>;

  // Casting partnerships
  createPartnership(data: InsertCastingPartnership): Promise<CastingPartnership>;
  getPartnershipsByUserId(userId: string): Promise<CastingPartnership[]>;
  getPartnershipById(id: string): Promise<CastingPartnership | undefined>;
  updatePartnership(id: string, data: Partial<InsertCastingPartnership>): Promise<CastingPartnership | undefined>;
  deletePartnership(id: string): Promise<boolean>;

  // Partnership invitations
  createPartnershipInvitation(data: InsertPartnershipInvitation): Promise<PartnershipInvitation>;
  getInvitationsByUserId(userId: string): Promise<PartnershipInvitationWithCasters[]>;
  getInvitationById(id: string): Promise<PartnershipInvitationWithCasters | undefined>;
  updateInvitationStatus(id: string, status: string): Promise<PartnershipInvitation | undefined>;
  deleteInvitation(id: string): Promise<boolean>;

  // Partnership events
  createPartnershipEvent(data: InsertPartnershipEvent): Promise<PartnershipEvent>;
  getPartnershipEventsByEventId(eventId: string): Promise<PartnershipEventWithPartnership[]>;
  updatePartnershipEvent(id: string, data: Partial<InsertPartnershipEvent>): Promise<PartnershipEvent | undefined>;
  deletePartnershipEvent(id: string): Promise<boolean>;

  // Chat message operations
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(eventId: string, casterId?: string, options?: {
    limit?: number;
    offset?: number;
    onlyVisible?: boolean;
  }): Promise<(ChatMessage & { 
    user: { 
      id: string; 
      screenname: string | null;
      profileImageUrl: string | null;
      canCast: boolean;
    } 
  })[]>;
  updateChatMessageVisibility(messageId: string, isVisible: boolean): Promise<void>;
  checkRateLimit(userId: string, eventId: string): Promise<{ allowed: boolean; nextAllowedTime?: Date }>;

  // Co-caster invite operations
  createInvite(invite: InsertInvite): Promise<Invite>;
  getInvite(code: string): Promise<Invite | undefined>;
  markInviteAsUsed(code: string): Promise<void>;
  deleteInvite(code: string): Promise<void>;
  cleanupExpiredInvites(): Promise<void>;
  
  // New peek/consume operations for split invite flow
  peekInviteByCode(code: string): Promise<{
    valid: boolean;
    reason?: 'expired' | 'used' | 'not_found' | 'session_mismatch';
    invite?: {
      id: string;
      sessionId: string;
      expiresAt: Date;
      createdAt: Date | null;
      event: {
        id: string;
        title: string;
        startTime: Date;
      };
    };
  }>;
  consumeInvite(code: string, userId: string): Promise<{
    success: boolean;
    reason?: 'expired' | 'used' | 'not_found' | 'session_mismatch' | 'auth_required';
    data?: {
      sessionId: string;
      participantToken: string;
      stageArn: string;
      event: {
        id: string;
        title: string;
        startTime: Date;
      };
    };
  }>;

  // IVS Stage persistence operations
  createStage(stage: InsertStage): Promise<Stage>;
  getStageByKey(stageIdKey: string): Promise<Stage | undefined>;
  updateStageSession(stageIdKey: string, sessionId: string | null): Promise<void>;
  deleteStage(stageIdKey: string): Promise<void>;
  deleteStaleStages(staleDurationHours: number): Promise<string[]>;

  // IVS operations
  setupIVSChannel(userId: string, channelName: string): Promise<{
    channelArn: string;
    streamKey: string;
    playbackUrl: string;
    ingestEndpoint: string;
  }>;
  updateStreamSession(sessionId: string, data: {
    ivsStreamId?: string;
    ivsStreamStatus?: string;
    ivsPlaybackUrl?: string;
    ivsStreamHealth?: string;
  }): Promise<StreamSession | undefined>;
  getStreamSessionByEventAndCaster(eventId: string, casterId: string): Promise<StreamSession | undefined>;

  // Admin analytics operations
  getUserRegistrationStats(days?: number): Promise<{
    totalUsers: number;
    newUsersToday: number;
    newUsersThisWeek: number;
    newUsersThisMonth: number;
    dailyRegistrations: { date: string; count: number }[];
  }>;
  getCastingStats(): Promise<{
    totalCasters: number;
    activeCasters: number;
    totalStreamSessions: number;
    liveStreams: number;
    avgSessionDuration: number;
  }>;
  getPlatformMetrics(): Promise<{
    totalUsers: number;
    totalCasters: number;
    totalListeners: number;
    totalAdmins: number;
    totalEvents: number;
    liveEvents: number;
    totalStreamSessions: number;
    totalTips: number;
    totalMarkers: number;
  }>;
  getAllUsersWithCastingStats(): Promise<{
    id: string;
    email: string;
    screenname: string | null;
    role: "caster" | "listener" | "admin";
    canCast: boolean;
    createdAt: Date | null;
    totalStreamSessions: number;
    totalStreamTime: number; // in seconds
    lastStreamDate: Date | null;
    isCurrentlyLive: boolean;
  }[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }


  async updateUserProfile(userId: string, data: { bio?: string; screenname?: string | null }): Promise<void> {
    await db.update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async enableCasting(userId: string): Promise<void> {
    await db.update(users)
      .set({
        canCast: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      sql`lower(${users.email}) = lower(${email})`
    );
    return user;
  }

  async createUser(userData: InsertAuthUser): Promise<User> {
    // Check if this is the first user (bootstrap admin)
    const [userCount] = await db.select({ count: count() }).from(users);
    const isFirstUser = userCount.count === 0;
    
    // First user automatically becomes admin
    // Add termsAcceptedAt timestamp when user agrees to terms
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        role: isFirstUser ? 'admin' : userData.role || 'listener',
        termsAcceptedAt: userData.agreedToTerms ? new Date() : null,
      })
      .returning();
    
    if (isFirstUser) {
      console.log(`First user created with admin privileges: ${user.email}`);
    }
    
    return user;
  }

  // Event operations
  async getEvents(): Promise<Event[]> {
    const eventsData = await db.select().from(events).orderBy(desc(events.startTime));
    
    // Enrich with team data only if team IDs are present
    const enrichedEvents = [];
    for (const event of eventsData) {
      let homeTeamData = null;
      let awayTeamData = null;
      
      // Only look up team data if IDs are provided
      if (event.homeTeamId) {
        [homeTeamData] = await db.select().from(teams).where(eq(teams.id, event.homeTeamId));
      }
      if (event.awayTeamId) {
        [awayTeamData] = await db.select().from(teams).where(eq(teams.id, event.awayTeamId));
      }
      
      enrichedEvents.push({
        ...event,
        homeTeamData: homeTeamData || null,
        awayTeamData: awayTeamData || null,
      });
    }
    
    return enrichedEvents as any[];
  }

  async getEvent(eventId: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (!event) return undefined;
    
    // Enrich with team data only if team IDs are present
    let homeTeamData = null;
    let awayTeamData = null;
    
    if (event.homeTeamId) {
      [homeTeamData] = await db.select().from(teams).where(eq(teams.id, event.homeTeamId));
    }
    if (event.awayTeamId) {
      [awayTeamData] = await db.select().from(teams).where(eq(teams.id, event.awayTeamId));
    }
    
    return {
      ...event,
      homeTeamData: homeTeamData || null,
      awayTeamData: awayTeamData || null,
    } as any;
  }

  async getLiveEvents(): Promise<Event[]> {
    const eventsData = await db.select().from(events).where(eq(events.status, "live"));
    
    // Enrich with team data only if team IDs are present
    const enrichedEvents = [];
    for (const event of eventsData) {
      let homeTeamData = null;
      let awayTeamData = null;
      
      if (event.homeTeamId) {
        [homeTeamData] = await db.select().from(teams).where(eq(teams.id, event.homeTeamId));
      }
      if (event.awayTeamId) {
        [awayTeamData] = await db.select().from(teams).where(eq(teams.id, event.awayTeamId));
      }
      
      enrichedEvents.push({
        ...event,
        homeTeamData: homeTeamData || null,
        awayTeamData: awayTeamData || null,
      });
    }
    
    return enrichedEvents as any[];
  }

  async getEventsByTeam(teamSlug: string): Promise<Event[]> {
    const team = await this.getTeamBySlug(teamSlug);
    if (!team) return [];
    
    return await db.select().from(events).where(
      or(
        eq(events.homeTeamId, team.id),
        eq(events.awayTeamId, team.id)
      )
    );
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const [newEvent] = await db.insert(events).values(event).returning();
    return newEvent;
  }

  async updateEventStatus(eventId: string, status: "scheduled" | "live" | "ended"): Promise<void> {
    await db.update(events).set({ status }).where(eq(events.id, eventId));
  }

  // Event caster operations
  async getEventCasters(eventId: string, filters?: {
    perspective?: "home" | "away" | "neutral";
    mode?: "play-by-play" | "expert-analysis" | "fantasy-focus";
    tones?: ("serious" | "comedy" | "family-friendly")[];
    isLive?: boolean;
  }): Promise<EventCasterWithCaster[]> {
    let query = db
      .select({
        id: eventCasters.id,
        eventId: eventCasters.eventId,
        casterId: eventCasters.casterId,
        perspective: eventCasters.perspective,
        mode: eventCasters.mode,
        tones: eventCasters.tones,
        isLive: eventCasters.isLive,
        listenerCount: eventCasters.listenerCount,
        createdAt: eventCasters.createdAt,
        updatedAt: eventCasters.updatedAt,
        caster: {
          id: users.id,
          screenname: users.screenname,
          profileImageUrl: users.profileImageUrl,
          bio: users.bio,
          ivsPlaybackUrl: users.ivsPlaybackUrl,
          ivsChannelArn: users.ivsChannelArn,
          canCast: users.canCast,
          requiresOnboarding: users.requiresOnboarding,
        }
      })
      .from(eventCasters)
      .leftJoin(users, eq(eventCasters.casterId, users.id));
    
    // Build where conditions
    const conditions = [eq(eventCasters.eventId, eventId)];
    
    if (filters?.perspective) {
      conditions.push(eq(eventCasters.perspective, filters.perspective));
    }
    
    if (filters?.mode) {
      conditions.push(eq(eventCasters.mode, filters.mode));
    }
    
    if (filters?.isLive !== undefined) {
      conditions.push(eq(eventCasters.isLive, filters.isLive));
    }
    
    // For tones array filtering, check if any of the filter tones match the caster's tones
    if (filters?.tones && filters.tones.length > 0) {
      // Use raw SQL for array overlap check since Drizzle doesn't have native array operators
      conditions.push(sql`${eventCasters.tones} && ${filters.tones}`);
    }
    
    const result = await query
      .where(and(...conditions))
      .orderBy(desc(eventCasters.updatedAt), desc(eventCasters.listenerCount));
    
    const mappedResult = result.map(row => ({
      ...row,
      caster: row.caster || {
        id: row.casterId,
        screenname: null,
        profileImageUrl: null,
        bio: null,
        ivsPlaybackUrl: null,
        ivsChannelArn: null,
        canCast: false,
        requiresOnboarding: true,
      }
    }));

    // Deduplication: Keep only the most recent record per caster (safety measure for existing duplicates)
    const deduplicatedResult = new Map<string, typeof mappedResult[0]>();
    for (const record of mappedResult) {
      const casterId = record.casterId;
      if (!deduplicatedResult.has(casterId)) {
        deduplicatedResult.set(casterId, record);
      }
    }
    
    return Array.from(deduplicatedResult.values());
  }

  async createEventCaster(eventCaster: InsertEventCaster): Promise<EventCaster> {
    const [newEventCaster] = await db.insert(eventCasters).values(eventCaster).returning();
    return newEventCaster;
  }

  async upsertEventCaster(eventCaster: InsertEventCaster): Promise<EventCaster> {
    const [upsertedEventCaster] = await db.insert(eventCasters)
      .values(eventCaster)
      .onConflictDoUpdate({
        target: [eventCasters.eventId, eventCasters.casterId],
        set: {
          perspective: eventCaster.perspective,
          mode: eventCaster.mode,
          tones: eventCaster.tones,
          isLive: eventCaster.isLive,
          updatedAt: new Date(),
        }
      })
      .returning();
    return upsertedEventCaster;
  }

  async updateEventCasterLiveStatus(eventId: string, casterId: string, isLive: boolean): Promise<EventCaster | null> {
    const [updatedEventCaster] = await db.update(eventCasters)
      .set({ 
        isLive, 
        updatedAt: new Date(),
        listenerCount: isLive ? 0 : 0 // Reset listener count when going live/offline
      })
      .where(and(
        eq(eventCasters.eventId, eventId),
        eq(eventCasters.casterId, casterId)
      ))
      .returning();
    
    // Return null if event caster not found (e.g., event deleted, database reseeded)
    // This can happen when database is reseeded while someone is broadcasting
    return updatedEventCaster || null;
  }

  // Team operations
  async getTeams(): Promise<Team[]> {
    return await db.select().from(teams);
  }

  async getTeamBySlug(slug: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.slug, slug));
    return team;
  }

  // Stream operations
  async createStreamSession(session: InsertStreamSession): Promise<StreamSession> {
    const [newSession] = await db.insert(streamSessions).values(session).returning();
    return newSession;
  }

  async endStreamSession(sessionId: string): Promise<void> {
    await db.update(streamSessions).set({ endedAt: new Date() }).where(eq(streamSessions.id, sessionId));
  }

  async getStreamSession(sessionId: string): Promise<StreamSession | undefined> {
    const [session] = await db.select().from(streamSessions).where(eq(streamSessions.id, sessionId));
    return session;
  }

  // Marker operations
  async createMarker(marker: InsertMarker): Promise<Marker> {
    const [newMarker] = await db.insert(markers).values(marker).returning();
    return newMarker;
  }

  async getMarkersBySession(sessionId: string): Promise<Marker[]> {
    return await db.select().from(markers).where(eq(markers.sessionId, sessionId));
  }

  // Tip operations
  async createTip(tip: InsertTip): Promise<Tip> {
    const [newTip] = await db.insert(tips).values(tip).returning();
    return newTip;
  }

  async getTipsBySession(sessionId: string): Promise<Tip[]> {
    return await db.select().from(tips).where(eq(tips.sessionId, sessionId));
  }

  // Follow operations
  async followCaster(follow: InsertFollow): Promise<Follow> {
    const [newFollow] = await db.insert(follows).values(follow).returning();
    return newFollow;
  }

  async unfollowCaster(followerId: string, casterId: string): Promise<void> {
    await db.delete(follows).where(
      and(
        eq(follows.followerId, followerId),
        eq(follows.casterId, casterId)
      )
    );
  }

  async getFollowing(userId: string): Promise<Follow[]> {
    return await db.select().from(follows).where(eq(follows.followerId, userId));
  }

  // Partnership implementations
  async createPartnership(data: InsertCastingPartnership): Promise<CastingPartnership> {
    const [partnership] = await db.insert(castingPartnerships).values(data).returning();
    return partnership;
  }

  async getPartnershipsByUserId(userId: string): Promise<CastingPartnership[]> {
    return await db.select().from(castingPartnerships)
      .where(or(
        eq(castingPartnerships.caster1Id, userId),
        eq(castingPartnerships.caster2Id, userId)
      ))
      .orderBy(desc(castingPartnerships.createdAt));
  }

  async getPartnershipById(id: string): Promise<CastingPartnership | undefined> {
    const [partnership] = await db.select().from(castingPartnerships).where(eq(castingPartnerships.id, id));
    return partnership;
  }

  async updatePartnership(id: string, data: Partial<InsertCastingPartnership>): Promise<CastingPartnership | undefined> {
    const [partnership] = await db.update(castingPartnerships)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(castingPartnerships.id, id))
      .returning();
    return partnership;
  }

  async deletePartnership(id: string): Promise<boolean> {
    const result = await db.delete(castingPartnerships).where(eq(castingPartnerships.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Partnership invitation implementations
  async createPartnershipInvitation(data: InsertPartnershipInvitation): Promise<PartnershipInvitation> {
    const [invitation] = await db.insert(partnershipInvitations).values(data).returning();
    return invitation;
  }

  async getInvitationsByUserId(userId: string): Promise<PartnershipInvitationWithCasters[]> {
    const invitations = await db.select().from(partnershipInvitations)
      .where(or(
        eq(partnershipInvitations.fromCasterId, userId),
        eq(partnershipInvitations.toCasterId, userId)
      ))
      .orderBy(desc(partnershipInvitations.createdAt));

    // Enrich with user and event data
    const enrichedInvitations = await Promise.all(
      invitations.map(async (invitation) => {
        const [fromCaster] = await db.select({
          id: users.id,
          screenname: users.screenname,
          profileImageUrl: users.profileImageUrl,
        }).from(users).where(eq(users.id, invitation.fromCasterId));
        
        const [toCaster] = await db.select({
          id: users.id,
          screenname: users.screenname,
          profileImageUrl: users.profileImageUrl,
        }).from(users).where(eq(users.id, invitation.toCasterId));
        
        let event = undefined;
        if (invitation.eventId) {
          const [eventData] = await db.select({
            id: events.id,
            title: events.title,
          }).from(events).where(eq(events.id, invitation.eventId));
          event = eventData;
        }
        
        return {
          ...invitation,
          fromCaster,
          toCaster,
          event,
        };
      })
    );

    return enrichedInvitations as PartnershipInvitationWithCasters[];
  }

  async getInvitationById(id: string): Promise<PartnershipInvitationWithCasters | undefined> {
    const [invitation] = await db.select().from(partnershipInvitations)
      .where(eq(partnershipInvitations.id, id));
    
    if (!invitation) return undefined;
    
    // Enrich with user and event data
    const [fromCaster] = await db.select({
      id: users.id,
      screenname: users.screenname,
      profileImageUrl: users.profileImageUrl,
    }).from(users).where(eq(users.id, invitation.fromCasterId));
    
    const [toCaster] = await db.select({
      id: users.id,
      screenname: users.screenname,
      profileImageUrl: users.profileImageUrl,
    }).from(users).where(eq(users.id, invitation.toCasterId));
    
    let event = undefined;
    if (invitation.eventId) {
      const [eventData] = await db.select({
        id: events.id,
        title: events.title,
      }).from(events).where(eq(events.id, invitation.eventId));
      event = eventData;
    }
    
    return {
      ...invitation,
      fromCaster,
      toCaster,
      event,
    } as PartnershipInvitationWithCasters;
  }

  async updateInvitationStatus(id: string, status: string): Promise<PartnershipInvitation | undefined> {
    const [invitation] = await db.update(partnershipInvitations)
      .set({ status, updatedAt: new Date() })
      .where(eq(partnershipInvitations.id, id))
      .returning();
    return invitation;
  }

  async deleteInvitation(id: string): Promise<boolean> {
    const result = await db.delete(partnershipInvitations).where(eq(partnershipInvitations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Partnership event implementations
  async createPartnershipEvent(data: InsertPartnershipEvent): Promise<PartnershipEvent> {
    const [partnershipEvent] = await db.insert(partnershipEvents).values(data).returning();
    return partnershipEvent;
  }

  async getPartnershipEventsByEventId(eventId: string): Promise<PartnershipEventWithPartnership[]> {
    const partnershipEventsData = await db.select().from(partnershipEvents)
      .where(eq(partnershipEvents.eventId, eventId))
      .orderBy(desc(partnershipEvents.createdAt));

    // Enrich with partnership and caster data
    const enrichedEvents = await Promise.all(
      partnershipEventsData.map(async (partnershipEvent) => {
        const [partnership] = await db.select().from(castingPartnerships)
          .where(eq(castingPartnerships.id, partnershipEvent.partnershipId));
        
        if (!partnership) return { ...partnershipEvent, partnership: null };
        
        const [caster1] = await db.select({
          id: users.id,
          screenname: users.screenname,
          profileImageUrl: users.profileImageUrl,
        }).from(users).where(eq(users.id, partnership.caster1Id));
        
        const [caster2] = await db.select({
          id: users.id,
          screenname: users.screenname,
          profileImageUrl: users.profileImageUrl,
        }).from(users).where(eq(users.id, partnership.caster2Id));
        
        return {
          ...partnershipEvent,
          partnership: {
            id: partnership.id,
            name: partnership.name,
            caster1,
            caster2,
          },
        };
      })
    );

    return enrichedEvents as PartnershipEventWithPartnership[];
  }

  async updatePartnershipEvent(id: string, data: Partial<InsertPartnershipEvent>): Promise<PartnershipEvent | undefined> {
    const [partnershipEvent] = await db.update(partnershipEvents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(partnershipEvents.id, id))
      .returning();
    return partnershipEvent;
  }

  async deletePartnershipEvent(id: string): Promise<boolean> {
    const result = await db.delete(partnershipEvents).where(eq(partnershipEvents.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Caster implementation
  async getCasters(filters?: {
    league?: string;
    perspective?: "home" | "away" | "neutral";
    mode?: "play-by-play" | "expert-analysis" | "fantasy-focus";  
    tones?: ("serious" | "comedy" | "family-friendly")[];
    isLive?: boolean;
    searchQuery?: string;
  }): Promise<(User & { 
    currentLiveEvents: (EventCaster & { event: Event & { homeTeam: Team; awayTeam: Team } })[]; 
    totalListeners: number;
  })[]> {
    // Get all users with casting capabilities
    let whereConditions = [eq(users.canCast, true)];

    // Apply search filter if provided
    if (filters?.searchQuery) {
      const searchTerm = `%${filters.searchQuery.toLowerCase()}%`;
      const searchCondition = or(
        sql`LOWER(${users.screenname}) LIKE ${searchTerm}`,
        sql`LOWER(${users.bio}) LIKE ${searchTerm}`
      );
      if (searchCondition) {
        whereConditions.push(searchCondition);
      }
    }

    const casters = await db.select().from(users).where(and(...whereConditions));

    // Enrich casters with their current live events and listener counts
    const enrichedCasters = await Promise.all(
      casters.map(async (caster) => {
        // Build where conditions for event casters query
        let eventWhereConditions = [eq(eventCasters.casterId, caster.id)];

        if (filters?.isLive !== undefined) {
          eventWhereConditions.push(eq(eventCasters.isLive, filters.isLive));
        }

        if (filters?.perspective) {
          eventWhereConditions.push(eq(eventCasters.perspective, filters.perspective));
        }

        if (filters?.mode) {
          eventWhereConditions.push(eq(eventCasters.mode, filters.mode));
        }

        // Create aliases for teams (simplified approach)
        const homeTeamAlias = "homeTeam";
        const awayTeamAlias = "awayTeam";

        // Get all live event casters for this caster with separate team queries
        const eventCasterResults = await db.select({
          id: eventCasters.id,
          eventId: eventCasters.eventId,
          casterId: eventCasters.casterId,
          perspective: eventCasters.perspective,
          mode: eventCasters.mode,
          tones: eventCasters.tones,
          isLive: eventCasters.isLive,
          listenerCount: eventCasters.listenerCount,
          createdAt: eventCasters.createdAt,
          updatedAt: eventCasters.updatedAt,
          event: {
            id: events.id,
            homeTeamId: events.homeTeamId,
            awayTeamId: events.awayTeamId,
            startTime: events.startTime,
            title: events.title,
            description: events.description,
            status: events.status,
            sport: events.sport,
            tags: events.tags,
            language: events.language,
            createdAt: events.createdAt,
            updatedAt: events.updatedAt,
          },
        })
        .from(eventCasters)
        .innerJoin(events, eq(eventCasters.eventId, events.id))
        .where(and(...eventWhereConditions));

        // Enrich with team data only if team IDs are present
        const casterEvents = await Promise.all(
          eventCasterResults.map(async (result) => {
            let homeTeamData = null;
            let awayTeamData = null;
            
            if (result.event.homeTeamId) {
              [homeTeamData] = await db.select().from(teams).where(eq(teams.id, result.event.homeTeamId));
            }
            if (result.event.awayTeamId) {
              [awayTeamData] = await db.select().from(teams).where(eq(teams.id, result.event.awayTeamId));
            }
            
            return {
              ...result,
              event: {
                ...result.event,
                homeTeamData,
                awayTeamData
              }
            };
          })
        );

        // Filter by league and tones (client-side filtering)
        let filteredEvents = casterEvents;
        
        if (filters?.league) {
          filteredEvents = filteredEvents.filter(eventCaster => {
            return (eventCaster.event.homeTeamData?.league === filters.league) || 
                   (eventCaster.event.awayTeamData?.league === filters.league);
          });
        }

        if (filters?.tones && filters.tones.length > 0) {
          filteredEvents = filteredEvents.filter(eventCaster => {
            return filters.tones!.some(tone => eventCaster.tones.includes(tone));
          });
        }

        // Calculate total listener count
        const totalListeners = filteredEvents.reduce((sum, event) => sum + (event.listenerCount || 0), 0);

        // Format the events properly (events already have homeTeam and awayTeam)
        const currentLiveEvents = filteredEvents;

        return {
          ...caster,
          currentLiveEvents,
          totalListeners,
        };
      })
    );

    // Filter out casters with no events if we're filtering by specific criteria
    if (filters && (filters.isLive !== undefined || filters.league || filters.perspective || filters.mode || filters.tones)) {
      return enrichedCasters.filter(caster => caster.currentLiveEvents.length > 0);
    }

    return enrichedCasters;
  }

  // Chat message operations
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [chatMessage] = await db
      .insert(chatMessages)
      .values(message)
      .returning();
    return chatMessage;
  }

  async getChatMessages(
    eventId: string, 
    casterId?: string, 
    options?: {
      limit?: number;
      offset?: number;
      onlyVisible?: boolean;
    }
  ): Promise<(ChatMessage & { 
    user: { 
      id: string; 
      screenname: string | null;
      profileImageUrl: string | null;
      canCast: boolean;
    } 
  })[]> {
    const { limit = 50, offset = 0, onlyVisible = true } = options || {};
    
    const whereConditions = [eq(chatMessages.eventId, eventId)];
    
    if (casterId) {
      whereConditions.push(eq(chatMessages.casterId, casterId));
    }
    
    if (onlyVisible) {
      whereConditions.push(eq(chatMessages.isVisible, true));
    }

    const messages = await db
      .select({
        id: chatMessages.id,
        eventId: chatMessages.eventId,
        casterId: chatMessages.casterId,
        userId: chatMessages.userId,
        message: chatMessages.message,
        type: chatMessages.type,
        isVisible: chatMessages.isVisible,
        createdAt: chatMessages.createdAt,
        user: {
          id: users.id,
          screenname: users.screenname,
          profileImageUrl: users.profileImageUrl,
          canCast: users.canCast,
        }
      })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.userId, users.id))
      .where(and(...whereConditions))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit)
      .offset(offset);

    return messages;
  }

  async updateChatMessageVisibility(messageId: string, isVisible: boolean): Promise<void> {
    await db
      .update(chatMessages)
      .set({ isVisible })
      .where(eq(chatMessages.id, messageId));
  }

  async checkRateLimit(userId: string, eventId: string): Promise<{ allowed: boolean; nextAllowedTime?: Date }> {
    // Get user to check if they can cast (casters have no rate limit)
    const user = await this.getUser(userId);
    if (!user) {
      return { allowed: false };
    }

    // Casters have no rate limit
    if (user.canCast) {
      return { allowed: true };
    }

    // For listeners, check for messages in the last minute
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    
    const recentMessages = await db
      .select({ id: chatMessages.id, createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.userId, userId),
          eq(chatMessages.eventId, eventId),
          sql`${chatMessages.createdAt} > ${oneMinuteAgo}`
        )
      )
      .orderBy(desc(chatMessages.createdAt))
      .limit(1);

    if (recentMessages.length > 0) {
      // User has sent a message in the last minute
      const lastMessageTime = recentMessages[0].createdAt;
      if (!lastMessageTime) {
        return { allowed: true };
      }
      const nextAllowedTime = new Date(lastMessageTime.getTime() + 60 * 1000);
      
      return {
        allowed: false,
        nextAllowedTime
      };
    }

    return { allowed: true };
  }

  // IVS operations
  async setupIVSChannel(userId: string, channelName: string): Promise<{
    channelArn: string;
    streamKey: string;
    playbackUrl: string;
    ingestEndpoint: string;
  }> {
    try {
      // Create IVS channel using the service
      const channelData = await ivsService.createChannel(channelName, userId);
      
      // Update user with IVS channel information
      await db.update(users)
        .set({
          ivsChannelArn: channelData.channelArn,
          ivsStreamKey: channelData.streamKey,
          ivsPlaybackUrl: channelData.playbackUrl,
          ivsIngestEndpoint: channelData.ingestEndpoint,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      
      return channelData;
    } catch (error) {
      console.error("Error setting up IVS channel:", error);
      throw error;
    }
  }

  async updateStreamSession(sessionId: string, data: {
    ivsStreamId?: string;
    ivsStreamStatus?: string;
    ivsPlaybackUrl?: string;
    ivsStreamHealth?: string;
  }): Promise<StreamSession | undefined> {
    try {
      const [updatedSession] = await db.update(streamSessions)
        .set(data)
        .where(eq(streamSessions.id, sessionId))
        .returning();
      
      return updatedSession;
    } catch (error) {
      console.error("Error updating stream session:", error);
      throw error;
    }
  }

  async getStreamSessionByEventAndCaster(eventId: string, casterId: string): Promise<StreamSession | undefined> {
    try {
      const [session] = await db
        .select()
        .from(streamSessions)
        .where(
          and(
            eq(streamSessions.eventId, eventId),
            eq(streamSessions.casterId, casterId),
            sql`${streamSessions.endedAt} IS NULL` // Only get active sessions
          )
        )
        .orderBy(desc(streamSessions.startedAt))
        .limit(1);
      
      return session;
    } catch (error) {
      console.error("Error getting stream session:", error);
      throw error;
    }
  }

  // Admin analytics operations
  async getUserRegistrationStats(days: number = 30): Promise<{
    totalUsers: number;
    newUsersToday: number;
    newUsersThisWeek: number;
    newUsersThisMonth: number;
    dailyRegistrations: { date: string; count: number }[];
  }> {
    try {
      // Total users
      const totalUsers = await db.select({ count: count() }).from(users);
      
      // New users today (last 24 hours)
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const newUsersToday = await db
        .select({ count: count() })
        .from(users)
        .where(sql`${users.createdAt} >= ${yesterday}`);
      
      // New users this week (last 7 days)
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const newUsersThisWeek = await db
        .select({ count: count() })
        .from(users)
        .where(sql`${users.createdAt} >= ${weekAgo}`);
      
      // New users this month (last 30 days)
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const newUsersThisMonth = await db
        .select({ count: count() })
        .from(users)
        .where(sql`${users.createdAt} >= ${monthAgo}`);
      
      // Daily registrations for the last N days
      const startDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
      const dailyRegistrations = await db
        .select({
          date: sql<string>`DATE(${users.createdAt}) as date`,
          count: count()
        })
        .from(users)
        .where(sql`${users.createdAt} >= ${startDate}`)
        .groupBy(sql`DATE(${users.createdAt})`)
        .orderBy(sql`DATE(${users.createdAt}) ASC`);
      
      return {
        totalUsers: totalUsers[0]?.count || 0,
        newUsersToday: newUsersToday[0]?.count || 0,
        newUsersThisWeek: newUsersThisWeek[0]?.count || 0,
        newUsersThisMonth: newUsersThisMonth[0]?.count || 0,
        dailyRegistrations: dailyRegistrations.map(d => ({
          date: d.date,
          count: d.count || 0
        }))
      };
    } catch (error) {
      console.error("Error getting user registration stats:", error);
      throw error;
    }
  }

  async getCastingStats(): Promise<{
    totalCasters: number;
    activeCasters: number;
    totalStreamSessions: number;
    liveStreams: number;
    avgSessionDuration: number;
  }> {
    try {
      // Total casters (users with canCast = true)
      const totalCasters = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.canCast, true));
      
      // Active casters (users who have cast recently, e.g., in the last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const activeCasters = await db
        .select({ count: count(sql`DISTINCT ${streamSessions.casterId}`) })
        .from(streamSessions)
        .where(sql`${streamSessions.startedAt} >= ${weekAgo}`);
      
      // Total stream sessions
      const totalStreamSessions = await db.select({ count: count() }).from(streamSessions);
      
      // Live streams (sessions without endedAt)
      const liveStreams = await db
        .select({ count: count() })
        .from(streamSessions)
        .where(sql`${streamSessions.endedAt} IS NULL`);
      
      // Average session duration (for ended sessions only)
      const avgDurationResult = await db
        .select({
          avgDuration: sql<number>`AVG(EXTRACT(EPOCH FROM (${streamSessions.endedAt} - ${streamSessions.startedAt})))`
        })
        .from(streamSessions)
        .where(sql`${streamSessions.endedAt} IS NOT NULL`);
      
      return {
        totalCasters: totalCasters[0]?.count || 0,
        activeCasters: activeCasters[0]?.count || 0,
        totalStreamSessions: totalStreamSessions[0]?.count || 0,
        liveStreams: liveStreams[0]?.count || 0,
        avgSessionDuration: avgDurationResult[0]?.avgDuration || 0
      };
    } catch (error) {
      console.error("Error getting casting stats:", error);
      throw error;
    }
  }

  async getPlatformMetrics(): Promise<{
    totalUsers: number;
    totalCasters: number;
    totalListeners: number;
    totalAdmins: number;
    totalEvents: number;
    liveEvents: number;
    totalStreamSessions: number;
    totalTips: number;
    totalMarkers: number;
  }> {
    try {
      // Total users
      const totalUsers = await db.select({ count: count() }).from(users);
      
      // Users by role
      const totalCasters = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.canCast, true));
      
      const totalAdmins = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.role, "admin"));
      
      const totalListeners = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.role, "listener"));
      
      // Events
      const totalEvents = await db.select({ count: count() }).from(events);
      const liveEvents = await db
        .select({ count: count() })
        .from(events)
        .where(eq(events.status, "live"));
      
      // Stream sessions
      const totalStreamSessions = await db.select({ count: count() }).from(streamSessions);
      
      // Tips
      const totalTips = await db.select({ count: count() }).from(tips);
      
      // Markers
      const totalMarkers = await db.select({ count: count() }).from(markers);
      
      return {
        totalUsers: totalUsers[0]?.count || 0,
        totalCasters: totalCasters[0]?.count || 0,
        totalListeners: totalListeners[0]?.count || 0,
        totalAdmins: totalAdmins[0]?.count || 0,
        totalEvents: totalEvents[0]?.count || 0,
        liveEvents: liveEvents[0]?.count || 0,
        totalStreamSessions: totalStreamSessions[0]?.count || 0,
        totalTips: totalTips[0]?.count || 0,
        totalMarkers: totalMarkers[0]?.count || 0
      };
    } catch (error) {
      console.error("Error getting platform metrics:", error);
      throw error;
    }
  }

  async getAllUsersWithCastingStats(): Promise<{
    id: string;
    email: string;
    screenname: string | null;
    role: "caster" | "listener" | "admin";
    canCast: boolean;
    createdAt: Date | null;
    totalStreamSessions: number;
    totalStreamTime: number;
    lastStreamDate: Date | null;
    isCurrentlyLive: boolean;
  }[]> {
    try {
      const usersWithStats = await db
        .select({
          id: users.id,
          email: users.email,
          screenname: users.screenname,
          role: users.role,
          canCast: users.canCast,
          createdAt: users.createdAt,
          totalStreamSessions: sql<number>`COALESCE(COUNT(${streamSessions.id}), 0)`,
          totalStreamTime: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(${streamSessions.endedAt}, NOW()) - ${streamSessions.startedAt}))), 0)`,
          lastStreamDate: sql<Date | null>`MAX(${streamSessions.startedAt})`,
          isCurrentlyLive: sql<boolean>`COUNT(CASE WHEN ${streamSessions.endedAt} IS NULL THEN 1 END) > 0`
        })
        .from(users)
        .leftJoin(streamSessions, eq(users.id, streamSessions.casterId))
        .groupBy(
          users.id,
          users.email,
          users.screenname,
          users.role,
          users.canCast,
          users.createdAt
        )
        .orderBy(desc(users.createdAt));

      return usersWithStats;
    } catch (error) {
      console.error("Error getting users with casting stats:", error);
      throw error;
    }
  }

  // Co-caster invite implementations
  async createInvite(invite: InsertInvite): Promise<Invite> {
    const [newInvite] = await db.insert(invites).values(invite).returning();
    return newInvite;
  }

  async getInvite(code: string): Promise<Invite | undefined> {
    const [invite] = await db.select().from(invites).where(eq(invites.token, code));
    return invite;
  }

  async markInviteAsUsed(code: string): Promise<void> {
    await db.update(invites)
      .set({ consumedAt: new Date() })
      .where(eq(invites.token, code));
  }

  async deleteInvite(code: string): Promise<void> {
    await db.delete(invites).where(eq(invites.token, code));
  }

  async cleanupExpiredInvites(): Promise<void> {
    await db.delete(invites).where(sql`${invites.expiresAt} < NOW()`);
  }

  // New peek/consume implementations for split invite flow
  async peekInviteByCode(code: string): Promise<{
    valid: boolean;
    reason?: 'expired' | 'used' | 'not_found' | 'session_mismatch';
    invite?: {
      id: string;
      sessionId: string;
      expiresAt: Date;
      createdAt: Date | null;
      event: {
        id: string;
        title: string;
        startTime: Date;
      };
    };
  }> {
    try {
      console.log(`[STORAGE:PEEK] Starting peek for code: ${code?.substring(0, 8)}...`);
      
      // Get invite with related data
      const [invite] = await db
        .select({
          id: invites.id,
          sessionId: invites.sessionId,
          expiresAt: invites.expiresAt,
          createdAt: invites.createdAt,
          consumedAt: invites.consumedAt,
          consumedBy: invites.consumedBy,
        })
        .from(invites)
        .where(eq(invites.token, code));

      if (!invite) {
        console.log('[STORAGE:PEEK] Invite not found');
        return { valid: false, reason: 'not_found' };
      }

      // Check if expired
      if (invite.expiresAt < new Date()) {
        console.log('[STORAGE:PEEK] Invite expired');
        return { valid: false, reason: 'expired' };
      }

      // Check if already consumed
      if (invite.consumedAt) {
        console.log('[STORAGE:PEEK] Invite already used');
        return { valid: false, reason: 'used' };
      }

      // Get event details (we need to find the event from the sessionId)
      // SessionId format is typically: eventId:casterId:timestamp
      const eventId = invite.sessionId.split(':')[0];
      const [event] = await db
        .select({
          id: events.id,
          title: events.title,
          startTime: events.startTime,
        })
        .from(events)
        .where(eq(events.id, eventId));

      if (!event) {
        console.log('[STORAGE:PEEK] Event not found for sessionId');
        return { valid: false, reason: 'session_mismatch' };
      }

      console.log(`[STORAGE:PEEK] Valid invite found for event: ${event.title}`);
      
      return {
        valid: true,
        invite: {
          id: invite.id,
          sessionId: invite.sessionId,
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt,
          event: {
            id: event.id,
            title: event.title,
            startTime: event.startTime,
          },
        },
      };
    } catch (error) {
      console.error('[STORAGE:PEEK] Error peeking invite:', error);
      return { valid: false, reason: 'not_found' };
    }
  }

  async consumeInvite(code: string, userId: string, stageArn?: string): Promise<{
    success: boolean;
    reason?: 'expired' | 'used' | 'not_found' | 'session_mismatch' | 'auth_required';
    data?: {
      sessionId: string;
      participantToken: string;
      stageArn: string;
      event: {
        id: string;
        title: string;
        startTime: Date;
      };
    };
  }> {
    try {
      console.log(`[STORAGE:CONSUME] Starting consume for code: ${code?.substring(0, 8)}... by user: ${userId?.substring(0, 8)}...`);

      if (!userId) {
        console.log('[STORAGE:CONSUME] User ID required');
        return { success: false, reason: 'auth_required' };
      }
      
      if (!stageArn) {
        console.error('[STORAGE:CONSUME] stageArn is required');
        return { success: false, reason: 'session_mismatch' };
      }

      // Get invite with all fields
      const [invite] = await db
        .select()
        .from(invites)
        .where(eq(invites.token, code));

      if (!invite) {
        console.log('[STORAGE:CONSUME] Invite not found');
        return { success: false, reason: 'not_found' };
      }

      // Check if expired
      if (invite.expiresAt < new Date()) {
        console.log('[STORAGE:CONSUME] Invite expired');
        return { success: false, reason: 'expired' };
      }

      // Handle already consumed invite with idempotency
      if (invite.consumedAt) {
        // Check if same user consumed within 2 minutes and token is still valid
        if (invite.consumedBy === userId && invite.lastTokenAt) {
          const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
          if (invite.lastTokenAt > twoMinutesAgo && invite.lastToken) {
            console.log('[STORAGE:CONSUME] Returning cached token for same user');
            
            // Get event details
            const eventId = invite.sessionId.split(':')[0];
            const [event] = await db
              .select({
                id: events.id,
                title: events.title,
                startTime: events.startTime,
              })
              .from(events)
              .where(eq(events.id, eventId));

            if (event) {
              return {
                success: true,
                data: {
                  sessionId: invite.sessionId,
                  participantToken: invite.lastToken,
                  stageArn: stageArn,
                  event: {
                    id: event.id,
                    title: event.title,
                    startTime: event.startTime,
                  },
                },
              };
            }
          }
        }
        
        console.log('[STORAGE:CONSUME] Invite already used by different user or token expired');
        return { success: false, reason: 'used' };
      }

      // Get event details
      const eventId = invite.sessionId.split(':')[0];
      const [event] = await db
        .select({
          id: events.id,
          title: events.title,
          startTime: events.startTime,
        })
        .from(events)
        .where(eq(events.id, eventId));

      if (!event) {
        console.log('[STORAGE:CONSUME] Event not found for sessionId');
        return { success: false, reason: 'session_mismatch' };
      }

      // Create IVS participant token using the ivs service with unique stageArn
      let participantToken: string;
      try {
        const { participantToken: token } = await ivsService.createParticipantToken(stageArn, invite.sessionId, userId, 'cohost');
        participantToken = token;
        console.log(`[STORAGE:CONSUME] Created IVS participant token for co-host user: ${userId.substring(0, 8)}...`);
      } catch (error) {
        console.error('[STORAGE:CONSUME] Error creating participant token:', error);
        return { success: false, reason: 'session_mismatch' };
      }

      // Mark invite as consumed and cache token
      const now = new Date();
      await db
        .update(invites)
        .set({
          consumedAt: now,
          consumedBy: userId,
          lastToken: participantToken,
          lastTokenAt: now,
        })
        .where(eq(invites.token, code));

      console.log(`[STORAGE:CONSUME] Successfully consumed invite for event: ${event.title}`);

      return {
        success: true,
        data: {
          sessionId: invite.sessionId,
          participantToken: participantToken,
          stageArn: stageArn,
          event: {
            id: event.id,
            title: event.title,
            startTime: event.startTime,
          },
        },
      };
    } catch (error) {
      console.error('[STORAGE:CONSUME] Error consuming invite:', error);
      return { success: false, reason: 'session_mismatch' };
    }
  }

  // IVS Stage persistence implementations
  async createStage(stage: InsertStage): Promise<Stage> {
    console.log(`[STORAGE:STAGE] Creating stage with key: ${stage.stageIdKey}`);
    try {
      const [newStage] = await db.insert(stages).values(stage).returning();
      console.log(`[STORAGE:STAGE] Successfully created stage: ${newStage.id}`);
      return newStage;
    } catch (error) {
      console.error('[STORAGE:STAGE] Error creating stage:', error);
      throw error;
    }
  }

  async getStageByKey(stageIdKey: string): Promise<Stage | undefined> {
    console.log(`[STORAGE:STAGE] Looking up stage by key: ${stageIdKey}`);
    try {
      const [stage] = await db
        .select()
        .from(stages)
        .where(eq(stages.stageIdKey, stageIdKey));
      
      if (stage) {
        console.log(`[STORAGE:STAGE] Found existing stage: ${stage.id}, ARN: ${stage.stageArn.substring(0, 50)}...`);
      } else {
        console.log(`[STORAGE:STAGE] No stage found for key: ${stageIdKey}`);
      }
      
      return stage;
    } catch (error) {
      console.error('[STORAGE:STAGE] Error getting stage by key:', error);
      return undefined;
    }
  }

  async updateStageSession(stageIdKey: string, sessionId: string | null): Promise<void> {
    console.log(`[STORAGE:STAGE] Updating stage ${stageIdKey} with sessionId: ${sessionId || 'null'}`);
    try {
      await db
        .update(stages)
        .set({ 
          sessionId: sessionId,
          updatedAt: new Date()
        })
        .where(eq(stages.stageIdKey, stageIdKey));
      
      console.log(`[STORAGE:STAGE] Successfully updated stage session`);
    } catch (error) {
      console.error('[STORAGE:STAGE] Error updating stage session:', error);
      throw error;
    }
  }

  async deleteStage(stageIdKey: string): Promise<void> {
    console.log(`[STORAGE:STAGE] Deleting stage with key: ${stageIdKey}`);
    try {
      await db.delete(stages).where(eq(stages.stageIdKey, stageIdKey));
      console.log(`[STORAGE:STAGE] Successfully deleted stage`);
    } catch (error) {
      console.error('[STORAGE:STAGE] Error deleting stage:', error);
      throw error;
    }
  }

  async deleteStaleStages(staleDurationHours: number): Promise<string[]> {
    console.log(`[STORAGE:STAGE] Identifying stale stages older than ${staleDurationHours} hours...`);
    try {
      const cutoffTime = new Date(Date.now() - staleDurationHours * 60 * 60 * 1000);
      
      const deletedStages = await db
        .delete(stages)
        .where(sql`${stages.updatedAt} < ${cutoffTime}`)
        .returning({ stageArn: stages.stageArn });
      
      const arns = deletedStages.map(stage => stage.stageArn);
      console.log(`[STORAGE:STAGE] Deleted ${arns.length} stale stage(s) from database`);
      
      if (arns.length > 0) {
        console.log(`[STORAGE:STAGE] Returning ${arns.length} ARN(s) for AWS deletion`);
      }
      
      return arns;
    } catch (error) {
      console.error('[STORAGE:STAGE] Error deleting stale stages:', error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();
