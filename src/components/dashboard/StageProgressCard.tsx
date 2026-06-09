import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Lightbulb,
  Search,
  Hammer,
  TrendingUp,
  Rocket,
  ChevronRight,
  CheckCircle2,
  Flag
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { StageBadge } from '@/components/ui/StageBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { useMilestones } from '@/hooks/useMilestones';
import { StartupStage } from '@/types/database';


interface StageProgressCardProps {
  workspace: WorkspaceWithDetails;
  className?: string;
}

const STAGE_ORDER: StartupStage[] = ['ideation', 'validation', 'mvp', 'growth', 'scale'];

const STAGE_CONFIG: Record<StartupStage, { icon: typeof Lightbulb; color: string; label: string }> = {
  ideation: { icon: Lightbulb, color: 'text-primary', label: 'Ideation' },
  validation: { icon: Search, color: 'text-[hsl(var(--info))]', label: 'Validation' },
  mvp: { icon: Hammer, color: 'text-[hsl(var(--warning))]', label: 'MVP' },
  growth: { icon: TrendingUp, color: 'text-[hsl(var(--success))]', label: 'Growth' },
  scale: { icon: Rocket, color: 'text-primary', label: 'Scale' },
};

export function StageProgressCard({ workspace, className }: StageProgressCardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: milestones } = useMilestones(workspace.id);

  if (!workspace.stage) {
    return (
      <EmptyState
        icon={Flag}
        title={t('stageProgress.emptyTitle', { defaultValue: 'Etapa por definir' })}
        description={t('stageProgress.emptyDesc', { defaultValue: 'O estado da sua startup será atualizado pela equipa do programa.' })}
        className={className}
      />
    );
  }

  const currentStageIndex = STAGE_ORDER.indexOf(workspace.stage);
  const progressPercent = ((currentStageIndex + 1) / STAGE_ORDER.length) * 100;


  // Calculate milestone completion for current stage
  const milestoneStats = useMemo(() => {
    if (!milestones) return { completed: 0, total: 0, percent: 0 };
    const total = milestones.length;
    const completed = milestones.filter(m => m.status === 'completed').length;
    return { 
      completed, 
      total, 
      percent: total > 0 ? Math.round((completed / total) * 100) : 0 
    };
  }, [milestones]);

  const currentConfig = STAGE_CONFIG[workspace.stage];
  const CurrentIcon = currentConfig.icon;

  return (
    <Card className={cn('cursor-pointer hover:shadow-md transition-shadow', className)} onClick={() => navigate(`/workspace/${workspace.id}?tab=milestones-actions`)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CurrentIcon className={`h-4 w-4 ${currentConfig.color}`} />
            {t('stageProgress.yourJourney', 'Your Journey')}
          </CardTitle>
          <StageBadge stage={workspace.stage} size="sm" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* P0: Compact Stage Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{currentStageIndex + 1}/{STAGE_ORDER.length} {t('stageProgress.stages', 'fases')}</span>
            {milestones && milestones.length > 0 && (
              <span>{milestoneStats.completed}/{milestoneStats.total} {t('stageProgress.milestones', 'marcos')}</span>
            )}
          </div>
          <div className="relative">
            <Progress value={progressPercent} className="h-1.5" />
            <div className="flex justify-between mt-1.5">
              {STAGE_ORDER.map((stage, index) => {
                const config = STAGE_CONFIG[stage];
                const Icon = config.icon;
                const isPast = index < currentStageIndex;
                const isCurrent = index === currentStageIndex;
                
                return (
                  <div 
                    key={stage}
                    className={`flex flex-col items-center ${
                      isPast ? 'text-muted-foreground' : isCurrent ? config.color : 'text-muted-foreground/50'
                    }`}
                  >
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center text-xs ${
                      isPast 
                        ? 'bg-primary/20' 
                        : isCurrent 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted'
                    }`}>
                      {isPast ? (
                        <CheckCircle2 className="h-2.5 w-2.5" />
                      ) : (
                        <Icon className="h-2.5 w-2.5" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Compact CTA */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-between text-xs text-muted-foreground hover:text-foreground h-8"
          onClick={() => navigate(`/workspace/${workspace.id}?tab=milestones-actions`)}
        >
          <span>{t('stageProgress.viewMilestones', 'View milestones')}</span>
          <ChevronRight className="h-3 w-3" />
        </Button>
      </CardContent>
    </Card>
  );
}
