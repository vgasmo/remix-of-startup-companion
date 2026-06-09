/**
 * Enrollment Control Center
 * Admin-facing surface to understand and manage founder enrollment mode.
 * Read-only operational visibility + feature flag control for `open_registration`.
 */

import { useTranslation } from 'react-i18next';
import { 
  ShieldCheck, Users, Rocket, AlertCircle, CheckCircle2, 
  Clock, UserPlus, Lock, Globe, Info, ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useFeatureFlag, useFeatureFlags, useUpdateFeatureFlag } from '@/hooks/useFeatureFlags';
import { useAdminDashboardStats } from '@/hooks/useAdminDashboardStats';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { cn } from '@/lib/utils';

export function EnrollmentControlCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isOpenRegistration = useFeatureFlag('open_registration');
  const { data: flags } = useFeatureFlags();
  const updateFlag = useUpdateFeatureFlag();
  const { data: stats } = useAdminDashboardStats();

  // Fetch real claim queue count
  const { data: claimStats } = useQuery({
    queryKey: ['enrollment-claim-stats'],
    queryFn: async () => {
      const [claimsRes, unclaimedRes, pendingProfilesRes] = await Promise.all([
        supabase.from('startup_claim_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('workspaces').select('id', { count: 'exact', head: true }).eq('status', 'imported_unclaimed'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'pending'),
      ]);
      return {
        pendingClaims: claimsRes.count ?? 0,
        unclaimedWorkspaces: unclaimedRes.count ?? 0,
        pendingProfiles: pendingProfilesRes.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  const openRegFlag = flags?.find(f => f.key === 'open_registration' && f.scope === 'global');

  const handleToggleEnrollment = () => {
    if (!openRegFlag) {
      notify.error(t('enrollment.flagNotFound', { defaultValue: 'Feature flag "open_registration" not found. Create it in Feature Flags.' }));
      return;
    }
    updateFlag.mutate(
      { id: openRegFlag.id, enabled: !openRegFlag.enabled },
      {
        onSuccess: () => {
          notify.success(
            !openRegFlag.enabled
              ? t('enrollment.opened', { defaultValue: 'Enrollment opened — founders can now self-register.' })
              : t('enrollment.closed', { defaultValue: 'Enrollment closed — invite-only mode active.' })
          );
        },
      }
    );
  };

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            'h-9 w-9 rounded-xl flex items-center justify-center',
            isOpenRegistration ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
          )}>
            {isOpenRegistration ? (
              <Globe className="h-4 w-4 text-emerald-600" />
            ) : (
              <Lock className="h-4 w-4 text-amber-600" />
            )}
          </div>
          <div>
            <CardTitle className="text-base">
              {t('enrollment.title', { defaultValue: 'Enrollment & Access Control' })}
            </CardTitle>
            <CardDescription className="text-xs">
              {t('enrollment.description', { defaultValue: 'Controle como fundadores acedem à plataforma' })}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Mode */}
        <div className={cn(
          'flex items-center justify-between p-3 rounded-xl border',
          isOpenRegistration 
            ? 'border-emerald-200 dark:border-emerald-800/30 bg-emerald-50/50 dark:bg-emerald-950/10' 
            : 'border-amber-200 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-950/10'
        )}>
          <div className="flex items-center gap-3">
            <Badge variant={isOpenRegistration ? 'default' : 'secondary'} className="text-xs">
              {isOpenRegistration
                ? t('enrollment.modeOpen', { defaultValue: 'Registo Aberto' })
                : t('enrollment.modeInviteOnly', { defaultValue: 'Apenas Convite' })
              }
            </Badge>
            <span className="text-xs text-muted-foreground">
              {isOpenRegistration
                ? t('enrollment.modeOpenDesc', { defaultValue: 'Fundadores podem criar contas livremente' })
                : t('enrollment.modeInviteDesc', { defaultValue: 'Apenas emails na allowlist podem registar-se' })
              }
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="enrollment-toggle" className="text-xs text-muted-foreground">
              {isOpenRegistration ? t('common.on', 'ON') : t('common.off', 'OFF')}
            </Label>
            <Switch
              id="enrollment-toggle"
              checked={isOpenRegistration}
              onCheckedChange={handleToggleEnrollment}
              disabled={!openRegFlag || updateFlag.isPending}
            />
          </div>
        </div>

        {/* Explanatory copy */}
        <div className="flex gap-2 p-2.5 rounded-lg bg-muted/50 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/60" />
          <div className="space-y-1">
            <p><strong>{t('enrollment.modeOpenLabel', { defaultValue: 'Registo Aberto:' })}</strong> {t('enrollment.explainer1', { defaultValue: 'Novos fundadores podem criar conta. O claim de startup importada continua ativo.' })}</p>
            <p><strong>{t('enrollment.modeInviteLabel', { defaultValue: 'Apenas Convite:' })}</strong> {t('enrollment.explainer2', { defaultValue: 'Apenas emails na allowlist (signup_allowlist) podem registar-se. Útil para lançamentos controlados.' })}</p>
            <p className="mt-1 italic">{t('enrollment.claimExplainer', { defaultValue: 'O fluxo de claim é independente do modo de registo: após login, founders verificam se a sua startup já está no sistema.' })}</p>
          </div>
        </div>

        <Separator />

        {/* Operational Readiness Signals */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {t('enrollment.readinessTitle', { defaultValue: 'Painel Operacional' })}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => navigate('/admin?tab=approvals')}
              className="flex items-center gap-2 p-2.5 rounded-lg border border-border/40 bg-background hover:bg-muted/40 transition-colors text-left"
            >
              <Clock className="h-3.5 w-3.5 text-[hsl(var(--warning))] shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-tight">{claimStats?.pendingProfiles ?? stats?.pendingApprovalsCount ?? '—'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{t('enrollment.pendingApprovals', { defaultValue: 'Aprovações pendentes' })}</p>
              </div>
            </button>
            <button 
              onClick={() => navigate('/staff-cockpit')}
              className="flex items-center gap-2 p-2.5 rounded-lg border border-border/40 bg-background hover:bg-muted/40 transition-colors text-left"
            >
              <Rocket className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-tight">{claimStats?.pendingClaims ?? '—'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{t('enrollment.claimRequests', { defaultValue: 'Claims pendentes' })}</p>
              </div>
            </button>
            <button 
              onClick={() => navigate('/admin?tab=workspaces')}
              className="flex items-center gap-2 p-2.5 rounded-lg border border-border/40 bg-background hover:bg-muted/40 transition-colors text-left"
            >
              <UserPlus className="h-3.5 w-3.5 text-[hsl(var(--info))] shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-tight">{claimStats?.unclaimedWorkspaces ?? '—'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{t('enrollment.unclaimed', { defaultValue: 'Importadas não reclamadas' })}</p>
              </div>
            </button>
            <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border/40 bg-background">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-tight">
                  {isOpenRegistration
                    ? <Badge variant="default" className="text-[9px] px-1 py-0">{t('enrollment.open', 'Aberto')}</Badge>
                    : <Badge variant="secondary" className="text-[9px] px-1 py-0">{t('enrollment.gated', 'Gated')}</Badge>
                  }
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{t('enrollment.registrationGate', { defaultValue: 'Gate de registo' })}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick action if there are pending items */}
        {(claimStats?.pendingClaims ?? 0) > 0 && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full gap-2 text-xs"
            onClick={() => navigate('/staff-cockpit')}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {t('enrollment.reviewClaims', { defaultValue: 'Rever claims pendentes' })}
            <ArrowRight className="h-3 w-3 ml-auto" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
