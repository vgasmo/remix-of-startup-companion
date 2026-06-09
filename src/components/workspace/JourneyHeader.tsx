import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Info,
  Calendar,
  CheckCircle2,
  Target,
  ChevronRight,
  Sparkles,
  TrendingUp,
  Video,
  HelpCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { StageBadge } from '@/components/ui/StageBadge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HealthScoreCard } from '@/components/workspace/HealthScoreCard';
import { StartupStage, HealthScore } from '@/types/database';

interface JourneyHeaderProps {
  workspace: {
    id: string;
    program_id: string;
    stage: StartupStage;
    health_score: string | null;
    health_score_override: string | null;
    health_notes: string | null;
  };
  nextSession?: {
    title: string;
    starts_at: string;
  } | null;
  actionsCompleted: number;
  actionsTotal: number;
  milestonesCompleted: number;
  milestonesTotal: number;
  canWrite: boolean;
}

const STAGE_DESCRIPTIONS: Record<StartupStage, { en: string; pt: string }> = {
  ideation: {
    en: 'Define your problem and validate the market opportunity',
    pt: 'Defina o problema e valide a oportunidade de mercado',
  },
  validation: {
    en: 'Test your solution with real customers and gather feedback',
    pt: 'Teste a solução com clientes reais e recolha feedback',
  },
  mvp: {
    en: 'Build and launch your minimum viable product',
    pt: 'Construa e lance o seu produto mínimo viável',
  },
  growth: {
    en: 'Scale customer acquisition and optimize unit economics',
    pt: 'Escale a aquisição de clientes e otimize a economia',
  },
  scale: {
    en: 'Expand to new markets and build a world-class team',
    pt: 'Expanda para novos mercados e construa uma equipa de excelência',
  },
};

export function JourneyHeader({
  workspace,
  nextSession,
  actionsCompleted,
  actionsTotal,
  milestonesCompleted,
  milestonesTotal,
  canWrite,
}: JourneyHeaderProps) {
  const { t, i18n } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const [healthSheetOpen, setHealthSheetOpen] = useState(false);

  const effectiveHealth = workspace.health_score_override || workspace.health_score;
  const lang = i18n.language === 'pt' ? 'pt' : 'en';
  const stageDescription = STAGE_DESCRIPTIONS[workspace.stage]?.[lang] || '';

  const actionsProgress = actionsTotal > 0 ? Math.round((actionsCompleted / actionsTotal) * 100) : 0;
  const milestonesProgress = milestonesTotal > 0 ? Math.round((milestonesCompleted / milestonesTotal) * 100) : 0;

  // Role-based emphasis: Stage + Journey primary for founders, Health secondary
  // This component is viewed by all roles but founders see it most prominently

  return (
    <Card className="bg-gradient-to-r from-primary/5 via-background to-background border-primary/20">
      <CardContent className="py-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Stage Info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <StageBadge stage={workspace.stage} size="lg" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={t('common._iconHelp')}>
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-sm">{stageDescription}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-sm text-muted-foreground hidden md:inline truncate">
              {stageDescription}
            </span>
          </div>

          {/* Health Score with Explanation */}
          <Sheet open={healthSheetOpen} onOpenChange={setHealthSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" className="gap-2 h-auto py-1.5 px-3">
                <HealthBadge score={effectiveHealth as HealthScore | null} size="lg" />
                <Info className="h-4 w-4 text-muted-foreground" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  {t('journey.healthExplanation')}
                </SheetTitle>
                <SheetDescription>
                  {t('journey.healthExplanationDesc')}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <HealthScoreCard workspaceId={workspace.id} programId={workspace.program_id} />
                {workspace.health_notes && (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm">
                    <p className="font-medium mb-1">{t('journey.aiInsight')}</p>
                    <p className="text-muted-foreground">{workspace.health_notes}</p>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>

          {/* Next Session */}
          <div className="flex items-center gap-2">
            {nextSession ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setSearchParams({ tab: 'agenda' })}
              >
                <Video className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline">{t('journey.nextSession')}:</span>
                <span className="font-medium">
                  {format(new Date(nextSession.starts_at), 'MMM d, HH:mm')}
                </span>
              </Button>
            ) : canWrite ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setSearchParams({ tab: 'agenda' })}
              >
                <Calendar className="h-4 w-4" />
                {t('journey.scheduleSession')}
              </Button>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <Calendar className="h-3 w-3" />
                {t('journey.noSessionScheduled')}
              </Badge>
            )}
          </div>

          {/* Progress Indicators */}
          <div className="flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 min-w-[100px]">
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1">
                    <Progress value={actionsProgress} className="h-2" />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {actionsTotal > 0 ? `${actionsCompleted}/${actionsTotal}` : '—'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {t('journey.actionsCompleted', { completed: actionsCompleted, total: actionsTotal })}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 min-w-[100px]">
                  <Target className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1">
                    <Progress value={milestonesProgress} className="h-2" />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {milestonesTotal > 0 ? `${milestonesCompleted}/${milestonesTotal}` : '—'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {t('journey.milestonesCompleted', { completed: milestonesCompleted, total: milestonesTotal })}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
