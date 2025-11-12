import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Plus, Minus, Volume2 } from "lucide-react";
import { useState } from "react";

interface AudioSyncControlsProps {
  onSyncAdjust?: (offsetMs: number) => void;
  onAutoSync?: () => void;
  currentOffset?: number;
}

export default function AudioSyncControls({ 
  onSyncAdjust, 
  onAutoSync, 
  currentOffset = 0 
}: AudioSyncControlsProps) {
  const [offset, setOffset] = useState(currentOffset);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);

  const handleQuickAdjust = (ms: number) => {
    const newOffset = offset + ms;
    setOffset(newOffset);
    onSyncAdjust?.(newOffset);
    console.log(`Audio sync adjusted by ${ms}ms, total offset: ${newOffset}ms`);
  };

  const handleSliderChange = (value: number[]) => {
    const newOffset = value[0];
    setOffset(newOffset);
    onSyncAdjust?.(newOffset);
  };

  const handleAutoSync = () => {
    setIsAutoSyncing(true);
    console.log('Starting auto-sync...');
    onAutoSync?.();
    // Simulate auto-sync completion
    setTimeout(() => {
      setIsAutoSyncing(false);
      const autoOffset = Math.random() * 200 - 100; // Random offset for demo
      setOffset(autoOffset);
      onSyncAdjust?.(autoOffset);
    }, 2000);
  };

  const handleReset = () => {
    setOffset(0);
    onSyncAdjust?.(0);
    console.log('Audio sync reset to 0ms');
  };

  const getSyncStatus = () => {
    if (Math.abs(offset) < 50) return { text: "In Sync", color: "bg-green-500" };
    if (Math.abs(offset) < 200) return { text: "Minor Drift", color: "bg-yellow-500" };
    return { text: "Out of Sync", color: "bg-red-500" };
  };

  const status = getSyncStatus();

  return (
    <Card className="w-full max-w-md" data-testid="card-sync-controls">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Volume2 className="w-5 h-5" />
          Audio Sync
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status.color}`} />
          <span className="text-sm text-muted-foreground">{status.text}</span>
          <Badge variant="outline" className="ml-auto" data-testid="text-offset">
            {offset > 0 ? `+${offset.toFixed(0)}ms` : `${offset.toFixed(0)}ms`}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Quick Adjustment Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleQuickAdjust(-200)}
            data-testid="button-minus-200"
          >
            <Minus className="w-4 h-4 mr-1" />
            200ms
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleQuickAdjust(200)}
            data-testid="button-plus-200"
          >
            <Plus className="w-4 h-4 mr-1" />
            200ms
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleQuickAdjust(-50)}
            data-testid="button-minus-50"
          >
            <Minus className="w-4 h-4 mr-1" />
            50ms
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleQuickAdjust(50)}
            data-testid="button-plus-50"
          >
            <Plus className="w-4 h-4 mr-1" />
            50ms
          </Button>
        </div>

        {/* Fine Adjustment Slider */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Fine Adjustment</label>
          <Slider
            value={[offset]}
            onValueChange={handleSliderChange}
            max={1000}
            min={-1000}
            step={10}
            className="w-full"
            data-testid="slider-fine-adjust"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>-1000ms</span>
            <span>0ms</span>
            <span>+1000ms</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button 
            onClick={handleAutoSync}
            disabled={isAutoSyncing}
            className="flex-1"
            data-testid="button-auto-sync"
          >
            {isAutoSyncing ? "Syncing..." : "Auto Sync"}
          </Button>
          <Button 
            variant="outline"
            size="icon"
            onClick={handleReset}
            data-testid="button-reset"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        <div className="text-xs text-muted-foreground text-center">
          {offset > 0 ? `Audio is ${offset.toFixed(0)}ms behind TV` : 
           offset < 0 ? `Audio is ${Math.abs(offset).toFixed(0)}ms ahead of TV` : 
           "Audio and TV are in sync"}
        </div>
      </CardContent>
    </Card>
  );
}