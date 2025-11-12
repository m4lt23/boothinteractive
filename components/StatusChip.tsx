import { Badge } from "@/components/ui/badge";

type AudioState = 'NO_STREAM' | 'PAUSED' | 'PLAYING';

interface StatusChipProps {
  type: 'host' | 'cohost';
  value: number | AudioState;
}

export function StatusChip({ type, value }: StatusChipProps) {
  if (type === 'host') {
    return (
      <Badge variant="outline" className="font-mono text-xs" data-testid="status-chip-host">
        pubTracks: {value}
      </Badge>
    );
  }

  const state = value as AudioState;
  const colorClass = 
    state === 'NO_STREAM' ? 'bg-muted text-muted-foreground' :
    state === 'PAUSED' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30' :
    'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30';

  return (
    <Badge 
      variant="outline" 
      className={`font-mono text-xs ${colorClass}`}
      data-testid="status-chip-cohost"
    >
      remoteAudio: {state}
    </Badge>
  );
}
