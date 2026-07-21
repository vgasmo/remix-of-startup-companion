import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, Calculator, ArrowRight, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFeatureFlag } from '@/hooks/useFeatureFlags';

interface PlanAssistantsCardProps {
  workspaceId?: string;
  programId?: string;
}

/**
 * Surfaces the guided Business Plan / Financial Model assistants
 * from the Workspace Overview. Deep-links into
 * Documents → Financial sub-tab, using URL hash to scroll to the
 * matching assistant (business plan vs. financial model).
 * The Business Plan tile is only shown when the guided plan feature
 * flag is enabled for this workspace/program.
 */
export function PlanAssistantsCard({ workspaceId, programId }: PlanAssistantsCardProps = {}) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const guidedPlanEnabled = useFeatureFlag(
    'financial_business_plan_coach_v1',
    programId,
    workspaceId,
  );

  const openAssistants = (anchor?: 'business-plan' | 'financial-model') => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'documents');
    next.set('sub', 'financial');
    if (anchor) next.set('scroll', anchor);
    else next.delete('scroll');
    setSearchParams(next);
    // Best-effort scroll after tab renders.
    if (anchor) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          const el = document.getElementById(anchor);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      });
    }
  };

  return (
    <Card className="rounded-2xl border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">
              {t('planAssistants.title', { defaultValue: 'Assistentes de Plano' })}
            </CardTitle>
            <CardDescription>
              {t('planAssistants.description', {
                defaultValue: 'Wizards guiados de Plano Financeiro e Modelo Financeiro com apoio de IA.',
              })}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {guidedPlanEnabled && (
          <button
            type="button"
            onClick={() => openAssistants('business-plan')}
            className="group text-left rounded-xl border border-border/60 bg-background/60 p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <ClipboardList className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">
                {t('planAssistants.businessPlan.title', { defaultValue: 'Plano Financeiro Guiado' })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {t('planAssistants.businessPlan.description', {
                defaultValue: 'Perguntas passo-a-passo para estruturar pressupostos, mercado e projeções financeiras.',
              })}
            </p>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">
              {t('planAssistants.open', { defaultValue: 'Abrir assistente' })}
              <ArrowRight className="h-3 w-3" />
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => openAssistants('financial-model')}
          className={`group text-left rounded-xl border border-border/60 bg-background/60 p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors ${guidedPlanEnabled ? '' : 'sm:col-span-2'}`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Calculator className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">
              {t('planAssistants.financial.title', { defaultValue: 'Modelo Financeiro' })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {t('planAssistants.financial.description', {
              defaultValue: 'Cenários, burn, runway, LTV/CAC e revisão automática das projeções.',
            })}
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">
            {t('planAssistants.open', { defaultValue: 'Abrir assistente' })}
            <ArrowRight className="h-3 w-3" />
          </span>
        </button>

        <div className="sm:col-span-2 flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => openAssistants()} className="gap-1.5">
            {t('planAssistants.goToSection', { defaultValue: 'Ir para Documentos → Financeiro' })}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
