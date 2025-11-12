export function cohostAudioState(el?: HTMLAudioElement): 'NO_STREAM' | 'PAUSED' | 'PLAYING' {
  if (!el || !(el instanceof HTMLAudioElement)) return 'NO_STREAM';
  const ms = el.srcObject as MediaStream | null;
  const hasStream = !!ms && ms.getAudioTracks().length > 0;
  if (!hasStream) return 'NO_STREAM';
  return el.paused ? 'PAUSED' : 'PLAYING';
}

export function hostPubTracks(stageOrPc: any): number {
  const pc = stageOrPc?.connection || stageOrPc?.pc || stageOrPc;
  if (!pc?.getSenders) return 0;
  return pc.getSenders().filter((s: RTCRtpSender) => s.track?.kind === 'audio' && s.track.readyState === 'live').length;
}
