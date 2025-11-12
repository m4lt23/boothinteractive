import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Chip } from "@/components/ui/Chip";
import { 
  Radio, 
  Users, 
  Share, 
  Copy, 
  Check, 
  UserPlus, 
  Settings,
  Mic,
  MicOff,
  Palette,
  Wifi,
  WifiOff,
  AlertTriangle,
  Play,
  Square,
  Volume2,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface BroadcasterControlsProps {
  event: any;
  isLive: boolean;
  listenerCount: number;
  onGoLive: (settings: CasterSettings) => void;
  onEndStream: () => void;
  ivsChannelStatus?: any;
  hasIVSChannel: boolean;
  onBroadcastStateChange?: (state: BroadcastState) => void;
  isCohost?: boolean;
  cohostIsConnected?: boolean;
  cohostConnectState?: 'disconnected' | 'connecting' | 'connected' | 'error';
  isMuted?: boolean;
  onToggleMute?: () => void;
}

// Validation schema (required for all) - MUST match database enum values in schema.ts
const CasterSettingsSchema = z.object({
  mode: z.enum(['play-by-play','expert-analysis','fantasy-focus']),  // required
  tones: z.array(z.enum(['serious','comedy','pg13'])).min(1), // ≥ 1 required
  perspective: z.enum(['home','away','neutral']),                     // required
});

type CasterSettings = z.infer<typeof CasterSettingsSchema>;

type BroadcastState = 'disconnected' | 'connecting' | 'validating' | 'connected' | 'error';

// Helpers
const MODE_OPTIONS = [
  { value: 'play-by-play',     label: 'Play-by-Play' },
  { value: 'expert-analysis',  label: 'Expert Analysis' },
  { value: 'fantasy-focus',    label: 'Fantasy Focused' },
] as const;

const PERSPECTIVE_OPTIONS = [
  { value: 'home',    label: 'Home Team Fan' },
  { value: 'away',    label: 'Away Team Fan' },
  { value: 'neutral', label: 'Neutral/Unbiased' },
] as const;

const TONE_OPTIONS = [
  { value: 'serious',          label: 'Serious' },
  { value: 'comedy',           label: 'Comedy' },
  { value: 'pg13',  label: 'PG-13' },
] as const;

export default function BroadcasterControls({ 
  event, 
  isLive, 
  listenerCount, 
  onGoLive, 
  onEndStream,
  ivsChannelStatus,
  hasIVSChannel,
  onBroadcastStateChange,
  isCohost = false,
  cohostIsConnected = false,
  cohostConnectState = 'disconnected',
  isMuted: isMutedProp,
  onToggleMute: onToggleMuteProp
}: BroadcasterControlsProps) {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isMutedLocal, setIsMutedLocal] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  
  // Use Stage mute props if provided, otherwise fallback to local broadcast client mute
  const isMuted = isMutedProp !== undefined ? isMutedProp : isMutedLocal;
  const hasStageControls = onToggleMuteProp !== undefined;
  
  // Form setup with validation
  const form = useForm<CasterSettings>({
    resolver: zodResolver(CasterSettingsSchema),
    mode: 'onChange',
    defaultValues: {
      perspective: undefined as any, // none selected
      mode: undefined as any,        // none selected
      tones: [],                     // none selected
    }
  });

  const { watch, setValue, formState: { errors, isValid } } = form;
  
  // Broadcasting state
  const [broadcastState, setBroadcastState] = useState<BroadcastState>('disconnected');
  const [broadcastClient, setBroadcastClient] = useState<any>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [audioDevice, setAudioDevice] = useState<MediaDeviceInfo | null>(null);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const broadcastClientRef = useRef<any>(null);
  
  // IVS live state validation
  const [validationPollingInterval, setValidationPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [validationStartTime, setValidationStartTime] = useState<number | null>(null);
  
  // Microphone testing state
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number>(0);
  const [isRecording, setIsRecording] = useState(false);
  const [testRecording, setTestRecording] = useState<Blob | null>(null);
  const [isPlayingBack, setIsPlayingBack] = useState(false);
  const [micTestStream, setMicTestStream] = useState<MediaStream | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  // Check if user has completed mic test before (only required first time)
  const hasCompletedMicTestBefore = () => {
    return localStorage.getItem('booth_mic_test_completed') === 'true';
  };
  
  const [micTestPassed, setMicTestPassed] = useState(false); // Always show mic test for debugging
  const [showMicTestModal, setShowMicTestModal] = useState(false);
  
  // Audio monitoring refs
  const animationFrameRef = useRef<number | null>(null);
  const audioBufferRef = useRef<Uint8Array | null>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();

  // Notify parent component about broadcast state changes
  useEffect(() => {
    if (onBroadcastStateChange) {
      onBroadcastStateChange(broadcastState);
    }
  }, [broadcastState, onBroadcastStateChange]);

  // Function to create minimal video source with multiple fallback methods
  const createMinimalVideoSource = async (): Promise<MediaStream | null> => {
    console.log('Creating IVS-compatible synthetic video source (640x360 @ 15fps)...');

    // Method 1: HTML Canvas with proper IVS-compatible resolution and framerate
    try {
      console.log('Method 1: Trying HTML canvas.captureStream() with IVS-compatible settings...');
      
      const canvas = document.createElement('canvas');
      canvas.width = 640;  // Standard 360p width
      canvas.height = 360; // Standard 360p height
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Create a simple animated background that IVS will recognize as active video
        let frameCount = 0;
        const updateCanvas = () => {
          // Clear canvas
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Add subtle animation - a moving circle to keep the video "active"
          const x = (frameCount % 100) * (canvas.width / 100);
          const y = canvas.height / 2;
          ctx.fillStyle = '#333333';
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, 2 * Math.PI);
          ctx.fill();
          
          // Add "BOOTH AUDIO COMMENTARY" text
          ctx.fillStyle = '#666666';
          ctx.font = '20px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('BOOTH AUDIO COMMENTARY', canvas.width / 2, canvas.height / 2 - 40);
          ctx.font = '14px Arial';
          ctx.fillText('Live Sports Commentary', canvas.width / 2, canvas.height / 2 + 40);
          
          frameCount++;
        };
        
        // Initial draw
        updateCanvas();
        
        // Update canvas every ~67ms (15fps)
        const animationInterval = setInterval(updateCanvas, 67);
        
        console.log('Canvas created with 640x360 resolution and animated content');
      }
      
      if (typeof canvas.captureStream === 'function') {
        console.log('canvas.captureStream is available, attempting to capture at 15fps...');
        const stream = canvas.captureStream(15); // 15 FPS - meets IVS requirements
        
        if (stream && stream.getVideoTracks().length > 0) {
          console.log('Method 1 SUCCESS: IVS-compatible canvas stream created with video tracks:', stream.getVideoTracks().length);
          console.log('Video track settings:', {
            width: canvas.width,
            height: canvas.height,
            framerate: 15,
            tracks: stream.getVideoTracks().length
          });
          return stream;
        } else {
          throw new Error('Canvas stream created but has no video tracks');
        }
      } else {
        throw new Error('canvas.captureStream is not supported');
      }
    } catch (error) {
      console.warn('Method 1 FAILED (canvas.captureStream):', error);
    }

    // Method 2: getUserMedia with IVS-compatible video constraints
    try {
      console.log('Method 2: Trying getUserMedia with IVS-compatible video constraints...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 15, max: 30 },
          facingMode: 'environment',
        },
        audio: false
      });
      
      if (stream && stream.getVideoTracks().length > 0) {
        console.log('Method 2 SUCCESS: getUserMedia IVS-compatible video stream created');
        return stream;
      } else {
        throw new Error('getUserMedia returned stream without video tracks');
      }
    } catch (error) {
      console.warn('Method 2 FAILED (getUserMedia video):', error);
    }

    // Method 3: Create video element with data URL and captureStream
    try {
      console.log('Method 3: Trying video element with data URL...');
      
      // Create a 1x1 black pixel as a data URL
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 1, 1);
      }
      const dataUrl = canvas.toDataURL('image/png');
      
      // Create video element
      const video = document.createElement('video');
      video.width = 1;
      video.height = 1;
      video.loop = true;
      video.muted = true;
      video.autoplay = true;
      
      // Create a simple video blob that just shows the black pixel
      const blob = await fetch(dataUrl).then(r => r.blob());
      const videoUrl = URL.createObjectURL(blob);
      video.src = videoUrl;
      
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = reject;
        setTimeout(reject, 5000); // 5 second timeout
      });
      
      if (typeof (video as any).captureStream === 'function') {
        const stream = (video as any).captureStream(1);
        if (stream && stream.getVideoTracks().length > 0) {
          console.log('Method 3 SUCCESS: Video element stream created');
          return stream;
        }
      }
      throw new Error('Video element captureStream failed');
    } catch (error) {
      console.warn('Method 3 FAILED (video element):', error);
    }

    // Method 4: MediaRecorder approach - create a manual stream
    try {
      console.log('Method 4: Trying manual MediaStream creation...');
      
      // Create a MediaStream manually if the browser supports it
      if (typeof MediaStream === 'function') {
        const stream = new MediaStream();
        
        // Try to create a video track manually using canvas and MediaStreamTrack
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, 1, 1);
        }
        
        // This is a last resort - we'll try to create a fake video track
        // using a timer to capture canvas frames
        const fakeVideoTrack = await createFakeVideoTrack(canvas);
        if (fakeVideoTrack) {
          stream.addTrack(fakeVideoTrack);
          console.log('Method 4 SUCCESS: Manual stream with fake video track created');
          return stream;
        }
      }
      throw new Error('Manual MediaStream creation failed');
    } catch (error) {
      console.warn('Method 4 FAILED (manual MediaStream):', error);
    }

    console.error('All video source creation methods failed');
    return null;
  };

  // Helper function to create a fake video track using canvas animation
  const createFakeVideoTrack = async (canvas: HTMLCanvasElement): Promise<MediaStreamTrack | null> => {
    try {
      // This is a complex fallback - create an animated canvas that cycles pixels
      // to generate a valid video stream
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      
      let frameCount = 0;
      const animate = () => {
        // Alternate between black and very dark gray to create minimal "movement"
        const color = frameCount % 60 === 0 ? '#010101' : '#000000';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        frameCount++;
        setTimeout(animate, 1000); // 1 FPS
      };
      
      animate();
      
      // Try to use captureStream after starting animation
      if (typeof canvas.captureStream === 'function') {
        const stream = canvas.captureStream(1);
        const tracks = stream.getVideoTracks();
        if (tracks.length > 0) {
          return tracks[0];
        }
      }
      
      return null;
    } catch (error) {
      console.error('Fake video track creation failed:', error);
      return null;
    }
  };

  // Get stream key and ingest endpoint for broadcasting
  const { data: streamCredentials, isLoading: credentialsLoading } = useQuery({
    queryKey: ["/api/user/stream-key"],
    enabled: hasIVSChannel && isLive,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Initialize available devices - request permission first to get device labels
  useEffect(() => {
    const initializeDevices = async () => {
      try {
        // Request microphone permission first to get device labels
        // This is required for enumerateDevices to return proper device names
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true 
        });
        
        // Stop the stream immediately after getting permission
        stream.getTracks().forEach(track => track.stop());
        
        // Now enumerate devices with proper labels
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputDevices = devices.filter(device => 
          device.kind === 'audioinput' && device.deviceId && device.deviceId.trim() !== ""
        );
        
        console.log('Found audio devices:', audioInputDevices);
        setAvailableDevices(audioInputDevices);
        
        if (audioInputDevices.length > 0 && !audioDevice) {
          setAudioDevice(audioInputDevices[0]);
        }
      } catch (error) {
        console.error('Failed to enumerate devices:', error);
        
        // Fallback: try to enumerate without permission (won't have labels)
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioInputDevices = devices.filter(device => 
            device.kind === 'audioinput' && device.deviceId && device.deviceId.trim() !== ""
          );
          setAvailableDevices(audioInputDevices);
          
          if (audioInputDevices.length > 0 && !audioDevice) {
            setAudioDevice(audioInputDevices[0]);
          }
        } catch (fallbackError) {
          console.error('Fallback device enumeration failed:', fallbackError);
        }
        
        toast({
          title: "Microphone Access",
          description: "Microphone permission is needed for device selection. Please allow microphone access when prompted.",
          variant: "destructive",
        });
      }
    };

    initializeDevices();
  }, []);

  // Set up broadcast client when going live
  useEffect(() => {
    const setupBroadcastClient = async () => {
      if (isLive && streamCredentials && hasIVSChannel && !broadcastClient) {
        try {
          setBroadcastState('connecting');
          console.log('Setting up broadcast client...', { credentials: streamCredentials });
          
          // Dynamically import amazon-ivs-web-broadcast with better error handling
          let IVSBroadcastClient;
          try {
            const IVSBroadcast = await import('amazon-ivs-web-broadcast');
            console.log('IVS Broadcast module loaded:', IVSBroadcast);
            
            // Try different possible export names
            IVSBroadcastClient = (IVSBroadcast as any).AmazonIVSBroadcastClient || 
                                 (IVSBroadcast as any).default?.AmazonIVSBroadcastClient ||
                                 (IVSBroadcast as any).default;
            
            if (!IVSBroadcastClient) {
              throw new Error('AmazonIVSBroadcastClient not found in imported module');
            }
            console.log('IVSBroadcastClient found:', !!IVSBroadcastClient);
          } catch (importError) {
            console.error('Failed to import IVS broadcast client:', importError);
            throw new Error(`Failed to load IVS broadcast library: ${importError instanceof Error ? importError.message : 'Unknown error'}`);
          }
          
          // Validate stream credentials
          const credentials = streamCredentials as any;
          if (!credentials || !credentials.streamKey || !credentials.ingestEndpoint) {
            throw new Error('Invalid stream credentials - missing streamKey or ingestEndpoint');
          }
          
          console.log('Creating broadcast client with credentials:', {
            ingestEndpoint: credentials.ingestEndpoint,
            streamKeyPresent: !!credentials.streamKey
          });
          
          // Create broadcast client with better error handling
          let client;
          try {
            // Use 360p config optimized for our synthetic video (640x360 @ 15fps)
            const streamConfig = IVSBroadcastClient.BASIC_LANDSCAPE || {
              maxResolution: { width: 640, height: 360 },
              maxBitrate: 1500,
              maxFramerate: 15
            };
            
            client = IVSBroadcastClient.create({
              streamConfig,
              ingestEndpoint: credentials.ingestEndpoint,
            });
            
            if (!client) {
              throw new Error('Failed to create broadcast client - client is null');
            }
            console.log('Broadcast client created successfully');
          } catch (createError) {
            console.error('Failed to create broadcast client:', createError);
            throw new Error(`Failed to create broadcast client: ${createError instanceof Error ? createError.message : 'Unknown error'}`);
          }
          
          // Set up event listeners with better error handling
          if (client.on && IVSBroadcastClient.EVENTS) {
            client.on(IVSBroadcastClient.EVENTS.BROADCAST_ERROR, (error: any) => {
              console.error('Broadcast error event:', error);
              setBroadcastState('error');
              toast({
                title: "Broadcast Error",
                description: error?.message || "An error occurred during broadcasting",
                variant: "destructive",
              });
            });

            client.on(IVSBroadcastClient.EVENTS.BROADCAST_STATE_CHANGED, (state: any) => {
              console.log('Broadcast state changed:', state);
              if (typeof state === 'string') {
                const lowerState = state.toLowerCase();
                if (lowerState === 'disconnected' || lowerState === 'connecting' || lowerState === 'connected' || lowerState === 'error') {
                  setBroadcastState(lowerState as BroadcastState);
                }
              }
            });
          }

          // Create minimal video source for IVS - required for channel to go LIVE
          // IVS requires both audio and video inputs to transition channel to LIVE state
          let videoStream;
          try {
            console.log('Creating minimal video source for IVS...');
            console.log('Browser capabilities:', {
              hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
              hasEnumerateDevices: !!navigator.mediaDevices?.enumerateDevices,
              hasCanvasCaptureStream: typeof HTMLCanvasElement.prototype.captureStream === 'function',
              userAgent: navigator.userAgent,
              platform: navigator.platform
            });
            
            // Try multiple methods to create a minimal video source
            videoStream = await createMinimalVideoSource();
            
            if (!videoStream) {
              throw new Error('All video source creation methods failed');
            }
            
            console.log('Minimal video stream created:', {
              tracks: videoStream.getVideoTracks().length,
              width: 1,
              height: 1,
              streamId: videoStream.id,
              active: videoStream.active
            });
            
            // Add video stream to broadcast client
            if (videoStream && videoStream.getVideoTracks().length > 0) {
              console.log('Adding minimal video stream to broadcast client...');
              // Amazon IVS requires VideoComposition when adding video devices
              const videoComposition = {
                x: 0,      // Position from left
                y: 0,      // Position from top  
                width: 1,  // 1 pixel width (minimal)
                height: 1, // 1 pixel height (minimal)
                index: 0   // Z-index/layer
              };
              await client.addVideoInputDevice(videoStream, 'minimal-video', videoComposition);
              console.log('Minimal video stream added successfully');
            } else {
              throw new Error('Failed to create video stream - no video tracks found');
            }
            
          } catch (videoError) {
            console.error('Failed to create minimal video source with detailed error:', {
              error: videoError,
              errorName: videoError instanceof Error ? videoError.name : 'Unknown',
              errorMessage: videoError instanceof Error ? videoError.message : String(videoError),
              errorStack: videoError instanceof Error ? videoError.stack : 'No stack trace',
              errorConstructor: videoError?.constructor?.name || 'Unknown',
              stringifiedError: JSON.stringify(videoError, Object.getOwnPropertyNames(videoError))
            });
            throw new Error(`Failed to create video source: ${videoError instanceof Error ? videoError.message : 'Unknown error'}`);
          }

          // Get microphone stream with better error handling
          let stream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: audioDevice?.deviceId || undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100, // High quality audio for broadcasting
              }
            });
            console.log('Microphone stream obtained:', {
              tracks: stream.getAudioTracks().length,
              deviceId: audioDevice?.deviceId || 'default'
            });
          } catch (streamError) {
            console.error('Failed to get microphone stream:', streamError);
            throw new Error(`Failed to access microphone: ${streamError instanceof Error ? streamError.message : 'Unknown error'}`);
          }

          // Add audio stream to client using the correct IVS API
          try {
            const audioTrack = stream.getAudioTracks()[0];
            if (!audioTrack) {
              throw new Error('No audio track found in stream');
            }
            
            console.log('Adding audio stream to client:', {
              trackLabel: audioTrack.label,
              trackId: audioTrack.id,
              muted: isMuted,
              streamActive: stream.active,
              streamTracks: stream.getTracks().length,
              availableMethods: Object.keys(client).filter(key => typeof client[key] === 'function')
            });
            
            // Use the correct IVS API: addAudioInputDevice expects a MediaStream, not MediaStreamTrack
            try {
              console.log('Calling addAudioInputDevice with stream and name "microphone"');
              await client.addAudioInputDevice(stream, 'microphone');
              console.log('Audio stream added to broadcast client successfully');
            } catch (addError: any) {
              // Log detailed error information
              console.error('addAudioInputDevice failed with detailed error:', {
                error: addError,
                errorName: addError?.name,
                errorMessage: addError?.message,
                errorStack: addError?.stack,
                errorCode: addError?.code,
                stringifiedError: JSON.stringify(addError),
                errorType: typeof addError
              });
              throw addError;
            }
            
            // Handle muting if needed
            if (isMuted) {
              audioTrack.enabled = false;
              console.log('Audio track muted on initialization');
            }
            
          } catch (audioError) {
            console.error('Failed to add audio stream to broadcast client:', audioError);
            // Stop the stream if we can't add the audio
            stream.getTracks().forEach(track => track.stop());
            throw new Error(`Failed to add audio stream: ${audioError instanceof Error ? audioError.message : 'Unknown error'}`);
          }

          // Start broadcasting
          try {
            console.log('Starting broadcast with stream key:', credentials.streamKey.substring(0, 10) + '...');
            await client.startBroadcast(credentials.streamKey);
            console.log('Broadcast started successfully, now validating IVS LIVE state...');
            
            setBroadcastClient(client);
            broadcastClientRef.current = client;
            setMediaStream(stream);
            setBroadcastState('validating');
            
            // Start polling IVS channel status to confirm it's actually LIVE
            // IVS requires both audio and video to transition to LIVE state
            startIVSLiveValidation();
            
          } catch (broadcastError) {
            console.error('Failed to start broadcast:', broadcastError);
            // Clean up on failure
            stream.getTracks().forEach(track => track.stop());
            if (client.destroy) {
              try {
                await client.destroy();
              } catch (destroyError) {
                console.error('Error destroying client:', destroyError);
              }
            }
            throw new Error(`Failed to start broadcast: ${broadcastError instanceof Error ? broadcastError.message : 'Unknown error'}`);
          }
          
        } catch (error) {
          console.error('Failed to start broadcast:', error);
          setBroadcastState('error');
          toast({
            title: "Broadcast Setup Failed", 
            description: error instanceof Error ? error.message : "Could not start broadcasting. Please check your microphone and try again.",
            variant: "destructive",
          });
        }
      }
    };

    setupBroadcastClient();
  }, [isLive, streamCredentials, hasIVSChannel, broadcastClient, audioDevice, isMuted]);

  // Clean up broadcast when stopping
  useEffect(() => {
    if (!isLive && broadcastClient) {
      stopBroadcast();
    }
  }, [isLive]);

  // Function to start IVS live state validation polling
  const startIVSLiveValidation = () => {
    console.log('Starting IVS live state validation...');
    
    // Clear any existing polling interval
    if (validationPollingInterval) {
      clearInterval(validationPollingInterval);
    }
    
    const startTime = Date.now(); // Use local variable instead of state
    setValidationStartTime(startTime);
    const VALIDATION_TIMEOUT = 90 * 1000; // 90 seconds timeout
    const POLL_INTERVAL = 4 * 1000; // Poll every 4 seconds
    
    const pollChannelStatus = async () => {
      try {
        const currentTime = Date.now();
        const elapsedTime = currentTime - startTime; // Use local startTime variable
        
        console.log(`Checking IVS channel status... (${Math.round(elapsedTime / 1000)}s elapsed)`);
        
        // Check for timeout
        if (elapsedTime > VALIDATION_TIMEOUT) {
          console.error('IVS live validation timed out after', VALIDATION_TIMEOUT / 1000, 'seconds');
          clearInterval(validationPollingInterval!);
          setValidationPollingInterval(null);
          setBroadcastState('error');
          toast({
            title: "Stream Failed to Start",
            description: "The stream failed to go live within 90 seconds. Please try again.",
            variant: "destructive",
          });
          return;
        }
        
        // Poll the channel status endpoint using fetch
        const statusResponse = await fetch('/api/user/ivs-channel-status');
        const statusData = await statusResponse.json();
        console.log('IVS channel status response:', statusData);
        
        if (statusData && statusData.streamStatus && statusData.streamStatus.state === 'LIVE') {
          console.log('IVS channel confirmed LIVE! Validation successful.');
          
          // Clear polling and set connected state
          clearInterval(validationPollingInterval!);
          setValidationPollingInterval(null);
          setValidationStartTime(null);
          setBroadcastState('connected');
        } else {
          const state = statusData && statusData.streamStatus ? statusData.streamStatus.state : 'UNKNOWN';
          console.log(`IVS channel not yet live, current state: ${state}`);
        }
        
      } catch (error) {
        console.error('Error checking IVS channel status:', error);
        // Continue polling even on API errors - network issues shouldn't immediately fail
      }
    };
    
    // Start immediate check, then set up interval
    pollChannelStatus();
    const interval = setInterval(pollChannelStatus, POLL_INTERVAL);
    setValidationPollingInterval(interval);
  };

  // Cleanup validation polling when component unmounts or broadcast stops
  useEffect(() => {
    return () => {
      if (validationPollingInterval) {
        clearInterval(validationPollingInterval);
        setValidationPollingInterval(null);
      }
    };
  }, [validationPollingInterval]);

  // Start microphone testing with real-time audio level monitoring
  const startMicrophoneTest = async () => {
    try {
      console.log('Starting microphone test...');
      
      // Stop any existing test
      await stopMicrophoneTest();
      
      // Check if browser supports getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support microphone access. Please use Chrome, Firefox, or Safari.');
      }

      console.log('Requesting microphone access for device:', audioDevice?.label || 'default');
      
      // Get audio stream from selected device
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: audioDevice?.deviceId ? { exact: audioDevice.deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: false, // Disable for testing to get raw audio levels
          autoGainControl: false,  // Disable for accurate level monitoring
          sampleRate: 44100,
        }
      });

      console.log('Microphone access granted, stream active:', stream.active);
      console.log('Audio tracks:', stream.getAudioTracks().length);
      
      setMicTestStream(stream);
      setIsMicTesting(true);
      
      // Set up Web Audio API for real-time level monitoring
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyserNode = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(stream);
      
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.2;
      source.connect(analyserNode);
      
      setAudioContext(audioCtx);
      setAnalyser(analyserNode);
      
      // Create audio data buffer
      const bufferLength = analyserNode.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      audioBufferRef.current = dataArray;
      
      // Start audio level monitoring animation
      const updateAudioLevels = () => {
        if (analyserNode && audioBufferRef.current && stream && stream.active && !stream.getTracks().some(track => track.readyState === 'ended')) {
          analyserNode.getByteFrequencyData(audioBufferRef.current);
          
          // Calculate average audio level
          let sum = 0;
          for (let i = 0; i < audioBufferRef.current.length; i++) {
            sum += audioBufferRef.current[i];
          }
          const average = sum / audioBufferRef.current.length;
          
          // Convert to percentage (0-100)
          const level = Math.min(100, (average / 255) * 100);
          setAudioLevels(level);
          
          console.log('Audio level:', level); // Debug logging
          
          // Continue animation
          animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
        } else {
          console.log('Audio monitoring stopped - no active stream or analyser', {
            hasAnalyser: !!analyserNode,
            hasBuffer: !!audioBufferRef.current,
            hasStream: !!stream,
            streamActive: stream?.active,
            tracksEnded: stream?.getTracks().some(track => track.readyState === 'ended')
          });
        }
      };
      
      updateAudioLevels();
      
      toast({
        title: "Microphone Test Started",
        description: "Speak into your microphone to see audio levels. Test recording is now available.",
      });
      
    } catch (error) {
      console.error('Failed to start microphone test:', error);
      
      let errorMessage = "Could not access microphone. Please check permissions.";
      let errorTitle = "Microphone Test Failed";
      
      if (error instanceof DOMException) {
        switch (error.name) {
          case 'NotAllowedError':
            errorTitle = "Microphone Permission Denied";
            errorMessage = "Please allow microphone access in your browser settings and try again. Look for a microphone icon in your address bar.";
            break;
          case 'NotFoundError':
            errorTitle = "Microphone Not Found";
            errorMessage = "No microphone was found. Please connect a microphone and refresh the page.";
            break;
          case 'NotReadableError':
            errorTitle = "Microphone In Use";
            errorMessage = "Your microphone is being used by another application. Please close other apps and try again.";
            break;
          case 'OverconstrainedError':
            errorTitle = "Microphone Configuration Error";
            errorMessage = "The selected microphone doesn't support the required audio settings. Try selecting a different microphone.";
            break;
          default:
            errorMessage = error.message || errorMessage;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Stop microphone testing and cleanup
  const stopMicrophoneTest = async () => {
    console.log('Stopping microphone test...');
    
    try {
      // Stop animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Stop recording if active
      if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        setIsRecording(false);
      }
      
      // Stop audio stream
      if (micTestStream) {
        micTestStream.getTracks().forEach(track => track.stop());
        setMicTestStream(null);
      }
      
      // Close audio context
      if (audioContext && audioContext.state !== 'closed') {
        await audioContext.close();
        setAudioContext(null);
      }
      
      // Reset state
      setAnalyser(null);
      setMediaRecorder(null);
      setAudioLevels(0);
      setIsMicTesting(false);
      audioBufferRef.current = null;
      
    } catch (error) {
      console.error('Error stopping microphone test:', error);
    }
  };

  // Start test recording
  const startTestRecording = () => {
    if (!micTestStream) {
      toast({
        title: "No Audio Stream",
        description: "Please start microphone test first.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const recorder = new MediaRecorder(micTestStream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
        setTestRecording(blob);
        setIsRecording(false);
        
        toast({
          title: "Recording Complete",
          description: "You can now play back your test recording to hear how you sound.",
        });
      };
      
      recorder.onerror = (error) => {
        console.error('Recording error:', error);
        setIsRecording(false);
        toast({
          title: "Recording Failed",
          description: "Could not record audio. Please try again.",
          variant: "destructive",
        });
      };
      
      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
      setTestRecording(null); // Clear previous recording
      
      // Auto-stop after 5 seconds
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, 5000);
      
      toast({
        title: "Recording Started",
        description: "Speak clearly for up to 5 seconds. Recording will stop automatically.",
      });
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      setIsRecording(false);
      toast({
        title: "Recording Error",
        description: "Could not start recording. Please check browser support.",
        variant: "destructive",
      });
    }
  };

  // Stop test recording
  const stopTestRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
    }
  };

  // Play back test recording
  const playTestRecording = () => {
    if (!testRecording) {
      toast({
        title: "No Recording",
        description: "Please record a test audio clip first.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const audioUrl = URL.createObjectURL(testRecording);
      const audio = new Audio(audioUrl);
      
      setIsPlayingBack(true);
      
      audio.onended = () => {
        setIsPlayingBack(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.onerror = () => {
        setIsPlayingBack(false);
        URL.revokeObjectURL(audioUrl);
        toast({
          title: "Playback Error",
          description: "Could not play recording. Please try recording again.",
          variant: "destructive",
        });
      };
      
      audio.play();
      
    } catch (error) {
      console.error('Failed to play recording:', error);
      setIsPlayingBack(false);
      toast({
        title: "Playback Failed",
        description: "Could not play recording. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle device change with automatic test restart
  const handleDeviceChangeWithRestart = async (deviceId: string) => {
    const device = availableDevices.find(d => d.deviceId === deviceId);
    setAudioDevice(device || null);
    
    // If currently testing, restart with new device
    if (isMicTesting) {
      await stopMicrophoneTest();
      // Small delay before restarting
      setTimeout(startMicrophoneTest, 100);
    }
  };

  // Mark microphone test as passed and proceed
  const confirmMicrophoneTest = () => {
    setMicTestPassed(true);
    setShowMicTestModal(false);
    stopMicrophoneTest();
    
    // Remember that user has completed mic test (so it's not required next time)
    localStorage.setItem('booth_mic_test_completed', 'true');
    
    toast({
      title: "Microphone Test Complete",
      description: "Your microphone is ready for broadcasting! You won't need to test again unless you want to.",
    });
  };

  // Open microphone test modal
  const openMicTestModal = () => {
    setShowMicTestModal(true);
    setMicTestPassed(false);
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      stopMicrophoneTest();
    };
  }, []);

  const stopBroadcast = async () => {
    console.log('Stopping broadcast...');
    
    // FIRST: Clear validation polling to prevent race condition with "You're Live!" popup
    if (validationPollingInterval) {
      console.log('Clearing validation polling during explicit broadcast stop');
      clearInterval(validationPollingInterval);
      setValidationPollingInterval(null);
    }
    setValidationStartTime(null);
    
    try {
      // Stop the broadcast client if it exists
      if (broadcastClient) {
        try {
          if (broadcastClient.stopBroadcast) {
            await broadcastClient.stopBroadcast();
            console.log('Broadcast stopped successfully');
          }
          
          if (broadcastClient.removeAllListeners) {
            broadcastClient.removeAllListeners();
          }
          
          if (broadcastClient.destroy) {
            await broadcastClient.destroy();
            console.log('Broadcast client destroyed');
          }
        } catch (clientError) {
          console.error('Error stopping broadcast client:', clientError);
        }
      }
      
      // Stop all media tracks
      if (mediaStream) {
        try {
          mediaStream.getTracks().forEach(track => {
            track.stop();
            console.log('Stopped track:', track.label || track.kind);
          });
          setMediaStream(null);
        } catch (streamError) {
          console.error('Error stopping media stream:', streamError);
        }
      }
      
      // Reset state
      setBroadcastClient(null);
      broadcastClientRef.current = null;
      setBroadcastState('disconnected');
      
      console.log('Broadcast cleanup completed');
      
    } catch (error) {
      console.error('Failed to stop broadcast:', error);
      // Force reset state even if cleanup fails
      setBroadcastClient(null);
      broadcastClientRef.current = null;
      setBroadcastState('disconnected');
      setMediaStream(null);
    }
  };

  const handleToggleMute = async () => {
    console.log('Toggling mute, current state:', isMuted);
    
    // If using IVS Stage controls (passed from parent), use those
    if (hasStageControls && onToggleMuteProp) {
      onToggleMuteProp();
      return;
    }
    
    // Otherwise use legacy broadcast client controls
    if (broadcastClient && mediaStream) {
      try {
        const audioTrack = mediaStream.getAudioTracks()[0];
        if (audioTrack) {
          // Toggle the track enabled state (true = not muted, false = muted)
          audioTrack.enabled = isMuted; // If currently muted, enable; if not muted, disable
          console.log('Audio track enabled set to:', audioTrack.enabled);
          
          // Try to update the broadcast client if it supports it
          if (broadcastClient.updateAudioInputDevice) {
            try {
              await broadcastClient.updateAudioInputDevice('microphone', { 
                muted: !isMuted 
              });
              console.log('Broadcast client mute state updated');
            } catch (updateError) {
              console.warn('Could not update broadcast client mute state:', updateError);
              // Continue anyway - the track level mute should still work
            }
          }
        }
        
        setIsMutedLocal(!isMuted);
        
        toast({
          title: isMuted ? "Microphone Unmuted" : "Microphone Muted",
          description: isMuted ? "Your microphone is now active" : "Your microphone is now muted",
        });
        
      } catch (error) {
        console.error('Failed to toggle mute:', error);
        toast({
          title: "Mute Error",
          description: "Failed to toggle microphone. Please try again.",
          variant: "destructive",
        });
      }
    } else {
      // If not broadcasting yet, just toggle the state
      setIsMutedLocal(!isMuted);
      console.log('Toggled mute state while not broadcasting');
    }
  };

  const handleDeviceChange = async (deviceId: string) => {
    console.log('Changing audio device to:', deviceId);
    
    const device = availableDevices.find(d => d.deviceId === deviceId);
    if (device) {
      console.log('Found device:', device.label || device.deviceId);
      setAudioDevice(device);
      
      // If currently broadcasting, restart with new device
      if (broadcastClient && isLive) {
        toast({
          title: "Device Changed",
          description: "Audio device updated. Restarting broadcast...",
        });
        
        console.log('Restarting broadcast with new device...');
        await stopBroadcast();
        // The useEffect will handle restarting the broadcast with the new device
      } else {
        console.log('Device changed while not broadcasting');
      }
    } else {
      console.error('Device not found:', deviceId);
      toast({
        title: "Device Error",
        description: "Selected audio device not found",
        variant: "destructive",
      });
    }
  };


  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      toast({
        title: "Link Copied!",
        description: "Share this link with your co-casting partner.",
      });
      setTimeout(() => setLinkCopied(false), 3000);
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Please copy the link manually.",
        variant: "destructive",
      });
    }
  };


  const handleOpenSettingsModal = () => {
    setShowSettingsModal(true);
  };

  const handleConfirmGoLive = () => {
    const formData = form.getValues();
    console.log("[CAST SETTINGS SUBMIT]", formData); // should show internal values (not labels)
    
    // Send internal values directly - no transformation needed
    onGoLive(formData);
    setShowSettingsModal(false);
  };



  return (
    <div className="space-y-4">
      {/* Live Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="w-5 h-5" />
            Broadcasting Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(isLive || (isCohost && cohostIsConnected)) ? (
            <div className="space-y-4">
              {/* Live Status & Broadcast Status */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
                    <span className="font-medium text-red-600">LIVE</span>
                    <Badge variant="secondary">{listenerCount} listening</Badge>
                  </div>
                  {!isCohost && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={onEndStream}
                      data-testid="button-end-stream"
                    >
                      End Stream
                    </Button>
                  )}
                </div>

                {/* Broadcast Connection Status */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  {isCohost ? (
                    // Co-host shows Stage connection status
                    <>
                      {cohostConnectState === 'connected' && (
                        <>
                          <Wifi className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-medium text-green-600">Broadcasting</span>
                          <Badge variant="outline" className="text-green-600 border-green-600">Connected</Badge>
                        </>
                      )}
                      {cohostConnectState === 'connecting' && (
                        <>
                          <div className="w-4 h-4 animate-spin rounded-full border-2 border-orange-600 border-r-transparent" />
                          <span className="text-sm font-medium text-orange-600">Connecting...</span>
                          <Badge variant="outline" className="text-orange-600 border-orange-600">Connecting</Badge>
                        </>
                      )}
                      {cohostConnectState === 'error' && (
                        <>
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-medium text-red-600">Connection Error</span>
                          <Badge variant="destructive">Error</Badge>
                        </>
                      )}
                      {cohostConnectState === 'disconnected' && (
                        <>
                          <WifiOff className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-400">Not Connected</span>
                          <Badge variant="secondary">Offline</Badge>
                        </>
                      )}
                    </>
                  ) : (
                    // Host shows IVS Channel broadcast status
                    <>
                      {broadcastState === 'connected' && (
                        <>
                          <Wifi className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-medium text-green-600">Broadcasting</span>
                          <Badge variant="outline" className="text-green-600 border-green-600">Connected</Badge>
                        </>
                      )}
                      {broadcastState === 'connecting' && (
                        <>
                          <div className="w-4 h-4 animate-spin rounded-full border-2 border-orange-600 border-r-transparent" />
                          <span className="text-sm font-medium text-orange-600">Connecting...</span>
                          <Badge variant="outline" className="text-orange-600 border-orange-600">Initializing</Badge>
                        </>
                      )}
                      {broadcastState === 'validating' && (
                        <>
                          <div className="w-4 h-4 animate-spin rounded-full border-2 border-blue-600 border-r-transparent" />
                          <span className="text-sm font-medium text-blue-600">Starting stream...</span>
                          <Badge variant="outline" className="text-blue-600 border-blue-600">Validating</Badge>
                        </>
                      )}
                      {broadcastState === 'error' && (
                        <>
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-medium text-red-600">Broadcast Error</span>
                          <Badge variant="destructive">Error</Badge>
                        </>
                      )}
                      {broadcastState === 'disconnected' && (
                        <>
                          <WifiOff className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-400">Not Broadcasting</span>
                          <Badge variant="secondary">Offline</Badge>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              <Separator />

              {/* Audio Device Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Microphone Device</Label>
                <Select 
                  value={audioDevice?.deviceId || undefined} 
                  onValueChange={handleDeviceChangeWithRestart}
                  disabled={broadcastState === 'connecting'}
                >
                  <SelectTrigger data-testid="select-audio-device">
                    <SelectValue placeholder="Select microphone..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDevices.length > 0 ? (
                      availableDevices
                        .filter((device) => device.deviceId && device.deviceId.trim() !== "")
                        .map((device, index) => (
                          <SelectItem key={device.deviceId} value={device.deviceId}>
                            {device.label || `Microphone ${index + 1} (${device.deviceId.slice(-4)})`}
                          </SelectItem>
                        ))
                    ) : (
                      <SelectItem value="no-devices" disabled>
                        No microphones found
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Mic Controls */}
              <div className="flex items-center gap-4">
                <Button
                  variant={isMuted ? "destructive" : "default"}
                  size="sm"
                  onClick={handleToggleMute}
                  className="gap-2"
                  data-testid="button-toggle-mute"
                  disabled={broadcastState === 'connecting'}
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {isMuted ? "Unmute" : "Mute"}
                </Button>
                
                {broadcastState === 'error' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Force restart broadcast by clearing and re-triggering
                      setBroadcastClient(null);
                    }}
                    className="gap-2"
                  >
                    <Radio className="w-4 h-4" />
                    Retry Broadcast
                  </Button>
                )}
              </div>

              <Separator />

              {/* Microphone Testing */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Microphone Testing
                </Label>
                
                {/* Audio Level Monitor */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Audio Level</span>
                    <span>{Math.round(audioLevels)}%</span>
                  </div>
                  
                  {/* Visual Audio Level Bar */}
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-75 ${
                        audioLevels < 10 ? 'bg-gray-400' :
                        audioLevels < 50 ? 'bg-green-500' :
                        audioLevels < 80 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, audioLevels)}%` }}
                    />
                  </div>
                  
                  {/* Audio Level Status */}
                  <div className="text-xs text-center">
                    {!isMicTesting ? (
                      <span className="text-muted-foreground">Click "Test Microphone" to start monitoring</span>
                    ) : audioLevels < 5 ? (
                      <span className="text-gray-500">Speak into your microphone...</span>
                    ) : audioLevels < 20 ? (
                      <span className="text-green-600">Good level - speak louder for better quality</span>
                    ) : audioLevels < 70 ? (
                      <span className="text-green-600">Perfect audio level!</span>
                    ) : audioLevels < 85 ? (
                      <span className="text-yellow-600">Getting loud - consider moving back</span>
                    ) : (
                      <span className="text-red-600">Too loud - risk of audio distortion</span>
                    )}
                  </div>
                </div>

                {/* Microphone Test Controls */}
                <div className="flex gap-2">
                  <Button
                    variant={isMicTesting ? "destructive" : "outline"}
                    size="sm"
                    onClick={isMicTesting ? stopMicrophoneTest : startMicrophoneTest}
                    className="gap-2 flex-1"
                    data-testid="button-test-microphone"
                  >
                    <Mic className="w-4 h-4" />
                    {isMicTesting ? "Stop Test" : "Test Microphone"}
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openMicTestModal}
                    className="gap-2"
                    data-testid="button-advanced-test"
                  >
                    <Settings className="w-4 h-4" />
                    Advanced
                  </Button>
                </div>

                {/* Recording Controls (when testing) */}
                {isMicTesting && (
                  <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                    <Label className="text-xs font-medium">Test Recording</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={isRecording ? "destructive" : "outline"}
                        size="sm"
                        onClick={isRecording ? stopTestRecording : startTestRecording}
                        disabled={isPlayingBack}
                        className="gap-2 flex-1"
                        data-testid="button-record-test"
                      >
                        {isRecording ? (
                          <>
                            <Square className="w-3 h-3" />
                            Stop Recording ({Math.max(0, 5 - Math.floor((Date.now() % 5000) / 1000))}s)
                          </>
                        ) : (
                          <>
                            <Radio className="w-3 h-3" />
                            Record Test (5s)
                          </>
                        )}
                      </Button>
                      
                      {testRecording && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={playTestRecording}
                          disabled={isRecording || isPlayingBack}
                          className="gap-2"
                          data-testid="button-play-test"
                        >
                          <Play className="w-3 h-3" />
                          {isPlayingBack ? "Playing..." : "Play"}
                        </Button>
                      )}
                    </div>
                    
                    {isRecording && (
                      <div className="text-xs text-center text-muted-foreground">
                        Speak clearly for 5 seconds to test your audio quality
                      </div>
                    )}
                    
                    {testRecording && !isRecording && (
                      <div className="text-xs text-center text-green-600">
                        Recording ready! Click "Play" to hear how you sound.
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">
                  Ready to start broadcasting for {event.title}?
                </p>
                
                {/* Microphone Test Requirement */}
                {!micTestPassed && (
                  <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200 mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">
                        Microphone Test (Optional)
                      </span>
                    </div>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                      Test your audio setup to ensure optimal quality for your listeners. This is completely optional - you can go live immediately if you prefer.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={openMicTestModal}
                        variant="outline"
                        className="gap-2 border-yellow-300 text-yellow-800 hover:bg-yellow-100 dark:border-yellow-700 dark:text-yellow-200 dark:hover:bg-yellow-900/30"
                        data-testid="button-mic-test"
                      >
                        <Mic className="w-4 h-4" />
                        Test Microphone
                      </Button>
                    </div>
                  </div>
                )}
                
                {!isCohost && (
                  <Button
                    onClick={handleOpenSettingsModal}
                    className="gap-2"
                    data-testid="button-go-live"
                  >
                    <Radio className="w-4 h-4" />
                    Go Live
                  </Button>
                )}
                
                {isCohost && !cohostIsConnected && (
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                      <Radio className="w-4 h-4" />
                      <span className="font-medium">Co-host Mode</span>
                    </div>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      You'll automatically connect when the host starts broadcasting. No setup needed!
                    </p>
                  </div>
                )}
                
                {micTestPassed && (
                  <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400 mt-2">
                    <Check className="w-4 h-4" />
                    Microphone tested and ready!
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Broadcasting Settings Modal */}
      <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Set Your Commentary Style
            </DialogTitle>
            <DialogDescription>
              Choose your perspective, mode, and tone to help listeners find exactly the commentary they want.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Perspective */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Perspective</Label>
              <div className="flex flex-wrap gap-2">
                {PERSPECTIVE_OPTIONS.map(o => (
                  <Chip
                    key={o.value}
                    active={watch('perspective') === o.value}
                    onClick={() => setValue('perspective', o.value as any, { shouldValidate: true })}
                  >
                    {o.label}
                  </Chip>
                ))}
              </div>
              {!watch('perspective') && <p className="text-xs text-muted-foreground mt-1">Pick one.</p>}
              {errors.perspective && <p className="text-xs text-destructive mt-1">Select a perspective.</p>}
            </div>

            {/* Mode */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Commentary Mode</Label>
              <div className="flex flex-wrap gap-2 mt-3">
                {MODE_OPTIONS.map(o => (
                  <Chip
                    key={o.value}
                    active={watch('mode') === o.value}
                    onClick={() => setValue('mode', o.value as any, { shouldValidate: true })}
                  >
                    {o.label}
                  </Chip>
                ))}
              </div>
              {!watch('mode') && <p className="text-xs text-muted-foreground mt-1">Pick one.</p>}
              {errors.mode && <p className="text-xs text-destructive mt-1">Select a mode.</p>}
            </div>

            {/* Tone */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Tone (Serious and Comedy are mutually exclusive)</Label>
              <div className="flex flex-wrap gap-2 mt-3">
                {TONE_OPTIONS.map(o => {
                  const currentTones = watch('tones') || [];
                  const isOn = currentTones.includes(o.value as any);
                  return (
                    <Chip
                      key={o.value}
                      active={isOn}
                      onClick={() => {
                        const tone = o.value;
                        
                        // If clicking the same tone, remove it
                        if (isOn) {
                          setValue('tones', currentTones.filter(t => t !== tone) as any, { shouldValidate: true });
                          return;
                        }
                        
                        // Serious and Comedy are mutually exclusive
                        if (tone === 'serious' && currentTones.includes('comedy')) {
                          // Replace comedy with serious (keep pg13 if present)
                          setValue('tones', currentTones.filter(t => t !== 'comedy').concat(tone) as any, { shouldValidate: true });
                          return;
                        }
                        
                        if (tone === 'comedy' && currentTones.includes('serious')) {
                          // Replace serious with comedy (keep pg13 if present)
                          setValue('tones', currentTones.filter(t => t !== 'serious').concat(tone) as any, { shouldValidate: true });
                          return;
                        }
                        
                        // Otherwise, add the tone
                        setValue('tones', [...currentTones, tone] as any, { shouldValidate: true });
                      }}
                    >
                      {o.label}
                    </Chip>
                  );
                })}
              </div>
              {watch('tones')?.length === 0 && <p className="text-xs text-muted-foreground mt-1">Pick at least one.</p>}
              {errors.tones && <p className="text-xs text-destructive mt-1">Pick at least one tone.</p>}
            </div>

          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSettingsModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmGoLive}
              disabled={!form.formState.isValid}
              className="gap-2"
              data-testid="button-confirm-go-live"
            >
              <Radio className="w-4 h-4" />
              Start Broadcasting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advanced Microphone Test Modal */}
      <Dialog open={showMicTestModal} onOpenChange={setShowMicTestModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="w-5 h-5" />
              Advanced Microphone Testing
            </DialogTitle>
            <DialogDescription>
              Test your microphone setup to ensure perfect audio quality for your broadcast. Check audio levels, test different devices, and record a sample to hear how you sound.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Device Selection */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Microphone Device</Label>
              <Select 
                value={audioDevice?.deviceId || undefined} 
                onValueChange={handleDeviceChangeWithRestart}
                disabled={isMicTesting}
              >
                <SelectTrigger data-testid="modal-select-audio-device">
                  <SelectValue placeholder="Select microphone..." />
                </SelectTrigger>
                <SelectContent>
                  {availableDevices.length > 0 ? (
                    availableDevices
                      .filter((device) => device.deviceId && device.deviceId.trim() !== "")
                      .map((device, index) => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${index + 1} (${device.deviceId.slice(-4)})`}
                        </SelectItem>
                      ))
                  ) : (
                    <SelectItem value="no-devices" disabled>
                      No microphones found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Audio Level Monitoring */}
            <div className="space-y-4">
              <Label className="text-base font-medium">Audio Level Monitoring</Label>
              
              {/* Large Audio Level Display */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Current Level</span>
                  <span className="text-lg font-mono">{Math.round(audioLevels)}%</span>
                </div>
                
                {/* Enhanced Visual Audio Level Bar */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden mb-2">
                  <div 
                    className={`h-full transition-all duration-100 ${
                      audioLevels < 10 ? 'bg-gray-400' :
                      audioLevels < 30 ? 'bg-blue-500' :
                      audioLevels < 70 ? 'bg-green-500' :
                      audioLevels < 85 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, audioLevels)}%` }}
                  />
                </div>
                
                {/* Audio Level Guidelines */}
                <div className="flex justify-between text-xs text-muted-foreground mb-3">
                  <span>Silent</span>
                  <span>Optimal (30-70%)</span>
                  <span>Too Loud</span>
                </div>
                
                {/* Real-time Audio Status */}
                <div className="text-center p-2 rounded bg-background">
                  {!isMicTesting ? (
                    <span className="text-muted-foreground">Click "Start Test" to begin monitoring</span>
                  ) : audioLevels < 5 ? (
                    <span className="text-gray-500">🔇 No audio detected - speak into your microphone</span>
                  ) : audioLevels < 15 ? (
                    <span className="text-blue-600">🔉 Very quiet - try speaking louder</span>
                  ) : audioLevels < 30 ? (
                    <span className="text-blue-600">🔉 Quiet - good for ASMR or soft-spoken content</span>
                  ) : audioLevels < 70 ? (
                    <span className="text-green-600">🔊 Perfect level - excellent for broadcasting!</span>
                  ) : audioLevels < 85 ? (
                    <span className="text-yellow-600">📢 Getting loud - consider moving back from mic</span>
                  ) : (
                    <span className="text-red-600">⚠️ Too loud - risk of audio distortion and listener discomfort</span>
                  )}
                </div>
              </div>

              {/* Test Controls */}
              <div className="flex gap-3">
                <Button
                  variant={isMicTesting ? "destructive" : "default"}
                  onClick={isMicTesting ? stopMicrophoneTest : startMicrophoneTest}
                  className="gap-2 flex-1"
                  data-testid="modal-button-start-test"
                >
                  {isMicTesting ? (
                    <>
                      <Square className="w-4 h-4" />
                      Stop Test
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      Start Test
                    </>
                  )}
                </Button>
                
                {isMicTesting && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      stopMicrophoneTest();
                      setTimeout(startMicrophoneTest, 100);
                    }}
                    className="gap-2"
                    data-testid="modal-button-refresh-test"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                  </Button>
                )}
              </div>
            </div>

            {/* Recording Test Section */}
            {isMicTesting && (
              <div className="space-y-4 border-t pt-4">
                <Label className="text-base font-medium">Audio Quality Test</Label>
                
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Record a 5-second sample to hear how your voice sounds to listeners:
                  </div>
                  
                  <div className="flex gap-3">
                    <Button
                      variant={isRecording ? "destructive" : "outline"}
                      onClick={isRecording ? stopTestRecording : startTestRecording}
                      disabled={isPlayingBack}
                      className="gap-2 flex-1"
                      data-testid="modal-button-record"
                    >
                      {isRecording ? (
                        <>
                          <Square className="w-4 h-4" />
                          Stop Recording
                        </>
                      ) : (
                        <>
                          <Radio className="w-4 h-4" />
                          Record Sample (5s)
                        </>
                      )}
                    </Button>
                    
                    {testRecording && (
                      <Button
                        variant="outline"
                        onClick={playTestRecording}
                        disabled={isRecording || isPlayingBack}
                        className="gap-2 flex-1"
                        data-testid="modal-button-playback"
                      >
                        <Play className="w-4 h-4" />
                        {isPlayingBack ? "Playing..." : "Play Sample"}
                      </Button>
                    )}
                  </div>
                  
                  {isRecording && (
                    <div className="text-center text-sm">
                      <div className="text-red-600 font-medium">🔴 Recording in progress...</div>
                      <div className="text-muted-foreground mt-1">
                        "Hello, this is a test of my microphone setup for broadcasting."
                      </div>
                    </div>
                  )}
                  
                  {testRecording && !isRecording && !isPlayingBack && (
                    <div className="text-center text-sm text-green-600">
                      ✅ Recording ready! Play it back to hear how you sound to listeners.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tips and Guidelines */}
            <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg">
              <h4 className="font-medium mb-2 text-blue-900 dark:text-blue-100">Broadcasting Tips</h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• Speak 6-12 inches from your microphone for best results</li>
                <li>• Avoid background noise - test in your broadcasting environment</li>
                <li>• Keep audio levels between 30-70% for optimal quality</li>
                <li>• Use headphones while testing to avoid feedback</li>
                <li>• Your recording sample represents what listeners will hear</li>
              </ul>
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                stopMicrophoneTest();
                setShowMicTestModal(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                console.log('Microphone Ready button clicked!');
                confirmMicrophoneTest();
              }}
              disabled={false}
              className="gap-2"
              data-testid="modal-button-confirm"
            >
              <Check className="w-4 h-4" />
              Microphone Ready
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}