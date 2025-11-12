import { Users, Mic } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { formatCastersDisplay, getCasterCountText } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AvailableCastersProps {
  className?: string;
  showIcon?: boolean;
  showCount?: boolean;
  maxNameLength?: number;
  size?: 'sm' | 'md' | 'lg';
}

export default function AvailableCasters({ 
  className = "",
  showIcon = true,
  showCount = false,
  maxNameLength = 15,
  size = 'md'
}: AvailableCastersProps) {
  const { casters, isConnected, connectionStatus } = useWebSocket();
  
  // Format the casters display
  const { text, fullText, truncated } = formatCastersDisplay(casters, { maxNameLength });
  const countText = getCasterCountText(casters);
  
  // Determine display state
  const isLoading = connectionStatus === 'connecting' || connectionStatus === 'reconnecting';
  const hasError = connectionStatus === 'error';
  const hasCasters = casters && casters.length > 0;
  
  // Size variants
  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm", 
    lg: "text-base"
  };
  
  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5"
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${sizeClasses[size]} text-muted-foreground ${className}`}>
        {showIcon && <Mic className={`${iconSizes[size]} animate-pulse`} />}
        <span>Connecting...</span>
      </div>
    );
  }

  // Error state
  if (hasError) {
    return (
      <div className={`flex items-center gap-2 ${sizeClasses[size]} text-muted-foreground ${className}`}>
        {showIcon && <Mic className={`${iconSizes[size]} text-destructive`} />}
        <span>Connection error</span>
      </div>
    );
  }

  // No casters state
  if (!hasCasters) {
    return (
      <div className={`flex items-center gap-2 ${sizeClasses[size]} text-muted-foreground ${className}`}>
        {showIcon && <Mic className={`${iconSizes[size]}`} />}
        <span>No broadcasters</span>
      </div>
    );
  }

  // Active casters display
  const CasterText = () => {
    if (truncated) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help underline decoration-dotted decoration-1 underline-offset-2">
                {text}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs break-words">{fullText}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    return <span>{text}</span>;
  };

  return (
    <div 
      className={`flex items-center gap-2 ${sizeClasses[size]} ${className}`}
      data-testid="available-casters"
    >
      {showIcon && (
        <Mic 
          className={`${iconSizes[size]} text-green-600 dark:text-green-400`} 
          data-testid="icon-live-mic"
        />
      )}
      
      <div className="flex items-center gap-2">
        <CasterText />
        
        {showCount && casters.length > 0 && (
          <Badge 
            variant="secondary" 
            className="text-xs"
            data-testid="badge-caster-count"
          >
            {casters.length}
          </Badge>
        )}
      </div>
      
      {/* Connection status indicator for debugging */}
      {process.env.NODE_ENV === 'development' && (
        <span className="text-xs opacity-50">
          {isConnected ? '🟢' : '🔴'}
        </span>
      )}
    </div>
  );
}