# Overview

BOOTH is a live sports commentary platform connecting independent sports casters with listeners for real-time audio commentary. It provides a mobile-first, second-screen audio experience where casters can create channels, schedule games, and broadcast live, while listeners can discover streams, sync audio, and engage via chat and tips. The platform acts as a marketplace for commentators to build audiences and monetize content, enhancing the sports viewing experience for fans with personalized commentary.

# Recent Changes

## November 5, 2025
- **Event Display Bug Fix**: Resolved critical bug where events with manual team name entries were not appearing in the schedule view. The `fetchScheduledEvents` function in `liveSessions.ts` was only querying for events with `status = 'live'` and required team IDs. Updated to query all events and properly support manual team name entries (using `homeTeam`/`awayTeam` text fields when `homeTeamId`/`awayTeamId` are null).
- **Database Connection Stability**: Added robust error handling to the PostgreSQL connection pool in `db.ts` to prevent uncaught exceptions from terminating the application during connection issues.

## November 4, 2025
- **Multi-Host Display Enhancement**: Updated the stream list UI to display all active participants (host + co-hosts) instead of just the primary host. Listeners now see all broadcaster names separated by " + " (e.g., "HostName + Co-HostName") when browsing available streams on the Event page.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Framework**: React with TypeScript (Vite)
- **Styling**: Tailwind CSS, shadcn/ui for mobile-first design
- **State Management**: TanStack React Query
- **Routing**: Wouter
- **Component Strategy**: Modular and reusable UI components.

## Backend
- **Runtime**: Node.js with Express.js (TypeScript)
- **API Design**: RESTful API
- **Real-time Communication**: WebSocket integration for chat and streaming
- **Session Management**: Express sessions with PostgreSQL store.

## Authentication System
- **Provider**: Replit's OpenID Connect
- **Session Storage**: PostgreSQL-backed sessions (connect-pg-simple)
- **User Roles**: Caster, listener, administrator roles
- **Security**: Secure session cookies, CSRF protection.

## Database Design
- **Primary Database**: PostgreSQL with Drizzle ORM
- **Schema**: Users, Events, Teams, Stream sessions, Tips, and Follows tables
- **Connection**: Neon serverless PostgreSQL.

## Live Streaming
- **Audio Streaming**: WebRTC integration for low-latency audio
- **Sync Technology**: Audio synchronization with manual offset adjustments
- **Chat System**: Real-time chat via WebSockets
- **Stream Management**: Session-based lifecycle management and status tracking.

## Mobile-First Design
- **Responsive Design**: Tailwind CSS breakpoint system
- **Interactions**: Large touch targets, gesture-friendly navigation
- **Performance**: Optimized asset loading, minimal JavaScript
- **PWA Ready**: Service worker support and manifest configuration.

## Technical Implementations
- **Audio Architecture**: Dual-path audio system (direct mic and mixer via feature flags) for rollback safety.
- **Co-host Management**: Robust auto-reconnect, auto-join, and clean disconnect flows for co-hosts, addressing race conditions and UI synchronization.
- **IVS Integration**: Event-driven subscription for IVS Stages, ensuring reliable audio playback and preventing connection issues.

# External Dependencies

## Core Frameworks
- **React Ecosystem**: React 18, TypeScript, Wouter, TanStack React Query
- **Build Tools**: Vite, ESBuild
- **Styling**: Tailwind CSS, PostCSS, Autoprefixer.

## UI Component Libraries
- **Design System**: shadcn/ui (Radix UI primitives)
- **Icons**: Lucide React.

## Database and ORM
- **Database**: Neon serverless PostgreSQL
- **ORM**: Drizzle ORM, Drizzle Kit
- **Connection**: @neondatabase/serverless.

## Authentication and Security
- **OpenID Connect**: Replit's authentication
- **Session Storage**: connect-pg-simple
- **Security**: Passport.js.

## Planned Integrations
- **Payment Processing**: Stripe (tips, subscriptions)
- **Real-time Audio**: LiveKit or similar WebRTC solution
- **Cloud Storage**: For recorded replays and audio clips
- **Analytics**: For listener engagement.

## Development and Deployment
- **Development**: Replit environment
- **Type Safety**: TypeScript
- **Code Quality**: ESLint, Prettier
- **Deployment**: Production build optimization.