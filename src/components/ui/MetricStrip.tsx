import * as React from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface MetricItem {
  id: string;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  /** Optional tone for the value color. */
  tone?: 'default' | 'critical' | 'warning' | 'success' | 'muted';
  onClick?: () => void;
  ariaLabel?: string;
}

const TONE: Record<NonNullable<MetricItem['tone']>, string> = {
  default: 'text-foreground',
  critical: 'text-[hsl(var(--health-critical))]',
  warning: 'text-[hsl(var(--warning))]',
  success: 'text-[hsl(var(--success))]',
  muted: 'text-muted-foreground',
};

interface MetricStripProps {
  metrics: MetricItem[];
  className?: string;
}

/**
 * Hairline-separated metric row. Replaces 4-card stat grids with a calmer,
 * Linear-style strip. Click-through optional per metric.
 */
export function MetricStrip({ metrics, className }: MetricStripProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 md:grid-cols-4 rounded-xl border border-border/70 bg-card',
        'divide-y divide-border/70 md:divide-y-0 md:divide-x',
        className,
      )}
    >
      {metrics.map((m) => {
        const Icon = m.icon;
        const tone = TONE[m.tone ?? 'default'];
        const interactive = Boolean(m.onClick);
        const content = (
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {m.label}
              </p>
              <p className={cn('mt-1.5 text-2xl font-semibold leading-none num', tone)}>
                {m.value}
              </p>
              {m.hint && (
                <p className="mt-1.5 text-xs text-muted-foreground truncate">{m.hint}</p>
              )}
            </div>
            {Icon && <Icon className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />}
          </div>
        );
        if (interactive) {
          return (
            <button
              key={m.id}
              type="button"
              onClick={m.onClick}
              aria-label={m.ariaLabel ?? m.label}
              className="text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              {content}
            </button>
          );
        }
        return (
          <div key={m.id}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
