import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Users, Radio, Play, Filter } from "lucide-react";
import { Link } from "wouter";
import { getUserDisplayName, getUserInitials } from "@/lib/utils";
import { Chip } from "@/components/ui/Chip";
import { FilterGroup } from "@/components/ui/FilterGroup";
import AppHeader from "@/components/AppHeader";

type Perspective = "home" | "away" | "neutral";
type Mode = "playbyplay" | "expert" | "fantasy";
type Tone = "serious" | "comedy" | "pg13";

interface CasterFilters {
  perspective: Perspective | null;
  mode: Mode | null;
  tones: Tone[];
}

interface EventCaster {
  id: string;
  eventId: string;
  casterId: string;
  perspective: Perspective;
  mode: Mode;
  tones: Tone[];
  isLive: boolean;
  listenerCount: number;
  caster: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    screenname?: string | null;
    profileImageUrl?: string;
    bio?: string;
    teamsCovered?: string[];
  };
}

interface Event {
  id: string;
  title: string;
  homeTeam: { name: string; city: string };
  awayTeam: { name: string; city: string };
  startTime: string;
  status: "scheduled" | "live" | "ended";
}

export default function EventCasters() {
  const [match, params] = useRoute("/event/:eventId/casters");
  const eventId = params?.eventId;
  const [, setLocation] = useLocation();
  
  const [filters, setFilters] = useState<CasterFilters>({
    perspective: null,
    mode: null,
    tones: []
  });

  // Fetch event details
  const { data: event } = useQuery<Event>({
    queryKey: [`/api/events/${eventId}`],
    enabled: !!eventId,
  });

  // Fetch casters for this event  
  const { data: rawEventCasters = [] } = useQuery<any[]>({
    queryKey: [`/api/events/${eventId}/casters`],
    enabled: !!eventId,
  });

  // Transform legacy format to internal format for consistency
  const eventCasters: EventCaster[] = useMemo(() => {
    return rawEventCasters.map(caster => ({
      ...caster,
      mode: caster.mode === 'play-by-play' ? 'playbyplay' : 
            caster.mode === 'expert-analysis' ? 'expert' :
            caster.mode === 'fantasy-focus' ? 'fantasy' : caster.mode,
      tones: caster.tones.map((tone: string) => 
        tone === 'family-friendly' ? 'pg13' : tone
      )
    }));
  }, [rawEventCasters]);

  // Filter casters based on selected filters
  const filteredCasters = useMemo(() => {
    return eventCasters.filter((caster) => {
      // Only show live casters to avoid confusion
      if (!caster.isLive) {
        return false;
      }
      
      // Perspective filter
      if (filters.perspective && caster.perspective !== filters.perspective) {
        return false;
      }
      
      // Mode filter
      if (filters.mode && caster.mode !== filters.mode) {
        return false;
      }
      
      // Tones filter (at least one tone must match if filter is applied)
      if (filters.tones.length > 0) {
        const hasMatchingTone = filters.tones.some(filterTone => 
          caster.tones.includes(filterTone)
        );
        if (!hasMatchingTone) {
          return false;
        }
      }
      
      return true;
    });
  }, [eventCasters, filters]);

  // Filter button handlers
  const handlePerspectiveFilter = (perspective: Perspective) => {
    setFilters(prev => ({
      ...prev,
      perspective: prev.perspective === perspective ? null : perspective
    }));
  };

  const handleModeFilter = (mode: Mode) => {
    setFilters(prev => ({
      ...prev,
      mode: prev.mode === mode ? null : mode
    }));
  };

  const handleToneFilter = (tone: Tone) => {
    setFilters(prev => {
      const currentTones = prev.tones;
      const isSelected = currentTones.includes(tone);
      
      return {
        ...prev,
        tones: isSelected 
          ? currentTones.filter(t => t !== tone)
          : [...currentTones, tone]
      };
    });
  };

  const clearAllFilters = () => {
    setFilters({
      perspective: null,
      mode: null,
      tones: []
    });
  };

  const hasActiveFilters = filters.perspective || filters.mode || filters.tones.length > 0;

  const handleJoinCaster = (eventCasterId: string) => {
    console.log("DEBUG: Joining event caster:", eventCasterId);
    console.log("DEBUG: Current eventId:", eventId);
    const targetUrl = `/stream/${eventId}/${eventCasterId}`;
    console.log("DEBUG: Navigating to URL:", targetUrl);
    // Navigate to stream player to listen to caster's audio stream
    setLocation(targetUrl);
    console.log("DEBUG: Navigation called");
  };

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Radio className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Loading event details...</p>
        </div>
      </div>
    );
  }

  const isLive = event.status === "live";
  const liveCastersCount = filteredCasters.filter(c => c.isLive).length;
  const totalListeners = filteredCasters.reduce((sum, c) => sum + c.listenerCount, 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      {/* Event Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
            
            <div className="flex-1">
              <h1 className="text-xl font-semibold" data-testid="text-event-title">
                {event.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {event.awayTeam.city} {event.awayTeam.name} @ {event.homeTeam.city} {event.homeTeam.name}
              </p>
            </div>
            
            {isLive && (
              <Badge variant="destructive" className="gap-1">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                LIVE
              </Badge>
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Stats */}
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4" />
              {liveCastersCount} casters live
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              {totalListeners} total listeners
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="sticky top-16 z-10 w-full border-b bg-background/80 backdrop-blur -mx-4 px-4">
            <div className="max-w-6xl mx-auto py-3">
              {/* Desktop Filter Toolbar */}
              <div className="hidden sm:flex flex-wrap items-center gap-4">
                <FilterGroup label="Mode">
                  <Chip active={filters.mode === 'playbyplay'} onClick={() => handleModeFilter('playbyplay')}>Play-by-Play</Chip>
                  <Chip active={filters.mode === 'expert'} onClick={() => handleModeFilter('expert')}>Expert Analysis</Chip>
                  <Chip active={filters.mode === 'fantasy'} onClick={() => handleModeFilter('fantasy')}>Fantasy Focused</Chip>
                </FilterGroup>

                <FilterGroup label="Tone">
                  <Chip active={filters.tones.includes('serious')} onClick={() => handleToneFilter('serious')}>Serious</Chip>
                  <Chip active={filters.tones.includes('comedy')} onClick={() => handleToneFilter('comedy')}>Comedy</Chip>
                  <Chip active={filters.tones.includes('pg13')} onClick={() => handleToneFilter('pg13')}>PG-13</Chip>
                </FilterGroup>

                <FilterGroup label="Perspective">
                  <Chip active={filters.perspective === 'home'} onClick={() => handlePerspectiveFilter('home')}>
                    {event.homeTeam.name} Fan
                  </Chip>
                  <Chip active={filters.perspective === 'away'} onClick={() => handlePerspectiveFilter('away')}>
                    {event.awayTeam.name} Fan
                  </Chip>
                  <Chip active={filters.perspective === 'neutral'} onClick={() => handlePerspectiveFilter('neutral')}>Neutral</Chip>
                </FilterGroup>

                {/* Right side */}
                <div className="ml-auto flex items-center gap-3">
                  {hasActiveFilters && (
                    <button 
                      className="text-sm text-muted-foreground hover:underline" 
                      onClick={clearAllFilters}
                    >
                      Clear filters
                    </button>
                  )}
                  <span className="text-sm text-muted-foreground">{filteredCasters.length} casters</span>
                </div>
              </div>

              {/* Mobile Filter Button */}
              <div className="sm:hidden flex items-center justify-between">
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Filters
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0.5">
                      {(filters.perspective ? 1 : 0) + (filters.mode ? 1 : 0) + filters.tones.length}
                    </Badge>
                  )}
                </Button>
                <span className="text-sm text-muted-foreground">{filteredCasters.length} casters</span>
              </div>
            </div>
          </div>

          {/* Optional: Mobile filter summary */}
          {hasActiveFilters && (
            <div className="sm:hidden text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded text-center">
              {filters.mode && `Mode: ${filters.mode === 'playbyplay' ? 'Play-by-Play' : filters.mode === 'expert' ? 'Expert' : 'Fantasy'}`}
              {filters.mode && filters.tones.length > 0 && ' • '}
              {filters.tones.length > 0 && `Tone: ${filters.tones.map(t => t === 'pg13' ? 'PG-13' : t).join(', ')}`}
              {(filters.mode || filters.tones.length > 0) && filters.perspective && ' • '}
              {filters.perspective && `Perspective: ${filters.perspective === 'home' ? `${event.homeTeam.name} Fan` : filters.perspective === 'away' ? `${event.awayTeam.name} Fan` : 'Neutral'}`}
            </div>
          )}

          {/* Results */}
          <div className="space-y-4 mt-6">
            <h3 className="text-lg font-semibold">
              Available Casters
            </h3>

            {filteredCasters.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredCasters.map((eventCaster) => (
                  <Card key={eventCaster.id} className="hover-elevate">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarImage 
                            src={eventCaster.caster.profileImageUrl} 
                            alt={getUserDisplayName(eventCaster.caster)} 
                          />
                          <AvatarFallback>
                            {getUserInitials(eventCaster.caster)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1">
                          <CardTitle className="text-base">
                            {getUserDisplayName(eventCaster.caster)}
                          </CardTitle>
                          {eventCaster.isLive && (
                            <div className="flex items-center gap-1 text-sm text-red-600">
                              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                              LIVE • {eventCaster.listenerCount} listening
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-4">
                      {eventCaster.caster.bio && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {eventCaster.caster.bio}
                        </p>
                      )}
                      
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {eventCaster.perspective === "home" && `${event.homeTeam.name} Fan`}
                          {eventCaster.perspective === "away" && `${event.awayTeam.name} Fan`}  
                          {eventCaster.perspective === "neutral" && "Neutral"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {eventCaster.mode === "playbyplay" && "Play-by-Play"}
                          {eventCaster.mode === "expert" && "Expert"}
                          {eventCaster.mode === "fantasy" && "Fantasy"}
                        </Badge>
                        {eventCaster.tones.map((tone) => (
                          <Badge key={tone} variant="outline" className="text-xs">
                            {tone === "pg13" ? "PG-13" : tone}
                          </Badge>
                        ))}
                      </div>
                      
                      <Button 
                        className="w-full gap-2" 
                        onClick={() => handleJoinCaster(eventCaster.id)}
                        data-testid={`button-join-caster-${eventCaster.id}`}
                        variant={eventCaster.isLive ? "default" : "outline"}
                      >
                        <Play className="w-4 h-4" />
                        {eventCaster.isLive ? "Join Live Stream" : "Listen to Replay"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <Radio className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No casters match your filters</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Try adjusting your preferences or clear all filters
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}