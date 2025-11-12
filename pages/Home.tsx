import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radio, Calendar, TrendingUp, Users, Settings, Filter } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { usePostLoginRedirect } from "@/hooks/usePostLoginRedirect";
import { getUserDisplayName } from "@/lib/utils";
import LiveEventCard from "@/components/LiveEventCard";
import CasterProfile from "@/components/CasterProfile";
import UserProfile from "@/components/UserProfile";
import AppHeader from "@/components/AppHeader";
import MainTabs from "@/components/MainTabs";
import EventsFilters from "@/components/EventsFilters";
import { useEventsFilters } from "@/hooks/useEventsFilters";
import CreateEventForm from "@/components/CreateEventForm";

export default function Home() {
  const { user } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedSport, setSelectedSport] = useState<string>("all");
  const [currentTab, setCurrentTab] = useState("live");
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [, navigate] = useLocation();
  
  // Handle post-login redirect
  usePostLoginRedirect();

  // Sports configuration
  const sports = [
    { value: "all", label: "All Sports" },
    { value: "football", label: "Football" },
    { value: "basketball", label: "Basketball" },
    { value: "baseball", label: "Baseball" },
    { value: "hockey", label: "Hockey" },
    { value: "tennis", label: "Tennis" },
    { value: "golf", label: "Golf" },
    { value: "racing", label: "Car Racing" }
  ];

  // Example caster data for following tab
  const followingCasters = [
    {
      id: "caster-1",
      name: "SportsTalk Mike",
      followers: 15240,
      totalStreams: 89,
      rating: 4.8,
      isLive: true,
      sport: "basketball"
    },
    {
      id: "caster-2", 
      name: "Football Fanatic",
      followers: 8920,
      totalStreams: 156,
      rating: 4.6,
      isLive: false,
      sport: "football"
    },
    {
      id: "caster-3",
      name: "Hockey Analytics",
      followers: 3450,
      totalStreams: 67,
      rating: 4.9,
      isLive: true,
      sport: "hockey"
    }
  ];

  // Get tonight's events from the API
  const { data: tonight = [], isLoading } = useQuery({
    queryKey: ['/api/events/schedule'],
    queryFn: async () => (await apiRequest('GET', '/api/events/schedule')).json(),
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Initialize filters for events
  const { 
    filters, 
    filteredEvents, 
    updateFilter, 
    clearAllFilters, 
    hasActiveFilters 
  } = useEventsFilters(tonight);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <MainTabs value={currentTab} onValueChange={setCurrentTab} />
      
      {currentTab === "live" && (
        <EventsFilters 
          filters={filters}
          updateFilter={updateFilter}
          clearAllFilters={clearAllFilters}
          hasActiveFilters={hasActiveFilters}
          compact={false}
        />
      )}

      <div className="container mx-auto px-4 py-8">
        {/* Tab Content */}
        {currentTab === "live" && (
          <div className="space-y-6">
            {/* Live Events Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold" data-testid="text-tonight-events-title">
                  Live Events
                </h1>
                {user?.role === 'admin' && (
                  <Dialog open={isCreateEventOpen} onOpenChange={setIsCreateEventOpen}>
                    <DialogTrigger asChild>
                      <Button variant="default" data-testid="button-open-create-event">
                        Create Event
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                      <CreateEventForm 
                        onSuccess={() => {
                          setIsCreateEventOpen(false);
                          queryClient.invalidateQueries({ queryKey: ['/api/events/schedule'] });
                        }}
                        onCancel={() => {
                          setIsCreateEventOpen(false);
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              
              {isLoading ? (
                <p>Loading…</p>
              ) : filteredEvents.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <Radio className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {hasActiveFilters ? "No events match your filters." : "No scheduled events for tonight."}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {filteredEvents.map((e: any) => (
                    <Card key={e.eventId} data-testid={`card-event-${e.eventId}`}>
                      <CardContent className="flex items-center justify-between p-4 gap-4">
                        <div className="flex-1 min-w-0">
                          {e.title && (
                            <div className="font-semibold text-base mb-1" data-testid={`text-event-title-${e.eventId}`}>
                              {e.title}
                            </div>
                          )}
                          <div className="font-medium" data-testid={`text-event-teams-${e.eventId}`}>
                            {e.home} vs {e.away}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1" data-testid={`text-event-meta-${e.eventId}`}>
                            {new Date(e.startAt).toLocaleTimeString()} · {e.liveCasterCount} live {e.liveCasterCount === 1 ? 'caster' : 'casters'}
                          </div>
                          {e.tags && e.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2" data-testid={`tags-event-${e.eventId}`}>
                              {e.tags.map((tag: string, idx: number) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button 
                            onClick={() => navigate(`/event/${encodeURIComponent(e.eventId)}/broadcast`)}
                            data-testid={`button-cast-${e.eventId}`}
                            size="sm"
                          >
                            Cast
                          </Button>
                          <Button
                            onClick={() => navigate(`/event/${encodeURIComponent(e.eventId)}`)}
                            disabled={e.liveCasterCount === 0}
                            title={e.liveCasterCount === 0 ? 'No casters yet—be the first!' : 'Listen to live casters'}
                            data-testid={`button-listen-${e.eventId}`}
                            size="sm"
                            variant="outline"
                          >
                            Listen
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentTab === "following" && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Your Followed Casters</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {followingCasters.map((caster) => (
                <CasterProfile 
                  key={caster.id}
                  caster={caster}
                  upcomingEvents={2}
                  onFollow={(id) => console.log('Following:', id)}
                  onUnfollow={(id) => console.log('Unfollowing:', id)}
                />
              ))}
            </div>
          </div>
        )}

        {currentTab === "trending" && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Trending Games</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardContent className="text-center py-8">
                  <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Trending games coming soon</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {currentTab === "profile" && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Account Settings</h2>
            <UserProfile 
              user={user}
              onUpdate={() => {
                // Refresh user data when profile is updated
                window.location.reload();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}