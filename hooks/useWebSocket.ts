import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { queryClient } from '@/lib/queryClient';

interface ChatMessage {
  id: string;
  eventId: string;
  casterId: string | null;
  userId: string;
  message: string;
  type: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    screenname: string | null;
    profileImageUrl: string | null;
    canCast: boolean;
  };
}

interface SessionCaster {
  id: string;
  name: string;
  role: 'host' | 'cohost' | 'guest';
  joinedAt: number;
}

interface CasterUpdateEvent {
  type: 'session.casters.updated';
  sessionId: string;
  version: number;
  casters: SessionCaster[];
  timestamp: string;
}

interface PendingMessage {
  id: string;
  text: string;
  casterId?: string;
  timestamp: number;
  retryCount: number;
}

interface UseWebSocketReturn {
  messages: ChatMessage[];
  isConnected: boolean;
  isAuthenticated: boolean;
  sendMessage: (text: string, casterId?: string) => void;
  joinEvent: (eventId: string) => void;
  leaveEvent: () => void;
  connectionStatus: 'connecting' | 'connected' | 'authenticated' | 'disconnected' | 'error' | 'reconnecting';
  error: string | null;
  isRateLimited: boolean;
  nextAllowedTime: Date | null;
  currentEventId: string | null;
  pendingMessageCount: number;
  retryConnection: () => void;
  resendFailedMessages: () => void;
  // Caster tracking state
  casters: SessionCaster[];
  castersVersion: number;
  lastCasterUpdate: string | null;
}

// Constants for reliability features
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 90000; // 90 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const MESSAGE_QUEUE_MAX_SIZE = 50;
const MESSAGE_MAX_LENGTH = 500; // Match server limit

export function useWebSocket(): UseWebSocketReturn {
  const { user, isAuthenticated: userIsAuthenticated } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'authenticated' | 'disconnected' | 'error' | 'reconnecting'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [nextAllowedTime, setNextAllowedTime] = useState<Date | null>(null);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  
  // Caster tracking state
  const [casters, setCasters] = useState<SessionCaster[]>([]);
  const [castersVersion, setCastersVersion] = useState(0);
  const [lastCasterUpdate, setLastCasterUpdate] = useState<string | null>(null);
  
  // Polling fallback function for when WebSocket is unavailable
  const pollSessionMeta = useCallback(async () => {
    if (!currentSessionIdRef.current || !userIsAuthenticated) {
      return;
    }

    // Only poll when page is visible
    if (document.visibilityState !== 'visible') {
      console.log('[POLL] Skipping poll - page not visible');
      return;
    }

    try {
      console.log(`[POLL] Fetching session metadata for: ${currentSessionIdRef.current}`);
      
      const response = await fetch(`/api/sessions/${encodeURIComponent(currentSessionIdRef.current)}/meta`, {
        credentials: 'include',
      });

      if (!response.ok) {
        console.warn(`[POLL] Meta fetch failed: ${response.status}`);
        return;
      }

      const data = await response.json();
      console.log(`[POLL] Received meta data:`, data);

      // Apply version-based caster updates (same logic as WebSocket)
      if (data.data?.casters && data.data?.version && data.data.version > castersVersion) {
        console.log(`[POLL] Applying polled caster update: version ${data.data.version}, ${data.data.casters.length} casters`);
        setCasters(data.data.casters);
        setCastersVersion(data.data.version);
        setLastCasterUpdate(new Date().toISOString());
        
        console.log(`[POLL] Applied update: ${data.data.casters.map((c: any) => c.name).join(', ')}`);
      } else if (data.data?.version) {
        console.log(`[POLL] No caster update needed: polled v${data.data.version}, current v${castersVersion}`);
      }
    } catch (error) {
      console.warn('[POLL] Session meta polling failed:', error);
    }
  }, [userIsAuthenticated, castersVersion]);

  // Start/stop polling functions - define before useEffect that references them
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    console.log(`[POLL] Starting fallback polling every ${POLLING_INTERVAL}ms`);
    pollingIntervalRef.current = setInterval(pollSessionMeta, POLLING_INTERVAL);
    
    // Run initial poll immediately
    pollSessionMeta();
  }, [pollSessionMeta]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log('[POLL] Stopped fallback polling');
    }
  }, []);

  // Load optimistic caster state on initialization
  useEffect(() => {
    try {
      const optimisticState = sessionStorage.getItem('booth_optimistic_casters');
      if (optimisticState) {
        const parsed = JSON.parse(optimisticState);
        console.log('[WS] Loading optimistic caster state:', parsed);
        
        // Apply optimistic state
        setCasters(parsed.casters || []);
        setCastersVersion(parsed.version || 0);
        setLastCasterUpdate(parsed.timestamp || null);
        
        // Track session ID for polling
        if (parsed.sessionId) {
          currentSessionIdRef.current = parsed.sessionId;
          console.log(`[WS] Tracking session ID for polling: ${parsed.sessionId.substring(0, 8)}...`);
        }
        
        console.log(`[WS] Applied optimistic state: ${parsed.casters?.length || 0} casters, version ${parsed.version}`);
      }
    } catch (error) {
      console.warn('[WS] Failed to load optimistic caster state:', error);
    }
  }, []);
  
  // Manage polling lifecycle based on WebSocket status
  useEffect(() => {
    const shouldPoll = POLLING_ENABLED_STATUSES.includes(connectionStatus) && 
                      currentSessionIdRef.current && 
                      userIsAuthenticated;
    
    if (shouldPoll) {
      console.log(`[POLL] Starting polling - status: ${connectionStatus}, session: ${currentSessionIdRef.current?.substring(0, 8)}...`);
      startPolling();
    } else {
      console.log(`[POLL] Stopping polling - status: ${connectionStatus}, session: ${!!currentSessionIdRef.current}`);
      stopPolling();
    }
    
    return () => stopPolling();
  }, [connectionStatus, userIsAuthenticated]);
  
  // Handle page visibility changes for polling
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && pollingIntervalRef.current) {
        console.log('[POLL] Page visible - resuming polling');
        // Restart polling to ensure immediate update on page focus
        if (POLLING_ENABLED_STATUSES.includes(connectionStatus) && currentSessionIdRef.current) {
          startPolling();
        }
      } else if (document.visibilityState === 'hidden') {
        console.log('[POLL] Page hidden - polling will skip until visible');
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [connectionStatus]);
  
  // Refs for connection management
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rateLimitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isManualDisconnectRef = useRef(false);
  const tokenRefreshAttemptsRef = useRef(0);
  const maxTokenRefreshAttempts = 2;
  
  // Polling fallback refs
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  
  // Constants for polling fallback
  const POLLING_INTERVAL = 8000; // 8 seconds
  const POLLING_ENABLED_STATUSES = ['disconnected', 'error', 'connecting', 'reconnecting'];

  // Silent token refresh function
  const attemptTokenRefresh = useCallback(async (): Promise<boolean> => {
    if (tokenRefreshAttemptsRef.current >= maxTokenRefreshAttempts) {
      console.log('[WS] Max token refresh attempts reached');
      return false;
    }

    try {
      tokenRefreshAttemptsRef.current++;
      console.log(`[WS] Attempting silent token refresh (attempt ${tokenRefreshAttemptsRef.current})`);
      
      // Invalidate and refetch user data to refresh session
      await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      const refreshedUser = await queryClient.fetchQuery({ queryKey: ['/api/user'] });
      
      if (refreshedUser && (refreshedUser as any)?.id) {
        console.log('[WS] Token refresh successful');
        tokenRefreshAttemptsRef.current = 0; // Reset on success
        return true;
      } else {
        console.log('[WS] Token refresh failed - no user data');
        return false;
      }
    } catch (error) {
      console.error('[WS] Token refresh failed:', error);
      return false;
    }
  }, []);


  // Helper functions for connection management
  const clearAllTimeouts = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (rateLimitTimeoutRef.current) {
      clearTimeout(rateLimitTimeoutRef.current);
      rateLimitTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    // Clear existing heartbeat interval and timeout only
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
    
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('[WS] Sending heartbeat ping');
        
        // Clear any existing heartbeat timeout before setting new one
        if (heartbeatTimeoutRef.current) {
          clearTimeout(heartbeatTimeoutRef.current);
        }
        
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
        
        // Set timeout to wait for pong response
        heartbeatTimeoutRef.current = setTimeout(() => {
          console.log('[WS] Heartbeat timeout - no pong received');
          wsRef.current?.close();
        }, HEARTBEAT_TIMEOUT);
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  const getReconnectDelay = useCallback(() => {
    const attempts = reconnectAttemptsRef.current;
    const delay = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, attempts), MAX_RECONNECT_DELAY);
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;
    return delay + jitter;
  }, []);

  const connect = useCallback(async () => {
    if (!userIsAuthenticated || !user) {
      console.log('[WS] User not authenticated, attempting token refresh before connect');
      
      // Attempt token refresh if user is not available
      if (tokenRefreshAttemptsRef.current < maxTokenRefreshAttempts) {
        const refreshSuccess = await attemptTokenRefresh();
        if (!refreshSuccess) {
          console.log('[WS] Token refresh failed, skipping WebSocket connection');
          setError('Authentication required. Please refresh the page or log in again.');
          return;
        }
        // If refresh succeeded, the useEffect will trigger a new connect attempt
        return;
      } else {
        console.log('[WS] Max token refresh attempts reached, skipping WebSocket connection');
        setError('Authentication required. Please refresh the page or log in again.');
        return;
      }
    }

    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Check if we've exceeded max reconnect attempts
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[WS] Max reconnect attempts reached');
      setConnectionStatus('error');
      setError(`Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts. Click to retry.`);
      return;
    }

    try {
      const isReconnect = reconnectAttemptsRef.current > 0;
      setConnectionStatus(isReconnect ? 'reconnecting' : 'connecting');
      setError(null);
      
      console.log(`[WS] ${isReconnect ? 'Reconnecting' : 'Connecting'} (attempt ${reconnectAttemptsRef.current + 1})`);
      
      const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${wsProto}://${window.location.host}/ws`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[WS] Connected successfully');
        setIsConnected(true);
        setConnectionStatus('connected');
        setError(null);
        reconnectAttemptsRef.current = 0; // Reset on successful connection
        
        // Send authentication
        if (wsRef.current && (user as any)?.id) {
          wsRef.current.send(JSON.stringify({
            type: 'authenticate',
            token: (user as any).id
          }));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('[WS] Error parsing message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log(`[WS] Disconnected (code: ${event.code}, reason: ${event.reason})`);
        setIsConnected(false);
        setIsAuthenticated(false);
        clearAllTimeouts();
        
        if (isManualDisconnectRef.current) {
          setConnectionStatus('disconnected');
          return;
        }
        
        setConnectionStatus('disconnected');
        reconnectAttemptsRef.current++;
        
        // Schedule reconnection with exponential backoff
        const delay = getReconnectDelay();
        console.log(`[WS] Scheduling reconnect in ${Math.round(delay)}ms`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (userIsAuthenticated && !isManualDisconnectRef.current) {
            connect();
          }
        }, delay);
      };

      wsRef.current.onerror = (error) => {
        console.error('[WS] Connection error:', error);
        setConnectionStatus('error');
        setError('Connection failed');
      };

    } catch (error) {
      console.error('[WS] Failed to create connection:', error);
      setConnectionStatus('error');
      setError('Failed to connect');
    }
  }, [userIsAuthenticated, user, clearAllTimeouts, getReconnectDelay, startHeartbeat]);

  const handleWebSocketMessage = useCallback((data: any) => {
    console.log('[WS] Message received:', data);

    switch (data.type) {
      case 'authenticated':
        setIsAuthenticated(true);
        setConnectionStatus('authenticated');
        console.log('[WS] Authentication successful, starting heartbeat');
        
        // Reset token refresh attempts on successful authentication
        tokenRefreshAttemptsRef.current = 0;
        
        startHeartbeat();
        
        // Rejoin current event if we were in one
        if (currentEventId && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'join_event',
            eventId: currentEventId
          }));
        }
        
        // Flush any queued messages
        if (pendingMessages.length > 0) {
          console.log(`[WS] Flushing ${pendingMessages.length} queued messages`);
          pendingMessages.forEach(pendingMsg => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: 'send_message',
                message: pendingMsg.text,
                eventId: currentEventId,
                casterId: pendingMsg.casterId
              }));
            }
          });
          setPendingMessages([]);
        }
        break;

      case 'auth_failed':
        setError(data.message);
        setConnectionStatus('error');
        
        // Attempt silent token refresh on auth failure
        console.log('[WS] Authentication failed, attempting token refresh');
        attemptTokenRefresh().then(refreshSuccess => {
          if (refreshSuccess) {
            console.log('[WS] Token refresh successful, retrying connection');
            // Retry connection with fresh token
            setTimeout(() => {
              if (!isManualDisconnectRef.current && userIsAuthenticated) {
                connect();
              }
            }, 1000);
          } else {
            console.log('[WS] Token refresh failed - authentication issue persists');
            setError('Authentication failed. Please refresh the page or log in again.');
          }
        }).catch(error => {
          console.error('[WS] Token refresh error:', error);
          setError('Authentication failed. Please refresh the page or log in again.');
        });
        break;

      case 'joined_event':
        setCurrentEventId(data.eventId);
        setMessages(data.recentMessages || []);
        break;

      case 'new_message':
        setMessages(prev => [...prev, data.message]);
        break;

      case 'pong':
        // Clear the heartbeat timeout since we received a pong
        if (heartbeatTimeoutRef.current) {
          clearTimeout(heartbeatTimeoutRef.current);
          heartbeatTimeoutRef.current = null;
        }
        console.log('[WS] Received pong - heartbeat OK');
        break;

      case 'rate_limited':
        setIsRateLimited(true);
        setError(data.message);
        
        // Clear any existing rate limit timeout
        if (rateLimitTimeoutRef.current) {
          clearTimeout(rateLimitTimeoutRef.current);
        }
        
        let timeUntilAllowed = 5000; // Default 5 seconds
        
        if (data.nextAllowedTime) {
          const nextTime = new Date(data.nextAllowedTime);
          setNextAllowedTime(nextTime);
          timeUntilAllowed = nextTime.getTime() - Date.now();
        } else if (data.retryAfterMs) {
          timeUntilAllowed = data.retryAfterMs;
          const nextTime = new Date(Date.now() + timeUntilAllowed);
          setNextAllowedTime(nextTime);
        }
        
        rateLimitTimeoutRef.current = setTimeout(() => {
          setIsRateLimited(false);
          setNextAllowedTime(null);
          setError(null);
        }, Math.max(timeUntilAllowed, 0));
        break;

      case 'error':
        setError(data.message);
        break;

      case 'user_joined':
        // Could show a notification that a user joined
        break;

      case 'user_left':
        // Could show a notification that a user left
        break;

      case 'session.casters.updated':
        // Handle caster updates with versioning and out-of-order protection
        const casterUpdate = data as CasterUpdateEvent;
        console.log(`[WS] Caster update received: version ${casterUpdate.version}, ${casterUpdate.casters.length} casters`);
        
        // Only apply updates with newer versions (out-of-order protection)
        if (casterUpdate.version > castersVersion) {
          setCasters(casterUpdate.casters);
          setCastersVersion(casterUpdate.version);
          setLastCasterUpdate(casterUpdate.timestamp);
          console.log(`[WS] Applied caster update: ${casterUpdate.casters.map(c => c.name).join(', ')}`);
          
          // Clear optimistic state now that we have authoritative data
          try {
            sessionStorage.removeItem('booth_optimistic_casters');
            console.log('[WS] Cleared optimistic caster state after WebSocket reconciliation');
          } catch (error) {
            console.warn('[WS] Failed to clear optimistic state:', error);
          }
        } else {
          console.log(`[WS] Ignoring older caster update: received v${casterUpdate.version}, current v${castersVersion}`);
        }
        break;

      default:
        console.log('[WS] Unknown message type:', data.type);
    }
  }, [startHeartbeat, currentEventId, pendingMessages]);

  const addToPendingQueue = useCallback((text: string, casterId?: string) => {
    const pendingMessage: PendingMessage = {
      id: Math.random().toString(36).substr(2, 9),
      text: text.trim(),
      casterId,
      timestamp: Date.now(),
      retryCount: 0
    };

    setPendingMessages(prev => {
      const newQueue = [...prev, pendingMessage];
      // Keep queue size manageable
      if (newQueue.length > MESSAGE_QUEUE_MAX_SIZE) {
        return newQueue.slice(-MESSAGE_QUEUE_MAX_SIZE);
      }
      return newQueue;
    });

    console.log('[WS] Message queued for later sending:', pendingMessage.id);
  }, []);

  const sendMessage = useCallback((text: string, casterId?: string) => {
    const trimmedText = text.trim();
    
    // Validate message
    if (!trimmedText) {
      setError('Message cannot be empty');
      return;
    }

    if (trimmedText.length > MESSAGE_MAX_LENGTH) {
      setError(`Message too long (max ${MESSAGE_MAX_LENGTH} characters)`);
      return;
    }

    if (!currentEventId) {
      setError('No event joined');
      return;
    }

    if (isRateLimited) {
      setError('You are sending messages too quickly. Please wait.');
      return;
    }

    // If not connected or authenticated, queue the message
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !isAuthenticated) {
      addToPendingQueue(trimmedText, casterId);
      setError('Connection lost. Message queued and will be sent when reconnected.');
      return;
    }

    try {
      wsRef.current.send(JSON.stringify({
        type: 'send_message',
        message: trimmedText,
        eventId: currentEventId,
        casterId
      }));
      console.log('[WS] Message sent successfully');
    } catch (error) {
      console.error('[WS] Failed to send message:', error);
      addToPendingQueue(trimmedText, casterId);
      setError('Failed to send message. Queued for retry.');
    }
  }, [isAuthenticated, isRateLimited, currentEventId, addToPendingQueue]);

  const joinEvent = useCallback((eventId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected to chat');
      return;
    }

    if (!isAuthenticated) {
      setError('Not authenticated');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'join_event',
      eventId
    }));
  }, [isAuthenticated]);

  const leaveEvent = useCallback(() => {
    setCurrentEventId(null);
    setMessages([]);
  }, []);

  // Connect when user becomes authenticated
  useEffect(() => {
    if (userIsAuthenticated && user) {
      connect();
    }

    return () => {
      isManualDisconnectRef.current = true;
      clearAllTimeouts();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, userIsAuthenticated, user]);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error && !isRateLimited) {
      const timeout = setTimeout(() => {
        setError(null);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [error, isRateLimited]);

  // Helper functions for message queue management
  const retryConnection = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  const resendFailedMessages = useCallback(() => {
    pendingMessages.forEach(pendingMsg => {
      sendMessage(pendingMsg.text, pendingMsg.casterId);
    });
    setPendingMessages([]);
  }, [pendingMessages]);

  return {
    messages,
    isConnected,
    isAuthenticated,
    sendMessage,
    joinEvent,
    leaveEvent,
    connectionStatus,
    error,
    isRateLimited,
    nextAllowedTime,
    currentEventId,
    pendingMessageCount: pendingMessages.length,
    retryConnection,
    resendFailedMessages,
    // Caster tracking
    casters,
    castersVersion,
    lastCasterUpdate
  };
}