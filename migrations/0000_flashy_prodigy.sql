CREATE TYPE "public"."event_status" AS ENUM('scheduled', 'live', 'ended');--> statement-breakpoint
CREATE TYPE "public"."league" AS ENUM('nfl', 'nba', 'mlb', 'nhl', 'college_football', 'college_basketball', 'soccer');--> statement-breakpoint
CREATE TYPE "public"."mode" AS ENUM('play-by-play', 'expert-analysis', 'fantasy-focus');--> statement-breakpoint
CREATE TYPE "public"."perspective" AS ENUM('home', 'away', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."sport" AS ENUM('football', 'basketball', 'baseball', 'hockey', 'tennis', 'golf', 'racing');--> statement-breakpoint
CREATE TYPE "public"."tone" AS ENUM('serious', 'comedy', 'pg13');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('caster', 'listener', 'admin');--> statement-breakpoint
CREATE TABLE "casting_partnerships" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caster1_id" varchar NOT NULL,
	"caster2_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"caster_id" varchar,
	"user_id" varchar NOT NULL,
	"message" text NOT NULL,
	"type" varchar DEFAULT 'chat' NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "event_casters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"caster_id" varchar NOT NULL,
	"perspective" "perspective" NOT NULL,
	"mode" "mode" NOT NULL,
	"tones" "tone"[] NOT NULL,
	"is_live" boolean DEFAULT false NOT NULL,
	"listener_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_team_id" varchar,
	"away_team_id" varchar,
	"home_team" varchar,
	"away_team" varchar,
	"start_time" timestamp NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"status" "event_status" DEFAULT 'scheduled' NOT NULL,
	"sport" "sport" DEFAULT 'football' NOT NULL,
	"tags" text[],
	"language" varchar DEFAULT 'en',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" varchar NOT NULL,
	"caster_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"consumed_at" timestamp,
	"consumed_by" varchar,
	"last_token" text,
	"last_token_at" timestamp,
	"invited_by_user_id" varchar NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "markers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"label" varchar NOT NULL,
	"timestamp_ms" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "partnership_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partnership_id" varchar NOT NULL,
	"event_id" varchar NOT NULL,
	"perspective" "perspective" NOT NULL,
	"mode" "mode" NOT NULL,
	"tones" "tone"[] NOT NULL,
	"is_live" boolean DEFAULT false NOT NULL,
	"listener_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "partnership_invitations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_caster_id" varchar NOT NULL,
	"to_caster_id" varchar NOT NULL,
	"event_id" varchar,
	"partnership_name" varchar NOT NULL,
	"message" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id_key" varchar NOT NULL,
	"stage_arn" text NOT NULL,
	"event_id" varchar NOT NULL,
	"host_user_id" varchar NOT NULL,
	"session_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "stages_stage_id_key_unique" UNIQUE("stage_id_key")
);
--> statement-breakpoint
CREATE TABLE "stream_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"caster_id" varchar NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp,
	"avg_concurrency" integer DEFAULT 0,
	"max_concurrency" integer DEFAULT 0,
	"replay_url" varchar,
	"ivs_stream_id" varchar,
	"ivs_stream_status" varchar,
	"ivs_playback_url" varchar,
	"ivs_stream_health" varchar,
	"ivs_recording_config_arn" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sync_presets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"source_label" varchar NOT NULL,
	"offset_ms" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league" "league" NOT NULL,
	"city" varchar NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"logo_url" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "teams_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tips" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" varchar NOT NULL,
	"to_caster_id" varchar NOT NULL,
	"session_id" varchar,
	"amount" integer NOT NULL,
	"currency" varchar DEFAULT 'usd',
	"stripe_payment_intent_id" varchar,
	"message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"password" varchar NOT NULL,
	"email" varchar NOT NULL,
	"screenname" varchar,
	"profile_image_url" varchar,
	"role" "user_role" DEFAULT 'listener' NOT NULL,
	"can_cast" boolean DEFAULT false NOT NULL,
	"requires_onboarding" boolean DEFAULT true NOT NULL,
	"bio" text,
	"social_links" jsonb,
	"ivs_channel_arn" varchar,
	"ivs_stream_key" varchar,
	"ivs_playback_url" varchar,
	"ivs_ingest_endpoint" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "casting_partnerships" ADD CONSTRAINT "casting_partnerships_caster1_id_users_id_fk" FOREIGN KEY ("caster1_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "casting_partnerships" ADD CONSTRAINT "casting_partnerships_caster2_id_users_id_fk" FOREIGN KEY ("caster2_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_caster_id_users_id_fk" FOREIGN KEY ("caster_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_casters" ADD CONSTRAINT "event_casters_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_casters" ADD CONSTRAINT "event_casters_caster_id_users_id_fk" FOREIGN KEY ("caster_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_caster_id_users_id_fk" FOREIGN KEY ("caster_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_consumed_by_users_id_fk" FOREIGN KEY ("consumed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markers" ADD CONSTRAINT "markers_session_id_stream_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."stream_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnership_events" ADD CONSTRAINT "partnership_events_partnership_id_casting_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "public"."casting_partnerships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnership_events" ADD CONSTRAINT "partnership_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnership_invitations" ADD CONSTRAINT "partnership_invitations_from_caster_id_users_id_fk" FOREIGN KEY ("from_caster_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnership_invitations" ADD CONSTRAINT "partnership_invitations_to_caster_id_users_id_fk" FOREIGN KEY ("to_caster_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnership_invitations" ADD CONSTRAINT "partnership_invitations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_caster_id_users_id_fk" FOREIGN KEY ("caster_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_presets" ADD CONSTRAINT "sync_presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_to_caster_id_users_id_fk" FOREIGN KEY ("to_caster_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_session_id_stream_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."stream_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_casters_event_caster_unique" ON "event_casters" USING btree ("event_id","caster_id");--> statement-breakpoint
CREATE INDEX "invites_token_idx" ON "invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invites_expires_at_idx" ON "invites" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "invites_consumed_by_idx" ON "invites" USING btree ("consumed_by");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "stages_stage_id_key_idx" ON "stages" USING btree ("stage_id_key");--> statement-breakpoint
CREATE INDEX "stages_event_id_idx" ON "stages" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "stages_host_user_id_idx" ON "stages" USING btree ("host_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_screenname_lower_unique" ON "users" USING btree (lower("screenname")) WHERE "users"."screenname" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));