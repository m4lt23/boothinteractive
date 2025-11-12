import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Filter, Search, X, Clock } from "lucide-react";
import { 
  Filters, 
  SportType, 
  EventStatus, 
  TimeFilter, 
  SPORT_LABELS, 
  STATUS_LABELS, 
  TIME_LABELS 
} from "@/hooks/useEventsFilters";

interface EventsFiltersProps {
  filters: Filters;
  updateFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  clearAllFilters: () => void;
  hasActiveFilters: boolean;
  compact?: boolean;
}

export default function EventsFilters({ 
  filters, 
  updateFilter, 
  clearAllFilters, 
  hasActiveFilters,
  compact = false 
}: EventsFiltersProps) {
  const FilterControls = () => (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search events, teams, or casters..."
          value={filters.searchQuery}
          onChange={(e) => updateFilter("searchQuery", e.target.value)}
          className="pl-10"
          data-testid="input-search"
        />
      </div>

      {/* Filter Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Sport Type Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium" data-testid="label-sport-filter">
            Sport
          </label>
          <Select 
            value={filters.sport} 
            onValueChange={(value: SportType) => updateFilter("sport", value)}
          >
            <SelectTrigger data-testid="select-sport">
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

        {/* Status Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium" data-testid="label-status-filter">
            Status
          </label>
          <Select 
            value={filters.status} 
            onValueChange={(value: EventStatus) => updateFilter("status", value)}
          >
            <SelectTrigger data-testid="select-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Time Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium" data-testid="label-time-filter">
            <Clock className="w-4 h-4 inline mr-1" />
            Time Range
          </label>
          <Select 
            value={filters.timeFilter} 
            onValueChange={(value: TimeFilter) => updateFilter("timeFilter", value)}
          >
            <SelectTrigger data-testid="select-time">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIME_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 pt-2" data-testid="container-active-filters">
          {filters.sport !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {SPORT_LABELS[filters.sport]}
              <button 
                onClick={() => updateFilter("sport", "all")}
                className="ml-1 hover:text-destructive"
                data-testid="button-remove-sport-filter"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.status !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {STATUS_LABELS[filters.status]}
              <button 
                onClick={() => updateFilter("status", "all")}
                className="ml-1 hover:text-destructive"
                data-testid="button-remove-status-filter"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.timeFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {TIME_LABELS[filters.timeFilter]}
              <button 
                onClick={() => updateFilter("timeFilter", "all")}
                className="ml-1 hover:text-destructive"
                data-testid="button-remove-time-filter"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.searchQuery && (
            <Badge variant="secondary" className="gap-1">
              "{filters.searchQuery}"
              <button 
                onClick={() => updateFilter("searchQuery", "")}
                className="ml-1 hover:text-destructive"
                data-testid="button-remove-search-filter"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );

  if (compact) {
    // Mobile/compact layout - use accordion
    return (
      <div className="border-b bg-background">
        <div className="container mx-auto px-4">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="filters" className="border-0">
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  <span className="font-medium">Filters</span>
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="ml-2">
                      {Object.values(filters).filter(v => v !== "all" && v !== "").length}
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-muted-foreground">
                    Filter events by sport, status, time, or search
                  </span>
                  {hasActiveFilters && (
                    <Button 
                      variant="outline" 
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
                <FilterControls />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    );
  }

  // Desktop/full layout - use card
  return (
    <div className="border-b bg-background">
      <div className="container mx-auto px-4 py-4">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="w-5 h-5" />
                Filters
              </CardTitle>
              {hasActiveFilters && (
                <Button 
                  variant="outline" 
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
          </CardHeader>
          <CardContent>
            <FilterControls />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}