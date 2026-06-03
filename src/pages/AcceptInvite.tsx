import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle, XCircle, Mail, LogIn } from 'lucide-react';
import { BackToHomeLink } from '@/components/ui/BackToHomeLink';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';

type InviteStatus = 'loading' | 'needs_login' | 'processing' | 'success' | 'error';

export default function AcceptInvite() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAuthReady } = useAuth();
  
  const [status, setStatus] = useState<InviteStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [expectedEmail, setExpectedEmail] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  
  const token = searchParams.get('token');
  
  useEffect(() => {
    if (!isAuthReady) return;
    
    if (!token) {
      setStatus('error');
      setError(t('invite.invalidToken'));
      return;
    }
    
    if (!user) {
      setStatus('needs_login');
      // Token is always re-read from the URL on return; no need to persist.
      return;
    }
    
    // User is logged in, process the invitation
    processInvitation(token);
  }, [token, user, isAuthReady]);
  
  const processInvitation = async (inviteToken: string) => {
    setStatus('processing');
    
    try {
      const { data, error } = await supabase.functions.invoke('accept-workspace-invite', {
        body: { token: inviteToken }
      });
      
      if (error) {
        logger.error('Error accepting invite', {}, error);
        setStatus('error');
        setError(error.message || t('invite.acceptFailed'));
        return;
      }
      
      if (data.error) {
        setStatus('error');
        setError(data.error);
        if (data.expectedEmail) {
          setExpectedEmail(data.expectedEmail);
        }
        if (data.workspaceId) {
          setWorkspaceId(data.workspaceId);
        }
        return;
      }
      
      // Success!
      setStatus('success');
      setWorkspaceId(data.workspaceId);
      
      // (no token cleanup needed — token lives only in the URL)
      
      notify.success(t('invite.acceptedSuccess'));
      
      // Redirect to workspace after a brief delay
      setTimeout(() => {
        const redirectUrl = data.showOnboarding 
          ? `/workspace/${data.workspaceId}?onboarding=true`
          : `/workspace/${data.workspaceId}`;
        navigate(redirectUrl);
      }, 2000);
      
    } catch (err) {
      logger.error('Failed to accept invitation', {}, err);
      setStatus('error');
      setError(t('invite.acceptFailed'));
    }
  };
  
  const handleLogin = () => {
    // Redirect to login with return URL - use /login not /auth
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
    navigate(`/login?returnTo=${returnUrl}`);
  };

  const handleSignup = () => {
    // Redirect to signup with return URL
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
    navigate(`/login?mode=signup&returnTo=${returnUrl}`);
  };
  
  const handleGoToWorkspace = () => {
    if (workspaceId) {
      navigate(`/workspace/${workspaceId}`);
    }
  };
  
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-background p-4">
      <div className="absolute top-4 left-4">
        <BackToHomeLink />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            {status === 'loading' || status === 'processing' ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : status === 'success' ? (
              <CheckCircle className="h-6 w-6 text-green-500" />
            ) : status === 'needs_login' ? (
              <Mail className="h-6 w-6 text-primary" />
            ) : (
              <XCircle className="h-6 w-6 text-destructive" />
            )}
            {status === 'loading' && t('invite.verifying')}
            {status === 'needs_login' && t('invite.loginRequired')}
            {status === 'processing' && t('invite.processing')}
            {status === 'success' && t('invite.accepted')}
            {status === 'error' && t('invite.error')}
          </CardTitle>
          <CardDescription>
            {status === 'loading' && t('invite.verifyingDesc')}
            {status === 'needs_login' && t('invite.loginRequiredDesc')}
            {status === 'processing' && t('invite.processingDesc')}
            {status === 'success' && t('invite.acceptedDesc')}
            {status === 'error' && error}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {status === 'needs_login' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                {t('invite.loginToAccept')}
              </p>
              <Button onClick={handleLogin} className="w-full gap-2">
                <LogIn className="h-4 w-4" />
                {t('auth.signIn')}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                {t('invite.noAccountYet')}{' '}
                <button 
                  onClick={handleSignup}
                  className="text-primary hover:underline"
                >
                  {t('auth.signUp')}
                </button>
              </p>
            </div>
          )}
          
          {status === 'error' && expectedEmail && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t('invite.wrongEmail', { email: expectedEmail })}
              </p>
            </div>
          )}
          
          {status === 'error' && workspaceId && (
            <Button onClick={handleGoToWorkspace} variant="outline" className="w-full">
              {t('invite.goToWorkspace')}
            </Button>
          )}
          
          {status === 'success' && (
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                {t('invite.redirecting')}
              </p>
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" />
            </div>
          )}
          
          {status === 'error' && !workspaceId && (
            <Button onClick={() => navigate('/')} variant="outline" className="w-full">
              {t('common.back')}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
