/**
 * ReadinessCard — shared readiness UI used by CRM leads and contracts.
 *
 * Supports two flavours through a common visual language:
 *  - `checklist`: binary ok/pending items (contract readiness).
 *  - `scored`: weighted score with per-item progress (CRM lead score).
 *  - `hybrid`: items may mix both shapes.
 *
 * The component is presentation-only; callers derive items and pass them in.
 */
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, AlertTriangle, ShieldAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ReadinessTone = 'success' | 'warning' | 'info' | 'muted';

export interface ReadinessItem {
  key: string;
  label: string;
  /** Binary check outcome (checklist mode). Ignored when `score` is provided. */
  ok?: boolean;
  /** Weighted score for this item (scored mode). */
  score?: number;
  /** Denominator for `score`. Required when `score` is set. */
  maxScore?: number;
  /** Small helper text under the label. */
  detail?: string;
  /** Optional lucide icon rendered before the label. */
  icon?: LucideIcon;
  /** Force a tone (defaults derived from ok / score ratio). */
  tone?: ReadinessTone;
}

export interface ReadinessCardProps {
  title: string;
  titleIcon?: LucideIcon;
  /** Aggregate score (numerator). If omitted, derived from items. */
  score?: number;
  /** Aggregate max (denominator). If omitted, derived from items. */
  maxScore?: number;
  /** Short qualitative label (e.g. "Lead Morno", "Aguarda envio"). */
  statusLabel?: string;
  /** One-line explanation of the current state. */
  statusDescription?: string;
  statusTone?: ReadinessTone;
  statusIcon?: LucideIcon;
  items: ReadinessItem[];
  /** Compact list (no progress bars, no details) — used inside dense views. */
  compact?: boolean;
  /** Optional alert rendered below the list (e.g. provider lock). */
  alert?: {
    tone: ReadinessTone;
    title?: string;
    body: ReactNode;
    icon?: LucideIcon;
  } | null;
  /** Footer hint shown when nothing critical is failing. */
  hint?: string;
  className?: string;
}

const toneClasses: Record<ReadinessTone, { text: string; bg: string; border: string }> = {
  success: {
    text: 'text-[hsl(var(--success))]',
    bg: 'bg-[hsl(var(--success))]/10',
    border: 'border-[hsl(var(--success))]/40',
  },
  warning: {
    text: 'text-[hsl(var(--warning))]',
    bg: 'bg-[hsl(var(--warning))]/10',
    border: 'border-[hsl(var(--warning))]/40',
  },
  info: {
    text: 'text-[hsl(var(--info))]',
    bg: 'bg-[hsl(var(--info))]/10',
    border: 'border-[hsl(var(--info))]/40',
  },
  muted: {
    text: 'text-muted-foreground',
    bg: 'bg-muted/40',
    border: 'border-muted',
  },
};

function itemTone(it: ReadinessItem): ReadinessTone {
  if (it.tone) return it.tone;
  if (typeof it.ok === 'boolean') return it.ok ? 'success' : 'muted';
  if (typeof it.score === 'number' && typeof it.maxScore === 'number' && it.maxScore > 0) {
    const ratio = it.score / it.maxScore;
    if (ratio >= 0.999) return 'success';
    if (ratio >= 0.5) return 'warning';
    return 'muted';
  }
  return 'muted';
}

export function ReadinessCard({
  title,
  titleIcon: TitleIcon,
  score,
  maxScore,
  statusLabel,
  statusDescription,
  statusTone = 'muted',
  statusIcon: StatusIcon,
  items,
  compact = false,
  alert,
  hint,
  className,
}: ReadinessCardProps) {
  const derivedScore =
    score ??
    items.reduce((acc, it) => {
      if (typeof it.score === 'number') return acc + it.score;
      if (typeof it.ok === 'boolean') return acc + (it.ok ? 1 : 0);
      return acc;
    }, 0);
  const derivedMax =
    maxScore ??
    items.reduce((acc, it) => {
      if (typeof it.maxScore === 'number') return acc + it.maxScore;
      if (typeof it.ok === 'boolean') return acc + 1;
      return acc;
    }, 0);

  const complete = derivedMax > 0 && derivedScore >= derivedMax;
  const statusPalette = toneClasses[statusTone];

  return (
    <Card className={cn('border-muted/60', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {TitleIcon ? (
              <TitleIcon className="h-4 w-4 text-primary" />
            ) : complete ? (
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )}
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            {StatusIcon && (
              <div
                className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center',
                  statusPalette.bg,
                )}
                aria-hidden
              >
                <StatusIcon className={cn('h-4 w-4', statusPalette.text)} />
              </div>
            )}
            <Badge variant={complete ? 'default' : 'outline'} className="text-[11px] tabular-nums">
              {derivedScore}/{derivedMax}
            </Badge>
          </div>
        </div>
        {(statusLabel || statusDescription) && (
          <div className="flex items-center justify-between gap-2 pt-2">
            {statusLabel && (
              <Badge variant="outline" className={cn('gap-1 text-[11px]', statusPalette.text)}>
                {StatusIcon && <StatusIcon className="h-3 w-3" />}
                {statusLabel}
              </Badge>
            )}
            {statusDescription && (
              <span className="text-[11px] text-muted-foreground text-right flex-1">
                {statusDescription}
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className={cn('space-y-2', compact && 'space-y-1.5')}>
          {items.map((it) => {
            const tone = itemTone(it);
            const palette = toneClasses[tone];
            const ItemIcon = it.icon;
            const isScored = typeof it.score === 'number' && typeof it.maxScore === 'number';
            const isOk = it.ok === true || (isScored && it.score! >= (it.maxScore ?? 0));
            return (
              <li
                key={it.key}
                className="text-sm"
                aria-label={`${it.label}: ${
                  isScored ? `${it.score}/${it.maxScore}` : isOk ? 'ok' : 'pending'
                }`}
              >
                <div className="flex items-start gap-2">
                  {ItemIcon ? (
                    <ItemIcon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', palette.text)} />
                  ) : isOk ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-[hsl(var(--success))] flex-shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'leading-snug',
                          !isOk && !isScored && 'text-muted-foreground',
                        )}
                      >
                        {it.label}
                      </span>
                      {isScored && (
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                          {it.score}/{it.maxScore}
                        </span>
                      )}
                    </div>
                    {isScored && !compact && (
                      <Progress
                        value={
                          it.maxScore! > 0 ? Math.min(100, (it.score! / it.maxScore!) * 100) : 0
                        }
                        className="h-1.5 mt-1"
                      />
                    )}
                    {it.detail && !compact && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">{it.detail}</div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {alert && (
          <div
            role="alert"
            className={cn(
              'mt-3 flex items-start gap-2 rounded-md border p-2.5 text-xs',
              toneClasses[alert.tone].border,
              toneClasses[alert.tone].bg,
              toneClasses[alert.tone].text,
            )}
          >
            {(() => {
              const AlertIcon = alert.icon ?? (alert.tone === 'warning' ? ShieldAlert : AlertTriangle);
              return <AlertIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />;
            })()}
            <div className="leading-snug">
              {alert.title && <strong className="block">{alert.title}</strong>}
              {alert.body}
            </div>
          </div>
        )}

        {hint && !alert && !complete && (
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground pt-1">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>{hint}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ReadinessCard;
