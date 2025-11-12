import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, Plus, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { insertEventSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";

const createEventFormSchema = insertEventSchema.extend({
  homeTeam: z.string().min(1, "Home team is required"),
  awayTeam: z.string().min(1, "Away team is required"),
  startDate: z.string().min(1, "Start date is required"),
  startTime: z.string().min(1, "Start time is required"),
  tagInput: z.string().optional(),
}).omit({ homeTeamId: true, awayTeamId: true });

type CreateEventFormData = z.infer<typeof createEventFormSchema>;

interface CreateEventFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function CreateEventForm({ onSuccess, onCancel }: CreateEventFormProps) {
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<CreateEventFormData>({
    resolver: zodResolver(createEventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      homeTeam: "",
      awayTeam: "",
      startDate: "",
      startTime: "",
      language: "en",
      tagInput: "",
    },
  });

  const createEventMutation = useMutation({
    mutationFn: async (data: CreateEventFormData) => {
      const { startDate, startTime, tagInput, ...eventData } = data;
      const startDateTime = new Date(`${startDate}T${startTime}`);
      
      return apiRequest("POST", "/api/events", {
        ...eventData,
        startTime: startDateTime.toISOString(),
        tags,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/live"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/schedule"] });
      queryClient.refetchQueries({ queryKey: ["/api/events/schedule"] });
      toast({
        title: "Event Created",
        description: "Your commentary event has been scheduled successfully!",
      });
      onSuccess?.();
      form.reset();
      setTags([]);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create event",
        variant: "destructive",
      });
    },
  });

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const onSubmit = (data: CreateEventFormData) => {
    if (data.homeTeam.toLowerCase().trim() === data.awayTeam.toLowerCase().trim()) {
      toast({
        title: "Error",
        description: "Home and away teams must be different",
        variant: "destructive",
      });
      return;
    }
    createEventMutation.mutate(data);
  };

  // Get tomorrow's date as minimum
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5" />
          Create Commentary Event
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Event Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Event Title</Label>
            <Input
              id="title"
              placeholder="e.g., Chiefs vs Bills - AFC Championship"
              {...form.register("title")}
              data-testid="input-event-title"
            />
            {form.formState.errors.title && (
              <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          {/* Teams */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="homeTeam">Home Team</Label>
              <Input
                id="homeTeam"
                placeholder="e.g., Rams"
                {...form.register("homeTeam")}
                data-testid="input-home-team"
              />
              {form.formState.errors.homeTeam && (
                <p className="text-sm text-destructive">{form.formState.errors.homeTeam.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="awayTeam">Away Team</Label>
              <Input
                id="awayTeam"
                placeholder="e.g., Bills"
                {...form.register("awayTeam")}
                data-testid="input-away-team"
              />
              {form.formState.errors.awayTeam && (
                <p className="text-sm text-destructive">{form.formState.errors.awayTeam.message}</p>
              )}
            </div>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                min={minDate}
                {...form.register("startDate")}
                data-testid="input-start-date"
              />
              {form.formState.errors.startDate && (
                <p className="text-sm text-destructive">{form.formState.errors.startDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="startTime"
                  type="time"
                  className="pl-10"
                  {...form.register("startTime")}
                  data-testid="input-start-time"
                />
              </div>
              {form.formState.errors.startTime && (
                <p className="text-sm text-destructive">{form.formState.errors.startTime.message}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Tell listeners what to expect from your commentary..."
              rows={3}
              {...form.register("description")}
              data-testid="textarea-description"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag (e.g., playoffs, rivalry)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                data-testid="input-tag"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddTag}
                data-testid="button-add-tag"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1" data-testid={`tag-${tag}`}>
                    {tag}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleRemoveTag(tag)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Language */}
          <div className="space-y-2">
            <Label htmlFor="language">Commentary Language</Label>
            <Select 
              value={form.watch("language") || "en"} 
              onValueChange={(value) => form.setValue("language", value)}
            >
              <SelectTrigger data-testid="select-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                <SelectItem value="de">German</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={createEventMutation.isPending}
              className="flex-1"
              data-testid="button-create-event"
            >
              {createEventMutation.isPending ? "Creating..." : "Create Event"}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}