import { useEffect, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, Wifi, WifiOff } from "lucide-react";
import AvailableCasters from "@/components/AvailableCasters";

interface ChatPanelProps {
  eventId: string | null;
  onStatusChange?: (status: string) => void;
}

export default function ChatPanel({ eventId, onStatusChange }: ChatPanelProps) {
  const [text, setText] = useState("");
  
  const {
    messages,
    connectionStatus,
    error,
    isConnected,
    isAuthenticated,
    isRateLimited,
    nextAllowedTime,
    pendingMessageCount,
    sendMessage,
    joinEvent,
    leaveEvent,
    retryConnection,
    resendFailedMessages
  } = useWebSocket();

  // Join/leave event when eventId changes
  useEffect(() => {
    if (eventId && isAuthenticated) {
      joinEvent(eventId);
    } else if (!eventId) {
      leaveEvent();
    }
  }, [eventId, isAuthenticated, joinEvent, leaveEvent]);

  // Notify parent of status changes
  useEffect(() => {
    onStatusChange?.(connectionStatus);
  }, [connectionStatus, onStatusChange]);

  // Helper to get display name
  const who = (u?: any) => u?.screenname || "user";

  const send = () => {
    if (!text.trim()) return;
    sendMessage(text.trim());
    setText("");
  };

  // Connection status indicator
  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
      case 'authenticated':
        return <Wifi className="h-4 w-4 text-green-500" />;
      case 'connecting':
      case 'reconnecting':
        return <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />;
      case 'disconnected':
      case 'error':
        return <WifiOff className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connecting': return 'Connecting...';
      case 'connected': return 'Connected';
      case 'authenticated': return 'Chat Ready';
      case 'reconnecting': return 'Reconnecting...';
      case 'disconnected': return 'Disconnected';
      case 'error': return 'Connection Error';
      default: return connectionStatus;
    }
  };

  const canSend = isConnected && isAuthenticated && !isRateLimited && Boolean(text.trim()) && Boolean(eventId);

  return (
    <section className="rounded-2xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Chat</h2>
          {pendingMessageCount > 0 && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
              {pendingMessageCount} queued
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-xs text-muted-foreground">{getStatusText()}</span>
        </div>
      </div>

      {/* Available casters display */}
      <div className="mb-2">
        <AvailableCasters 
          size="sm" 
          showIcon={true}
          showCount={false}
          className="text-muted-foreground"
        />
      </div>

      {/* Error and retry section */}
      {error && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-sm">
          <div className="flex items-center justify-between">
            <span className="text-red-700">{error}</span>
            <div className="flex gap-1">
              {connectionStatus === 'error' && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={retryConnection}
                  data-testid="button-retry-connection"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              )}
              {pendingMessageCount > 0 && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={resendFailedMessages}
                  data-testid="button-resend-messages"
                >
                  Resend {pendingMessageCount}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rate limit info */}
      {isRateLimited && nextAllowedTime && (
        <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700">
          Rate limited. Next message allowed at {nextAllowedTime.toLocaleTimeString()}
        </div>
      )}

      <div className="h-64 overflow-y-auto rounded border p-2 text-sm bg-muted/30">
        {messages.length === 0 ? (
          <div className="text-muted-foreground">No messages yet. Say hi!</div>
        ) : (
          messages.map((m, i) => (
            <div key={m.id ?? i} className="mb-2">
              <div className="text-xs text-muted-foreground">
                {who(m.user)} • {m.createdAt ? new Date(m.createdAt).toLocaleTimeString() : ""}
              </div>
              <div>{m.message}</div>
            </div>
          ))
        )}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          onKeyDown={(e) => e.key === "Enter" && send()}
          data-testid="input-chat-message"
        />
        <Button
          onClick={send}
          disabled={!canSend}
          data-testid="button-send-chat"
        >
          Send
        </Button>
      </div>
    </section>
  );
}