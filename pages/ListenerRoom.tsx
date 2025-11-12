import { useParams, useLocation } from "wouter";
import { useEffect, useRef, useState, useMemo } from "react";
import { Stage, StageEvents, SubscribeType } from "amazon-ivs-web-broadcast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import ChatPanel from "@/components/ChatPanel";
import AppHeader from "@/components/AppHeader";
import { AudioSyncController } from "@/audio/AudioSyncController";
import { SyncTuner, usePersistentDelay } from "@/components/SyncTuner";
import { useQuery } from "@tanstack/react-query";

export default function ListenerRoom() {
  const { sessionId: rawSessionId } = useParams<{ sessionId: string }>();
  const sessionId = useMemo(
    () => (rawSessionId ? decodeURIComponent(rawSessionId) : ''),
    [rawSessionId]
  );
  const [, navigate] = useLocation();
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Check user authentication status
  const { data: user } = useQuery<{ id: string } | null>({
    queryKey: ['/api/user'],
    retry: false,
  });
  const isAuthenticated = !!user?.id;
  
  // Use refs to track Stage instance and join state to prevent race conditions
  const stageRef = useRef<Stage | null>(null);
  const isJoiningRef = useRef<boolean>(false);
  const hasInitialized = useRef<boolean>(false);
  
  const [stage, setStage] = useState<Stage|null>(null);
  const [audioStatus, setAudioStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [chatStatus, setChatStatus] = useState<string>("idle");
  const [eventTitle, setEventTitle] = useState("");
  const [eventId, setEventId] = useState<string | null>(null);
  const [activeParticipants, setActiveParticipants] = useState<Map<string, { name: string, isHost: boolean }>>(new Map());
  const [allStreams, setAllStreams] = useState<MediaStream>(new MediaStream());
  const [showStartAudioButton, setShowStartAudioButton] = useState(false);
  const [audioGestureNeeded, setAudioGestureNeeded] = useState(true);
  
  // Web Audio API for sync tuner
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [controller, setController] = useState<AudioSyncController | null>(null);
  const { delay, setDelay } = usePersistentDelay(eventId || "", 0);

  // Fetch event title on mount
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const r = await apiRequest("GET", `/api/sessions/${encodeURIComponent(sessionId)}/meta`);
        if (r.ok) {
          const m = await r.json();
          setEventId(m.eventId ?? null);
          setEventTitle(m.eventTitle || `Event #${m.eventId}`);
        }
      } catch {}
    })();
  }, [sessionId]);

  // Sync delay changes with controller
  useEffect(() => {
    if (controller) {
      controller.setDelay(delay);
    }
  }, [delay, controller]);

  // Handle chat status updates
  const handleChatStatusChange = (status: string) => {
    setChatStatus(status);
  };

  // Get display-friendly status
  const getDisplayStatus = (status: string) => {
    switch (status) {
      case "idle": return "Idle";
      case "connecting": return "Connecting...";
      case "connected": return "Connected";
      case "authenticated": return "Connected";
      case "joined": return "Connected";
      case "error": return "Error";
      default: return status.includes("closed:") ? "Disconnected" : status;
    }
  };

  // Main function to start audio connection with user gesture
  const startAudioConnection = async () => {
    if (!sessionId || isJoiningRef.current) {
      return;
    }
    
    isJoiningRef.current = true;
    setAudioStatus("connecting");
    setAudioGestureNeeded(false); // Hide button once connection starts
    setShowStartAudioButton(false);
    
    let stg: Stage | null = null;
    let mounted = true;
    
    try {
      // Fetch viewer token
      const tokenUrl = `/api/sessions/${encodeURIComponent(sessionId)}/viewerToken`;
      const r = await apiRequest("GET", tokenUrl);
      
      if (!r.ok) {
        const errorText = await r.text();
        console.error('[LISTENER TOKEN] ERROR:', errorText);
        throw new Error(`viewerToken ${r.status}: ${errorText}`);
      }
      
      const responseData = await r.json();
      const { token } = responseData;
      
      // Create Stage strategy (listener only subscribes)
      const strategy = {
        stageStreamsToPublish() {
          return [];
        },
        shouldPublishParticipant() {
          return false;
        },
        shouldSubscribeToParticipant() {
          return SubscribeType.AUDIO_VIDEO;
        }
      };
      
      stg = new Stage(token, strategy);
      
      // Create AudioContext and controller WITH USER GESTURE
      let ctx: AudioContext | null = null;
      let ctrl: AudioSyncController | null = null;
      
      try {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // With user gesture, AudioContext should start in 'running' state
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        
        ctrl = new AudioSyncController(ctx, 179.999);
        ctrl.setDelay(delay);
        setAudioContext(ctx);
        setController(ctrl);
      } catch (error) {
        console.error('[LISTENER] Failed to create AudioContext:', error);
        throw error;
      }
      
      // Handle participant streams
      stg.on(StageEvents.STAGE_PARTICIPANT_STREAMS_ADDED, async (participant: any, streams: any[]) => {
        // Add participant to active list
        setActiveParticipants(prev => {
          const updated = new Map(prev);
          const name = participant.attributes?.screenname || participant.attributes?.username || `Participant ${participant.id.slice(0, 8)}`;
          const isHost = participant.attributes?.role === 'host' || prev.size === 0;
          updated.set(participant.id, { name, isHost });
          return updated;
        });
        
        // Add streams to combined MediaStream
        setAllStreams(currentStream => {
          const updatedStream = new MediaStream(currentStream.getTracks());
          streams.forEach(stream => {
            if (stream.mediaStreamTrack && stream.mediaStreamTrack.kind === 'audio') {
              updatedStream.addTrack(stream.mediaStreamTrack);
            }
          });
          return updatedStream;
        });
        
        // Route audio through Web Audio API
        setController(currentController => {
          if (currentController && streams.length > 0) {
            streams.forEach(stream => {
              if (stream.mediaStreamTrack && stream.mediaStreamTrack.kind === 'audio') {
                const singleTrackStream = new MediaStream([stream.mediaStreamTrack]);
                currentController.addStream(singleTrackStream);
              }
            });
            
            // Connect to audio element and play
            if (audioRef.current) {
              audioRef.current.srcObject = currentController.outputStream;
              
              audioRef.current.play()
                .catch((error) => {
                  console.error('[LISTENER] Audio play failed:', error.message);
                  if (mounted) setShowStartAudioButton(true);
                });
            }
          }
          return currentController;
        });
      });
      
      // Handle participant leaving
      stg.on(StageEvents.STAGE_PARTICIPANT_LEFT, (participant: any) => {
        setActiveParticipants(prev => {
          const updated = new Map(prev);
          updated.delete(participant.id);
          return updated;
        });
      });
      
      await stg.join();
      setStage(stg);
      stageRef.current = stg;
      setAudioStatus("connected");
    } catch (error) {
      console.error('[LISTENER] Connection failed:', error);
      if (mounted) {
        setAudioStatus("error");
        setAudioGestureNeeded(true); // Show button again on error
      }
    } finally {
      isJoiningRef.current = false;
    }
  };

  // Initialization - distinguish between normal navigation (Flow A) and direct URL access (Flow B/C)
  useEffect(() => {
    if (!sessionId || hasInitialized.current) return;
    
    // Check if this is normal navigation from event list (Flow A)
    const isNormalNavigation = localStorage.getItem('booth.listen.sessionId') === sessionId;
    
    // Clear the localStorage flag after checking
    if (isNormalNavigation) {
      localStorage.removeItem('booth.listen.sessionId');
    }
    
    hasInitialized.current = true;
    
    // Flow A: Authenticated user from event list → auto-start, no button
    if (isAuthenticated && isNormalNavigation) {
      setAudioGestureNeeded(false);
      setShowStartAudioButton(false);
      startAudioConnection();
    } 
    // Flow B/C: Direct URL access (or unauthenticated) → show button
    else {
      setAudioGestureNeeded(true);
      setShowStartAudioButton(true);
    }
  }, [sessionId, isAuthenticated]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stageRef.current) {
        try {
          stageRef.current.leave();
        } catch (error) {
          console.error('[LISTENER] Error leaving Stage:', error);
        }
        stageRef.current = null;
      }
      
      if (audioContext) {
        try {
          audioContext.close();
        } catch (error) {
          console.error('[LISTENER] Error closing AudioContext:', error);
        }
      }
      
      isJoiningRef.current = false;
      hasInitialized.current = false;
    };
  }, []);

  const leave = async () => {
    try {
      await stage?.leave();
    } catch (error) {
      console.error('[LISTENER] Error leaving stage:', error);
    }
    
    // Clear refs
    stageRef.current = null;
    isJoiningRef.current = false;
    
    localStorage.removeItem("booth.listen.sessionId");
    navigate("/");
  };


  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <div className="mx-auto max-w-4xl p-4 space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold" data-testid="text-room-title">{eventTitle || "Listening…"}</h1>
          <Button onClick={leave} variant="destructive" data-testid="button-leave">Leave Stream</Button>
        </header>
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
      
      {/* Start Audio Button - ALWAYS shown for direct URL access to satisfy browser autoplay policy */}
      {showStartAudioButton && (
        <div className="rounded-2xl border-2 border-primary bg-primary/10 p-8 text-center shadow-lg">
          <h2 className="text-2xl font-bold mb-3">Ready to Listen</h2>
          <p className="text-base text-muted-foreground mb-6">
            Click the button below to start listening to the live audio stream
          </p>
          <Button 
            onClick={startAudioConnection} 
            size="lg"
            variant="default"
            className="w-full md:w-auto px-8 py-6 text-lg"
            data-testid="button-start-audio"
          >
            🎧 Start Listening
          </Button>
        </div>
      )}
      
      {/* Status indicators and active broadcasters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border p-4">
          <p className="text-sm font-medium mb-1">Audio Stream</p>
          <p className="text-sm text-muted-foreground" data-testid="text-audio-status">
            {getDisplayStatus(audioStatus)}
          </p>
          {audioStatus === "connected" && (
            <p className="text-xs text-green-600 mt-1">
              {allStreams.getAudioTracks().length} audio track(s) active
            </p>
          )}
        </div>
        
        <div className="rounded-2xl border p-4">
          <p className="text-sm font-medium mb-1">Chat</p>
          <p className="text-sm text-muted-foreground" data-testid="text-chat-status">
            {getDisplayStatus(chatStatus)}
          </p>
        </div>
        
        <div className="rounded-2xl border p-4">
          <p className="text-sm font-medium mb-1">Active Broadcasters</p>
          <div className="space-y-1" data-testid="list-active-broadcasters">
            {activeParticipants.size === 0 ? (
              <p className="text-xs text-muted-foreground">No broadcasters online</p>
            ) : (
              Array.from(activeParticipants.values()).map((participant, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className={participant.isHost ? "font-medium" : "text-muted-foreground"}>
                    {participant.name} {participant.isHost && "(Host)"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

        {/* Sync Tuner - show only when connected and controller exists */}
        {controller && audioStatus === "connected" && (
          <SyncTuner
            eventId={eventId || ""}
            delaySec={delay}
            setDelay={setDelay}
            className="border rounded-2xl p-4"
          />
        )}

        {/* Always mount ChatPanel for parallel connection, pass eventId when available */}
        <ChatPanel eventId={eventId} onStatusChange={handleChatStatusChange} />
      </div>
    </div>
  );
}