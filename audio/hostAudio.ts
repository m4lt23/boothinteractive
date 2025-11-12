import { LocalStageStream } from "amazon-ivs-web-broadcast";
import { USE_MIXER_PATH } from "@/featureFlags";

// Shared: Ensure AudioContext for both paths
export async function ensureAudioContext(): Promise<AudioContext> {
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = (window as any).__boothCtx || new AC();
  (window as any).__boothCtx = ctx;
  if (ctx.state !== 'running') {
    await ctx.resume();
  }
  return ctx;
}

// BASELINE PATH: Direct mic stream publishing (no audio graph)
export async function baselineJoinAudio(): Promise<MediaStream> {
  console.log('[BASELINE] Starting direct mic stream setup');
  
  // Resume AudioContext for autoplay compatibility
  await ensureAudioContext();
  
  // Get microphone stream directly
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  
  console.log('[BASELINE] Got mic stream (will be published directly)');
  return micStream;
}

// MIXER PATH: Full audio graph with mic → outbound → dest
export interface AudioGraph {
  ctx: AudioContext;
  mic: MediaStreamAudioSourceNode;
  out: GainNode;
  dest: MediaStreamAudioDestinationNode;
  micStream: MediaStream;
}

export async function mixerJoinAudio(): Promise<AudioGraph> {
  console.log('[MIXER] Building audio graph');
  
  // 1) Context
  const ctx = await ensureAudioContext();
  
  // 2) Get microphone
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  
  // 3) Build graph: mic → outbound gain → destination
  const mic = ctx.createMediaStreamSource(micStream);
  const out = ctx.createGain();
  out.gain.value = 1.0;
  mic.connect(out);
  
  const dest = ctx.createMediaStreamDestination();
  out.connect(dest);
  
  console.log('[MIXER] Audio graph built: mic → out → dest');
  
  // 4) Expose for debugging
  (window as any).audioContext = ctx;
  (window as any).hostMicNode = mic;
  (window as any).outboundMixNode = out;
  (window as any)._boothDest = dest;
  
  console.log('[MIXER] Audio graph ready (will publish dest.stream)');
  
  return { ctx, mic, out, dest, micStream };
}

// Entry point: Select path based on flag
export async function joinAudio(): Promise<AudioGraph | MediaStream> {
  if (USE_MIXER_PATH) {
    return await mixerJoinAudio();
  } else {
    return await baselineJoinAudio();
  }
}

// Co-host: Ensure remote audio element for playback
export async function ensureRemoteAudioEl(): Promise<HTMLAudioElement> {
  let el = document.getElementById('remote-audio') as HTMLAudioElement | null;
  if (!el) {
    el = document.createElement('audio');
    el.id = 'remote-audio';
    el.autoplay = true;
    el.muted = false;
    el.controls = false;
    el.style.display = 'none';
    document.body.appendChild(el);
    console.log('[COHOST] Created remote audio element');
  }
  
  // Resume AudioContext for autoplay
  await ensureAudioContext();
  
  return el;
}

// Safe play with user gesture fallback
export async function safePlay(el: HTMLAudioElement) {
  try {
    await el.play();
    console.log('[COHOST] play() succeeded');
  } catch (e) {
    console.warn('[COHOST] play() blocked; awaiting user gesture', e);
    const once = () => {
      el.play().catch(() => {});
      window.removeEventListener('pointerdown', once);
    };
    window.addEventListener('pointerdown', once, { once: true });
  }
}
