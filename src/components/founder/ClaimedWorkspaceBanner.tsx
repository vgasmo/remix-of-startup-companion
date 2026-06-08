/**
 * ClaimedWorkspaceBanner — Contextual guidance for founders with freshly claimed workspace.
 * ADDITIVE ONLY. Read-only, no mutations, no permission changes.
 */
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Rocket, ArrowRight, Clock, CheckCircle2, Building2, FileText, Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type FounderOnboardingState } from '@/hooks/useFounderOnboardingState';

interface ClaimedWorkspaceBannerProps {
  founderState: FounderOnboardingState;
}

export function ClaimedWorkspaceBanner({ founderState }: ClaimedWorkspaceBannerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Show for claimed workspace state (not yet fully active)
  if (founderState.status === 'has_active_workspace' && founderState.activeWorkspaceId) {
    // Active workspace — no banner needed
    return null;
  }

  if (founderState.status === 'has_pending_workspace') {
    return (
      <Card className="rounded-xl border-warning/60 dark:border-warning/40 bg-warning/5 dark:bg-warning/5">
        <CardContent className="py-4 flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">
              {t('founder.claimed.pendingTitle', { defaultValue: 'Candidatura em análise' })}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {founderState.startupName
                ? t('founder.claimed.pendingDescNamed', {
                    defaultValue: 'A sua candidatura para "{{name}}" está a ser analisada pela equipa. Receberá uma notificação quando for aprovada.',
                    name: founderState.startupName,
                  })
                : t('founder.claimed.pendingDesc', {
                    defaultValue: 'A sua candidatura está a ser analisada pela equipa. Receberá uma notificação quando for aprovada.',
                  })
              }
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="outline" className="text-[10px] gap-1">
                <Clock className="h-2.5 w-2.5" />
                {t('founder.claimed.awaitingReview', { defaultValue: 'Aguarda aprovação' })}
              </Badge>
            </div>
            {/* Next steps guidance */}
            <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800/50">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {t('founder.claimed.nextSteps', { defaultValue: 'Próximos passos' })}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {t('founder.claimed.nextStepsDesc', { defaultValue: 'Enquanto aguarda, pode explorar a plataforma e preparar documentação.' })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (founderState.status === 'has_pending_claim') {
    return (
      <Card className="rounded-xl border-info/40 bg-info/5">
        <CardContent className="py-4 flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-info/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-info" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">
              {t('founder.claimed.claimTitle', { defaultValue: 'Associação pendente' })}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('founder.claimed.claimDesc', {
                defaultValue: 'O seu pedido de associação aguarda revisão pela equipa. Receberá uma notificação assim que for processado.',
              })}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="outline" className="text-[10px] gap-1">
                <Clock className="h-2.5 w-2.5" />
                {founderState.pendingClaimEmail || t('founder.claimed.awaitingVerification', { defaultValue: 'Em verificação' })}
              </Badge>
              <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => navigate('/settings')}>
                {t('founder.claimed.viewSettings', { defaultValue: 'Ver definições' })}
              </Button>
            </div>
            {/* Next steps guidance */}
            <div className="mt-3 pt-3 border-t border-info/30">
              <p className="text-xs font-medium text-info flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {t('founder.claimed.nextSteps', { defaultValue: 'Próximos passos' })}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {t('founder.claimed.nextStepsDesc', { defaultValue: 'Enquanto aguarda, pode explorar a plataforma e organizar documentação relevante.' })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (founderState.status === 'needs_claim_verification') {
    return (
      <Card className="rounded-xl border-primary/30 bg-primary/5">
        <CardContent className="py-4 flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Rocket className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">
              {t('founder.claimed.getStartedTitle', { defaultValue: 'Bem-vindo à plataforma!' })}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('founder.claimed.getStartedDesc', {
                defaultValue: 'Para aceder ao seu espaço de trabalho, associe-se a uma startup existente ou crie uma nova candidatura.',
              })}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => navigate('/claim-startup')}>
                <ArrowRight className="h-3 w-3" />
                {t('founder.claimed.claimCta', { defaultValue: 'Associar startup' })}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
