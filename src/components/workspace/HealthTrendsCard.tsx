import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { HealthSparkline } from './HealthSparkline';
import { useHealthHistory, useHealthTrends } from '@/hooks/useHealthHistory';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface HealthTrendsCardProps {
  workspaceId: string;
  className?: string;
}

export function HealthTrendsCard({ workspaceId, className }: HealthTrendsCardProps) {
  const { t } = useTranslation();
  const { data: history, isLoading } = useHealthHistory(workspaceId, 90);
  const { delta7d, delta30d, componentTrends, current, previous } = useHealthTrends(workspaceId);
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t('health.trends', 'Tendências de Saúde')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const renderDelta = (delta: number | null, label: string) => {
    if (delta === null) return null;
    const isPositive = delta > 0;
    const isNeutral = delta === 0;

    return (
      <div className="flex items-center gap-1.5">
        {isNeutral ? (
          <Minus className="h-3 w-3 text-muted-foreground" />
        ) : isPositive ? (
          <TrendingUp className="h-3 w-3 text-[hsl(var(--success))]" />
        ) : (
          <TrendingDown className="h-3 w-3 text-destructive" />
        )}
        <span className={cn(
          "text-sm font-medium",
          isNeutral && "text-muted-foreground",
          isPositive && "text-[hsl(var(--success))]",
          !isPositive && !isNeutral && "text-destructive"
        )}>
          {isPositive && '+'}{delta}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    );
  };

  const renderComponentTrend = (key: string, delta: number) => {
    if (delta === 0) return null;
    const isPositive = delta > 0;

    return (
      <div 
        key={key}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs",
          isPositive ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] " : "bg-destructive/10 text-destructive "
        )}
      >
        {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        <span className="capitalize">{key}</span>
        <span>{isPositive ? '+' : ''}{delta}</span>
      </div>
    );
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Health Trends
          </CardTitle>
          <HealthSparkline workspaceId={workspaceId} days={90} width={100} height={28} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Delta indicators */}
        <div className="flex gap-4">
          {renderDelta(delta7d, 'vs 7d')}
          {renderDelta(delta30d, 'vs 30d')}
        </div>

        {/* Component trends */}
        {componentTrends && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(componentTrends)
              .filter(([, delta]) => (delta as number) !== 0)
              .map(([key, delta]) => renderComponentTrend(key, delta as number))}
            {Object.values(componentTrends).every(d => d === 0) && (
              <span className="text-xs text-muted-foreground">{t('health.noComponentChanges', 'Sem alterações nos componentes')}</span>
            )}
          </div>
        )}

        {/* Why changed? */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between p-0 h-auto">
              <span className="text-xs font-medium flex items-center gap-1">
                <Info className="h-3 w-3" />
                Why did it change?
              </span>
              <span className="text-xs text-muted-foreground">
                {isOpen ? 'Hide' : 'Show'}
              </span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-2">
            {current?.explanation_json?.slice(0, 3).map((factor: any, i: number) => (
              <div 
                key={i}
                className={cn(
                  "flex items-start gap-2 text-xs p-2 rounded-lg",
                  factor.impact === 'negative' && "bg-destructive/10",
                  factor.impact === 'positive' && "bg-[hsl(var(--success))]/10",
                  factor.impact === 'neutral' && "bg-muted/50"
                )}
              >
                {factor.impact === 'negative' ? (
                  <AlertTriangle className="h-3 w-3 text-destructive mt-0.5" />
                ) : factor.impact === 'positive' ? (
                  <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))] mt-0.5" />
                ) : (
                  <Minus className="h-3 w-3 text-muted-foreground mt-0.5" />
                )}
                <div>
                  <div className="font-medium">{factor.factor}: {factor.score}/{factor.maxScore}</div>
                  <div className="text-muted-foreground">{factor.details}</div>
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
