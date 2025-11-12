import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, Calendar, MapPin, Settings, Wifi, WifiOff, AlertCircle, Bug, LogOut, UserPlus, Copy, Check, Share, Users, Radio as RadioIcon } from "lucide-react";
import QRCode from "qrcode";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import BroadcasterControls from "@/components/BroadcasterControls";
import ChatPanel from "@/components/ChatPanel";
import AppHeader from "@/components/AppHeader";
import { CasterWarningModal } from "@/components/CasterWarningModal";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { getUserDisplayName, getUserInitials } from "@/lib/utils";
import { Stage, LocalStageStream, SubscribeType, StageEvents } from "amazon-ivs-web-broadcast";
import { AudioSyncController } from "@/audio/AudioSyncController";
import { joinAudio as hostJoinAudio, ensureRemoteAudioEl, safePlay as hostSafePlay, AudioGraph } from "@/audio/hostAudio";
import { USE_MIXER_PATH, USE_DEBUG_PANEL } from "@/featureFlags";
import { cohostAudioState, hostPubTracks } from "@/utils/audioHelpers";
import { StatusChip } from "@/components/StatusChip";
import type { Event } from "@shared/schema";
// import boothLogo from "@assets/booth-logo.svg";

interface CasterSettings {
  perspective: 'home' | 'away' | 'neutral';
  mode: 'play-by-play' | 'expert-analysis' | 'fantasy-focus';
  tones: ('serious' | 'comedy' | 'family-friendly')[];
}

// Add window property declarations for TypeScript
declare global {
  interface Window {
    boothDebug?: any;
    audioContext?: AudioContext;
    hostMicNode?: MediaStreamAudioSourceNode;
    outboundMixNode?: GainNode;
    _boothDest?: MediaStreamAudioDestinationNode;
    ivsPublisher?: any;
    ivsSubscriber?: any;
    pc?: RTCPeerConnection;
  }
}

export default function Broadcaster() {
  const { eventId } = useParams();
  const [location, setLocation] = useLocation();
  const [isLive, setIsLive] = useState(false);
  const [listenerCount, setListenerCount] = useState(0);
  const [hasIVSChannel, setHasIVSChannel] = useState(false);
  const [ivsStreamStatus, setIvsStreamStatus] = useState<any>(null);
  const [broadcastState, setBroadcastState] = useState<'disconnected' | 'connecting' | 'validating' | 'connected' | 'error'>('disconnected');
  const [hasShownValidating, setHasShownValidating] = useState(false);
  const [isSettingUpChannel, setIsSettingUpChannel] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [heartbeatInterval, setHeartbeatInterval] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [showSetup, setShowSetup] = useState(true); // Control setup UI visibility
  
  // New audio management refs for simplified audio graph
  const ctxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outRef = useRef<GainNode | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const [ready, setReady] = useState(false);
  const joiningRef = useRef(false);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const intentionalDisconnectRef = useRef(false); // Track user-initiated disconnects
  const activeSessionIdRef = useRef<string | null>(null); // Track active session for reconnect
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track reconnect timeout
  const isMountedRef = useRef(true); // Track component mount state
  
  // Co-host debug state
  const [cohostConnectState, setCohostConnectState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [publishedTracks, setPublishedTracks] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [localParticipantId, setLocalParticipantId] = useState<string | null>(null);
  const [persistedDebugInfo, setPersistedDebugInfo] = useState<any>(null);
  
  // Co-host credentials state (never use hostToken if isCohost)
  const [cohostCreds, setCohostCreds] = useState<{participantToken: string; stageArn: string; sessionId: string; inviteCode?: string} | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  
  // Audio mixing state (simplified - now using direct audio graph)
  const [audioRef] = useState(() => new Audio());
  const [monitorAudioRef] = useState(() => new Audio()); // Hidden audio element for broadcaster monitor
  const [monitorBound, setMonitorBound] = useState(false);
  const [mixedCount, setMixedCount] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, null>>(new Map());
  
  // Stage participants tracking (for rendering co-hosts)
  const [stageParticipants, setStageParticipants] = useState<any[]>([]);
  
  // Mute functionality for IVS Stage
  const [isMuted, setIsMuted] = useState(false);
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  
  // Co-host invite state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [cohostInviteUrl, setCohostInviteUrl] = useState<string | null>(null);
  const [makingCohostInvite, setMakingCohostInvite] = useState(false);
  const [cohostInviteCopied, setCohostInviteCopied] = useState(false);
  const [inviteQrCode, setInviteQrCode] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);
  
  // Share stream state
  const [showShareModal, setShowShareModal] = useState(false);
  const [directStreamLink, setDirectStreamLink] = useState("");
  const [directLinkCopied, setDirectLinkCopied] = useState(false);
  
  // Caster warning modal state
  const [showCasterWarning, setShowCasterWarning] = useState(false);
  const [pendingGoLiveSettings, setPendingGoLiveSettings] = useState<CasterSettings | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading: userLoading } = useAuth();

  // Parse URL parameters for co-host detection
  const urlParams = new URLSearchParams(window.location.search);
  const isCohostFromUrl = urlParams.get('role') === 'cohost';
  
  // GUARDRAIL: Source credentials in proper order with provenance tracking
  const [credentialsState, setCredentialsState] = useState<{
    cohostCreds: any | null;
    credsSource: 'nav' | 'storage' | 'none';
    tokenPresent: boolean;
    error?: string;
  }>({ cohostCreds: null, credsSource: 'none', tokenPresent: false });
  
  // Check for co-host mode from credentials or URL
  const isCohost = isCohostFromUrl || credentialsState.tokenPresent;
  const skipSetup = isCohost || urlParams.get('skipSetup') === '1';
  
  // Extract variables for backwards compatibility
  const cohostToken = credentialsState.cohostCreds?.participantToken;
  const cohostStageArn = credentialsState.cohostCreds?.stageArn;
  const inheritedPrefs = credentialsState.cohostCreds?.inheritedPrefs;


  // Audio functions moved to client/src/audio/hostAudio.ts
  // - hostJoinAudio() - Entry point that selects baseline or mixer path based on USE_MIXER_PATH flag
  // - ensureRemoteAudioEl() - Creates remote audio element for co-host playback
  // - hostSafePlay() - Safe play with user gesture fallback
  
  // GUARDRAIL: Source credentials in proper order - navigation state first, then sessionStorage
  // CRITICAL FIX: Run unconditionally on mount to restore co-host state even after navigation
  useEffect(() => {
    let foundCreds = null;
    let source: 'nav' | 'storage' | 'none' = 'none';
    
    // 1. Check navigation state first (primary method)
    const navState = (history.state || {}) as any;
    const navCreds = navState.cohostCreds;
    
    if (navCreds && navCreds.participantToken) {
      foundCreds = navCreds;
      source = 'nav';
      console.log('[COHOST] Found credentials in navigation state');
    } else {
      // 2. Fallback to sessionStorage (backup method) - ALWAYS CHECK, even without ?role=cohost
      try {
        const stored = sessionStorage.getItem('cohostCreds');
        if (stored) {
          const parsedCreds = JSON.parse(stored);
          if (parsedCreds && parsedCreds.participantToken) {
            foundCreds = parsedCreds;
            source = 'storage';
            console.log('[COHOST] Found credentials in sessionStorage');
          }
        }
      } catch (e) {
        console.error('[COHOST] Failed to parse sessionStorage credentials:', e);
      }
    }
    
    // If we found credentials, restore co-host state
    if (foundCreds && foundCreds.participantToken && foundCreds.participantToken.trim() !== '') {
      // Success - set credentials with provenance
      console.log('[COHOST] ✅ RESTORING CREDENTIALS on mount:', {
        tokenPresent: !!foundCreds.participantToken,
        source,
        hasSessionId: !!foundCreds.sessionId,
        hasStageArn: !!foundCreds.stageArn
      });
      
      setCredentialsState({
        cohostCreds: foundCreds,
        credsSource: source,
        tokenPresent: true
      });
      
      // CRITICAL: Also set cohostCreds state so the button condition works
      setCohostCreds(foundCreds);
      console.log('[COHOST] ✅ cohostCreds state updated - button should now render');
      
      // Load persisted debug info
      const debugStored = sessionStorage.getItem('cohostDebug');
      if (debugStored) {
        try {
          const debugInfo = JSON.parse(debugStored);
          setPersistedDebugInfo(debugInfo);
          console.log('[COHOST] Loaded persisted debug info:', debugInfo);
        } catch (e) {
          console.warn('[COHOST] Failed to parse persisted debug info:', e);
        }
      }
    } else if (isCohostFromUrl) {
      // Only show error if URL says we should be a co-host but credentials are missing
      console.error('[COHOST] URL indicates co-host mode but missing participantToken');
      setCredentialsState({
        cohostCreds: null,
        credsSource: 'none',
        tokenPresent: false,
        error: 'Missing co-host token — please re-open invite link.'
      });
    } else {
      // Normal host mode - no credentials needed
      console.log('[HOST] No co-host credentials found - running in host mode');
    }
  }, []); // Run once on mount, check storage every time

  // Initialize simplified audio graph when going live
  useEffect(() => {
    // The audio graph will be built when joinAudio() is called from the go live button
    console.log(`[AUDIO] Audio initialization ready for ${isCohost ? 'COHOST' : 'HOST'}`);
  }, [isCohost]);

  // Initialize debug panel on mount (only if USE_DEBUG_PANEL flag is true)
  useEffect(() => {
    if (!USE_DEBUG_PANEL) {
      console.log('[DEBUG] Debug panel disabled (USE_DEBUG_PANEL=false)');
      return;
    }
    
    if (typeof window !== 'undefined' && !window.boothDebug) {
      // Inject debug panel script directly into DOM
      const script = document.createElement('script');
      script.textContent = `
(function(){const S=o=>JSON.stringify(o,null,2),now=()=>new Date().toISOString().split('T')[1].replace('Z','');function clamp(v,m,M){return Math.min(M,Math.max(m,v))}
const p=document.createElement('div');p.style.cssText=\`position:fixed;right:12px;bottom:12px;width:320px;z-index:99999;font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;background:#ffffffE6;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,.15);overflow:hidden;backdrop-filter:saturate(1.2) blur(6px);\`;
p.innerHTML=\`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;"><strong>Booth Debug · Host</strong><button id="bdg-collapse" style="border:none;background:transparent;cursor:pointer">–</button></div><div id="bdg-body" style="padding:10px 12px;max-height:60vh;overflow:auto"><div style="display:grid;gap:8px"><div><b>Status</b><pre id="bdg-status" style="white-space:pre-wrap;background:#f8f8f8;padding:8px;border-radius:4px;font-size:10px;margin:0;max-height:80px;overflow:auto">{}</pre></div><div><b>VU Meters</b><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:center"><div><span style="font-size:10px">Local</span><canvas id="bdg-vu-local" width="80" height="16" style="border:1px solid #ddd;border-radius:2px"></canvas></div><div><span style="font-size:10px">Outbound</span><canvas id="bdg-vu-out" width="80" height="16" style="border:1px solid #ddd;border-radius:2px"></canvas></div></div><label style="font-size:10px;display:flex;align-items:center;gap:4px;margin-top:4px"><input type="checkbox" id="bdg-tap-out" style="margin:0">Tap outbound node</label></div><div><b>Quick Tests</b><div style="display:grid;grid-template-columns:1fr 1fr;gap:4px"><button id="bdg-btn-tone" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:10px">Test Tone → Remote</button><button id="bdg-btn-loopback" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:10px">Loopback</button><button id="bdg-btn-autoplay" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:10px">Autoplay Nudge</button><button id="bdg-btn-dump" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:10px">Dump State</button></div></div><div><b>Console Log</b><pre id="bdg-log" style="background:#1e293b;color:#f1f5f9;padding:6px;font-size:10px;border-radius:4px;max-height:120px;overflow:auto;white-space:pre-wrap;margin:0"></pre></div></div></div>\`;
document.body.appendChild(p);const b=p.querySelector('#bdg-body');p.querySelector('#bdg-collapse').onclick=()=>{b.style.display=b.style.display==='none'?'block':'none'};
const st={ctx:null,micNode:null,outboundNode:null,monitorNode:null,ivsPublisher:null,ivsSubscriber:null,localAnalyser:null,outAnalyser:null,vuLocal:p.querySelector('#bdg-vu-local'),vuOut:p.querySelector('#bdg-vu-out'),vuRAF:0,loopbackDest:null,logs:[]};
const $log=p.querySelector('#bdg-log');function log(...a){const line=\`[\${now()}] \${a.map(x=>typeof x==='object'?S(x):String(x)).join(' ')}\`;st.logs.push(line);if(st.logs.length>300)st.logs.shift();$log.textContent=st.logs.join('\\n');$log.scrollTop=$log.scrollHeight;console.debug('[BoothDebug]',...a)}
const $status=p.querySelector('#bdg-status');const setStatus=o=>$status.textContent=S(o);
function mkAn(){const an=st.ctx.createAnalyser();an.fftSize=2048;return an}
function meter(src,an){try{src.connect(an)}catch(e){log('Meter connect error',e)}}
function drawVU(c,an){const g=c.getContext('2d'),d=new Uint8Array(an.fftSize);an.getByteTimeDomainData(d);let peak=0;for(let i=0;i<d.length;i++){const v=Math.abs(d[i]-128)/128;if(v>peak)peak=v}const w=c.width,h=c.height;g.clearRect(0,0,w,h);const val=clamp(peak*1.8,0,1);g.fillStyle='#334155';g.fillRect(0,0,w,h);g.fillStyle='#a3e635';g.fillRect(0,0,w*val,h)}
function raf(){if(!st.localAnalyser||!st.outAnalyser){st.vuRAF=requestAnimationFrame(raf);return}drawVU(st.vuLocal,st.localAnalyser);drawVU(st.vuOut,st.outAnalyser);st.vuRAF=requestAnimationFrame(raf)}
const api={register({ctx,micNode,outboundNode,monitorNode,ivsPublisher,ivsSubscriber}){st.ctx=ctx||st.ctx||new (window.AudioContext||window.webkitAudioContext)();st.micNode=micNode||st.micNode;st.outboundNode=outboundNode||st.outboundNode;st.monitorNode=monitorNode||st.monitorNode;st.ivsPublisher=ivsPublisher||st.ivsPublisher;st.ivsSubscriber=ivsSubscriber||st.ivsSubscriber;if(st.ctx&&st.ctx.state!=='running'){st.ctx.resume().catch(e=>log('AudioContext resume error',e))}if(st.ctx&&st.micNode&&!st.localAnalyser){st.localAnalyser=mkAn();meter(st.micNode,st.localAnalyser)}if(st.ctx&&st.outboundNode&&!st.outAnalyser){st.outAnalyser=mkAn();meter(st.outboundNode,st.outAnalyser)}if(!st.vuRAF){st.vuRAF=requestAnimationFrame(raf)}this.refreshStatus();log('Registered objects')},
refreshStatus(){const ctxState=st.ctx?st.ctx.state:'none';const audioOutput=typeof navigator.mediaDevices?.selectAudioOutput==='function'?'supported':'not supported';const pubState=st.ivsPublisher?.connectionState||st.ivsPublisher?.getState?.()||'unknown';const subState=st.ivsSubscriber?.connectionState||st.ivsSubscriber?.getState?.()||'unknown';const outboundGain=(st.outboundNode?.gain?.value!=null)?st.outboundNode.gain.value:'(n/a)';const monitorGain=(st.monitorNode?.gain?.value!=null)?st.monitorNode.gain.value:'(n/a)';setStatus({ctxState,audioOutput,pubState,subState,outboundGain,monitorGain,hasLocalAnalyser:!!st.localAnalyser,hasOutAnalyser:!!st.outAnalyser})},
sendTestToneToOutbound(sec=1.5,f=440){if(!st.ctx||!st.outboundNode){log('No ctx/outboundNode for tone');return}const osc=st.ctx.createOscillator(),g=st.ctx.createGain();g.gain.value=.2;osc.type='sine';osc.frequency.value=f;osc.connect(g);try{g.connect(st.outboundNode)}catch(e){log('Tone connect error',e)}osc.start();setTimeout(()=>{try{osc.stop();osc.disconnect();g.disconnect()}catch(_){}},sec*1000);log(\`Sent \${f}Hz tone (\${sec}s) to outbound\`)},
loopback(en=true){if(!st.ctx||!st.micNode){log('No ctx/micNode for loopback');return}if(en){st.loopbackDest=st.loopbackDest||st.ctx.createMediaStreamDestination();try{st.micNode.connect(st.loopbackDest)}catch(e){log('Loopback connect error',e)}const el=document.createElement('audio');el.autoplay=true;el.muted=false;el.srcObject=st.loopbackDest.stream;el.style.display='none';document.body.appendChild(el);log('Loopback enabled')}else{try{st.micNode.disconnect(st.loopbackDest)}catch(_){}log('Loopback disabled')}},
async autoplayNudge(){if(!st.ctx)return;try{await st.ctx.resume();log('AudioContext resumed')}catch(e){log('AudioContext resume failed',e)}},
tapOutbound(en=true){const cb=document.getElementById('bdg-tap-out');if(cb)cb.checked=!!en;if(en){if(!st.outboundNode||!st.outAnalyser){log('No outbound node to tap');return}try{st.outboundNode.connect(st.outAnalyser)}catch(_){}log('Outbound tapped')}else{try{st.outboundNode.disconnect(st.outAnalyser)}catch(_){}log('Outbound tap removed')}},
async dump(){const dev=await navigator.mediaDevices.enumerateDevices().catch(()=>[]);const tracks=[];try{const pc=st.ivsPublisher?.connection||st.ivsPublisher?.pc;const snd=pc?.getSenders?.()||st.ivsPublisher?.connection?.getSenders?.()||[];for(const s of snd){if(s.track&&s.track.kind==='audio'){tracks.push({label:s.track.label,enabled:s.track.enabled,muted:s.track.muted,readyState:s.track.readyState})}}}catch(_){}log('STATE DUMP →',{ctxState:st.ctx?.state,micConnected:!!st.micNode,outboundConnected:!!st.outboundNode,publisherState:st.ivsPublisher?.connectionState||'unknown',audioDevices:dev.filter(d=>d.kind==='audioinput').length,audioTracks:tracks,outboundGain:st.outboundNode?.gain?.value,monitorGain:st.monitorNode?.gain?.value})}
};
p.querySelector('#bdg-btn-tone').onclick=()=>api.sendTestToneToOutbound();
p.querySelector('#bdg-btn-loopback').onclick=()=>api.loopback(true);
p.querySelector('#bdg-btn-autoplay').onclick=()=>api.autoplayNudge();
p.querySelector('#bdg-btn-dump').onclick=()=>api.dump();
p.querySelector('#bdg-tap-out').onchange=(e)=>api.tapOutbound(e.target.checked);
window.boothDebug=api;log('Booth Debug loaded');
})();
      `;
      document.head.appendChild(script);
      console.log('[DEBUG] Injected debug panel script');
    }
  }, []); // Run once on mount

  // Register audio objects with debug panel when ready (only if enabled)
  useEffect(() => {
    if (!USE_DEBUG_PANEL) return;
    
    if (typeof window !== 'undefined' && window.boothDebug && ctxRef.current && micRef.current && outRef.current) {
      console.log('[DEBUG] Registering audio objects with debug panel');
      
      // Register audio objects from new simplified graph
      window.boothDebug.register({
        ctx: ctxRef.current,
        micNode: micRef.current,
        outboundNode: outRef.current,
        monitorNode: null, // We don't have a separate monitor node
        ivsPublisher: stage, // Register the stage as publisher
        ivsSubscriber: null // We don't have a separate subscriber
      });
    }
  }, [ctxRef.current, micRef.current, outRef.current, stage]);

  // NOTE: Old auto-connect useEffect removed - replaced by new guarded auto-join useEffect below (lines ~1061-1123)
  // The new auto-join has proper race condition guards with joiningRef to prevent duplicate Stage connections

  // Type-safe user object - moved here to avoid ReferenceError
  const typedUser = user as any;

  // Query for event data
  const { data: event } = useQuery<Event>({
    queryKey: ["/api/events", eventId],
    enabled: !!eventId,
  });

  // Query for current user's event_caster record to get the event_caster ID for share links
  const { data: eventCasters } = useQuery<any[]>({
    queryKey: ["/api/events", eventId, "casters"],
    enabled: !!eventId && !!user?.id,
  });

  // Find the current user's event_caster record
  const myEventCaster = eventCasters?.find((ec: any) => ec.casterId === user?.id);
  const eventCasterId = myEventCaster?.id;

  // Mutation to enable casting permissions
  const enableCastingMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/user/request-casting", {});
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Casting Enabled!",
        description: "You can now set up your broadcasting channel.",
      });
      // Invalidate user query to refresh permissions
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to enable casting permissions",
        variant: "destructive",
      });
    },
  });

  // Auto-enable casting permissions if user doesn't have them (skip for co-hosts)
  useEffect(() => {
    if (typedUser && !typedUser.canCast && !enableCastingMutation.isPending && !isCohost) {
      enableCastingMutation.mutate();
    }
  }, [typedUser?.canCast, typedUser?.id, isCohost]);

  // Query for IVS channel status
  const { data: ivsChannelStatus, refetch: refetchChannelStatus, isLoading: isLoadingChannelStatus } = useQuery({
    queryKey: ["/api/user/ivs-channel-status"],
    enabled: !!typedUser?.canCast,
    refetchInterval: 10000, // Poll every 10 seconds
  });

  // Handle IVS channel status updates with useEffect
  useEffect(() => {
    if (ivsChannelStatus) {
      const data = ivsChannelStatus as any;
      setHasIVSChannel(data?.hasChannel || false);
      setIvsStreamStatus(data?.streamStatus || null);
      if (data?.streamStatus?.state === "LIVE") {
        // Only set isLive(true) if we're not already in a disconnected state
        // This prevents restarting broadcast when user explicitly ended stream
        if (broadcastState !== 'disconnected') {
          setIsLive(true);
        }
        setListenerCount(data.streamStatus.viewerCount || 0);
      } else if (data?.streamStatus?.state === "OFFLINE") {
        // Only set isLive to false if we're not in any broadcast state
        // During validation, we expect OFFLINE status while connecting
        // During connected state, we should trust our local state over temporary IVS inconsistencies
        if (broadcastState !== 'connecting' && broadcastState !== 'validating' && broadcastState !== 'connected') {
          setIsLive(false);
          setListenerCount(0);
        }
      }
    }
  }, [ivsChannelStatus, broadcastState]);

  // Mutation to set up IVS channel
  const setupChannelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/user/setup-ivs-channel", {});
    },
    onSuccess: (data) => {
      setHasIVSChannel(true);
      toast({
        title: "🎙️ Channel Ready!",
        description: "Your broadcasting channel has been set up successfully.",
      });
      refetchChannelStatus();
    },
    onError: (error: any) => {
      toast({
        title: "Setup Failed",
        description: error.message || "Failed to set up broadcasting channel",
        variant: "destructive",
      });
    },
  });

  // Show loading or redirect if not authenticated
  if (userLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }
  
  // GUARDRAIL: Hard stop with inline error for missing co-host token
  if (isCohost && credentialsState.error) {
    return (
      <div className="container mx-auto p-4">
        <Card className="max-w-md mx-auto mt-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span>Co-Host Connection Error</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {credentialsState.error}
              </AlertDescription>
            </Alert>
            <div className="mt-4 space-y-2">
              <Button 
                onClick={() => window.location.href = '/'} 
                className="w-full"
                data-testid="button-go-home-error"
              >
                Go to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!user) {
    setLocation("/");
    return null;
  }

  // Rehydrate session from localStorage on mount (only when authenticated)
  useEffect(() => {
    if (!user) return; // Wait for authentication
    
    const savedSessionId = localStorage.getItem('booth.sessionId');
    if (savedSessionId && !sessionId) {
      // Clear any existing interval first to prevent duplicates
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        setHeartbeatInterval(null);
      }
      
      // Verify session still exists before rehydrating
      apiRequest("GET", "/api/sessions/active")
        .then(res => res.json())
        .then((activeSessions: any[]) => {
          const sessionExists = activeSessions.some(s => s.sessionId === savedSessionId && s.status === 'live');
          if (sessionExists) {
            setSessionId(savedSessionId);
            setIsLive(true);
            
            // Resume heartbeat
            const interval = window.setInterval(() => {
              apiRequest("POST", `/api/sessions/${encodeURIComponent(savedSessionId)}/heartbeat`, {})
                .catch((error) => {
                  console.warn("Heartbeat failed:", error);
                  // Only clear session on definitive 404/403, not on network errors
                  if (error.message?.includes('404') || error.message?.includes('403')) {
                    localStorage.removeItem('booth.sessionId');
                    setSessionId(null);
                    setIsLive(false);
                    clearInterval(interval); // Clear the captured interval variable
                    setHeartbeatInterval(null);
                  }
                });
            }, 5000);
            setHeartbeatInterval(interval);
          } else {
            // Session no longer exists, clean up
            localStorage.removeItem('booth.sessionId');
          }
        })
        .catch((error) => {
          // Only clear on definitive failures, not network issues
          if (error.message?.includes('404') || error.message?.includes('403')) {
            localStorage.removeItem('booth.sessionId');
          }
        });
    }
  }, [user, sessionId, heartbeatInterval]);

  // Cleanup intervals on component unmount (but NOT the session)
  useEffect(() => {
    return () => {
      // Only clear timers on unmount - don't stop the session!
      // Sessions should persist through reloads and only end on explicit "End Stream"
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    };
  }, [heartbeatInterval]);
  
  // Cleanup reconnect timeout on component unmount
  useEffect(() => {
    isMountedRef.current = true; // Set to true on mount
    return () => {
      isMountedRef.current = false; // Set to false on unmount to prevent state updates
      if (reconnectTimeoutRef.current) {
        console.log('[BROADCASTER] Clearing reconnect timeout on unmount');
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // Reset flags to prevent any stale reconnects
      intentionalDisconnectRef.current = true;
      activeSessionIdRef.current = null;
    };
  }, []);

  
  // Mutation to start live session
  const startSessionMutation = useMutation({
    mutationFn: async (settings: CasterSettings) => {
      if (!typedUser?.id) throw new Error("User not authenticated");
      
      const res = await apiRequest("POST", "/api/sessions/start", {
        eventId,
        perspective: settings.perspective,
        mode: settings.mode,
        tones: settings.tones,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      const newSessionId = data.sessionId;
      setSessionId(newSessionId);
      setIsLive(true);
      localStorage.setItem('booth.sessionId', newSessionId);
      
      // Clear any existing interval first, then start heartbeat
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      
      const interval = window.setInterval(() => {
        if (newSessionId) {
          apiRequest("POST", `/api/sessions/${encodeURIComponent(newSessionId)}/heartbeat`, {})
            .catch((error) => {
              console.warn("Heartbeat failed:", error);
              // Only clear session on definitive 404/403, not on network errors
              if (error.message?.includes('404') || error.message?.includes('403')) {
                localStorage.removeItem('booth.sessionId');
                setSessionId(null);
                setIsLive(false);
                clearInterval(interval); // Clear the captured interval variable
                setHeartbeatInterval(null);
              }
            });
        }
      }, 5000);
      setHeartbeatInterval(interval);
      
      toast({
        title: "🎙️ Live Session Started",
        description: "Your broadcast session is now active",
      });
      
      // Start IVS Stage audio publishing
      goLiveToStage(newSessionId);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/events/schedule', 'tonight'] });
      queryClient.invalidateQueries({ queryKey: ['/api/events/live'] });
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'live'] });
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'casters'] }); // Refresh event_casters for Share Stream
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start live session",
        variant: "destructive",
      });
    },
  });

  // Mutation to stop live session
  const stopSessionMutation = useMutation({
    mutationFn: async () => {
      const currentSessionId = sessionId || localStorage.getItem('booth.sessionId');
      if (!currentSessionId) throw new Error("No active session");
      
      return apiRequest("POST", `/api/sessions/${encodeURIComponent(currentSessionId)}/stop`, {});
    },
    onSuccess: () => {
      // Stop IVS Stage audio publishing first
      stopCast();
      
      // Clear heartbeat
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        setHeartbeatInterval(null);
      }
      
      localStorage.removeItem('booth.sessionId');
      setSessionId(null);
      setIsLive(false);
      
      // GUARDRAIL: Clear co-host credentials on explicit session end/leave
      if (isCohost) {
        console.log('[COHOST] Explicit session end - clearing cohostCreds from sessionStorage');
        sessionStorage.removeItem('cohostCreds');
        sessionStorage.removeItem('cohostJoinFlow');
        sessionStorage.removeItem('cohostDebug');
      }
      
      toast({
        title: "Stream Ended",
        description: "Your stream has ended successfully.",
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/events/schedule', 'tonight'] });
      queryClient.invalidateQueries({ queryKey: ['/api/events/live'] });
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'live'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to stop session",
        variant: "destructive",
      });
    },
  });

  // Mutation to accept caster warning
  const acceptCasterWarningMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/user/agree-caster-warning", {});
      return await res.json();
    },
    onSuccess: async (data: any) => {
      // Update user in cache with new hasAgreedCasterWarning flag
      queryClient.setQueryData(['/api/user'], data.user);
      // Force refetch to bypass staleTime and get fresh data immediately
      await queryClient.refetchQueries({ queryKey: ['/api/user'] });
      
      // Now proceed with going live if we have pending settings
      if (pendingGoLiveSettings) {
        if (isCohost) {
          handleCohostGoLive(pendingGoLiveSettings);
        } else {
          startSessionMutation.mutate(pendingGoLiveSettings);
        }
        setPendingGoLiveSettings(null);
      }
      
      setShowCasterWarning(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to accept caster warning",
        variant: "destructive",
      });
    },
  });

  // Function to join IVS Stage and publish microphone audio (for both host and co-host)
  async function goLiveToStage(sessionId: string) {
    // Guard against calling after component unmount
    if (!isMountedRef.current) {
      console.log(`[${isCohost ? 'COHOST' : 'HOST'}] goLiveToStage aborted - component unmounted`);
      return;
    }
    
    try {
      console.log("Starting IVS Stage audio publishing for session:", sessionId);
      
      // Store active sessionId for potential reconnection and reset intentional disconnect flag
      activeSessionIdRef.current = sessionId;
      intentionalDisconnectRef.current = false;
      console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Auto-reconnect enabled for session:`, sessionId.slice(-8));
      
      setCohostConnectState('connecting');
      setLastError(null);
      
      let token: string;
      let stageArn: string;
      
      if (isCohost) {
        // GUARDRAIL: Co-host path - MUST use cohostCreds, never call hostToken
        console.log('[COHOST] ASSERTION: Using co-host participant token, never calling /hostToken');
        if (!cohostCreds || !cohostCreds.participantToken || !cohostCreds.stageArn) {
          throw new Error('Co-host credentials missing. Please rejoin using the invite link.');
        }
        token = cohostCreds.participantToken;
        stageArn = cohostCreds.stageArn;
        console.log(`[COHOST] connecting using participant token, sessionId: ${sessionId.slice(-8)}, stageArn: ${stageArn.slice(-8)}`);
      } else {
        // Host path: Request host token
        console.log('[BROADCASTER:HOST] Requesting host token for session:', sessionId);
        
        // GUARDRAIL: Assertion to catch any accidental hostToken calls in co-host mode
        if (isCohost) {
          console.error('[COHOST] ASSERTION FAILED: /hostToken call attempted in co-host mode!');
          throw new Error('Internal error: hostToken call in co-host mode');
        }
        
        const r = await apiRequest("GET", `/api/sessions/${encodeURIComponent(sessionId)}/hostToken`);
        if (!r.ok) {
          const errorData = await r.json();
          throw new Error(`Host token failed: ${errorData.message}`);
        }
        const tokenData = await r.json();
        token = tokenData.token;
        stageArn = tokenData.stageArn;
        console.log('[BROADCASTER:HOST] Host token received, Stage ARN:', stageArn);
      }
      
      // Check if unmounted after token fetch
      if (!isMountedRef.current) {
        console.log(`[${isCohost ? 'COHOST' : 'HOST'}] goLiveToStage aborted after token fetch - component unmounted`);
        return;
      }

      // 2) Set up audio using dual-path module (flag-controlled)
      console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Audio setup: USE_MIXER_PATH=${USE_MIXER_PATH}`);
      
      // Ensure remote audio element for co-hosts to hear host
      const remoteEl = await ensureRemoteAudioEl();
      remoteAudioRef.current = remoteEl;
      
      // Call hostJoinAudio which selects baseline or mixer path based on flag
      const audioResult = await hostJoinAudio();
      
      // Handle result based on path taken
      let audioTrack: MediaStreamTrack;
      if (USE_MIXER_PATH) {
        // Mixer path returns AudioGraph
        const graph = audioResult as AudioGraph;
        ctxRef.current = graph.ctx;
        micRef.current = graph.mic;
        outRef.current = graph.out;
        destRef.current = graph.dest;
        setMicStream(graph.micStream);
        audioTrack = graph.dest.stream.getAudioTracks()[0];
        
        // Register with debug panel if enabled (will register ivsPublisher after Stage is created)
        if (USE_DEBUG_PANEL && window.boothDebug) {
          window.boothDebug.register({
            ctx: graph.ctx,
            micNode: graph.mic,
            outboundNode: graph.out
          });
        }
        
        console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Mixer path audio ready`);
      } else {
        // Baseline path returns MediaStream
        const micStream = audioResult as MediaStream;
        setMicStream(micStream);
        audioTrack = micStream.getAudioTracks()[0];
        console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Baseline path audio ready`);
      }
      
      if (!audioTrack) {
        throw new Error("No audio track available");
      }
      
      // Check if unmounted after audio setup
      if (!isMountedRef.current) {
        console.log(`[${isCohost ? 'COHOST' : 'HOST'}] goLiveToStage aborted after audio setup - component unmounted`);
        // Clean up audio track
        if (audioTrack) audioTrack.stop();
        return;
      }
      
      console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Audio track ready, readyState: ${audioTrack.readyState}`);
      console.log(`[${isCohost ? 'COHOST' : 'HOST'}] AUDIO TRACK DETAILS:`, {
        id: audioTrack.id,
        kind: audioTrack.kind,
        label: audioTrack.label,
        enabled: audioTrack.enabled,
        muted: audioTrack.muted,
        readyState: audioTrack.readyState
      });
      
      // Store audio track reference for mute functionality
      localAudioTrackRef.current = audioTrack;
      console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Audio track stored in ref for mute control`);
      
      // 3) Create LocalStageStream from the audio track
      const localAudioStream = new LocalStageStream(audioTrack);
      const localStreams = [localAudioStream];
      console.log(`[${isCohost ? 'COHOST' : 'HOST'}] LocalStageStream created from audio track`);
      
      // 4) Create strategy for Stage with correct API
      const strategy = {
        // Return streams to publish to the Stage
        stageStreamsToPublish() {
          console.log(`[${isCohost ? 'COHOST' : 'HOST'}] ✅ stageStreamsToPublish() CALLBACK INVOKED`);
          console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Publishing ${localStreams.length} LocalStageStream(s)`);
          console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Stream details:`, localStreams.map(s => ({
            streamType: s.streamType,
            mediaStreamTrack: s.mediaStreamTrack ? {
              id: s.mediaStreamTrack.id,
              kind: s.mediaStreamTrack.kind,
              enabled: s.mediaStreamTrack.enabled,
              readyState: s.mediaStreamTrack.readyState
            } : null
          })));
          return localStreams;
        },
        
        // Control which participants to subscribe to (AUDIO ONLY - this is an audio platform)
        shouldSubscribeToParticipant() {
          return SubscribeType.AUDIO_ONLY;
        },
        
        // Control publishing to participants
        shouldPublishParticipant() {
          return true;
        }
      };

      // 5) Create stage with token and strategy
      const stg = new Stage(token, strategy);
      console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Stage created with audio publishing strategy`);
      
      // Expose stage for debug panel access
      window.ivsPublisher = stg;
      setStage(stg);
      
      // Add Stage event handlers for connection state tracking  
      stg.on(StageEvents.STAGE_CONNECTION_STATE_CHANGED, (state: any) => {
        console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Connection state changed:`, state);
        if (isCohost) {
          setLastEvent(`STATE_CHANGED:${state}`);
        }
        if (state === 'connected') {
          setCohostConnectState('connected');
          if (isCohost) {
            console.log('[COHOST] stage:connected');
          }
          console.log(`[${isCohost ? 'COHOST' : 'HOST'}] connected, sessionId: ${sessionId.slice(-8)}`);
          // Don't set isLive immediately - wait for published tracks
        } else if (state === 'disconnected' || state === 'failed') {
          setCohostConnectState('disconnected');
          setIsLive(false);
          setPublishedTracks(0);
          console.log(`[${isCohost ? 'COHOST' : 'HOST'}] disconnected from Stage`);
          
          // AUTO-RECONNECT LOGIC: If disconnect wasn't user-initiated, automatically reconnect
          if (!intentionalDisconnectRef.current && activeSessionIdRef.current) {
            console.log(`[${isCohost ? 'COHOST' : 'HOST'}] ⚠️ Unexpected disconnect detected - initiating auto-reconnect in 2s...`);
            console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Reconnecting to session:`, activeSessionIdRef.current.slice(-8));
            
            // Clear any existing reconnect timeout
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            
            // Wait 2 seconds before reconnecting to avoid rapid reconnection loops
            reconnectTimeoutRef.current = setTimeout(() => {
              const reconnectSessionId = activeSessionIdRef.current;
              
              // Check if component is still mounted before attempting reconnect
              if (!isMountedRef.current) {
                console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Auto-reconnect cancelled - component unmounted`);
                reconnectTimeoutRef.current = null;
                return;
              }
              
              if (reconnectSessionId && !intentionalDisconnectRef.current) {
                console.log(`[${isCohost ? 'COHOST' : 'HOST'}] 🔄 Executing auto-reconnect for session:`, reconnectSessionId.slice(-8));
                goLiveToStage(reconnectSessionId).catch(err => {
                  console.error(`[${isCohost ? 'COHOST' : 'HOST'}] Auto-reconnect failed:`, err);
                  // Only show toast if component is still mounted
                  if (isMountedRef.current) {
                    toast({
                      title: "Reconnection Failed",
                      description: "Unable to reconnect to the stream. Please check your connection.",
                      variant: "destructive"
                    });
                  }
                });
              } else {
                console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Auto-reconnect cancelled - disconnect was intentional`);
              }
              reconnectTimeoutRef.current = null;
            }, 2000);
          } else {
            const reason = intentionalDisconnectRef.current ? 'user-initiated' : 'no active session';
            console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Auto-reconnect skipped - reason:`, reason);
          }
        }
      });
      
      stg.on(StageEvents.STAGE_PARTICIPANT_STREAMS_ADDED, (participant: any, tracks: any[]) => {
        console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Participant streams added:`, participant.userId, 'tracks:', tracks.length);
        if (isCohost) {
          setLastEvent(`STREAMS_ADDED:${participant.userId}`);
        }
        
        if (participant.isLocal) {
          // Track local participant ID
          if (isCohost) {
            setLocalParticipantId(participant.participantId || participant.userId);
          }
          // Use tracks from event since getLocalParticipant() not available
          const currentTracks = tracks.length;
          setPublishedTracks(currentTracks);
          if (isCohost) {
            console.log(`[COHOST] publishedTracks: ${currentTracks}`);
          }
          console.log(`[${isCohost ? 'COHOST' : 'HOST'}] publish local track ok, total: ${currentTracks}`);
          
          // Set LIVE immediately when tracks are published (Stage must be connected for this event to fire)
          // CRITICAL FIX: Removed cohostConnectState check to avoid race condition - this event only fires after connection
          if (currentTracks > 0) {
            setIsLive(true);
            console.log(`[${isCohost ? 'COHOST' : 'HOST'}] now LIVE with ${currentTracks} tracks`);
          }
        } else {
          // Handle remote participant streams - bind AUDIO to remote audio element
          const participantId = participant.participantId || participant.userId;
          const roleName = isCohost ? 'COHOST' : 'HOST';
          console.log(`[REMOTE:${roleName}] Stage callback: STAGE_PARTICIPANT_STREAMS_ADDED, participant: ${participantId}, tracks: ${tracks.length}`);
          
          // Find AUDIO stream only
          const audioTrack = tracks.find((t: any) => t.mediaStreamTrack?.kind === 'audio');
          if (!audioTrack) {
            console.log(`[REMOTE:${roleName}] No audio tracks in streams (skipping)`);
            return;
          }
          
          const mediaStreamTrack = audioTrack.mediaStreamTrack;
          if (!mediaStreamTrack) {
            console.error(`[REMOTE:${roleName}] Audio track found but no mediaStreamTrack`);
            return;
          }
          
          const ms = new MediaStream([mediaStreamTrack]);
          console.log(`[REMOTE:${roleName}] MediaStream created:`, ms.id, 'tracks:', ms.getAudioTracks().length);
          
          // Bind remote audio to the dedicated audio element for playback
          const remoteEl = remoteAudioRef.current;
          if (!remoteEl) {
            console.error(`[REMOTE:${roleName}] ❌ Remote audio element not ready - THIS IS THE BUG!`);
            return;
          }
          
          // Avoid double-binds
          if (remoteEl.srcObject !== ms) {
            remoteEl.srcObject = ms;
            console.log(`[REMOTE:${roleName}] srcObject set to new MediaStream`);
          } else {
            console.log(`[REMOTE:${roleName}] srcObject already bound (skipping re-bind)`);
          }
          
          // Safe play with user-gesture fallback (from hostAudio module)
          hostSafePlay(remoteEl).then(() => {
            console.log(`[REMOTE:${roleName}] ✅ play() succeeded for ${participantId}`);
          }).catch((err) => {
            console.error(`[REMOTE:${roleName}] ❌ play() rejected:`, err);
          });
          
          console.log(`[REMOTE:${roleName}] ✅ Bound audio from ${participantId} to #remote-audio`);
          setMonitorBound(true);
          
          // Track this stream for counting purposes
          setRemoteStreams(prev => new Map(prev.set(participantId, null)));
          setMixedCount(prev => prev + 1);
        }
      });
      
      stg.on(StageEvents.STAGE_PARTICIPANT_STREAMS_REMOVED, (participant: any, tracks: any[]) => {
        const participantId = participant.participantId || participant.userId;
        const roleName = isCohost ? 'COHOST' : 'HOST';
        console.log(`[${roleName}] Participant streams removed:`, participantId, 'tracks:', tracks.length);
        if (isCohost) {
          setLastEvent(`STREAMS_REMOVED:${participantId}`);
        }
        
        if (participant.isLocal) {
          // Track current count since getLocalParticipant() not available  
          const currentTracks = Math.max(0, publishedTracks - tracks.length);
          setPublishedTracks(currentTracks);
          if (isCohost) {
            console.log(`[COHOST] publishedTracks: ${currentTracks}`);
          }
          console.log(`[${roleName}] tracks removed, remaining: ${currentTracks}`);
          
          // If no tracks left, not LIVE anymore
          if (currentTracks === 0) {
            setIsLive(false);
          }
        } else {
          // Handle remote participant stream removal - clear audio element if needed
          if (remoteStreams.has(participantId)) {
            const audioTracksRemoved = tracks.filter(t => t.mediaStreamTrack?.kind === 'audio').length;
            console.log(`[REMOTE:${roleName}] Removing streams for participant ${participantId}, audio tracks: ${audioTracksRemoved}`);
            
            // Clear remote audio element if this was the active stream
            const remoteEl = remoteAudioRef.current;
            if (remoteEl && audioTracksRemoved > 0) {
              remoteEl.srcObject = null;
              setMonitorBound(false);
              console.log(`[REMOTE:${roleName}] Cleared #remote-audio element`);
            }
            
            setRemoteStreams(prev => {
              const newMap = new Map(prev);
              newMap.delete(participantId);
              return newMap;
            });
            setMixedCount(prev => Math.max(0, prev - audioTracksRemoved));
          }
        }
      });
      
      // Track participant joins for UI rendering
      stg.on(StageEvents.STAGE_PARTICIPANT_JOINED, (participant: any) => {
        const participantId = participant.participantId || participant.userId;
        const roleName = isCohost ? 'COHOST' : 'HOST';
        console.log(`[${roleName}] Participant joined:`, participantId, 'isLocal:', participant.isLocal);
        
        // Add to participants list for UI rendering
        setStageParticipants(prev => {
          // Check if participant already exists
          const exists = prev.some(p => (p.participantId || p.userId) === participantId);
          if (!exists) {
            return [...prev, participant];
          }
          return prev;
        });
        
        if (isCohost) {
          setLastEvent(`PARTICIPANT_JOINED:${participantId}`);
        }
      });
      
      stg.on(StageEvents.STAGE_PARTICIPANT_LEFT, (participant: any) => {
        const participantId = participant.participantId || participant.userId;
        const roleName = isCohost ? 'COHOST' : 'HOST';
        console.log(`[${roleName}] Participant left:`, participantId);
        if (isCohost) {
          setLastEvent(`PARTICIPANT_LEFT:${participantId}`);
        }
        
        // Remove from participants list
        setStageParticipants(prev => 
          prev.filter(p => (p.participantId || p.userId) !== participantId)
        );
        
        if (participant.isLocal) {
          // Cleanup on local participant leave
          setPublishedTracks(0);
          setIsLive(false);
          setCohostConnectState('disconnected');
        } else {
          // Handle remote participant leaving - clear audio element
          if (remoteStreams.has(participantId)) {
            console.log(`[REMOTE:${roleName}] Participant ${participantId} left - clearing audio`);
            
            // Clear remote audio element
            const remoteEl = remoteAudioRef.current;
            if (remoteEl) {
              remoteEl.srcObject = null;
              setMonitorBound(false);
              console.log(`[REMOTE:${roleName}] Cleared #remote-audio element`);
            }
            
            setRemoteStreams(prev => {
              const newMap = new Map(prev);
              newMap.delete(participantId);
              return newMap;
            });
            setMixedCount(prev => Math.max(0, prev - 1));
          }
        }
      });
      
      // 5) Join the stage
      if (isCohost) {
        console.log('[COHOST] stage:connect:start');
      }
      await stg.join();
      
      // Check if unmounted after stage join
      if (!isMountedRef.current) {
        console.log(`[${isCohost ? 'COHOST' : 'HOST'}] goLiveToStage aborted after stage join - component unmounted`);
        // Clean up - leave the stage
        try { await stg.leave(); } catch {}
        return;
      }
      
      const roleText = isCohost ? 'co-host' : 'host';
      console.log(`Successfully joined Stage as ${roleText}, now triggering stream publication...`);
      
      // CRITICAL: Force the strategy to execute and publish our audio streams
      // The strategy's stageStreamsToPublish() is only called when refreshStrategy() is invoked
      console.log(`[${isCohost ? 'COHOST' : 'HOST'}] ATTEMPTING TO PUBLISH AUDIO TRACK via refreshStrategy()`);
      try {
        stg.refreshStrategy();
        console.log(`[${isCohost ? 'COHOST' : 'HOST'}] PUBLISHING COMPLETED SUCCESSFULLY - refreshStrategy() called`);
      } catch (err: any) {
        console.error(`[${isCohost ? 'COHOST' : 'HOST'}] refreshStrategy() FAILED:`, err);
        throw new Error(`Failed to publish audio: ${err.message}`);
      }
      
      // Only set state if component is still mounted
      if (isMountedRef.current) {
        setStage(stg);
        // Don't set isLive here - wait for STAGE_PARTICIPANT_STREAMS_ADDED event
        
        // CRITICAL FIX: After successful join, ensure credentialsState is updated for co-hosts
        // This guarantees isCohost computes to true and the Leave Stream button will render
        if (cohostCreds && cohostCreds.participantToken) {
          console.log('[COHOST] Confirming co-host role after successful Stage join');
          setCredentialsState(prev => ({
            cohostCreds: cohostCreds,  // Ensure cohostCreds object is in state
            credsSource: prev.credsSource || 'storage',
            tokenPresent: true
          }));
        }

        toast({
          title: "🔗 Stage Connected",
          description: `Connected as ${roleText}, publishing audio...`
        });
      }

    } catch (error: any) {
      console.error(`[${isCohost ? 'COHOST' : 'HOST'}] error:`, error.message);
      
      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setCohostConnectState('error');
        setLastError(error.message || 'Unknown error');
      }
      
      // Cleanup on error - reset all audio state
      if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        if (isMountedRef.current) {
          setMicStream(null);
        }
      }
      
      // Clear audio track reference and reset mute state
      localAudioTrackRef.current = null;
      if (isMountedRef.current) {
        setIsMuted(false);
      }
      console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Cleared audio track reference and reset mute state on error`);
      
      // Only show toast if component is still mounted
      if (isMountedRef.current) {
        toast({
          title: `${isCohost ? 'Co-host' : 'Host'} Setup Failed`,
          description: error.message || "Could not set up Stage audio publishing",
          variant: "destructive"
        });
      }
    }
  }

  // Function to leave the Stage and stop audio publishing
  async function stopCast() {
    try {
      // Mark this as an intentional disconnect so auto-reconnect doesn't trigger
      intentionalDisconnectRef.current = true;
      console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Intentional disconnect - disabling auto-reconnect`);
      
      // Clear any pending reconnect timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // FORCE STOP: Stop mic stream tracks BEFORE leaving Stage to ensure clean disconnect
      if (micStream) {
        micStream.getTracks().forEach((track: MediaStreamTrack) => {
          track.stop();
          console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Stopped track:`, track.kind, track.id);
        });
        console.log('--- IVS Stage tracks manually stopped ---');
      }
      
      if (stage) {
        console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Leaving IVS Stage...`);
        await stage.leave();
        setStage(null);
        console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Successfully left IVS Stage`);
      }
      
      // Only clear micStream after successful Stage disconnect
      if (micStream) {
        setMicStream(null);
        console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Cleared microphone stream reference`);
      }
      
      // Clear audio track reference and reset mute state
      localAudioTrackRef.current = null;
      setIsMuted(false);
      console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Cleared audio track reference and reset mute state`);
      
      // Reset debug state
      setPublishedTracks(0);
      setCohostConnectState('disconnected');
      setLastError(null);
      
    } catch (error) {
      console.error(`[${isCohost ? 'COHOST' : 'HOST'}] Error leaving Stage:`, error);
      // Even on error, try to stop tracks if they're still active
      if (micStream) {
        try {
          micStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
          setMicStream(null);
          console.log(`[${isCohost ? 'COHOST' : 'HOST'}] Stopped tracks in error handler`);
        } catch (trackError) {
          console.error(`[${isCohost ? 'COHOST' : 'HOST'}] Failed to stop tracks in error handler:`, trackError);
        }
      }
    }
  }

  // Remove this old definition as it's redefined below

  // Persist cohost context to sessionStorage for reload handling
  useEffect(() => {
    if (isCohost && cohostCreds) {
      const cohostContext = {
        sessionId: cohostCreds.sessionId,
        participantToken: cohostCreds.participantToken,
        stageArn: cohostCreds.stageArn,
        inviteCode: cohostCreds.inviteCode,
        inheritedPrefs,
        timestamp: Date.now()
      };
      sessionStorage.setItem('booth.cohostContext', JSON.stringify(cohostContext));
      console.log('[BROADCASTER:COHOST] Persisted cohost context to sessionStorage');
    }
  }, [isCohost, cohostCreds, inheritedPrefs]);

  // Skip setup for co-hosts - apply inherited prefs and start automatically
  useEffect(() => {
    if (!skipSetup) return;

    // Get inherited prefs from navigation state or sessionStorage fallback
    let effectivePrefs = inheritedPrefs;
    let effectiveToken = cohostToken;
    let effectiveStageArn = cohostStageArn;
    
    if (!effectivePrefs || !effectiveToken) {
      const stored = sessionStorage.getItem('booth.cohostContext');
      if (stored) {
        try {
          const cohostContext = JSON.parse(stored);
          effectivePrefs = cohostContext.inheritedPrefs;
          effectiveToken = cohostContext.participantToken;
          effectiveStageArn = cohostContext.stageArn;
          console.log('[BROADCASTER:COHOST] Restored cohost context from sessionStorage');
        } catch (error) {
          console.warn('[BROADCASTER:COHOST] Failed to parse stored cohost context:', error);
        }
      }
    }
    
    // BYPASS: Use default prefs if missing - never block co-host from proceeding
    if (!effectivePrefs) {
      console.warn('[BROADCASTER:COHOST] Missing inherited prefs, using defaults');
      effectivePrefs = {
        mode: 'play-by-play',
        perspective: 'neutral',
        tone: 'serious'
      };
    }
    
    console.log('[BROADCASTER:COHOST] Applying inherited prefs and skipping setup:', effectivePrefs);
    
    // Convert inherited prefs format to CasterSettings format
    const cohostSettings: CasterSettings = {
      mode: effectivePrefs.mode || 'play-by-play', 
      perspective: effectivePrefs.perspective || 'neutral',
      tones: effectivePrefs.tone ? [effectivePrefs.tone] : ['serious']
    };
    
    // Hide setup UI for co-hosts
    setShowSetup(false);
    
    // NOTE: Old setTimeout auto-trigger removed - the new guarded auto-join useEffect (below) 
    // handles Stage connection immediately without delay and with proper race condition guards
    console.log('[BROADCASTER:COHOST] Setup hidden, auto-join useEffect will handle Stage connection');
    
  }, [skipSetup, inheritedPrefs, cohostToken]);
  
  // Auto-join co-host to Stage on page load
  useEffect(() => {
    // Only auto-join if:
    // 1. User is a co-host
    // 2. We have valid participant token
    // 3. Stage is not already connected
    // 4. Setup UI is hidden (co-host flow active)
    // 5. Not already joining (prevent duplicate calls)
    if (isCohost && cohostCreds?.participantToken && !stage && !showSetup && !joiningRef.current) {
      console.log('[COHOST] Auto-joining Stage on load...');
      console.log('[COHOST] Using participant token:', cohostCreds.participantToken.substring(0, 20) + '...');
      
      // Set flag to prevent duplicate joins
      joiningRef.current = true;
      
      // Set the session ID from cohost context for heartbeat
      const stored = sessionStorage.getItem('booth.cohostContext');
      if (stored) {
        try {
          const cohostContext = JSON.parse(stored);
          const hostSessionId = cohostContext.sessionId;
          setSessionId(hostSessionId);
          
          // Clear any existing heartbeat interval before creating a new one
          if (heartbeatInterval) {
            console.log('[COHOST] Clearing existing heartbeat interval');
            window.clearInterval(heartbeatInterval);
          }
          
          // Start heartbeat for co-host presence
          const interval = window.setInterval(() => {
            if (hostSessionId) {
              apiRequest("POST", `/api/sessions/${encodeURIComponent(hostSessionId)}/cohost-heartbeat`, { userId: typedUser?.id })
                .catch((error) => {
                  console.warn("Co-host heartbeat failed:", error);
                });
            }
          }, 5000);
          setHeartbeatInterval(interval);
          
          console.log('[COHOST] Set session ID and started heartbeat:', hostSessionId);
        } catch (error) {
          console.warn('[COHOST] Failed to parse cohost context for heartbeat:', error);
        }
      }
      
      // Immediately join the stage using the existing goLiveToStage function
      setLastEvent('auto_join_stage');
      setCohostConnectState('connecting');
      goLiveToStage(cohostCreds.participantToken)
        .then(() => {
          console.log('[COHOST] Auto-join goLiveToStage promise resolved');
          // Note: joiningRef will be reset in finally block after a short delay
          // to allow Stage connection events to fire
        })
        .catch((error) => {
          console.error('[COHOST] Auto-join failed:', error);
          setCohostConnectState('error');
          setLastError(error.message || 'Auto-join failed');
          toast({
            title: "Auto-join Failed",
            description: error.message || "Could not automatically join the stream. Please try manually.",
            variant: "destructive"
          });
        })
        .finally(() => {
          // Reset joining flag after a delay to allow Stage connection to establish
          // This prevents the flag from getting stuck if goLiveToStage succeeds but Stage doesn't materialize
          setTimeout(() => {
            console.log('[COHOST] Resetting joiningRef flag after auto-join attempt');
            joiningRef.current = false;
          }, 3000); // 3 second delay allows Stage events to fire
        });
    }
  }, [isCohost, cohostCreds?.participantToken, stage, showSetup, heartbeatInterval]);
  
  // Co-host flow: Skip session creation and go directly to Stage connection
  const handleCohostGoLive = async (settings: CasterSettings) => {
    try {
      setLastEvent('cohost_flow_start');
      setCohostConnectState('connecting');
      console.log('[COHOST] Starting co-host session directly with Stage connection');
      
      // For co-hosts, we don't create a session - we join the existing host's session
      // Set the session ID from cohost context
      const stored = sessionStorage.getItem('booth.cohostContext');
      if (stored) {
        const cohostContext = JSON.parse(stored);
        const hostSessionId = cohostContext.sessionId;
        setSessionId(hostSessionId);
        
        // Start heartbeat for co-host presence
        const interval = window.setInterval(() => {
          if (hostSessionId) {
            // Use a different endpoint for co-host heartbeat or the same one
            apiRequest("POST", `/api/sessions/${encodeURIComponent(hostSessionId)}/cohost-heartbeat`, { userId: typedUser?.id })
              .catch((error) => {
                console.warn("Co-host heartbeat failed:", error);
              });
          }
        }, 5000);
        setHeartbeatInterval(interval);
        
        // Use the co-host credentials for Stage connection (use participantToken, not sessionId)
        if (cohostCreds?.participantToken) {
          setLastEvent('stage_connect_start');
          console.log('[COHOST] stage:connect:start with participantToken');
          await goLiveToStage(cohostCreds.participantToken);
        } else {
          throw new Error('Co-host participant token not found');
        }
        
      } else {
        throw new Error('Co-host context not found');
      }
      
    } catch (error: any) {
      console.error('[COHOST] Failed to start co-host session:', error);
      setLastError(error.message);
      setCohostConnectState('error');
      toast({
        title: "Co-host Setup Failed",
        description: error.message || "Could not connect as co-host",
        variant: "destructive"
      });
    }
  };
  
  // Toggle mute for IVS Stage audio track
  const handleToggleMute = () => {
    // Guard: Only allow mute if audio track is ready
    if (!localAudioTrackRef.current) {
      console.warn('[MUTE] No local audio track available to mute - Stage not ready yet');
      toast({
        title: "Mute Unavailable",
        description: "Audio is still connecting. Please wait a moment and try again.",
        variant: "destructive"
      });
      // Do NOT flip isMuted state - keep UI in sync with reality
      return;
    }
    
    // Now safe to toggle
    const newMuteState = !isMuted;
    localAudioTrackRef.current.enabled = !newMuteState;
    setIsMuted(newMuteState);
    
    console.log(`[MUTE] Audio track ${newMuteState ? 'muted' : 'unmuted'}, track.enabled = ${localAudioTrackRef.current.enabled}`);
    
    toast({
      title: newMuteState ? "Microphone Muted" : "Microphone Unmuted",
      description: newMuteState ? "Your microphone is now muted" : "Your microphone is now active",
    });
  };
  
  // Modified handleGoLive to detect co-host mode and show caster warning if needed
  const handleGoLive = (settings: CasterSettings) => {
    // CRITICAL: Block action if user data not loaded yet
    if (userLoading || !user) {
      console.warn('[BROADCASTER] Cannot go live: user data not loaded');
      toast({
        title: "Please wait",
        description: "Loading your account information...",
        variant: "default",
      });
      return;
    }
    
    // Check if user has agreed to caster warning (only for hosts, not cohosts)
    if (!isCohost && !user.hasAgreedCasterWarning) {
      // Show warning modal and store settings for later
      setPendingGoLiveSettings(settings);
      setShowCasterWarning(true);
      return;
    }
    
    // User has already agreed or is a cohost, proceed normally
    if (isCohost) {
      handleCohostGoLive(settings);
    } else {
      startSessionMutation.mutate(settings);
    }
  };
  
  // Handler for caster warning modal acceptance
  const handleAcceptCasterWarning = (dontShowAgain: boolean) => {
    if (dontShowAgain) {
      // Save to backend
      acceptCasterWarningMutation.mutate();
    } else {
      // Just close modal and proceed for this session
      setShowCasterWarning(false);
      if (pendingGoLiveSettings) {
        if (isCohost) {
          handleCohostGoLive(pendingGoLiveSettings);
        } else {
          startSessionMutation.mutate(pendingGoLiveSettings);
        }
        setPendingGoLiveSettings(null);
      }
    }
  };

  const handleEndStream = () => {
    // Clean up cohost context when session ends
    if (isCohost) {
      sessionStorage.removeItem('booth.cohostContext');
      console.log('[BROADCASTER:COHOST] Cleaned up cohost context on session end');
    }
    stopSessionMutation.mutate();
  };

  // Co-host specific function to leave the stream without ending the session
  const handleLeaveStream = async () => {
    console.error('🚨🚨🚨 [COHOST] LEAVE STREAM BUTTON CLICKED - FUNCTION EXECUTING 🚨🚨🚨');
    
    // 🛑 NUCLEAR STATE RESET: Immediately silence ALL UI/reconnect logic
    console.log('[COHOST] 🔥 NUCLEAR RESET: Setting all connection states to prevent reconnection');
    setCohostConnectState('disconnected'); // Silence UI pop-ups and prevent reconnection
    setIsLive(false); // Ensure the UI thinks we're done
    
    // 🛑 CRITICAL: Block auto-join IMMEDIATELY by keeping joiningRef = TRUE during disconnect
    // The auto-join useEffect checks !joiningRef.current, so TRUE blocks it
    joiningRef.current = true;
    console.log('[COHOST] 🔒 BLOCKING auto-join by setting joiningRef.current = true');
    
    // 🛑 Clear credential states IMMEDIATELY to prevent isCohost from being true
    setCohostCreds(null);
    setCredentialsState({
      cohostCreds: null,
      credsSource: 'none',
      tokenPresent: false
    });
    console.log('[COHOST] 🧹 Cleared credential states to prevent re-detection');
    
    try {
      console.log('[COHOST] Leaving stream...');
      
      // Call stopCast to cleanly disconnect from Stage
      await stopCast();
      
      // Clear heartbeat interval to prevent memory leaks
      if (heartbeatInterval) {
        console.log('[COHOST] Clearing heartbeat interval');
        window.clearInterval(heartbeatInterval);
        setHeartbeatInterval(null);
      }
      
      // Clean up co-host credentials
      sessionStorage.removeItem('cohostCreds');
      sessionStorage.removeItem('cohostJoinFlow');
      sessionStorage.removeItem('cohostDebug');
      sessionStorage.removeItem('booth.cohostContext');
      console.log('[COHOST] Cleaned up cohost credentials and context');
      
      // Reset UI state
      setIsLive(false);
      setCohostConnectState('disconnected');
      
      toast({
        title: "Left Stream",
        description: "You have disconnected from the stream.",
      });
      
      // 🛑 CRITICAL FINAL FIX: Pause for 500ms to allow IVS SDK to clean up tracks
      console.log('[COHOST] Waiting 500ms for IVS SDK to release microphone before redirect...');
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('[COHOST] 500ms delay complete - safe to redirect now');
      
      // 🛑 FINAL SESSION PURGE: Clear session state before redirect
      setSessionId(null); // Clear the session state to prevent any redirect based on stale session data
      console.log('[COHOST] 🧹 Cleared session state before redirect');
      
      // 🛑 ENFORCE FINAL REDIRECT: Navigate to home page
      console.log('[COHOST] 🎯 Redirecting to home page');
      setLocation('/');
      
      // Prevent any downstream code from executing
      return;
      
    } catch (error: any) {
      console.error('🚨 [COHOST] CRITICAL ERROR IN HANDLELEAVESTREAM:', error);
      toast({
        title: "Disconnect Error",
        description: error.message || "Failed to disconnect cleanly. Please refresh the page.",
        variant: "destructive"
      });
    }
  };

  const handleBroadcastStateChange = (state: 'disconnected' | 'connecting' | 'validating' | 'connected' | 'error') => {
    setBroadcastState(state);
  };

  // Generate co-host invite link when modal opens
  const handleOpenInviteModal = async () => {
    setMakingCohostInvite(true);
    try {
      // Get current live call session ID using the new endpoint
      console.log("[INVITE:UI] Getting current live call session...");
      const currentCallResponse = await apiRequest("GET", "/api/sessions/current-call");
      
      if (!currentCallResponse.ok) {
        if (currentCallResponse.status === 401) {
          toast({ 
            title: "Authentication required", 
            description: "Please log in to create invites.",
            variant: "destructive"
          });
        } else if (currentCallResponse.status === 403) {
          toast({ 
            title: "Access denied", 
            description: "Only hosts can create invites.",
            variant: "destructive"
          });
        } else {
          toast({ 
            title: "Error", 
            description: "Failed to get current session information.",
            variant: "destructive"
          });
        }
        return;
      }
      
      const callData = await currentCallResponse.json();
      const sessionId = callData.sessionId;
      
      console.log("[INVITE:UI] Current call session:", { sessionId, role: callData.role });
      
      if (!sessionId) {
        console.log("[INVITE:UI] No active live call session found");
        toast({ 
          title: "No active session", 
          description: "You need to be live to invite a co-host. Start your broadcast first.",
          variant: "destructive"
        });
        return;
      }
      
      if (callData.role !== 'host') {
        console.log("[INVITE:UI] User is not the host of the session");
        toast({ 
          title: "Access denied", 
          description: "Only the session host can create invites.",
          variant: "destructive"
        });
        return;
      }

      console.log(`[INVITE:UI] Creating invite for live call session: ${sessionId}`);
      const response = await apiRequest("POST", `/api/sessions/${encodeURIComponent(sessionId)}/invites`, {
        expiresInSec: 900, // 15 minutes
        headers: {
          'X-App-Session-Id': localStorage.getItem('booth.sessionId') || 'unknown'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setCohostInviteUrl(data.joinUrl);
        
        // Generate QR code for the invite URL
        try {
          const qrCodeDataUrl = await QRCode.toDataURL(data.joinUrl, {
            width: 200,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });
          setInviteQrCode(qrCodeDataUrl);
        } catch (qrError) {
          console.warn("Failed to generate QR code:", qrError);
        }
        
        toast({ 
          title: "Invite ready", 
          description: "Copy the link and send to your friend." 
        });
        setShowInviteModal(true);
      } else {
        const error = await response.json();
        toast({ 
          title: "Could not create invite", 
          description: error.message || "Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error creating cohost invite:", error);
      toast({ 
        title: "Could not create invite", 
        description: "Please try again.",
        variant: "destructive"
      });
    } finally {
      setMakingCohostInvite(false);
    }
  };

  const handleCopyCohostLink = async () => {
    if (!cohostInviteUrl) return;
    try {
      await navigator.clipboard.writeText(cohostInviteUrl);
      setCohostInviteCopied(true);
      toast({
        title: "Co-host invite link copied!",
        description: "Send this link to your friend to invite them as co-host.",
      });
      setTimeout(() => setCohostInviteCopied(false), 3000);
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Please copy the link manually.",
        variant: "destructive",
      });
    }
  };

  // Share co-host invite using Web Share API
  const handleShareCohostInvite = async () => {
    if (!cohostInviteUrl) return;
    
    // Check if Web Share API is supported
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join me as co-host on BOOTH`,
          text: `Join me as a co-host for ${(event as any)?.title || 'this game'} on BOOTH!`,
          url: cohostInviteUrl,
        });
        
        toast({
          title: "Invite shared!",
          description: "Your co-host invite has been shared.",
        });
      } catch (error: any) {
        // User cancelled sharing or error occurred
        if (error.name !== 'AbortError') {
          console.error("Error sharing:", error);
          // Fallback to copy
          handleCopyCohostLink();
        }
      }
    } else {
      // Fallback to copy if Web Share API not supported
      handleCopyCohostLink();
    }
  };

  // Generate share links when modal opens
  const handleOpenShareModal = () => {
    const baseUrl = window.location.origin;
    
    // Validate that we have event ID and active session ID
    if (!event?.id) {
      toast({
        title: "Share Error",
        description: "Event information not loaded. Please wait and try again.",
        variant: "destructive",
      });
      return;
    }
    
    if (!sessionId) {
      toast({
        title: "Share Error",
        description: "Unable to find your active session. Please go live first, then try sharing.",
        variant: "destructive",
      });
      return;
    }
    
    // Generate the share link using full sessionId (routes to modern ListenerRoom)
    const directLink = `${baseUrl}/room/${encodeURIComponent(sessionId)}`;
    
    setDirectStreamLink(directLink);
    setShowShareModal(true);
  };

  const handleCopyDirectLink = async () => {
    try {
      await navigator.clipboard.writeText(directStreamLink);
      setDirectLinkCopied(true);
      toast({
        title: "Link Copied!",
        description: "Direct stream link copied to clipboard.",
      });
      setTimeout(() => setDirectLinkCopied(false), 3000);
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Please copy the link manually.",
        variant: "destructive",
      });
    }
  };

  // Show progressive notifications based on broadcast state
  useEffect(() => {
    if (!isLive) {
      // Reset state when not live
      setHasShownValidating(false);
      return;
    }

    switch (broadcastState) {
      case 'connecting':
        toast({
          title: "🔗 Connecting...",
          description: "Connecting to broadcast server...",
        });
        break;
      case 'validating':
        if (!hasShownValidating) {
          toast({
            title: "✅ Validating...",
            description: "Validating stream connection with Amazon IVS...",
          });
          setHasShownValidating(true);
        }
        break;
      case 'connected':
        toast({
          title: "🎙️ You're Live!",
          description: "Your commentary is now broadcasting to listeners.",
        });
        break;
      case 'error':
        toast({
          title: "❌ Connection Failed",
          description: "Failed to establish broadcast connection. Please try again.",
          variant: "destructive",
        });
        break;
    }
  }, [broadcastState, isLive, hasShownValidating, toast]);

  const handleBack = () => {
    // Navigate back to the live events page (home page)
    setLocation('/');
  };

  const handleSendMessage = (message: string) => {
    console.log('Broadcaster chat message:', message);
    // This would broadcast to all listeners
  };

  // Simulate listener count updates when live
  useEffect(() => {
    if (isLive) {
      const interval = setInterval(() => {
        setListenerCount(prev => Math.max(0, prev + Math.floor(Math.random() * 3) - 1));
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isLive]);
  

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      {/* Broadcasting Status Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleBack}
                data-testid="button-back"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <span className="text-sm text-muted-foreground">Broadcaster</span>
            </div>
            
            <div className="flex items-center gap-4">
              {broadcastState === 'connected' && (
                <Badge variant="destructive" className="gap-1 animate-pulse">
                  <div className="w-2 h-2 bg-white rounded-full" />
                  LIVE
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Broadcasting Status - moved to top */}
        {(hasIVSChannel || (isCohost && cohostConnectState === 'connected')) && (
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(broadcastState === 'connected' || (isCohost && cohostConnectState === 'connected')) ? (
                <Wifi className="w-4 h-4 text-green-600" />
              ) : (
                <WifiOff className="w-4 h-4 text-gray-400" />
              )}
              <span className="text-sm font-medium">
                Status: {
                  isCohost && cohostConnectState === 'connected' 
                    ? 'CONNECTED' 
                    : broadcastState === 'connected' 
                      ? 'LIVE' 
                      : (ivsStreamStatus?.state || "OFFLINE")
                }
              </span>
              <Badge variant={(broadcastState === 'connected' || (isCohost && cohostConnectState === 'connected')) ? "default" : "secondary"}>
                {
                  isCohost && cohostConnectState === 'connected'
                    ? 'LIVE'
                    : broadcastState === 'connected' 
                      ? 'HEALTHY' 
                      : (ivsStreamStatus?.health || "Unknown")
                }
              </Badge>
              {/* Invite Co-Host Button - Only show for hosts when live */}
              {isLive && !isCohost && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={handleOpenInviteModal}
                        disabled={makingCohostInvite}
                        className="ml-2"
                        data-testid="button-invite-cohost-header"
                      >
                        <UserPlus className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Invite Co-Caster</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={handleOpenShareModal}
                        data-testid="button-share-stream-header"
                      >
                        <Share className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Share Stream</p>
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
            {broadcastState === 'connected' && (
              <div className="text-sm text-muted-foreground">
                Viewers: {ivsStreamStatus?.viewerCount || 0} | Stream ID: {ivsStreamStatus?.streamId || 'Connecting...'}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event Info */}
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <Calendar className="w-5 h-5" />
                  {(event as any)?.title || "Loading..."}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {event ? (
                  <div className="flex items-center justify-center gap-4">
                    <div className="text-center">
                      <p className="font-semibold">
                        {(event as any)?.homeTeamData?.city || (event as any)?.homeTeam || 'TBD'}
                      </p>
                      {(event as any)?.homeTeamData && (
                        <p className="text-sm text-muted-foreground">
                          {(event as any)?.homeTeamData?.name}
                        </p>
                      )}
                    </div>
                    <span className="text-muted-foreground">vs</span>
                    <div className="text-center">
                      <p className="font-semibold">
                        {(event as any)?.awayTeamData?.city || (event as any)?.awayTeam || 'TBD'}
                      </p>
                      {(event as any)?.awayTeamData && (
                        <p className="text-sm text-muted-foreground">
                          {(event as any)?.awayTeamData?.name}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center">Loading event details...</p>
                )}
              </CardContent>
            </Card>

            {/* Enabling Casting Permissions */}
            {!typedUser?.canCast && enableCastingMutation.isPending && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Enabling Broadcasting Permissions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0 animate-pulse" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        Setting up your broadcasting account...
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-200">
                        We're enabling your broadcasting permissions. This will only take a moment.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* IVS Channel Setup */}
            {typedUser?.canCast && !hasIVSChannel && !isLoadingChannelStatus && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Set Up Broadcasting Channel
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        One-time setup required
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-200">
                        Set up your broadcasting channel to start streaming live audio commentary. This only needs to be done once.
                      </p>
                    </div>
                  </div>
                  
                  <Button
                    onClick={() => setupChannelMutation.mutate()}
                    disabled={setupChannelMutation.isPending}
                    className="w-full gap-2"
                    data-testid="button-setup-channel"
                  >
                    <Settings className="w-4 h-4" />
                    {setupChannelMutation.isPending ? "Setting up..." : "Set Up Broadcasting Channel"}
                  </Button>
                </CardContent>
              </Card>
            )}


            {/* Broadcaster Controls */}
            {/* Show for hosts (hasIVSChannel) OR co-hosts successfully connected to Stage */}
            {(() => {
              // Use explicit connection state for co-hosts, not raw stage reference
              // This prevents controls from flickering during reconnect sequences
              const isConnectedToStage = cohostConnectState === 'connected';
              const shouldShowControls = (hasIVSChannel && showSetup) || (isCohost && isConnectedToStage);
              
              console.log('[BROADCASTER_CONTROLS] Render check:', {
                shouldShowControls,
                hasIVSChannel,
                showSetup,
                isCohost,
                cohostConnectState,
                isConnectedToStage
              });
              
              return shouldShowControls ? (
                <BroadcasterControls
                  event={event}
                  isLive={isLive}
                  listenerCount={listenerCount}
                  onGoLive={handleGoLive}
                  onEndStream={handleEndStream}
                  ivsChannelStatus={ivsChannelStatus}
                  hasIVSChannel={hasIVSChannel}
                  onBroadcastStateChange={handleBroadcastStateChange}
                  isCohost={isCohost}
                  cohostIsConnected={cohostConnectState === 'connected'}
                  cohostConnectState={cohostConnectState}
                  isMuted={isMuted}
                  onToggleMute={handleToggleMute}
                />
              ) : null;
            })()}

            {/* Co-Host Leave Stream Button */}
            {/* RESILIENT FIX: Multiple fallback conditions to ensure button always appears when co-host is live */}
            {/* Conditions: (isCohost OR cohostCreds exists) AND (isLive OR cohostConnectState is connected) */}
            {(() => {
              const showButton = (isCohost || cohostCreds) && (isLive || cohostConnectState === 'connected');
              console.log('[LEAVE_BUTTON] Render check:', {
                showButton,
                isCohost,
                cohostCredsExists: !!cohostCreds,
                isLive,
                cohostConnectState,
                condition1: isCohost || cohostCreds,
                condition2: isLive || cohostConnectState === 'connected'
              });
              
              return showButton ? (
                <Card>
                  <CardContent className="pt-6">
                    <Button
                      type="button"
                      onClick={handleLeaveStream}
                      variant="destructive"
                      className="w-full gap-2"
                      data-testid="button-leave-stream"
                    >
                      <LogOut className="w-4 h-4" />
                      Leave Stream
                    </Button>
                  </CardContent>
                </Card>
              ) : null;
            })()}
            
            {/* Stage Participants - Show active co-hosts */}
            {isLive && stageParticipants.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    👥 Active Participants ({stageParticipants.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stageParticipants.map((participant) => {
                      const participantId = participant.participantId || participant.userId;
                      const isLocal = participant.isLocal;
                      const role = isLocal ? (isCohost ? 'You (Co-Host)' : 'You (Host)') : 'Co-Host';
                      
                      return (
                        <div
                          key={participantId}
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                          data-testid={`participant-${participantId}`}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {isLocal ? '🎙️' : '🎧'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{role}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {participantId.slice(0, 8)}...
                            </p>
                          </div>
                          {!isLocal && (
                            <Badge variant="secondary" className="text-xs">
                              Live
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Hidden audio element for remote participant playback (already created by ensureRemoteAudioEl) */}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Live Chat */}
            <ChatPanel 
              eventId={eventId || null}
            />
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Invite Co-Caster
            </DialogTitle>
            <DialogDescription>
              Share this link with your friend to invite them to co-cast with you live!
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">🎙️ How Co-Casting Works</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Your friend joins using this link</li>
                <li>• Both of you broadcast to the same audience</li>
                <li>• Share the commentary workload</li>
                <li>• Create engaging banter and chemistry</li>
              </ul>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-link">Co-Host Invite Link</Label>
                {cohostInviteUrl ? (
                  <>
                    <div className="flex gap-2">
                      <Input
                        id="invite-link"
                        value={cohostInviteUrl}
                        readOnly
                        data-testid="input-cohost-invite-link"
                      />
                      <Button
                        onClick={handleCopyCohostLink}
                        variant="outline"
                        className="flex-shrink-0"
                        data-testid="button-copy-cohost-link"
                      >
                        {cohostInviteCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    
                    {/* Share options */}
                    <div className="flex gap-2">
                      <Button
                        onClick={handleShareCohostInvite}
                        variant="outline"
                        className="flex-1 gap-2"
                        data-testid="button-share-cohost-invite"
                      >
                        <Share className="w-4 h-4" />
                        Share
                      </Button>
                      <Button
                        onClick={() => setShowQrCode(!showQrCode)}
                        variant="outline"
                        className="flex-1 gap-2"
                        data-testid="button-show-qr-code"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect width="5" height="5" x="3" y="3" rx="1"/>
                          <rect width="5" height="5" x="16" y="3" rx="1"/>
                          <rect width="5" height="5" x="3" y="16" rx="1"/>
                          <path d="m21 16-3.5-3.5-1 1"/>
                          <path d="m21 21-3.5-3.5-1 1"/>
                          <path d="m21 11-3.5-3.5-1 1"/>
                        </svg>
                        {showQrCode ? 'Hide QR' : 'Show QR'}
                      </Button>
                    </div>
                    
                    {/* QR Code display */}
                    {showQrCode && inviteQrCode && (
                      <div className="flex justify-center p-4 bg-muted rounded-lg">
                        <img 
                          src={inviteQrCode} 
                          alt="QR Code for co-host invite"
                          className="max-w-[150px] max-h-[150px]"
                          data-testid="img-invite-qr-code"
                        />
                      </div>
                    )}
                    
                    <div className="text-sm text-muted-foreground">
                      ⏰ This invite expires in 15 minutes and can only be used once.
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Click "Generate Invite Link" to create a co-host invite.
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowInviteModal(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Stream Modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share className="w-5 h-5" />
              Share Your Live Stream
            </DialogTitle>
            <DialogDescription>
              Share your stream with friends and listeners using these links. Choose the option that works best for your audience.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Direct Stream Link */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <RadioIcon className="w-4 h-4 text-blue-600" />
                <Label className="text-base font-medium">Direct Stream Link</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Takes listeners straight to your live stream. Perfect for sharing with friends who want to jump right in.
              </p>
              <div className="flex gap-2">
                <Input
                  value={directStreamLink}
                  readOnly
                  className="text-xs"
                  data-testid="input-direct-stream-link"
                />
                <Button
                  onClick={handleCopyDirectLink}
                  variant="outline"
                  className="flex-shrink-0"
                  data-testid="button-copy-direct-link"
                >
                  {directLinkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Tips */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Share className="w-4 h-4" />
                Sharing Tips
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Share your link on social media, messaging apps, or anywhere your audience hangs out</li>
                <li>• Links work best when shared while you're live!</li>
                <li>• Consider mentioning your commentary style when sharing</li>
              </ul>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowShareModal(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Caster Warning Modal */}
      <CasterWarningModal
        open={showCasterWarning}
        onAccept={handleAcceptCasterWarning}
      />

    </div>
  );
}