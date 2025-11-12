import { useParams, useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Mic, MicOff, Volume2, VolumeX, Radio, Clock, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import AppHeader from "@/components/AppHeader";

export default function CohostJoin() {
  const { sessionId: rawSessionId, code } = useParams<{ sessionId?: string; code?: string }>();
  const [location, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  // Decode the sessionId from URL encoding (handles %3A -> : conversion) using useMemo
  const sessionId = useMemo(
    () => (rawSessionId ? decodeURIComponent(rawSessionId) : ''),
    [rawSessionId]
  );
  
  // Handle both old and new invite systems
  const urlParams = new URLSearchParams(window.location.search);
  const inviteToken = urlParams.get('invite');
  
  // Use code param for new system, fallback to query param for old system
  const inviteCode = code || inviteToken;
  
  console.log('[COHOST] incoming', { sessionId, code, invite: inviteToken, inviteCode });
  
  const [isJoining, setIsJoining] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{
    endpoint?: string;
    status?: number;
    contentType?: string;
    redirectLocation?: string;
    reason?: string;
    htmlPreview?: string;
    sessionId?: string;
    step?: string;
  } | null>(null);

  // For new invite system, get session info directly since invite was already consumed
  const { data: sessionData, isLoading: sessionDataLoading, error: sessionDataError } = useQuery({
    queryKey: ['session-meta', sessionId],
    enabled: !!sessionId && !!code && isAuthenticated, // Only for new invite system
    queryFn: async () => {
      const r = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/meta`, {
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`meta ${r.status}`);
      return r.json();
    },
  });

  // Legacy: Fetch session details for old invite system
  const { data: session, isLoading: sessionLoading, error: sessionError } = useQuery({
    queryKey: ['session-legacy-meta', sessionId],
    enabled: !!sessionId && !code, // Only if using old system
    queryFn: async () => {
      const r = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/meta`, {
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`meta ${r.status}`);
      return r.json();
    },
  });

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: [`/api/events/${(session as any)?.eventId}`, 'event'],
    enabled: !!(session as any)?.eventId && !code, // Only if using old system
  });

  const { data: host, isLoading: hostLoading } = useQuery({
    queryKey: [`/api/users/${(session as any)?.hostId}`, 'user'],
    enabled: !!(session as any)?.hostId && !code, // Only if using old system
  });

  // Extract data from the appropriate source
  const currentEvent = code ? (sessionData as any)?.event : event;
  const isLoadingData = code ? sessionDataLoading : (sessionLoading || eventLoading || hostLoading);

  // Redirect to auth if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth');
    }
  }, [isAuthenticated, navigate]);

  // Show error if no invite code provided
  if (!inviteCode) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex items-center justify-center p-4 min-h-[calc(100vh-64px)]">
          <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <UserPlus className="w-5 h-5" />
              Invalid Invite
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                This invite link is missing required information. Please ask your friend to send you a new invite link.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
        </div>
      </div>
    );
  }

  // Safe fetch helper that handles JSON/HTML detection and debugging
  const safeFetch = async (endpoint: string, options: RequestInit = {}) => {
    const response = await fetch(endpoint, {
      ...options,
      redirect: 'manual', // Catch unexpected redirects
      credentials: 'include' // Always include auth cookies
    });

    const contentType = response.headers.get('content-type') || '';
    const redirectLocation = response.headers.get('location');
    
    // Update debug info
    setDebugInfo(prev => ({
      ...prev,
      endpoint,
      status: response.status,
      contentType,
      redirectLocation: redirectLocation || undefined
    }));

    // Handle redirects
    if (response.status >= 300 && response.status < 400) {
      const error = new Error(`Unexpected redirect to ${redirectLocation}`);
      setDebugInfo(prev => ({
        ...prev,
        reason: error.message,
        step: 'redirect_error'
      }));
      throw error;
    }

    // Parse response based on content type
    if (contentType.includes('application/json')) {
      const data = await response.json();
      
      // For error responses, throw with the parsed data for structured error handling
      if (!response.ok) {
        const reason = data.reason || data.message || `HTTP ${response.status}`;
        setDebugInfo(prev => ({
          ...prev,
          reason,
          step: 'json_error_response'
        }));
        
        const error = new Error(reason);
        (error as any).data = data;
        (error as any).status = response.status;
        throw error;
      }
      
      return data;
    } else {
      const htmlText = await response.text();
      const htmlPreview = htmlText.substring(0, 120);
      
      setDebugInfo(prev => ({
        ...prev,
        htmlPreview,
        reason: `Expected JSON but got ${contentType || 'HTML'}`,
        step: 'content_type_error'
      }));
      
      throw new Error(`Expected JSON but got ${contentType || 'HTML'}: ${htmlPreview}`);
    }
  };

  const handleJoinAsCohost = async () => {
    if (!inviteCode) return;
    
    // Prevent double-clicks and multiple simultaneous attempts
    if (isJoining) {
      console.log('[UI:CONSUME] Already joining, ignoring duplicate request');
      return;
    }
    
    setIsJoining(true);
    try {
      // For new invite system, resolve the invite code to get event info and participant token
      if (inviteCode) {
        console.log('[UI:CONSUME] Attempting to consume invite:', inviteCode);
        setDebugInfo({ step: 'consume_start', endpoint: '/api/cohost/invites/consume' });
        
        let data;
        
        try {
          data = await safeFetch('/api/cohost/invites/consume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: inviteCode })
          });
          
          console.log('[UI:CONSUME] Success response:', data);
          setDebugInfo(prev => ({ ...prev, step: 'consume_success' }));
          
          // Session switching guard: Check if user is already in a different session
          const existingOptimistic = sessionStorage.getItem('booth_optimistic_casters');
          if (existingOptimistic) {
            try {
              const existingData = JSON.parse(existingOptimistic);
              if (existingData.sessionId && existingData.sessionId !== data.data.sessionId) {
                console.log('[UI:CONSUME] Session switch detected, clearing old optimistic state');
                sessionStorage.removeItem('booth_optimistic_casters');
              }
            } catch (e) {
              console.warn('[UI:CONSUME] Failed to parse existing optimistic state, clearing:', e);
              sessionStorage.removeItem('booth_optimistic_casters');
            }
          }
          
          // Apply optimistic caster updates if available
          if (data.data.casters && data.data.version) {
            console.log('[UI:CONSUME] Applying optimistic caster update:', data.data.casters);
            
            // Store optimistic caster state for useWebSocket to pick up
            const optimisticState = {
              sessionId: data.data.sessionId,
              casters: data.data.casters,
              version: data.data.version,
              timestamp: new Date().toISOString(),
              source: 'consume_optimistic'
            };
            
            sessionStorage.setItem('booth_optimistic_casters', JSON.stringify(optimisticState));
            console.log('[UI:CONSUME] Stored optimistic caster state for session:', data.data.sessionId);
          }
          
        } catch (fetchError: any) {
          console.log('[UI:CONSUME] Fetch error:', fetchError.message);
          
          // Handle auth redirect
          if (fetchError.status === 401) {
            const nextUrl = encodeURIComponent(location);
            console.log('[COHOST:AUTH] Redirecting to auth with next URL:', nextUrl);
            navigate(`/auth?next=${nextUrl}`);
            return;
          }
          
          // Handle network connectivity issues
          if (!fetchError.status || fetchError.status === 0) {
            throw new Error('network_error');
          }
          
          // Map HTTP status codes to user-friendly error messages
          if (fetchError.status === 410) {
            throw new Error('expired');
          } else if (fetchError.status === 404) {
            throw new Error('not_found');
          } else if (fetchError.status === 409) {
            throw new Error('used');
          } else if (fetchError.status >= 500) {
            throw new Error('server_error');
          }
          
          // Re-throw with debug info preserved
          throw fetchError;
        }
        
        // Extract inherited prefs from consume response (or fallback to meta fetch)
        let prefs = data.data.prefs;
        
        if (!prefs) {
          console.log('[COHOST:PREFS] No prefs in consume response, fetching from meta');
          setDebugInfo(prev => ({ ...prev, step: 'fetching_meta' }));
          
          try {
            const metaResponse = await safeFetch(`/api/sessions/${encodeURIComponent(data.data.sessionId)}/meta`);
            prefs = metaResponse.data?.prefs;
            console.log('[COHOST:PREFS] Fetched prefs from meta:', prefs);
          } catch (metaError) {
            console.warn('[COHOST:PREFS] Failed to fetch meta, proceeding without prefs:', metaError);
          }
        } else {
          console.log('[COHOST:PREFS] Using prefs from consume response:', prefs);
        }

        setDebugInfo(prev => ({ 
          ...prev, 
          sessionId: data.data.sessionId,
          step: 'navigate_start'
        }));
        
        toast({
          title: "Welcome as co-host!",
          description: "You're now ready to broadcast with your friend.",
        });
        
        // Clean up any previous session state before navigation
        console.log('[UI:CONSUME] Cleaning up previous session state before navigation');
        
        // Clear any stale WebSocket state that might interfere
        try {
          sessionStorage.removeItem('booth_ws_reconnect_data');
          sessionStorage.removeItem('booth_chat_state');
        } catch (e) {
          console.warn('[UI:CONSUME] Failed to clear previous session state:', e);
        }
        
        // Navigate to broadcaster page with skipSetup flag and inherited prefs
        const queryParams = new URLSearchParams({
          role: 'cohost',
          skipSetup: '1'
        });
        
        navigate(`/event/${data.data.event.id}/broadcast?${queryParams.toString()}`, {
          state: { 
            cohostToken: data.data.participantToken,
            sessionId: data.data.sessionId,
            isCohost: true,
            stageArn: data.data.stageArn,
            inheritedPrefs: prefs
          }
        });
      } else {
        // This should never happen since we check for inviteCode at the start
        throw new Error('No invite code available');
      }
    } catch (error: any) {
      console.error("Error joining as co-host:", error);
      
      // Capture error in debug info
      setDebugInfo(prev => ({ 
        ...prev, 
        reason: error.message || String(error),
        step: 'error_caught'
      }));
      
      let errorMessage = "This invite may have expired or been used already.";
      let errorTitle = "Could not join broadcast";
      
      // Enhanced error messages for debugging
      console.log('[COHOST:ERROR_HANDLER] Processing error:', error.message);
      
      if (error.message === 'expired' || error.message === 'invite_expired') {
        errorMessage = "This invite has expired. Please ask your friend for a new invite link.";
        errorTitle = "🕒 Invite Expired";
      } else if (error.message === 'used') {
        errorMessage = "This invite has already been used. Each invite can only be used once.";
        errorTitle = "🔒 Invite Already Used";
      } else if (error.message === 'session_mismatch' || error.message === 'session_not_found') {
        errorMessage = "The broadcasting session has ended. Please ask your friend to start a new session.";
        errorTitle = "📺 Session Ended";
      } else if (error.message === 'not_found' || error.message === 'invite_not_found') {
        errorMessage = "This invite link is invalid. Please check the link or ask for a new one.";
        errorTitle = "❌ Invalid Invite";
      } else if (error.message === 'network_error') {
        errorMessage = "Unable to connect to the server. Please check your internet connection and try again.";
        errorTitle = "🌐 Connection Error";
      } else if (error.message === 'server_error') {
        errorMessage = "There's a temporary server issue. Please try again in a moment.";
        errorTitle = "🔧 Server Error";
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsJoining(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading invite details...</p>
        </div>
      </div>
    );
  }

  // Handle session resolution errors for new system
  if (code && (sessionDataError || !sessionData)) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex items-center justify-center p-4 min-h-[calc(100vh-64px)]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <UserPlus className="w-5 h-5" />
                Invite Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertDescription>
                  This invite has expired or is no longer valid. Please ask your friend to send you a new invite link.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <UserPlus className="w-5 h-5" />
              Session Not Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                This broadcast session could not be found. It may have ended or the link is invalid.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex items-center justify-center p-4 min-h-[calc(100vh-64px)]">
        <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-xl">
            <Radio className="w-6 h-6 text-red-500" />
            Join as Co-Host
          </CardTitle>
          <p className="text-muted-foreground">
            You've been invited to co-cast a live sports commentary!
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Event and Host Info */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Event</p>
              <p className="font-semibold">{(event as any)?.title || 'Sports Event'}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-muted-foreground">Host</p>
              <div className="flex items-center gap-2">
                <p className="font-medium">{(host as any)?.screenname || 'Broadcaster'}</p>
                <Badge variant="secondary" className="text-xs">Host</Badge>
              </div>
            </div>
            
            <div>
              <p className="text-sm font-medium text-muted-foreground">Session Status</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium">Live Broadcasting</span>
              </div>
            </div>
          </div>

          {/* Debug Information (temporary) */}
          {debugInfo && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-2">Debug Info:</p>
              <div className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                <div>Endpoint: {debugInfo.endpoint || 'none'}</div>
                <div>Status: {debugInfo.status || 'pending'}</div>
                <div>Content-Type: {debugInfo.contentType || 'unknown'}</div>
                <div>Step: {debugInfo.step || 'init'}</div>
                {debugInfo.redirectLocation && <div>Redirect: {debugInfo.redirectLocation}</div>}
                {debugInfo.reason && <div>Reason: {debugInfo.reason}</div>}
                {debugInfo.htmlPreview && <div>HTML: {debugInfo.htmlPreview.substring(0, 60)}...</div>}
                {debugInfo.sessionId && <div>Session: {debugInfo.sessionId.substring(0, 18)}...</div>}
              </div>
            </div>
          )}

          {/* Co-hosting Info */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Co-Host Broadcasting
            </h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">•</span>
                You'll broadcast live to the same audience as your friend
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">•</span>
                Share the commentary and create engaging conversation
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-600 mt-0.5">•</span>
                Use headphones to prevent echo and feedback
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                This invite expires after use and cannot be shared
              </li>
            </ul>
          </div>

          {/* Audio Setup Reminder */}
          <Alert>
            <Volume2 className="w-4 h-4" />
            <AlertDescription>
              <strong>Important:</strong> Please use headphones or earbuds to prevent audio feedback when broadcasting together.
            </AlertDescription>
          </Alert>

          {/* Join Button */}
          <Button
            onClick={handleJoinAsCohost}
            disabled={isJoining}
            className="w-full gap-2"
            size="lg"
            data-testid="button-join-cohost"
          >
            <Mic className="w-4 h-4" />
            {isJoining ? "Joining Broadcast..." : "Join as Co-Host"}
          </Button>

          {/* User Info */}
          <div className="text-center text-sm text-muted-foreground">
            Joining as <span className="font-medium">{user?.screenname}</span>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}