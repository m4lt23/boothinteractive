import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Radio, Volume2, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { getUserDisplayName } from "@/lib/utils";

interface LiveEventCardProps {
  event: {
    id: string;
    title: string;
    homeTeam: { name: string; city: string; logoUrl?: string };
    awayTeam: { name: string; city: string; logoUrl?: string };
    status: "scheduled" | "live" | "ended";
    caster?: { firstName?: string | null; lastName?: string | null; screenname?: string | null; id?: string; };
    listenerCount?: number;
    startTime: string;
    tags?: string[];
  };
  onJoinStream?: (eventId: string) => void;
}

export default function LiveEventCard({ event, onJoinStream }: LiveEventCardProps) {
  const { isAuthenticated } = useAuth();

  const handleCasterSelection = () => {
    if (!isAuthenticated) {
      // Redirect to login if not authenticated
      window.location.href = '/api/login';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "live": return "bg-red-500 animate-pulse";
      case "scheduled": return "bg-yellow-500";
      case "ended": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <Card className="hover-elevate" data-testid={`card-event-${event.id}`}>
      <CardContent className="p-4">
        {/* Top row - Status, Title, Listeners */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={`w-2 h-2 rounded-full ${getStatusColor(event.status)} flex-shrink-0`} />
            <Badge variant={event.status === "live" ? "destructive" : "secondary"} className="text-xs">
              {event.status.toUpperCase()}
            </Badge>
            <h3 className="font-medium text-sm truncate" data-testid={`text-title-${event.id}`}>
              {event.title}
            </h3>
          </div>
          {event.status === "live" && event.listenerCount && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2 flex-shrink-0">
              <Users className="w-3 h-3" />
              <span data-testid={`text-listeners-${event.id}`}>{event.listenerCount}</span>
            </div>
          )}
        </div>
        
        {/* Teams row */}
        <div className="text-xs text-muted-foreground mb-2 truncate">
          {event.homeTeam.city} {event.homeTeam.name} vs {event.awayTeam.city} {event.awayTeam.name}
        </div>
        
        {/* Caster and tags row */}
        <div className="flex items-center justify-between mb-3">
          {event.caster && (
            <div className="flex items-center gap-1 text-xs min-w-0 flex-1">
              <Radio className="w-3 h-3 text-primary flex-shrink-0" />
              <span className="truncate" data-testid={`text-caster-${event.id}`}>
                {getUserDisplayName(event.caster)}
              </span>
            </div>
          )}
          <div className="flex gap-1 ml-2">
            {event.tags?.slice(0, 2).map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs px-1 py-0">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        
        {/* Action buttons - smaller and more compact */}
        <div className="flex gap-2">
          {/* Cast this Event button */}
          {isAuthenticated ? (
            <Link to={`/event/${event.id}/broadcast`} className="flex-1">
              <Button variant="outline" size="sm" className="w-full gap-1 text-xs" data-testid={`button-cast-${event.id}`}>
                <Radio className="w-3 h-3" />
                Cast
              </Button>
            </Link>
          ) : (
            <Button 
              variant="outline" 
              size="sm"
              className="flex-1 gap-1 text-xs" 
              onClick={handleCasterSelection}
              data-testid={`button-cast-${event.id}`}
            >
              <Radio className="w-3 h-3" />
              Cast
            </Button>
          )}

          {/* Choose Caster button */}
          {event.status === "live" ? (
            isAuthenticated ? (
              <Link to={`/event/${event.id}/casters`} className="flex-1">
                <Button size="sm" className="w-full gap-1 text-xs" data-testid={`button-join-${event.id}`}>
                  <Volume2 className="w-3 h-3" />
                  Listen
                </Button>
              </Link>
            ) : (
              <Button 
                size="sm"
                className="flex-1 gap-1 text-xs" 
                onClick={handleCasterSelection}
                data-testid={`button-join-${event.id}`}
              >
                <Volume2 className="w-3 h-3" />
                Listen
              </Button>
            )
          ) : (
            isAuthenticated ? (
              <Link to={`/event/${event.id}/casters`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full gap-1 text-xs" data-testid={`button-scheduled-${event.id}`}>
                  <Volume2 className="w-3 h-3" />
                  Listen
                </Button>
              </Link>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                className="flex-1 gap-1 text-xs" 
                onClick={handleCasterSelection}
                data-testid={`button-scheduled-${event.id}`}
              >
                <Volume2 className="w-3 h-3" />
                Listen
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}