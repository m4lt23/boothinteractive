import { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, CheckCircle2, Clock, Users, XCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// New types for split peek/consume flow
type InvitePeekResponse = {
  valid: true;
  invite: {
    sessionId: string;
    expiresAt: string;
    event: {
      id: string;
      title: string;
      startTime: string;
    };
  };
} | {
  valid: false;
  reason: 'expired' | 'used' | 'not_found' | 'session_mismatch';
  message?: string;
};

type InviteConsumeResponse = {
  success: true;
  data: {
    sessionId: string;
    participantToken: string;
    stageArn: string;
    event: {
      id: string;
      title: string;
      startTime: string;
    };
  };
} | {
  success: false;
  reason: 'expired' | 'used' | 'not_found' | 'session_mismatch' | 'auth_required';
  message?: string;
};

export default function CohostJoinPage() {
  const [match, params] = useRoute('/cohost/j/:code');
  const { toast } = useToast();
  const [isJoining, setIsJoining] = useState(false);
  
  const code = params?.code;

  // Peek invite on mount (non-consuming)
  const { data, isLoading, error } = useQuery({
    queryKey: ['invite-peek', code],
    queryFn: async () => {
      if (!code) throw new Error('Missing invite code');
      
      console.log(`[UI:PEEK] Peeking invite ${code}`);
      
      const response = await fetch(`/api/cohost/invites/peek?code=${encodeURIComponent(code)}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.log(`[UI:PEEK] Error response:`, errorData);
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      const result = await response.json() as InvitePeekResponse;
      console.log(`[UI:PEEK] Result:`, result);
      
      return result;
    },
    enabled: !!code,
  });

  // Join the co-host session (consume invite)
  const joinSession = async (code: string) => {
    setIsJoining(true);
    
    // Store debug info in sessionStorage
    const storeDebugInfo = (step: string, data?: any) => {
      const debugInfo = {
        step,
        endpoint: '/api/cohost/invites/consume',
        timestamp: Date.now(),
        ...data
      };
      sessionStorage.setItem('cohostDebug', JSON.stringify(debugInfo));
    };
    
    try {
      console.log(`[UI:CONSUME] Consuming invite ${code}`);
      storeDebugInfo('consume_start');

      // Consume the invite (this marks it as used and returns participant token)
      const response = await fetch(`/api/cohost/invites/consume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ code })
      });

      const consumeResult = await response.json() as InviteConsumeResponse;
      console.log(`[UI:CONSUME] Result:`, consumeResult);

      if (!response.ok || !consumeResult.success) {
        // Handle specific error reasons
        const reason = consumeResult.success === false ? consumeResult.reason : 'unknown';
        console.error(`[UI:CONSUME] Failed with reason: ${reason}`);
        storeDebugInfo('consume_error', { status: response.status, reason });
        
        const errorMessage = reason === 'used' 
          ? 'This invite has already been used and cannot be used again.'
          : reason === 'expired'
          ? 'This invite has expired. Please ask the host for a new invite.'
          : reason === 'auth_required'
          ? 'Please log in to join the session.'
          : 'Invite could not be used. Please ask the host for a new link.';
          
        throw new Error(errorMessage);
      }

      // GUARDRAIL: Validate consume payload before saving anywhere
      const { participantToken, sessionId: consumeSessionId, stageArn } = consumeResult.data;
      
      // Validate participantToken is nonempty string
      if (!participantToken || typeof participantToken !== 'string' || participantToken.trim() === '') {
        console.error('[UI:CONSUME] Invalid participantToken:', { hasToken: !!participantToken, type: typeof participantToken });
        throw new Error('Invalid participant token received from server');
      }
      
      // Validate sessionId matches what peek returned (if peek data available)
      if (data && data.valid && data.invite.sessionId !== consumeSessionId) {
        console.error('[UI:CONSUME] sessionId mismatch:', { 
          peekSessionId: data.invite.sessionId, 
          consumeSessionId 
        });
        throw new Error('Session ID mismatch - invite may have been tampered with');
      }
      
      // Validate required fields
      if (!consumeSessionId || !stageArn) {
        console.error('[UI:CONSUME] Missing required fields:', { 
          hasSessionId: !!consumeSessionId, 
          hasStageArn: !!stageArn 
        });
        throw new Error('Incomplete response from server');
      }
      
      console.log('[UI:CONSUME] Validation passed - all required fields present');

      storeDebugInfo('consume_success', { 
        status: response.status, 
        sessionId: consumeSessionId,
        participantId: participantToken?.slice(-8) 
      });

      const eventTitle = consumeResult.data.event.title;

      // GUARDRAIL: Persist credentials via both navigation state AND sessionStorage
      const cohostCreds = {
        participantToken,
        sessionId: consumeSessionId,
        stageArn,
        inviteCode: code
      };
      
      // Store in sessionStorage with exact key Broadcaster.tsx expects
      sessionStorage.setItem('cohostCreds', JSON.stringify(cohostCreds));
      sessionStorage.setItem('cohostJoinFlow', 'consume_ok');
      console.log('[UI:CONSUME] Stored cohostCreds in sessionStorage:', {
        hasToken: !!participantToken,
        sessionId: consumeSessionId,
        hasStageArn: !!stageArn
      });

      toast({
        title: "Welcome as co-host!",
        description: `Connecting to "${eventTitle}"...`
      });

      storeDebugInfo('navigate_start', { eventId: consumeResult.data.event.id });

      // Navigate with both state AND sessionStorage persistence
      const queryParams = new URLSearchParams({
        role: 'cohost',
        skipSetup: '1'
      });
      
      // Navigate with state (primary method) - use window.history.pushState for state handling
      const targetUrl = `/event/${consumeResult.data.event.id}/broadcast?${queryParams.toString()}`;
      
      console.log('[UI:CONSUME] Navigating with cohostCreds in state and storage');
      
      // Use window.history.pushState to pass state and then trigger navigation
      window.history.replaceState(
        { cohostCreds, joinFlow: 'consume_ok' }, 
        '', 
        targetUrl
      );
      
      // Force navigation to the new URL
      window.location.href = targetUrl;
      
    } catch (err: any) {
      console.error('[UI:CONSUME] Join failed:', err);
      storeDebugInfo('error_caught', { error: err.message });
      
      toast({
        title: "Connection failed",
        description: err.message || "Invite could not be used. Please ask the host for a new link.",
        variant: "destructive"
      });
    } finally {
      setIsJoining(false);
    }
  };

  // Handle different invite states
  const renderInviteStatus = () => {
    if (isLoading) {
      return (
        <Card className="max-w-md mx-auto mt-8" data-testid="card-loading">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Validating invite...</span>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (error) {
      return (
        <Card className="max-w-md mx-auto mt-8" data-testid="card-error">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <span>Connection Error</span>
            </CardTitle>
            <CardDescription>
              Unable to validate the invite
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error.message}
              </AlertDescription>
            </Alert>
            <Button 
              onClick={() => window.location.reload()} 
              className="w-full mt-4"
              data-testid="button-retry"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (!data) {
      return (
        <Card className="max-w-md mx-auto mt-8" data-testid="card-no-data">
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              No invite data received
            </div>
          </CardContent>
        </Card>
      );
    }

    // Handle error reasons (peek failed)
    if (!data.valid) {
      const getErrorIcon = () => {
        switch (data.reason) {
          case 'expired': return <Clock className="h-5 w-5 text-orange-500" />;
          case 'used': return <CheckCircle2 className="h-5 w-5 text-blue-500" />;
          case 'not_found': return <XCircle className="h-5 w-5 text-destructive" />;
          case 'session_mismatch': return <Users className="h-5 w-5 text-yellow-500" />;
          default: return <AlertCircle className="h-5 w-5 text-destructive" />;
        }
      };

      const getErrorTitle = () => {
        switch (data.reason) {
          case 'expired': return 'Invite Expired';
          case 'used': return 'Invite Already Used';
          case 'not_found': return 'Invite Not Found';
          case 'session_mismatch': return 'Session Ended';
          default: return 'Invalid Invite';
        }
      };

      const getErrorMessage = () => {
        switch (data.reason) {
          case 'expired': return 'This invite has expired. Please ask the host for a new invite.';
          case 'used': return 'This invite has already been used and cannot be used again.';
          case 'not_found': return 'This invite code is not valid or has been removed.';
          case 'session_mismatch': return 'The live session for this invite has ended.';
          default: return data.message || 'Unknown error occurred';
        }
      };

      return (
        <Card className="max-w-md mx-auto mt-8" data-testid={`card-error-${data.reason}`}>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {getErrorIcon()}
              <span>{getErrorTitle()}</span>
            </CardTitle>
            <CardDescription>
              {getErrorMessage()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => window.location.href = '/'} 
              className="w-full"
              data-testid="button-go-home"
            >
              Go to Home
            </Button>
          </CardContent>
        </Card>
      );
    }

    // Success - show event details and join button (peek was valid)
    if (data.valid && data.invite) {
      return (
        <Card className="max-w-md mx-auto mt-8" data-testid="card-success">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span>Ready to Join</span>
            </CardTitle>
            <CardDescription>
              You've been invited to co-host this event
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold" data-testid="text-event-title">
                {data.invite.event.title}
              </h3>
              <p className="text-sm text-muted-foreground" data-testid="text-event-time">
                {new Date(data.invite.event.startTime).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground" data-testid="text-expire-time">
                Expires: {new Date(data.invite.expiresAt).toLocaleString()}
              </p>
            </div>
            
            <Button 
              onClick={() => code && joinSession(code)}
              disabled={isJoining || !code}
              className="w-full"
              data-testid="button-join-session"
            >
              {isJoining ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <Users className="mr-2 h-4 w-4" />
                  Join as Co-Host
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  if (!match || !code) {
    return (
      <div className="container mx-auto p-4" data-testid="container-invalid-url">
        <Card className="max-w-md mx-auto mt-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <span>Invalid URL</span>
            </CardTitle>
            <CardDescription>
              The invite link is malformed or incomplete
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => window.location.href = '/'} 
              className="w-full"
              data-testid="button-go-home-invalid"
            >
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4" data-testid="container-cohost-join">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">
          Co-Host Invite
        </h1>
        <p className="text-muted-foreground mt-2" data-testid="text-page-description">
          Join a live sports commentary session
        </p>
      </div>

      {renderInviteStatus()}
    </div>
  );
}