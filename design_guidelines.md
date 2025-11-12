# Sports Casting Platform Design Guidelines

## Design Approach
**Reference-Based Approach** - Drawing inspiration from live streaming platforms like Twitch, Discord, and sports apps like ESPN for real-time engagement patterns and mobile-first sports viewing experiences.

## Core Design Elements

### Color Palette
**Primary Colors:**
- Dark Mode: 220 15% 12% (deep navy background)
- Light Mode: 220 20% 98% (clean white)
- Brand Accent: 210 100% 56% (vibrant blue for live indicators)

**Supporting Colors:**
- Success/Live: 142 76% 36% (green for active streams)
- Warning: 38 92% 50% (amber for sync alerts)
- Error: 0 84% 60% (red for connection issues)

### Typography
- **Primary Font**: Inter (Google Fonts) - excellent readability on mobile
- **Headings**: 600-700 weight, larger line heights for impact
- **Body Text**: 400-500 weight, optimized for small screens
- **Live Data**: 500-600 weight for real-time information clarity

### Layout System
**Tailwind Spacing Units**: Primarily 2, 4, 6, and 8 for consistent rhythm
- Mobile containers: p-4, m-2
- Component spacing: gap-4, space-y-6
- Interactive elements: p-2, h-8 minimum touch targets

### Component Library

**Navigation:**
- Bottom tab bar for mobile (Home, Live, Profile, More)
- Floating action button for "Go Live" (casters only)
- Swipe-friendly gesture navigation

**Live Streaming Cards:**
- Large team logos with game status indicators
- Live listener count with pulsing animation
- Audio waveform visualization during active streams
- Quick join buttons with haptic feedback

**Audio Controls:**
- Large, thumb-friendly sync adjustment buttons (±50ms/±200ms)
- Visual sync offset display with color coding
- Simplified volume and mute controls optimized for one-handed use

**Chat Interface:**
- Minimal, overlay-style chat that doesn't obstruct main content
- Auto-hiding on inactivity during critical game moments
- Emoji-first reactions for quick engagement

**Tipping System:**
- Preset amount buttons ($1, $5, $10) with Stripe integration
- Celebration animations for successful tips
- Transparent overlay that doesn't interrupt audio

### Mobile-First Considerations

**Touch Interactions:**
- Minimum 44px touch targets for all interactive elements
- Swipe gestures for navigation between live streams
- Pull-to-refresh for live event discovery

**Performance Optimizations:**
- Progressive loading for event lists
- Optimized audio streaming indicators
- Battery-conscious background activity notifications

**Responsive Breakpoints:**
- Mobile: Focus on single-column layouts, full-width cards
- Tablet: Two-column grid for event discovery
- Desktop: Three-column layout with expanded chat panels

### Audio-Centric Design Features

**Real-Time Indicators:**
- Subtle pulsing animations for live audio
- Visual representation of audio quality/connection strength
- Clear visual feedback for sync adjustments

**Accessibility:**
- High contrast mode for outdoor sports viewing
- Large text options for users watching while multitasking
- Audio-first design with minimal visual distractions during games

### Images
**Hero Section**: Large team matchup graphics with game schedules
**Caster Profiles**: Avatar images with team affiliation badges
**Event Cards**: Team logos and stadium imagery for context
**Background**: Subtle sports-themed patterns that don't interfere with readability

The design prioritizes real-time functionality, mobile usability, and the unique dual-screen sports viewing experience while maintaining clean, accessible interfaces that work seamlessly during live sporting events.