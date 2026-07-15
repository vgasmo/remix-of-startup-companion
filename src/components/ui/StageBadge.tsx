import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { StartupStage } from '@/types/database';

export interface StageBadgeProps {
  stage: StartupStage | 'awaiting_workspace' | string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const stageConfig: Record<string, { labelKey: string; className: string }> = {
  ideation: { labelKey: 'stages.ideation', className: 'bg-stage-ideation/10 text-stage-ideation border-stage-ideation/30' },
  validation: { labelKey: 'stages.validation', className: 'bg-stage-validation/10 text-stage-validation border-stage-validation/30' },
  mvp: { labelKey: 'stages.mvp', className: 'bg-stage-mvp/10 text-stage-mvp border-stage-mvp/30' },
  growth: { labelKey: 'stages.growth', className: 'bg-stage-growth/10 text-stage-growth border-stage-growth/30' },
  scale: { labelKey: 'stages.scale', className: 'bg-stage-scale/10 text-stage-scale border-stage-scale/30' },
  awaiting_workspace: { labelKey: 'stages.awaiting_workspace', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40' },
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
};

export const StageBadge = forwardRef<HTMLSpanElement, StageBadgeProps>(
  function StageBadge({ stage, size = 'md', className }, ref) {
    const { t } = useTranslation();
    const config = stageConfig[stage];

    if (!config) {
      return (
        <span ref={ref} className={cn(
          "inline-flex items-center rounded-full font-medium border bg-muted text-muted-foreground border-border",
          sizeStyles[size],
          className
        )}>
          {stage ?? '—'}
        </span>
      );
    }
    
    return (
      <span ref={ref} className={cn(
        "inline-flex items-center rounded-full font-medium border",
        sizeStyles[size],
        config.className,
        className
      )}>
        {t(config.labelKey, { defaultValue: stage })}
      </span>
    );
  }
);
