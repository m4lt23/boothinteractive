import * as React from "react";

type Props = {
  eventId: string;
  delaySec: number;
  setDelay: (sec: number) => void;
  className?: string;
};

const keyFor = (eventId: string) => `booth.delay.${eventId}`;

export function usePersistentDelay(eventId: string, initial = 0) {
  const [delay, setDelayState] = React.useState<number>(() => {
    try {
      const raw = localStorage.getItem(keyFor(eventId));
      return raw ? Math.min(179.999, Math.max(0, JSON.parse(raw).delay ?? 0)) : initial;
    } catch { return initial; }
  });
  const setDelay = (d: number) => {
    const clamped = Math.max(0, Math.min(179.999, d));
    setDelayState(clamped);
    try { localStorage.setItem(keyFor(eventId), JSON.stringify({ delay: clamped })); } catch {}
  };
  const reset = () => setDelay(0);
  return { delay, setDelay, reset };
}

export function SyncTuner({ eventId, delaySec, setDelay, className }: Props) {
  const MAX_DELAY = 179.999;
  
  // "–" buttons push audio back (increase delay)
  const back = (s: number) => () => {
    const requested = delaySec + s;
    setDelay(Math.min(MAX_DELAY, requested));
  };
  
  // "+" buttons move toward live (decrease delay)
  const fwd  = (s: number) => () => {
    const requested = delaySec - s;
    setDelay(Math.max(0, requested));
  };

  return (
    <div className={`mt-2 flex flex-wrap items-center gap-2 text-sm ${className ?? ""}`}>
      <span className="text-muted-foreground">Sync Tuner</span>
      <span className="ml-2 tabular-nums">Delay: {delaySec.toFixed(1)}s</span>

      <div className="ml-3 flex items-center gap-1">
        {/* back in time (increase delay) */}
        <button type="button"
                className="px-3 py-1.5 rounded-md border text-sm bg-red-50 border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-50"
                onClick={back(10)} 
                disabled={delaySec >= MAX_DELAY}
                data-testid="button-delay-minus-10s">–10s</button>
        <button type="button"
                className="px-3 py-1.5 rounded-md border text-sm bg-red-50 border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-50"
                onClick={back(5)} 
                disabled={delaySec >= MAX_DELAY}
                data-testid="button-delay-minus-5s">–5s</button>
        <button type="button"
                className="px-3 py-1.5 rounded-md border text-sm bg-red-50 border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-50"
                onClick={back(1)} 
                disabled={delaySec >= MAX_DELAY}
                data-testid="button-delay-minus-1s">–1s</button>

        <span className="mx-1 text-muted-foreground">•</span>

        {/* toward live (decrease delay) */}
        <button type="button"
                className="px-3 py-1.5 rounded-md border text-sm bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                onClick={fwd(1)} disabled={delaySec <= 0} data-testid="button-delay-plus-1s">+1s</button>
        <button type="button"
                className="px-3 py-1.5 rounded-md border text-sm bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                onClick={fwd(5)} disabled={delaySec <= 0} data-testid="button-delay-plus-5s">+5s</button>

        <span className="mx-1 text-muted-foreground">•</span>

        <button type="button"
                className="px-3 py-1.5 rounded-md border text-sm bg-green-50 border-green-200 text-green-700 hover:bg-green-100 disabled:opacity-50"
                onClick={() => setDelay(0)} disabled={delaySec <= 0} data-testid="button-delay-reset">
          Reset to Live
        </button>
      </div>
    </div>
  );
}