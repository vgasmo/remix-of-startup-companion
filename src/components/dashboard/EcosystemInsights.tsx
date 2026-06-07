import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  Info,
  ArrowRight,
  Lightbulb,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EcosystemInsight, InsightSeverity } from '@/hooks/useEcosystemInsights';

interface EcosystemInsightsProps {
  insights: EcosystemInsight[];
  className?: string;
}

const severityConfig: Record<InsightSeverity, {
  icon: typeof AlertTriangle;
  bg: string;
  border: string;
  text: string;
  iconColor: string;
}> = {
  critical: {
    icon: AlertTriangle,
    bg: 'bg-destructive/5 dark:bg-destructive/10',
    border: 'border-destructive/20',
    text: 'text-destructive',
    iconColor: 'text-destructive',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-warning/5',
    border: 'border-warning/30',
    text: 'text-warning',
    iconColor: 'text-warning',
  },
  info: {
    icon: Info,
    bg: 'bg-info/5',
    border: 'border-info/20',
    text: 'text-info',
    iconColor: 'text-info',
  },
  positive: {
    icon: CheckCircle2,
    bg: 'bg-success/5',
    border: 'border-success/30',
    text: 'text-success',
    iconColor: 'text-success',
  },
};

export const EcosystemInsights = React.forwardRef<HTMLDivElement, EcosystemInsightsProps>(
  function EcosystemInsights({ insights, className }, ref) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    if (insights.length === 0) return null;

    return (
      <div ref={ref} className={cn('space-y-2', className)}>
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
          <Lightbulb className="h-4 w-4" />
          <span>{t('dashboard.insights')}</span>
        </div>
        {insights.map((insight) => {
          const config = severityConfig[insight.severity];
          const Icon = config.icon;
          return (
            <div
              key={insight.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-xl border transition-colors',
                config.bg,
                config.border,
              )}
            >
              <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', config.iconColor)} />
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium', config.text)}>
                  {insight.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {insight.description}
                </p>
              </div>
              {insight.actionLabel && insight.actionHref && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs h-7 gap-1"
                  onClick={() => navigate(insight.actionHref!)}
                >
                  {insight.actionLabel}
                  <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    );
  }
);
EcosystemInsights.displayName = 'EcosystemInsights';
