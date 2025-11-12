import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  integer,
  text,
  boolean,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table (required for auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User role enum
export const userRoleEnum = pgEnum("user_role", ["caster", "listener", "admin"]);

// Event status enum  
export const eventStatusEnum = pgEnum("event_status", ["scheduled", "live", "ended"]);

// League enum
export const leagueEnum = pgEnum("league", ["nfl", "nba", "mlb", "nhl", "college_football", "college_basketball", "soccer"]);

// Sport enum
export const sportEnum = pgEnum("sport", ["football", "basketball", "baseball", "hockey", "tennis", "golf", "racing"]);

// Caster preference enums
export const perspectiveEnum = pgEnum("perspective", ["home", "away", "neutral"]);
export const modeEnum = pgEnum("mode", ["play-by-play", "expert-analysis", "fantasy-focus"]);
export const toneEnum = pgEnum("tone", ["serious", "comedy", "pg13"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  password: varchar("password").notNull(),
  email: varchar("email").notNull(),
  screenname: varchar("screenname"), // Made nullable for migration
  profileImageUrl: varchar("profile_image_url"),
  role: userRoleEnum("role").default("listener").notNull(),
  canCast: boolean("can_cast").default(false).notNull(), // Allow users to have casting capabilities
  requiresOnboarding: boolean("requires_onboarding").default(true).notNull(), // Track migration status
  bio: text("bio"),
  socialLinks: jsonb("social_links"),
  // IVS-specific fields for casters
  ivsChannelArn: varchar("ivs_channel_arn"), // Amazon IVS channel ARN
  ivsStreamKey: varchar("ivs_stream_key"), // Secret stream key for broadcasting
  ivsPlaybackUrl: varchar("ivs_playback_url"), // Public playback URL
  ivsIngestEndpoint: varchar("ivs_ingest_endpoint"), // RTMP ingest endpoint
  // Terms and Conditions acceptance
  agreedToTerms: boolean("agreed_to_terms").default(false).notNull(),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  // Caster liability warning acceptance
  hasAgreedCasterWarning: boolean("has_agreed_caster_warning").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Case-insensitive unique index on screenname (conditional for non-null values)
  uniqueIndex("users_screenname_lower_unique").on(sql`lower(${table.screenname})`).where(sql`${table.screenname} IS NOT NULL`),
  // Case-insensitive unique index on email
  uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
]);

// Teams table
export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  league: leagueEnum("league").notNull(),
  city: varchar("city").notNull(),
  name: varchar("name").notNull(),
  slug: varchar("slug").unique().notNull(),
  logoUrl: varchar("logo_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Events table (games that casters can claim)
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  homeTeamId: varchar("home_team_id").references(() => teams.id),
  awayTeamId: varchar("away_team_id").references(() => teams.id),
  homeTeam: varchar("home_team"),
  awayTeam: varchar("away_team"),
  startTime: timestamp("start_time").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  status: eventStatusEnum("status").default("scheduled").notNull(),
  sport: sportEnum("sport").default("football").notNull(),
  tags: text("tags").array(),
  language: varchar("language").default("en"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Event casters junction table (many casters can cast same event with different styles)
export const eventCasters = pgTable("event_casters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id),
  casterId: varchar("caster_id").notNull().references(() => users.id),
  perspective: perspectiveEnum("perspective").notNull(),
  mode: modeEnum("mode").notNull(),
  tones: toneEnum("tones").array().notNull(),
  isLive: boolean("is_live").default(false).notNull(),
  listenerCount: integer("listener_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Prevent duplicate caster records for the same event
  uniqueIndex("event_casters_event_caster_unique").on(table.eventId, table.casterId),
]);

// Stream sessions table (actual live streams)
export const streamSessions = pgTable("stream_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id),
  casterId: varchar("caster_id").notNull().references(() => users.id),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  avgConcurrency: integer("avg_concurrency").default(0),
  maxConcurrency: integer("max_concurrency").default(0),
  replayUrl: varchar("replay_url"),
  // IVS-specific fields
  ivsStreamId: varchar("ivs_stream_id"), // IVS stream session ID
  ivsStreamStatus: varchar("ivs_stream_status"), // "live", "offline", "error"
  ivsPlaybackUrl: varchar("ivs_playback_url"), // Session-specific playback URL
  ivsStreamHealth: varchar("ivs_stream_health"), // "healthy", "starved", "unhealthy"
  ivsRecordingConfigArn: varchar("ivs_recording_config_arn"), // For recordings
  createdAt: timestamp("created_at").defaultNow(),
});

// Markers for key moments during streams
export const markers = pgTable("markers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => streamSessions.id),
  label: varchar("label").notNull(),
  timestampMs: integer("timestamp_ms").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tips from listeners to casters
export const tips = pgTable("tips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromUserId: varchar("from_user_id").notNull().references(() => users.id),
  toCasterId: varchar("to_caster_id").notNull().references(() => users.id),
  sessionId: varchar("session_id").references(() => streamSessions.id),
  amount: integer("amount").notNull(), // in cents
  currency: varchar("currency").default("usd"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Follows (listeners following casters)
export const follows = pgTable("follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  followerId: varchar("follower_id").notNull().references(() => users.id),
  casterId: varchar("caster_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Casting partnerships (for co-casting)
export const castingPartnerships = pgTable("casting_partnerships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caster1Id: varchar("caster1_id").notNull().references(() => users.id),
  caster2Id: varchar("caster2_id").notNull().references(() => users.id),
  name: varchar("name").notNull(), // e.g., "Mike & Sarah Sports Cast"
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Partnership invitations
export const partnershipInvitations = pgTable("partnership_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromCasterId: varchar("from_caster_id").notNull().references(() => users.id),
  toCasterId: varchar("to_caster_id").notNull().references(() => users.id),
  eventId: varchar("event_id").references(() => events.id), // Optional: invitation for specific event
  partnershipName: varchar("partnership_name").notNull(),
  message: text("message"),
  status: varchar("status").default("pending").notNull(), // pending, accepted, declined, expired
  expiresAt: timestamp("expires_at").notNull(), // Invitations expire after 7 days
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Partnership events (replaces individual event_casters for partnerships)
export const partnershipEvents = pgTable("partnership_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnershipId: varchar("partnership_id").notNull().references(() => castingPartnerships.id),
  eventId: varchar("event_id").notNull().references(() => events.id),
  perspective: perspectiveEnum("perspective").notNull(),
  mode: modeEnum("mode").notNull(),
  tones: toneEnum("tones").array().notNull(),
  isLive: boolean("is_live").default(false).notNull(),
  listenerCount: integer("listener_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Sync presets for audio sync
export const syncPresets = pgTable("sync_presets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  sourceLabel: varchar("source_label").notNull(),
  offsetMs: integer("offset_ms").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat messages for real-time chat
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id),
  casterId: varchar("caster_id").references(() => users.id), // null for general event chat
  userId: varchar("user_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  type: varchar("type").default("chat").notNull(), // "chat", "tip", "system"
  isVisible: boolean("is_visible").default(true).notNull(), // for moderation
  createdAt: timestamp("created_at").defaultNow(),
});

// Co-caster invite links for real-time streaming
export const invites = pgTable("invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(), // References live session ID (will cascade delete)
  token: text("token").notNull().unique(), // Unique token for the invite URL
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  consumedAt: timestamp("consumed_at"), // Nullable - set when invite is used
  consumedBy: varchar("consumed_by").references(() => users.id), // User who consumed the invite
  lastToken: text("last_token"), // Cached participant token for idempotency
  lastTokenAt: timestamp("last_token_at"), // When the token was created/cached
  invitedByUserId: varchar("invited_by_user_id").notNull().references(() => users.id),
}, (table) => [
  // Indexes for performance
  index("invites_token_idx").on(table.token),
  index("invites_expires_at_idx").on(table.expiresAt),
  index("invites_consumed_by_idx").on(table.consumedBy),
]);

// IVS Stages for persistent stage management
export const stages = pgTable("stages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stageIdKey: varchar("stage_id_key").notNull().unique(), // Composite key: eventId_hostUserId
  stageArn: text("stage_arn").notNull(), // AWS IVS Stage ARN
  eventId: varchar("event_id").notNull().references(() => events.id),
  hostUserId: varchar("host_user_id").notNull().references(() => users.id),
  sessionId: varchar("session_id"), // Current active session ID (nullable)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Index for composite key lookups
  index("stages_stage_id_key_idx").on(table.stageIdKey),
  // Index for event lookups
  index("stages_event_id_idx").on(table.eventId),
  // Index for host lookups
  index("stages_host_user_id_idx").on(table.hostUserId),
]);

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  events: many(events),
  streamSessions: many(streamSessions),
  sentTips: many(tips, { relationName: "sentTips" }),
  receivedTips: many(tips, { relationName: "receivedTips" }),
  following: many(follows, { relationName: "following" }),
  followers: many(follows, { relationName: "followers" }),
  syncPresets: many(syncPresets),
  chatMessages: many(chatMessages),
  casterChatMessages: many(chatMessages, { relationName: "casterMessages" }),
  // Partnership relations
  partnershipsAsCaster1: many(castingPartnerships, { relationName: "caster1" }),
  partnershipsAsCaster2: many(castingPartnerships, { relationName: "caster2" }),
  sentInvitations: many(partnershipInvitations, { relationName: "fromCaster" }),
  receivedInvitations: many(partnershipInvitations, { relationName: "toCaster" }),
}));

export const teamsRelations = relations(teams, ({ many }) => ({
  homeEvents: many(events, { relationName: "homeTeam" }),
  awayEvents: many(events, { relationName: "awayTeam" }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  homeTeam: one(teams, { fields: [events.homeTeamId], references: [teams.id], relationName: "homeTeam" }),
  awayTeam: one(teams, { fields: [events.awayTeamId], references: [teams.id], relationName: "awayTeam" }),
  streamSessions: many(streamSessions),
  eventCasters: many(eventCasters),
  partnershipEvents: many(partnershipEvents),
  partnershipInvitations: many(partnershipInvitations),
  chatMessages: many(chatMessages),
}));

export const eventCastersRelations = relations(eventCasters, ({ one }) => ({
  event: one(events, { fields: [eventCasters.eventId], references: [events.id] }),
  caster: one(users, { fields: [eventCasters.casterId], references: [users.id] }),
}));

export const streamSessionsRelations = relations(streamSessions, ({ one, many }) => ({
  event: one(events, { fields: [streamSessions.eventId], references: [events.id] }),
  caster: one(users, { fields: [streamSessions.casterId], references: [users.id] }),
  markers: many(markers),
  tips: many(tips),
}));

export const markersRelations = relations(markers, ({ one }) => ({
  session: one(streamSessions, { fields: [markers.sessionId], references: [streamSessions.id] }),
}));

export const tipsRelations = relations(tips, ({ one }) => ({
  fromUser: one(users, { fields: [tips.fromUserId], references: [users.id], relationName: "sentTips" }),
  toCaster: one(users, { fields: [tips.toCasterId], references: [users.id], relationName: "receivedTips" }),
  session: one(streamSessions, { fields: [tips.sessionId], references: [streamSessions.id] }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, { fields: [follows.followerId], references: [users.id], relationName: "following" }),
  caster: one(users, { fields: [follows.casterId], references: [users.id], relationName: "followers" }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  event: one(events, { fields: [chatMessages.eventId], references: [events.id] }),
  user: one(users, { fields: [chatMessages.userId], references: [users.id] }),
  caster: one(users, { fields: [chatMessages.casterId], references: [users.id], relationName: "casterMessages" }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  invitedByUser: one(users, { fields: [invites.invitedByUserId], references: [users.id] }),
}));

export const stagesRelations = relations(stages, ({ one }) => ({
  event: one(events, { fields: [stages.eventId], references: [events.id] }),
  hostUser: one(users, { fields: [stages.hostUserId], references: [users.id] }),
}));

export const syncPresetsRelations = relations(syncPresets, ({ one }) => ({
  user: one(users, { fields: [syncPresets.userId], references: [users.id] }),
}));

// Partnership relations
export const castingPartnershipsRelations = relations(castingPartnerships, ({ one, many }) => ({
  caster1: one(users, { fields: [castingPartnerships.caster1Id], references: [users.id], relationName: "caster1" }),
  caster2: one(users, { fields: [castingPartnerships.caster2Id], references: [users.id], relationName: "caster2" }),
  partnershipEvents: many(partnershipEvents),
}));

export const partnershipInvitationsRelations = relations(partnershipInvitations, ({ one }) => ({
  fromCaster: one(users, { fields: [partnershipInvitations.fromCasterId], references: [users.id], relationName: "fromCaster" }),
  toCaster: one(users, { fields: [partnershipInvitations.toCasterId], references: [users.id], relationName: "toCaster" }),
  event: one(events, { fields: [partnershipInvitations.eventId], references: [events.id] }),
}));

export const partnershipEventsRelations = relations(partnershipEvents, ({ one }) => ({
  partnership: one(castingPartnerships, { fields: [partnershipEvents.partnershipId], references: [castingPartnerships.id] }),
  event: one(events, { fields: [partnershipEvents.eventId], references: [events.id] }),
}));

// Safe PublicUser type that omits sensitive fields
export type PublicUser = Omit<typeof users.$inferSelect, 
  'password' | 'ivsStreamKey' | 'ivsChannelArn' | 'ivsIngestEndpoint'
>;

// Targeted Zod schemas for secure validation
// Schema for initial user registration (only safe fields) with strong password policy
export const insertAuthUserSchema = createInsertSchema(users).pick({
  email: true,
  screenname: true,
  password: true,
  agreedToTerms: true,
}).extend({
  password: z.string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  agreedToTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the Terms and Conditions to create an account" })
  }),
});

// Schema for profile updates (no sensitive fields)
export const updateProfileSchema = createInsertSchema(users).pick({
  screenname: true,
  profileImageUrl: true,
  bio: true,
  socialLinks: true,
}).partial();

// Schema for password changes
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

// Schema for onboarding completion (sets screenname)
export const completeOnboardingSchema = createInsertSchema(users).pick({
  screenname: true,
}).extend({
  screenname: z.string().min(3, "Screen name must be at least 3 characters"),
});

// Admin-only schema for role/permission changes
export const updateUserPermissionsSchema = createInsertSchema(users).pick({
  role: true,
  canCast: true,
}).partial();

// Internal schema for IVS setup (server-side only)
export const setupIvsSchema = createInsertSchema(users).pick({
  ivsChannelArn: true,
  ivsStreamKey: true,
  ivsPlaybackUrl: true,
  ivsIngestEndpoint: true,
}).partial();
export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEventCasterSchema = createInsertSchema(eventCasters).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStreamSessionSchema = createInsertSchema(streamSessions).omit({ id: true, createdAt: true });
export const insertMarkerSchema = createInsertSchema(markers).omit({ id: true, createdAt: true });
export const insertTipSchema = createInsertSchema(tips).omit({ id: true, createdAt: true });
export const insertFollowSchema = createInsertSchema(follows).omit({ id: true, createdAt: true });
export const insertSyncPresetSchema = createInsertSchema(syncPresets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export const insertInviteSchema = createInsertSchema(invites).omit({ createdAt: true });
export const insertStageSchema = createInsertSchema(stages).omit({ id: true, createdAt: true, updatedAt: true });
// Partnership schemas
export const insertCastingPartnershipSchema = createInsertSchema(castingPartnerships).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPartnershipInvitationSchema = createInsertSchema(partnershipInvitations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPartnershipEventSchema = createInsertSchema(partnershipEvents).omit({ id: true, createdAt: true, updatedAt: true });

// Type exports - using specific schemas instead of broad upsertUser
export type InsertAuthUser = z.infer<typeof insertAuthUserSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type ChangePassword = z.infer<typeof changePasswordSchema>;
export type CompleteOnboarding = z.infer<typeof completeOnboardingSchema>;
export type UpdateUserPermissions = z.infer<typeof updateUserPermissionsSchema>;
export type SetupIvs = z.infer<typeof setupIvsSchema>;

// Migration helper type to check for required onboarding
export type UserNeedsOnboarding = User & {
  requiresOnboarding: true;
  screenname: null;
};
// WARNING: Full User type contains sensitive fields (password, IVS secrets)
// Use PublicUser type for client-facing APIs instead
export type User = typeof users.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;
export type InsertEventCaster = z.infer<typeof insertEventCasterSchema>;
export type EventCaster = typeof eventCasters.$inferSelect;
export type InsertStreamSession = z.infer<typeof insertStreamSessionSchema>;
export type StreamSession = typeof streamSessions.$inferSelect;
export type InsertMarker = z.infer<typeof insertMarkerSchema>;
export type Marker = typeof markers.$inferSelect;
export type InsertTip = z.infer<typeof insertTipSchema>;
export type Tip = typeof tips.$inferSelect;
export type InsertFollow = z.infer<typeof insertFollowSchema>;
export type Follow = typeof follows.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type InsertSyncPreset = z.infer<typeof insertSyncPresetSchema>;
export type SyncPreset = typeof syncPresets.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertInvite = z.infer<typeof insertInviteSchema>;
export type Invite = typeof invites.$inferSelect;
export type InsertStage = z.infer<typeof insertStageSchema>;
export type Stage = typeof stages.$inferSelect;
// Partnership types
export type InsertCastingPartnership = z.infer<typeof insertCastingPartnershipSchema>;
export type CastingPartnership = typeof castingPartnerships.$inferSelect;
export type InsertPartnershipInvitation = z.infer<typeof insertPartnershipInvitationSchema>;
export type PartnershipInvitation = typeof partnershipInvitations.$inferSelect;
export type InsertPartnershipEvent = z.infer<typeof insertPartnershipEventSchema>;
export type PartnershipEvent = typeof partnershipEvents.$inferSelect;

// Safe caster profile type for API responses
export type SafeCasterProfile = {
  id: string;
  screenname: string | null; // Now nullable due to migration
  profileImageUrl: string | null;
  bio: string | null;
  ivsPlaybackUrl: string | null; // Keep playback URL as it's public
  canCast: boolean;
  requiresOnboarding: boolean;
};

// Composite types for API responses using safe types
export type EventCasterWithCaster = EventCaster & {
  caster: SafeCasterProfile;
};

// Minimal caster info for partnership displays
export type PartnershipCasterInfo = {
  id: string;
  screenname: string | null; // Now nullable due to migration
  profileImageUrl: string | null;
};

export type PartnershipEventWithPartnership = PartnershipEvent & {
  partnership: {
    id: string;
    name: string;
    caster1: PartnershipCasterInfo;
    caster2: PartnershipCasterInfo;
  };
};

export type PartnershipInvitationWithCasters = PartnershipInvitation & {
  fromCaster: PartnershipCasterInfo;
  toCaster: PartnershipCasterInfo;
  event?: {
    id: string;
    title: string;
  };
};
