import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { track } from '@/lib/analytics';
import { useAuth } from '@/contexts/AuthContext';
import { useFounderOnboardingState } from '@/hooks/useFounderOnboardingState';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Clock, Rocket, Shield, AlertCircle, ArrowRight, Plus } from 'lucide-react';
import { BackToHomeLink } from '@/components/ui/BackToHomeLink';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { CreateStartupDialog } from '@/components/founder/CreateStartupDialog';

type ClaimPageState = 'idle' | 'verifying' | 'auto_claimed' | 'already_claimed' | 'pending_review' | 'error';

export default function ClaimStartup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile, roles } = useAuth();
  const founderState = useFounderOnboardingState();

  const [pageState, setPageState] = useState<ClaimPageState>('idle');
  const [claimedStartupName, setClaimedStartupName] = useState<string | null>(null);
  const [claimedWorkspaceId, setClaimedWorkspaceId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Determine the effective display state based on founderState + pageState
  const getDisplayState = () => {
    // If we just ran the RPC, that takes priority
    if (
      pageState === 'verifying' ||
      pageState === 'auto_claimed' ||
      pageState === 'already_claimed' ||
      pageState === 'pending_review' ||
      pageState === 'error'
    ) {
      return pageState;
    }
    // Otherwise, use the read-only state
    if (founderState.isLoading) return 'loading' as const;
    if (founderState.status === 'error') return 'error' as const;
    if (founderState.status === 'needs_onboarding') return 'needs_onboarding' as const;
    if (founderState.status === 'has_active_workspace') return 'already_claimed' as const;
    if (founderState.status === 'has_pending_claim') return 'pending_review' as const;
    if (founderState.status === 'has_pending_workspace') return 'pending_application' as const;
    return 'ready_to_verify' as const;
  };

  const displayState = getDisplayState();

  // P0.1 Safety: non-founders should never see the claim UI
  // Strict profile-role guard: only 'founder' role may access this page
  useEffect(() => {
    if (!profile || roles.length === 0) return; // still loading
    const isFounder = roles.includes('founder');
    if (!isFounder) {
      navigate('/', { replace: true });
      return;
    }
    // Secondary guard via founderState for founders who are also staff
    if (
      !founderState.isLoading &&
      (founderState.status === 'not_founder' || founderState.status === 'staff_exempt')
    ) {
      navigate('/my-workspaces', { replace: true });
    }
  }, [profile, founderState.isLoading, founderState.status, navigate]);

  const handleVerify = useCallback(async () => {
    if (!user) return;
    setPageState('verifying');
    void track('claim_started');

    try {
      const { data, error } = await supabase.rpc('claim_startup');
      if (error) {
        logger.error('claim_rpc_failed', { userId: user.id.slice(0, 8) }, error);
        setPageState('error');
        return;
      }

      const result = data as { status: string; startup_name?: string; workspace_id?: string; message?: string };

      if (result.status === 'auto_claimed') {
        setPageState('auto_claimed');
        setClaimedStartupName(result.startup_name || null);
        setClaimedWorkspaceId(result.workspace_id || null);
        void track('claim_completed', { workspaceId: result.workspace_id, properties: { mode: 'auto' } });
        // Invalidate onboarding state so routing updates
        queryClient.invalidateQueries({ queryKey: ['founder-onboarding-state'] });
        toast({
          title: t('claimStartup.claimedTitle', { defaultValue: 'Startup verificada!' }),
          description: t('claimStartup.claimedDesc', { defaultValue: 'A sua startup foi associada automaticamente à sua conta.' }),
        });
        setTimeout(() => {
          if (result.workspace_id) {
            navigate(`/workspace/${result.workspace_id}`, { replace: true });
          } else {
            navigate('/my-workspaces', { replace: true });
          }
        }, 2500);
      } else if (result.status === 'already_claimed' || result.status === 'already_member') {
        setPageState('already_claimed');
        queryClient.invalidateQueries({ queryKey: ['founder-onboarding-state'] });
        queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        setTimeout(() => navigate('/my-workspaces', { replace: true }), 1500);
      } else if (result.status === 'pending' || result.status === 'pending_review') {
        setPageState('pending_review');
        queryClient.invalidateQueries({ queryKey: ['founder-onboarding-state'] });
      } else {
        logger.error('claim_unknown_status', { status: result.status });
        setPageState('error');
      }
    } catch (err) {
      logger.error('claim_unexpected_error', { userId: user?.id?.slice(0, 8) }, err);
      setPageState('error');
    }
  }, [user, navigate, t, queryClient]);

  return (
    <main data-testid="claim-startup-page" className="relative flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="absolute top-4 left-4">
        <BackToHomeLink />
      </div>
      <Card className="w-full max-w-md shadow-lg border-border/60">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Rocket className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-heading">
            {t('claimStartup.title', { defaultValue: 'Verificar a sua Startup' })}
          </CardTitle>
          <CardDescription className="max-w-sm mx-auto text-sm">
            {t('claimStartup.subtitle', { defaultValue: 'Vamos verificar se a sua startup já está preparada no sistema e associá-la à sua conta.' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">

          {/* LOADING — hook is resolving */}
          {displayState === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {t('common.loading', { defaultValue: 'A carregar...' })}
              </p>
            </div>
          )}

          {/* READY TO VERIFY — primary CTA */}
          {displayState === 'ready_to_verify' && (
            <div className="flex flex-col items-center gap-5 py-6 text-center w-full">
              {/* How it works — step by step */}
              <div className="w-full space-y-2.5 text-left">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                  {t('claimStartup.howItWorksTitle', { defaultValue: 'Como funciona' })}
                </p>
                {[
                  { step: '1', text: t('claimStartup.step1', { defaultValue: 'Verificamos se existe uma startup associada ao seu email no nosso sistema.' }) },
                  { step: '2', text: t('claimStartup.step2', { defaultValue: 'Se encontrarmos, a startup é associada automaticamente à sua conta.' }) },
                  { step: '3', text: t('claimStartup.step3', { defaultValue: 'Se não, o pedido é enviado para a equipa para revisão manual.' }) },
                ].map(({ step, text }) => (
                  <div key={step} className="flex items-start gap-3 px-1">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">{step}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-4 py-2.5 w-full">
                <Shield className="h-4 w-4 text-primary shrink-0" />
                <span>{t('claimStartup.securityNote', { defaultValue: 'Processo seguro e confidencial. Os seus dados não são partilhados externamente.' })}</span>
              </div>

              <Button onClick={handleVerify} size="lg" className="gap-2 w-full max-w-xs shadow-lg">
                <Rocket className="h-5 w-5" />
                {t('claimStartup.verifyCta', { defaultValue: 'Verificar Agora' })}
              </Button>

              <div className="w-full border-t pt-4 mt-2">
                <p className="text-xs text-muted-foreground mb-3">
                  {t('claimStartup.newStartupHint', { defaultValue: 'Tem uma startup nova que ainda não está no sistema?' })}
                </p>
                <Button variant="outline" onClick={() => setShowCreateDialog(true)} className="gap-2 w-full max-w-xs">
                  <Plus className="h-4 w-4" />
                  {t('claimStartup.submitApplication', { defaultValue: 'Submeter Candidatura' })}
                </Button>
              </div>
            </div>
          )}

          {/* VERIFYING — RPC in progress */}
          {displayState === 'verifying' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground font-medium">
                {t('claimStartup.searching', { defaultValue: 'A verificar a sua startup...' })}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {t('claimStartup.searchingHint', { defaultValue: 'Isto demora apenas alguns segundos.' })}
              </p>
            </div>
          )}

          {/* AUTO CLAIMED — success */}
          {displayState === 'auto_claimed' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="h-16 w-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center ring-1 ring-emerald-200 dark:ring-emerald-800/30">
                <CheckCircle2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-lg font-semibold text-foreground">
                {t('claimStartup.found', { defaultValue: 'Startup verificada com sucesso!' })}
              </p>
              {claimedStartupName && (
                <Badge variant="default" className="text-sm px-3 py-1">{claimedStartupName}</Badge>
              )}
              <p className="text-sm text-muted-foreground">
                {t('claimStartup.redirecting', { defaultValue: 'A redirecionar para o seu espaço de trabalho...' })}
              </p>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* ALREADY CLAIMED — user already has a workspace */}
          {displayState === 'already_claimed' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="text-lg font-semibold text-foreground">
                {t('claimStartup.alreadyLinked', { defaultValue: 'A sua startup já está associada' })}
              </p>
              {founderState.startupName && (
                <Badge variant="default" className="text-sm px-3 py-1">{founderState.startupName}</Badge>
              )}
              <Button onClick={() => navigate('/my-workspaces', { replace: true })} className="gap-2 mt-2">
                <ArrowRight className="h-4 w-4" />
                {t('claimStartup.goToWorkspace', { defaultValue: 'Ir para o meu espaço de trabalho' })}
              </Button>
            </div>
          )}

          {/* PENDING REVIEW — claim request submitted, awaiting staff */}
          {(displayState === 'pending_review') && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="h-16 w-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center ring-1 ring-amber-200 dark:ring-amber-800/30">
                <Clock className="h-9 w-9 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-lg font-semibold text-foreground">
                {t('claimStartup.pendingTitle', { defaultValue: 'Pedido em Análise' })}
              </p>
              <p className="text-sm text-muted-foreground max-w-xs">
                {t('claimStartup.pendingDesc', { defaultValue: 'Não encontrámos uma correspondência automática. A equipa irá analisar o seu pedido e associá-lo manualmente.' })}
              </p>
              <div className="bg-muted/50 rounded-lg px-4 py-2.5 text-xs text-muted-foreground">
                <p>{profile?.email}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{t('claimStartup.pendingTiming', { defaultValue: 'Receberá uma notificação por email assim que a equipa revir o seu pedido.' })}</span>
              </div>
              <p className="text-xs text-muted-foreground/60 max-w-xs">
                {t('claimStartup.pendingReassurance', { defaultValue: 'Não precisa de fazer mais nada. Receberá acesso assim que a equipa confirmar.' })}
              </p>

              <div className="w-full border-t pt-4 mt-2">
                <p className="text-xs text-muted-foreground mb-3">
                  {t('claimStartup.orSubmitNew', { defaultValue: 'Ou, se preferir, pode submeter uma candidatura de nova startup:' })}
                </p>
                <Button variant="outline" onClick={() => setShowCreateDialog(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t('claimStartup.submitApplication', { defaultValue: 'Submeter Candidatura' })}
                </Button>
              </div>
            </div>
          )}

          {/* PENDING APPLICATION — founder submitted a new startup */}
          {displayState === 'pending_application' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="h-16 w-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center ring-1 ring-amber-200 dark:ring-amber-800/30">
                <Clock className="h-9 w-9 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-lg font-semibold text-foreground">
                {t('claimStartup.applicationPendingTitle', { defaultValue: 'Candidatura em Análise' })}
              </p>
              {founderState.startupName && (
                <Badge variant="secondary" className="text-sm px-3 py-1">{founderState.startupName}</Badge>
              )}
              <p className="text-sm text-muted-foreground max-w-xs">
                {t('claimStartup.applicationPendingDesc', { defaultValue: 'A sua candidatura foi recebida e está a ser analisada pela nossa equipa. Será notificado assim que for aprovada.' })}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{t('claimStartup.pendingTiming', { defaultValue: 'Receberá uma notificação por email assim que a equipa revir o seu pedido.' })}</span>
              </div>
            </div>
          )}

          {/* NEEDS ONBOARDING — workspace assigned by admin, founder must complete wizard */}
          {displayState === 'needs_onboarding' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                <Rocket className="h-9 w-9 text-primary" />
              </div>
              <p className="text-lg font-semibold text-foreground">
                {t('claimStartup.onboardingTitle', { defaultValue: 'Bem-vindo à Startup Leiria!' })}
              </p>
              {founderState.startupName && (
                <Badge variant="default" className="text-sm px-3 py-1">{founderState.startupName}</Badge>
              )}
              <p className="text-sm text-muted-foreground max-w-xs">
                {t('claimStartup.onboardingDesc', { defaultValue: 'O seu workspace foi preparado pela nossa equipa. Complete o processo de onboarding para começar a utilizar a plataforma.' })}
              </p>
              <Button 
                onClick={() => {
                  // Navigate to the workspace with onboarding wizard — do NOT clear needs_onboarding here
                  if (founderState.activeWorkspaceId) {
                    navigate(`/workspace/${founderState.activeWorkspaceId}?onboarding=true`, { replace: true });
                  }
                }} 
                size="lg" 
                className="gap-2 w-full max-w-xs shadow-lg"
              >
                <ArrowRight className="h-5 w-5" />
                {t('claimStartup.startOnboarding', { defaultValue: 'Iniciar Onboarding' })}
              </Button>
            </div>
          )}


          {displayState === 'error' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="text-sm font-medium text-foreground">
                {t('claimStartup.errorTitle', { defaultValue: 'Erro na verificação' })}
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {t('claimStartup.error', { defaultValue: 'Ocorreu um erro temporário. Os seus dados estão seguros. Por favor tente novamente.' })}
              </p>
              <Button onClick={() => setPageState('idle')} variant="outline" className="gap-2">
                {t('common.retry', { defaultValue: 'Tentar novamente' })}
              </Button>
            </div>
          )}

        </CardContent>
      </Card>

      <CreateStartupDialog 
        open={showCreateDialog} 
        onOpenChange={setShowCreateDialog} 
      />
    </main>
  );
}
