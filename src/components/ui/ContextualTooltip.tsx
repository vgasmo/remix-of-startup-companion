import { ReactNode } from 'react';
import { Info, HelpCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ContextualTooltipProps {
  children: ReactNode;
  title: string;
  description?: string;
  metric?: {
    value: number | string;
    change?: number;
    unit?: string;
    target?: number | string;
  };
  learnMoreUrl?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

/**
 * P2: Contextual tooltips with rich content for metrics and KPIs.
 * Shows value, trend, target, and optional learn more link.
 */
export function ContextualTooltip({
  children,
  title,
  description,
  metric,
  learnMoreUrl,
  side = 'top',
  className,
}: ContextualTooltipProps) {
  const getTrendIcon = (change?: number) => {
    if (!change) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (change > 0) return <TrendingUp className="h-3 w-3 text-[hsl(var(--success))]" />;
    return <TrendingDown className="h-3 w-3 text-destructive" />;
  };

  const getTrendColor = (change?: number) => {
    if (!change) return 'text-muted-foreground';
    return change > 0 ? 'text-[hsl(var(--success))]' : 'text-destructive';
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("cursor-help", className)}>{children}</span>
        </TooltipTrigger>
        <TooltipContent 
          side={side} 
          className="max-w-xs p-3 space-y-2"
          sideOffset={8}
        >
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="font-medium text-sm">{title}</p>
              {description && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>

          {metric && (
            <div className="bg-muted/50 rounded-md p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Current</span>
                <span className="font-medium text-sm">
                  {metric.value}{metric.unit && <span className="text-muted-foreground ml-0.5">{metric.unit}</span>}
                </span>
              </div>
              {metric.change !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Change</span>
                  <span className={cn("flex items-center gap-1 text-xs font-medium", getTrendColor(metric.change))}>
                    {getTrendIcon(metric.change)}
                    {metric.change > 0 ? '+' : ''}{metric.change}%
                  </span>
                </div>
              )}
              {metric.target !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Target</span>
                  <span className="text-xs font-medium">
                    {metric.target}{metric.unit && <span className="text-muted-foreground ml-0.5">{metric.unit}</span>}
                  </span>
                </div>
              )}
            </div>
          )}

          {learnMoreUrl && (
            <a 
              href={learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <HelpCircle className="h-3 w-3" />
              Learn more
            </a>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Simple info icon with tooltip
 */
interface InfoTooltipProps {
  content: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

export function InfoTooltip({ content, side = 'top', className }: InfoTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className={cn("h-3.5 w-3.5 text-muted-foreground cursor-help hover:text-foreground transition-colors", className)} />
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs text-xs">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
