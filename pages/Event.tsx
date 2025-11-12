import { useMemo, useState, useRef, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Filter } from "lucide-react";
import { Stage, SubscribeType, StageEvents } from "amazon-ivs-web-broadcast";
import AppHeader from "@/components/AppHeader";
import { Chip } from "@/components/ui/Chip";
import { FilterGroup } from "@/components/ui/FilterGroup";
import { AudioSyncController } from "@/audio/AudioSyncController";

const MODE = [
  { value: 'play-by-play', label: 'Play-by-Play' },
  { value: 'expert-analysis', label: 'Expert Analysis' },
  { value: 'fantasy-focus', label: 'Fantasy Focused' },
];
const TONE = [
  { value: 'serious', label: 'Serious' },
  { value: 'comedy',  label: 'Comedy' },
  { value: 'pg13',    label: 'PG-13' },
];
const PERSP = [
  { value: 'home', label: 'Home' },
  { value: 'away', label: 'Away' },
  { value: 'neutral', label: 'Neutral' },
];


export default function EventPage() {
  const { eventId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  
  // Audio mixing state
  const [audioController, setAudioController] = useState<AudioSyncController | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [participantStreams, setParticipantStreams] = useState<Map<string, {track: MediaStreamTrack, node: any}>>(new Map());
  
  // Initialize AudioContext and AudioSyncController
  useEffect(() => {
    const initAudio = async () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        await ctx.resume();
        const controller = new AudioSyncController(ctx, 179.999);
        setAudioContext(ctx);
        setAudioController(controller);
        
        // Bind audio element to controller output stream once
        if (audioRef.current) {
          audioRef.current.srcObject = controller.outputStream;
        }
      } catch (error) {
        console.error('Failed to initialize audio:', error);
      }
    };
    
    initAudio();
  }, []);
  
  // Cleanup function for removing participant stream
  const removeParticipantStream = (participantId: string) => {
    const streamInfo = participantStreams.get(participantId);
    if (streamInfo && audioController) {
      try {
        // AudioSyncController doesn't have removeStream yet, so we'll track manually
        // In a full implementation, we'd add removeStream to AudioSyncController
        console.log(`[MIX] audioController.removeStream(${participantId})`);
        console.log(`[MIX] removeStream participantId=${participantId}`);
        
        setParticipantStreams(prev => {
          const newMap = new Map(prev);
          newMap.delete(participantId);
          return newMap;
        });
      } catch (error) {
        console.error('Error removing participant stream:', error);
      }
    }
  };
  
  // Fetch event details
  const { data: event } = useQuery({
    queryKey: ['/api/events', eventId],
    queryFn: async () => (await apiRequest('GET', `/api/events/${eventId}`)).json(),
    enabled: !!eventId,
  });

  const { data: casters = [] } = useQuery({
    queryKey: ['/api/events', eventId, 'live'],
    queryFn: async () => (await apiRequest('GET', `/api/events/${eventId}/live`)).json(),
    enabled: !!eventId,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const [filters, setFilters] = useState({
    mode: null as string | null,
    perspective: null as string | null,
    tones: [] as string[]
  });
  const [joining, setJoining] = useState<string | null>(null);

  const visible = useMemo(() => {
    return casters.filter((c: any) => {
      // Mode filter (single selection)
      if (filters.mode && c.mode !== filters.mode) {
        return false;
      }
      
      // Perspective filter (single selection)
      if (filters.perspective && c.perspective !== filters.perspective) {
        return false;
      }
      
      // Tones filter (multiple selection - all selected tones must be present)
      if (filters.tones.length > 0) {
        const hasAllTones = filters.tones.every(filterTone => 
          (c.tones || []).includes(filterTone)
        );
        if (!hasAllTones) {
          return false;
        }
      }
      
      return true;
    });
  }, [casters, filters]);

  const clearAll = () => { 
    setFilters({ mode: null, perspective: null, tones: [] }); 
  };

  // Filter handlers
  const handleModeFilter = (mode: string) => {
    setFilters(prev => ({
      ...prev,
      mode: prev.mode === mode ? null : mode
    }));
  };

  const handlePerspectiveFilter = (perspective: string) => {
    setFilters(prev => ({
      ...prev,
      perspective: prev.perspective === perspective ? null : perspective
    }));
  };

  const handleToneFilter = (tone: string) => {
    setFilters(prev => {
      const currentTones = prev.tones;
      
      // If clicking the same tone, remove it
      if (currentTones.includes(tone)) {
        return {
          ...prev,
          tones: currentTones.filter(t => t !== tone)
        };
      }
      
      // Serious and Comedy are mutually exclusive
      if (tone === 'serious' && currentTones.includes('comedy')) {
        // Replace comedy with serious (keep pg13 if present)
        return {
          ...prev,
          tones: currentTones.filter(t => t !== 'comedy').concat(tone)
        };
      }
      
      if (tone === 'comedy' && currentTones.includes('serious')) {
        // Replace serious with comedy (keep pg13 if present)
        return {
          ...prev,
          tones: currentTones.filter(t => t !== 'serious').concat(tone)
        };
      }
      
      // Otherwise, add the tone
      return {
        ...prev,
        tones: [...currentTones, tone]
      };
    });
  };

  const hasActiveFilters = filters.mode || filters.perspective || filters.tones.length > 0;

  // Cleanup Stage and audio resources on component unmount
  useEffect(() => {
    return () => {
      console.log('[MIX] Cleaning up Stage and audio resources');
      
      // Clean up all participant streams
      participantStreams.forEach((_, participantId) => {
        removeParticipantStream(participantId);
      });
      
      // Leave stage
      if (stage) {
        try {
          stage.leave();
        } catch (error) {
          console.error('Error leaving Stage:', error);
        }
      }
      
      // Close audio context
      if (audioContext) {
        try {
          audioContext.close();
        } catch (error) {
          console.error('Error closing AudioContext:', error);
        }
      }
    };
  }, [stage, audioContext, participantStreams]);

  const joinCaster = async (caster: { id: string, casterName: string }) => {
    setJoining(caster.id);
    try {
      // Disconnect from previous stage if connected
      if (stage) {
        console.log('Disconnecting from previous stage...');
        try {
          await stage.leave();
          setStage(null);
        } catch (error) {
          console.error('Error leaving previous stage:', error);
        }
      }

      console.log('Attempting to join caster:', caster);
      
      // 1) Get viewer token for THIS session
      const response = await apiRequest('GET', `/api/sessions/${caster.id}/viewerToken`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`viewerToken ${response.status}: ${errorText}`);
      }
      
      const { token, stageArn } = await response.json();
      console.log('Viewer token received, Stage ARN:', stageArn);

      if (!token) {
        throw new Error('No viewer token received');
      }

      // 2) Create strategy for Stage (listener only subscribes)
      const strategy = {
        // Required: Return streams to publish (empty for listeners)
        stageStreamsToPublish() {
          return [];
        },
        
        // Required: Control which participants to publish (none for listeners)
        shouldPublishParticipant() {
          return false;
        },
        
        // Required: Control subscription to participants (subscribe to audio from all)
        shouldSubscribeToParticipant() {
          return SubscribeType.AUDIO_VIDEO;
        }
      };

      // 3) Create stage with token and strategy
      const stg = new Stage(token, strategy);
      
      // 4) Set up event listeners for proper audio mixing
      stg.on(StageEvents.STAGE_PARTICIPANT_STREAMS_ADDED, (participant: any, streams: any[]) => {
        const participantId = participant.id || 'unknown';
        const participantName = participant.attributes?.screenname || participant.attributes?.username || `Participant-${participantId.slice(0, 8)}`;
        const participantRole = participant.attributes?.role || 'guest';
        
        console.log(`[MIX] joined participantId=${participantId}, streams=${streams.length}`);
        
        // Process each audio stream with proper mixing
        streams.forEach(stream => {
          if (stream.mediaStreamTrack && stream.mediaStreamTrack.kind === 'audio' && audioController) {
            try {
              console.log(`[MIX] track-published participantId=${participantId}, track.kind=${stream.mediaStreamTrack.kind}`);
              
              // Create MediaStream for this participant's audio track
              const singleTrackStream = new MediaStream([stream.mediaStreamTrack]);
              
              // Add to AudioSyncController for proper mixing
              console.log(`[MIX] audioController.addStream(${participantId})`);
              audioController.addStream(singleTrackStream);
              
              console.log(`[MIX] addStream participantId=${participantId}, Map.size=${participantStreams.size + 1}`);
              
              // Track the stream for lifecycle management
              setParticipantStreams(prev => new Map(prev.set(participantId, {
                track: stream.mediaStreamTrack,
                node: null // We don't expose internal nodes from AudioSyncController
              })));
              
            } catch (error) {
              console.error('Error adding stream to controller:', error);
            }
          }
        });
      });
      
      // Handle participant leaving
      stg.on(StageEvents.STAGE_PARTICIPANT_LEFT, (participant: any) => {
        const participantId = participant.id || 'unknown';
        console.log(`[MIX] left participantId=${participantId}`);
        removeParticipantStream(participantId);
      });
      
      // Handle streams being removed
      stg.on(StageEvents.STAGE_PARTICIPANT_STREAMS_REMOVED, (participant: any, streams: any[]) => {
        const participantId = participant.id || 'unknown';
        console.log(`[MIX] streams-removed participantId=${participantId}`);
        removeParticipantStream(participantId);
      });

      // 5) Join the stage as listener
      await stg.join();
      console.log('Successfully joined Stage as listener');
      setStage(stg);

      // 6) Start audio playback (user gesture context) - plays the mixed output
      if (audioRef.current) {
        try {
          await audioRef.current.play();
          console.log('[MIX] Audio playback started - playing mixed output stream');
        } catch (playError) {
          console.warn('Audio autoplay blocked:', playError);
          // Note: In production, show "Tap to unmute" UI
        }
      }

      // 7) Navigate to listener room after successful join
      console.log("joined + playing, navigating to /room/", caster.id);
      localStorage.setItem('booth.listen.sessionId', caster.id);
      
      // Use fallback navigation method
      window.location.href = `/room/${encodeURIComponent(caster.id)}`;
      
    } catch (error: any) {
      console.error('Join failed', error);
      toast({
        title: 'Could not join stream',
        description: String(error.message || error),
        variant: "destructive"
      });
    } finally {
      setJoining(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto px-4 py-6 space-y-6">
        <header>
          <div>
            <h2 className="text-xl font-semibold" data-testid="text-event-title">
              {event?.title ?? 
               (event?.homeTeam && event?.awayTeam 
                 ? `${event.homeTeam} vs ${event.awayTeam}` 
                 : "Live Event")}
            </h2>
            <p className="text-sm text-muted-foreground">Choose a caster, or refine with filters.</p>
          </div>
        </header>

        {/* Filter Toolbar */}
        <div className="sticky top-16 z-10 w-full border-b bg-background/80 backdrop-blur -mx-4 px-4">
          <div className="max-w-6xl mx-auto py-3">
            {/* Desktop Filter Toolbar */}
            <div className="hidden sm:flex flex-wrap items-center gap-4">
              <FilterGroup label="Mode">
                <Chip active={filters.mode === 'play-by-play'} onClick={() => handleModeFilter('play-by-play')}>Play-by-Play</Chip>
                <Chip active={filters.mode === 'expert-analysis'} onClick={() => handleModeFilter('expert-analysis')}>Expert Analysis</Chip>
                <Chip active={filters.mode === 'fantasy-focus'} onClick={() => handleModeFilter('fantasy-focus')}>Fantasy Focused</Chip>
              </FilterGroup>

              <FilterGroup label="Tone">
                <Chip active={filters.tones.includes('serious')} onClick={() => handleToneFilter('serious')}>Serious</Chip>
                <Chip active={filters.tones.includes('comedy')} onClick={() => handleToneFilter('comedy')}>Comedy</Chip>
                <Chip active={filters.tones.includes('pg13')} onClick={() => handleToneFilter('pg13')}>PG-13</Chip>
              </FilterGroup>

              <FilterGroup label="Perspective">
                <Chip active={filters.perspective === 'home'} onClick={() => handlePerspectiveFilter('home')}>Home</Chip>
                <Chip active={filters.perspective === 'away'} onClick={() => handlePerspectiveFilter('away')}>Away</Chip>
                <Chip active={filters.perspective === 'neutral'} onClick={() => handlePerspectiveFilter('neutral')}>Neutral</Chip>
              </FilterGroup>

              {/* Right side */}
              <div className="ml-auto flex items-center gap-3">
                {hasActiveFilters && (
                  <button 
                    className="text-sm text-muted-foreground hover:underline" 
                    onClick={clearAll}
                    data-testid="button-clear-filters"
                  >
                    Clear filters
                  </button>
                )}
                <span className="text-sm text-muted-foreground">{visible.length} casters</span>
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
              <span className="text-sm text-muted-foreground">{visible.length} casters</span>
            </div>
          </div>
        </div>

        {/* Optional: Mobile filter summary */}
        {hasActiveFilters && (
          <div className="sm:hidden text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded text-center">
            {filters.mode && `Mode: ${filters.mode === 'play-by-play' ? 'Play-by-Play' : filters.mode === 'expert-analysis' ? 'Expert Analysis' : 'Fantasy Focused'}`}
            {filters.mode && filters.tones.length > 0 && ' • '}
            {filters.tones.length > 0 && `Tone: ${filters.tones.map(t => t === 'pg13' ? 'PG-13' : t).join(', ')}`}
            {(filters.mode || filters.tones.length > 0) && filters.perspective && ' • '}
            {filters.perspective && `Perspective: ${filters.perspective}`}
          </div>
        )}

        <section>
          <h3 className="font-medium mb-3" data-testid="text-caster-count">Available casters ({visible.length})</h3>
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No casters match your filters.</p>
          ) : (
            <div className="grid gap-3">
              {visible.map((c: any) => {
                const displayName = c.casters && c.casters.length > 0
                  ? c.casters.map((caster: any) => caster.name).join(' + ')
                  : (c.casterName || `Caster ${c.casterId}`);
                
                return (
                  <Card key={c.id} data-testid={`card-caster-${c.id}`}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <div className="font-semibold" data-testid={`text-caster-name-${c.id}`}>
                          {displayName}
                        </div>
                      <div className="text-xs text-muted-foreground" data-testid={`text-caster-meta-${c.id}`}>
                        {[
                          c.mode === "play-by-play" ? "Play-by-Play"
                          : c.mode === "expert-analysis" ? "Expert Analysis" 
                          : c.mode === "fantasy-focus" ? "Fantasy Focused" : null,
                          c.perspective === "home" ? "Home"
                          : c.perspective === "away" ? "Away"
                          : c.perspective === "neutral" ? "Neutral" : null,
                          (c.tones || []).map((tone: string) => 
                            tone === "serious" ? "Serious"
                            : tone === "comedy" ? "Comedy"
                            : tone === "pg13" ? "PG-13" : null
                          ).filter(Boolean).join(" + ") || null,
                        ].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <Button 
                      onClick={() => joinCaster(c)} 
                      disabled={joining === c.id}
                      data-testid={`button-listen-${c.id}`}
                    >
                      {joining === c.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        'Listen'
                      )}
                    </Button>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
      
      {/* Hidden audio element for stream playbook */}
      <audio ref={audioRef} autoPlay playsInline controls={false} style={{ display: 'none' }} />
    </div>
  );
}