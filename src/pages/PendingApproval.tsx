import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Clock, Mail, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import startupLeiriaLogo from '@/assets/startup-leiria.svg';

export default function PendingApproval() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [isChecking, setIsChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!profile?.id) return;
    setIsChecking(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('account_status')
        .eq('id', profile.id)
        .single();
      if (data?.account_status && data.account_status !== 'pending') {
        navigate('/');
      }
    } catch {
      // silent — next poll will retry
    } finally {
      setIsChecking(false);
    }
  }, [profile?.id, navigate]);

  // Poll every 30s while tab is visible, and once on focus.
  useEffect(() => {
    if (!profile?.id) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') checkStatus();
    }, 30000);
    const onFocus = () => checkStatus();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [profile?.id, checkStatus]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <img
              src={startupLeiriaLogo}
              alt="Startup Leiria"
              className="h-16 w-auto"
            />
          </div>
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-[hsl(var(--warning))]/10">
              <Clock className="h-8 w-8 text-[hsl(var(--warning))]" />
            </div>
          </div>
          <CardTitle className="text-2xl">{t('approval.pendingTitle', 'Account Pending Approval')}</CardTitle>
          <CardDescription className="text-base">
            {t('approval.pendingDescription', 'Your account is being reviewed by our team. You\'ll receive access once approved.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Mail className="h-4 w-4" />
              <span className="font-medium">{profile?.email}</span>
            </div>
            <p>{t('approval.responseTime', 'We typically respond within 2-3 business days.')}</p>
          </div>

          <Button
            variant="default"
            onClick={checkStatus}
            disabled={isChecking}
            className="w-full"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking
              ? t('approval.checking', 'Checking…')
              : t('approval.checkNow', 'Check status now')}
          </Button>

          <Button variant="outline" onClick={() => signOut()} className="w-full">
            <LogOut className="h-4 w-4 mr-2" />
            {t('auth.signOut')}
          </Button>

          <p className="text-xs text-muted-foreground">
            {t('approval.autoCheck', 'We check automatically every 30 seconds.')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
