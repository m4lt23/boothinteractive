import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// League options
const LEAGUES = [
  { value: "nfl", label: "NFL" },
  { value: "nba", label: "NBA" },
  { value: "nhl", label: "NHL" }, 
  { value: "mlb", label: "MLB" },
  { value: "other", label: "Other" },
] as const;

type LeagueType = typeof LEAGUES[number]["value"];

interface Team {
  id: string;
  city: string;
  name: string;
  league: string;
}

// Form validation schema
const createEventSchema = z.object({
  league: z.enum(["nfl", "nba", "nhl", "mlb", "other"], {
    required_error: "Please select a league",
  }),
  homeTeamId: z.string().min(1, "Please select a home team"),
  awayTeamId: z.string().min(1, "Please select an away team"),
  startTime: z.string().min(1, "Please select start time"),
  channel: z.string().optional(),
  title: z.string().optional(),
}).refine((data) => data.homeTeamId !== data.awayTeamId, {
  message: "Home and away teams must be different",
  path: ["awayTeamId"],
}).refine((data) => {
  const startTime = new Date(data.startTime);
  return startTime > new Date();
}, {
  message: "Start time must be in the future",
  path: ["startTime"],
});

type CreateEventFormData = z.infer<typeof createEventSchema>;

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateEventModal({ open, onOpenChange }: CreateEventModalProps) {
  const { toast } = useToast();
  const [selectedLeague, setSelectedLeague] = useState<LeagueType | "">("");

  const form = useForm<CreateEventFormData>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      league: undefined,
      homeTeamId: "",
      awayTeamId: "",
      startTime: "",
      channel: "",
      title: "",
    },
  });

  // Fetch teams based on selected league
  const { data: teams = [], isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams", selectedLeague],
    queryFn: async () => {
      const url = selectedLeague && selectedLeague !== "other" 
        ? `/api/teams?league=${selectedLeague}`
        : "/api/teams";
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch teams");
      }
      return response.json();
    },
    enabled: !!selectedLeague,
  });

  // Create event mutation
  const createEventMutation = useMutation({
    mutationFn: async (data: CreateEventFormData) => {
      const homeTeam = teams.find(t => t.id === data.homeTeamId);
      const awayTeam = teams.find(t => t.id === data.awayTeamId);
      
      // Auto-generate title if not provided
      const title = data.title || `${awayTeam?.city} ${awayTeam?.name} @ ${homeTeam?.city} ${homeTeam?.name}`;
      
      const payload = {
        league: data.league.toUpperCase(),
        homeTeamId: data.homeTeamId,
        awayTeamId: data.awayTeamId,
        startTime: new Date(data.startTime).toISOString(), // Convert to UTC
        status: "scheduled",
        title,
        tvCountry: "US",
        tvListings: data.channel ? [{
          providerId: "us-national",
          channelName: data.channel,
          channelNumber: ""
        }] : [],
        source: "manual"
      };

      const response = await apiRequest("POST", "/api/events", payload);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Event created",
        description: `Successfully created "${data.title}"`,
      });
      
      // Close modal and reset form
      onOpenChange(false);
      form.reset();
      setSelectedLeague("");
      
      // Refresh events list
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      
      // Scroll to new event (basic approach)
      setTimeout(() => {
        const newEventElement = document.querySelector(`[data-testid="card-event-${data.id}"]`);
        if (newEventElement) {
          newEventElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create event",
        description: error.message || "An error occurred while creating the event",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: CreateEventFormData) => {
    createEventMutation.mutate(data);
  };

  const handleLeagueChange = (league: LeagueType) => {
    setSelectedLeague(league);
    form.setValue("league", league);
    // Reset team selections when league changes
    form.setValue("homeTeamId", "");
    form.setValue("awayTeamId", "");
  };

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
    setSelectedLeague("");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]" data-testid="modal-create-event">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Create Event
          </DialogTitle>
          <DialogDescription>
            Create a new sports event for casters to claim and broadcast.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* League Selection */}
            <FormField
              control={form.control}
              name="league"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>League *</FormLabel>
                  <Select 
                    onValueChange={handleLeagueChange}
                    value={field.value || ""}
                    disabled={createEventMutation.isPending}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-league">
                        <SelectValue placeholder="Select a league" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LEAGUES.map((league) => (
                        <SelectItem key={league.value} value={league.value}>
                          {league.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Home Team */}
            <FormField
              control={form.control}
              name="homeTeamId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Home Team *</FormLabel>
                  <Select 
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={createEventMutation.isPending || !selectedLeague || teamsLoading}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-home-team">
                        <SelectValue placeholder={
                          !selectedLeague ? "Select league first" :
                          teamsLoading ? "Loading teams..." :
                          "Select home team"
                        } />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.city} {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Away Team */}
            <FormField
              control={form.control}
              name="awayTeamId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Away Team *</FormLabel>
                  <Select 
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={createEventMutation.isPending || !selectedLeague || teamsLoading}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-away-team">
                        <SelectValue placeholder={
                          !selectedLeague ? "Select league first" :
                          teamsLoading ? "Loading teams..." :
                          "Select away team"
                        } />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.city} {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Start Time */}
            <FormField
              control={form.control}
              name="startTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Time *</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      {...field}
                      disabled={createEventMutation.isPending}
                      data-testid="input-start-time"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* TV Channel (Optional) */}
            <FormField
              control={form.control}
              name="channel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>TV Channel</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., ABC, ESPN, TSN"
                      {...field}
                      disabled={createEventMutation.isPending}
                      data-testid="input-channel"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Custom Title (Optional) */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Leave empty to auto-generate"
                      {...field}
                      disabled={createEventMutation.isPending}
                      data-testid="input-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Submit Buttons */}
            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose}
                disabled={createEventMutation.isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createEventMutation.isPending}
                data-testid="button-create-event"
              >
                {createEventMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Create Event
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}