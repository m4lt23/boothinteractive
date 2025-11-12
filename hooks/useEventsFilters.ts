import { useState, useMemo } from "react";

// Types for filtering
export type SportType = "all" | "nfl" | "nba" | "mlb" | "nhl" | "college_football" | "college_basketball" | "soccer";
export type EventStatus = "all" | "live" | "scheduled" | "ended";
export type TimeFilter = "all" | "today" | "this_week" | "this_month" | "custom";

export interface EventWithTeams {
  id: string;
  title: string;
  homeTeam: { name: string; city: string; logoUrl?: string };
  awayTeam: { name: string; city: string; logoUrl?: string };
  status: "scheduled" | "live" | "ended";
  caster?: { firstName: string; lastName: string };
  listenerCount?: number;
  startTime: string;
  tags?: string[];
  league?: SportType;
}

export interface Filters {
  sport: SportType;
  status: EventStatus;
  timeFilter: TimeFilter;
  searchQuery: string;
}

export const SPORT_LABELS: Record<SportType, string> = {
  all: "All Sports",
  nfl: "NFL",
  nba: "NBA", 
  mlb: "MLB",
  nhl: "NHL",
  college_football: "College Football",
  college_basketball: "College Basketball",
  soccer: "Soccer"
};

export const STATUS_LABELS: Record<EventStatus, string> = {
  all: "All Events",
  live: "Live",
  scheduled: "Upcoming", 
  ended: "Completed"
};

export const TIME_LABELS: Record<TimeFilter, string> = {
  all: "All Time",
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  custom: "Custom Range"
};

export function useEventsFilters(events: EventWithTeams[] = []) {
  const [filters, setFilters] = useState<Filters>({
    sport: "all",
    status: "all", 
    timeFilter: "all",
    searchQuery: ""
  });

  // Filter events based on current filters
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Sport filter
      if (filters.sport !== "all" && event.league !== filters.sport) {
        return false;
      }

      // Status filter
      if (filters.status !== "all" && event.status !== filters.status) {
        return false;
      }

      // Search filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const searchableText = [
          event.title,
          event.homeTeam.name,
          event.homeTeam.city,
          event.awayTeam.name, 
          event.awayTeam.city,
          event.caster?.firstName,
          event.caster?.lastName,
          ...(event.tags || [])
        ].join(" ").toLowerCase();
        
        if (!searchableText.includes(query)) {
          return false;
        }
      }

      // Time filter
      if (filters.timeFilter !== "all") {
        const eventDate = new Date(event.startTime);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        switch (filters.timeFilter) {
          case "today":
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            if (eventDate < today || eventDate >= tomorrow) return false;
            break;
          case "this_week":
            const weekStart = new Date(today);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 7);
            if (eventDate < weekStart || eventDate >= weekEnd) return false;
            break;
          case "this_month":
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            if (eventDate < monthStart || eventDate >= monthEnd) return false;
            break;
        }
      }

      return true;
    });
  }, [events, filters]);

  // Update filter functions
  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearAllFilters = () => {
    setFilters({
      sport: "all",
      status: "all",
      timeFilter: "all", 
      searchQuery: ""
    });
  };

  const hasActiveFilters = filters.sport !== "all" || 
                          filters.status !== "all" || 
                          filters.timeFilter !== "all" || 
                          filters.searchQuery !== "";

  return {
    filters,
    filteredEvents,
    updateFilter,
    clearAllFilters,
    hasActiveFilters
  };
}