import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Search, 
  Filter, 
  X, 
  UserPlus,
  Radio,
  Users,
  Trophy,
  Volume2,
  Star,
  Clock,
  ArrowLeft
} from "lucide-react";
import { Link } from "wouter";
import { getUserDisplayName, getUserInitials } from "@/lib/utils";
import boothLogo from "@assets/BOOTH_1757601039908.jpg";
import AppHeader from "@/components/AppHeader";

// Types for filtering
type SportType = "all" | "nfl" | "nba" | "mlb" | "nhl" | "college_football" | "college_basketball" | "soccer";
type PerspectiveType = "all" | "home" | "away" | "neutral";
type ModeType = "all" | "play-by-play" | "expert-analysis" | "fantasy-focus";
type ToneType = "all" | "serious" | "comedy" | "family-friendly";

interface CasterEvent {
  id: string;
  eventId: string;
  perspective: "home" | "away" | "neutral";
  mode: "play-by-play" | "expert-analysis" | "fantasy-focus";
  tones: ("serious" | "comedy" | "family-friendly")[];
  isLive: boolean;
  listenerCount: number;
  event: {
    id: string;
    title: string;
    status: "scheduled" | "live" | "ended";
    homeTeam: { name: string; city: string; logoUrl?: string };
    awayTeam: { name: string; city: string; logoUrl?: string };
  };
}

interface CasterWithEvents {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  screenname?: string | null;
  email: string;
  profileImageUrl?: string;
  bio?: string;
  perspective?: "home" | "away" | "neutral";
  mode?: "play-by-play" | "expert-analysis" | "fantasy-focus";
  tones?: ("serious" | "comedy" | "family-friendly")[];
  currentLiveEvents: CasterEvent[];
  totalListeners: number;
}

interface Filters {
  sport: SportType;
  perspective: PerspectiveType;
  mode: ModeType;
  tone: ToneType;
  liveOnly: boolean;
  searchQuery: string;
}

const SPORT_LABELS: Record<SportType, string> = {
  all: "All Sports",
  nfl: "NFL",
  nba: "NBA", 
  mlb: "MLB",
  nhl: "NHL",
  college_football: "College Football",
  college_basketball: "College Basketball",
  soccer: "Soccer"
};

const PERSPECTIVE_LABELS: Record<PerspectiveType, string> = {
  all: "All Perspectives",
  home: "Home Team Fan",
  away: "Away Team Fan", 
  neutral: "Neutral"
};

const MODE_LABELS: Record<ModeType, string> = {
  all: "All Modes",
  "play-by-play": "Play-by-Play",
  "expert-analysis": "Expert Analysis",
  "fantasy-focus": "Fantasy Focus"
};

const TONE_LABELS: Record<ToneType, string> = {
  all: "All Tones",
  serious: "Serious",
  comedy: "Comedy",
  "family-friendly": "Family-Friendly"
};

export default function Casters() {
  const [filters, setFilters] = useState<Filters>({
    sport: "all",
    perspective: "all",
    mode: "all", 
    tone: "all",
    liveOnly: false,
    searchQuery: ""
  });

  // Fetch casters data
  const { data: casters = [], isLoading, error } = useQuery<CasterWithEvents[]>({
    queryKey: ["/api/casters"],
    queryFn: async () => {
      const response = await fetch("/api/casters");
      if (!response.ok) {
        throw new Error("Failed to fetch casters");
      }
      return response.json();
    }
  });

  // Filter casters based on current filters
  const filteredCasters = useMemo(() => {
    return casters.filter(caster => {
      // Search filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const searchableText = [
          caster.firstName,
          caster.lastName,
          caster.bio
        ].join(" ").toLowerCase();
        
        if (!searchableText.includes(query)) {
          return false;
        }
      }

      // Live only filter
      if (filters.liveOnly && caster.currentLiveEvents.length === 0) {
        return false;
      }

      // Sport filter - check current live events or caster preferences
      if (filters.sport !== "all") {
        const hasMatchingLiveEvent = caster.currentLiveEvents.some(event => {
          // Extract league from event (simplified check)
          const eventTitle = event.event.title.toLowerCase();
          return eventTitle.includes(filters.sport.replace("_", " "));
        });

        // If no live events match the sport filter, exclude this caster
        if (!hasMatchingLiveEvent) {
          return false;
        }
      }

      // Perspective filter
      if (filters.perspective !== "all") {
        const hasMatchingPerspective = caster.currentLiveEvents.some(event => 
          event.perspective === filters.perspective
        ) || caster.perspective === filters.perspective;
        
        if (!hasMatchingPerspective) {
          return false;
        }
      }

      // Mode filter
      if (filters.mode !== "all") {
        const hasMatchingMode = caster.currentLiveEvents.some(event => 
          event.mode === filters.mode
        ) || caster.mode === filters.mode;
        
        if (!hasMatchingMode) {
          return false;
        }
      }

      // Tone filter
      if (filters.tone !== "all") {
        const hasMatchingTone = caster.currentLiveEvents.some(event => 
          event.tones.includes(filters.tone as any)
        ) || (caster.tones && caster.tones.includes(filters.tone as any));
        
        if (!hasMatchingTone) {
          return false;
        }
      }

      return true;
    });
  }, [casters, filters]);

  // Separate live and offline casters
  const liveCasters = filteredCasters.filter(c => c.currentLiveEvents.length > 0);
  const offlineCasters = filteredCasters.filter(c => c.currentLiveEvents.length === 0);

  const clearAllFilters = () => {
    setFilters({
      sport: "all",
      perspective: "all", 
      mode: "all",
      tone: "all",
      liveOnly: false,
      searchQuery: ""
    });
  };

  const updateFilter = (key: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const hasActiveFilters = filters.sport !== "all" || filters.perspective !== "all" || 
    filters.mode !== "all" || filters.tone !== "all" || filters.liveOnly || filters.searchQuery;

  const formatTones = (tones?: string[]) => {
    if (!tones || tones.length === 0) return "Serious";
    return tones.map(tone => {
      switch(tone) {
        case "serious": return "Serious";
        case "comedy": return "Comedy"; 
        case "family-friendly": return "Family";
        default: return tone;
      }
    }).join(", ");
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">Failed to load casters. Please try again.</p>
              <Button 
                className="mt-4" 
                onClick={() => window.location.reload()}
                data-testid="button-retry"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight" data-testid="text-page-title">
            Discover Casters
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto" data-testid="text-page-subtitle">
            Find the perfect commentary for your next game. From passionate hometown fans to expert analysts, 
            discover casters that match your style.
          </p>
        </div>

        {/* Filter Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-auto">
                  {[filters.sport, filters.perspective, filters.mode, filters.tone]
                    .filter(f => f !== "all").length + (filters.liveOnly ? 1 : 0) + (filters.searchQuery ? 1 : 0)} active
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search casters by name, bio, or teams..."
                value={filters.searchQuery}
                onChange={(e) => updateFilter("searchQuery", e.target.value)}
                className="pl-10"
                data-testid="input-search-casters"
              />
            </div>

            {/* Filter Selects */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Sport</label>
                <Select
                  value={filters.sport}
                  onValueChange={(value) => updateFilter("sport", value as SportType)}
                >
                  <SelectTrigger data-testid="select-sport-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SPORT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Perspective</label>
                <Select
                  value={filters.perspective}
                  onValueChange={(value) => updateFilter("perspective", value as PerspectiveType)}
                >
                  <SelectTrigger data-testid="select-perspective-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PERSPECTIVE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Mode</label>
                <Select
                  value={filters.mode}
                  onValueChange={(value) => updateFilter("mode", value as ModeType)}
                >
                  <SelectTrigger data-testid="select-mode-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tone</label>
                <Select
                  value={filters.tone}
                  onValueChange={(value) => updateFilter("tone", value as ToneType)}
                >
                  <SelectTrigger data-testid="select-tone-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TONE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Toggle Switches */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant={filters.liveOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateFilter("liveOnly", !filters.liveOnly)}
                  className="gap-2"
                  data-testid="button-live-only-filter"
                >
                  <Radio className={`w-4 h-4 ${filters.liveOnly ? 'animate-pulse' : ''}`} />
                  Live Only
                </Button>
              </div>

              {hasActiveFilters && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={clearAllFilters}
                  className="gap-2"
                  data-testid="button-clear-filters"
                >
                  <X className="w-4 h-4" />
                  Clear All
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <Skeleton className="w-12 h-12 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="w-32 h-4" />
                        <Skeleton className="w-24 h-3" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="w-full h-20 mb-4" />
                    <div className="flex gap-2 mb-4">
                      <Skeleton className="w-16 h-6" />
                      <Skeleton className="w-20 h-6" />
                    </div>
                    <Skeleton className="w-full h-10" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Live Now Section */}
        {!isLoading && liveCasters.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-green-500 animate-pulse" />
                <h2 className="text-2xl font-bold" data-testid="text-live-section-title">Live Now</h2>
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                {liveCasters.length} caster{liveCasters.length !== 1 ? 's' : ''} live
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {liveCasters.map((caster) => (
                <Card key={caster.id} className="relative">
                  {/* Live indicator */}
                  <div className="absolute top-4 right-4">
                    <Badge className="bg-green-500 text-white animate-pulse">
                      <Radio className="w-3 h-3 mr-1" />
                      LIVE
                    </Badge>
                  </div>

                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <Avatar className="w-12 h-12">
                        <AvatarImage 
                          src={caster.profileImageUrl} 
                          alt={getUserDisplayName(caster)} 
                        />
                        <AvatarFallback>
                          {getUserInitials(caster)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold" data-testid={`text-caster-name-${caster.id}`}>
                          {getUserDisplayName(caster)}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Users className="w-4 h-4" />
                          <span data-testid={`text-listener-count-${caster.id}`}>
                            {caster.totalListeners} listeners
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Bio */}
                    {caster.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-3" data-testid={`text-bio-${caster.id}`}>
                        {caster.bio}
                      </p>
                    )}

                    {/* Current Live Events */}
                    <div className="space-y-2">
                      {caster.currentLiveEvents.slice(0, 2).map((event) => (
                        <div key={event.id} className="bg-muted/50 rounded-lg p-3 space-y-2">
                          <p className="text-sm font-medium" data-testid={`text-event-title-${event.id}`}>
                            {event.event.title}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-xs">
                              {PERSPECTIVE_LABELS[event.perspective]}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {MODE_LABELS[event.mode]}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {formatTones(event.tones)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>



                    {/* Action Button */}
                    <Button 
                      className="w-full gap-2" 
                      data-testid={`button-follow-${caster.id}`}
                    >
                      <UserPlus className="w-4 h-4" />
                      Follow
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* All Casters Section */}
        {!isLoading && (filters.liveOnly ? liveCasters.length === 0 : offlineCasters.length > 0) && (
          <div className="space-y-6">
            {!filters.liveOnly && liveCasters.length > 0 && (
              <h2 className="text-2xl font-bold" data-testid="text-all-casters-title">All Casters</h2>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(filters.liveOnly ? liveCasters : offlineCasters).map((caster) => (
                <Card key={caster.id}>
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <Avatar className="w-12 h-12">
                        <AvatarImage 
                          src={caster.profileImageUrl} 
                          alt={getUserDisplayName(caster)} 
                        />
                        <AvatarFallback>
                          {getUserInitials(caster)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold" data-testid={`text-caster-name-${caster.id}`}>
                          {getUserDisplayName(caster)}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {caster.currentLiveEvents.length > 0 ? "Live" : "Offline"}
                        </p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Bio */}
                    {caster.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-3" data-testid={`text-bio-${caster.id}`}>
                        {caster.bio}
                      </p>
                    )}

                    {/* Preferences */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {caster.perspective && (
                          <Badge variant="outline" className="text-xs">
                            {PERSPECTIVE_LABELS[caster.perspective]}
                          </Badge>
                        )}
                        {caster.mode && (
                          <Badge variant="outline" className="text-xs">
                            {MODE_LABELS[caster.mode]}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {formatTones(caster.tones)}
                        </Badge>
                      </div>
                    </div>



                    {/* Action Button */}
                    <Button 
                      variant="outline" 
                      className="w-full gap-2" 
                      data-testid={`button-follow-${caster.id}`}
                    >
                      <UserPlus className="w-4 h-4" />
                      Follow
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Empty States */}
        {!isLoading && filteredCasters.length === 0 && (
          <Card className="text-center py-16">
            <CardContent className="space-y-4">
              <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold" data-testid="text-empty-state-title">
                  No casters found
                </h3>
                <p className="text-muted-foreground max-w-md mx-auto" data-testid="text-empty-state-description">
                  {hasActiveFilters 
                    ? "Try adjusting your filters to find more casters, or check back later for new talent."
                    : "No casters are available right now. Check back soon as new casters join the platform!"
                  }
                </p>
              </div>
              {hasActiveFilters && (
                <Button 
                  variant="outline" 
                  onClick={clearAllFilters}
                  className="gap-2"
                  data-testid="button-clear-filters-empty"
                >
                  <X className="w-4 h-4" />
                  Clear All Filters
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}