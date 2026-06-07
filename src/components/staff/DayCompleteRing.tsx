import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useWorkQueue } from '@/hooks/useWorkQueue';

const SIZE = 56;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export function DayCompleteRing() {
  const { t } = useTranslation();
  // Fetch all items (open + done) updated today by passing no status filter and merging
  const { data: openItems = [] } = useWorkQueue();
  const { data: doneItems = [] } = useWorkQueue({ status: 'done' });

  const { total, done, pct, isComplete } = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const sod = startOfDay.getTime();

    const doneToday = doneItems.filter(i => {
      const ts = new Date((i as any).updated_at || i.created_at).getTime();
      return ts >= sod;
    });
    const totalToday = openItems.length + doneToday.length;
    const doneCount = doneToday.length;
    const pct = totalToday === 0 ? 0 : Math.round((doneCount / totalToday) * 100);
    return { total: totalToday, done: doneCount, pct, isComplete: totalToday > 0 && doneCount === totalToday };
  }, [openItems, doneItems]);

  const dashOffset = CIRC * (1 - pct / 100);
  const colorClass = isComplete ? 'text-success' : 'text-primary';

  return (
    <div className="flex items-center gap-3 motion-reduce:transition-none">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="hsl(var(--muted))"
            strokeWidth={STROKE}
            fill="none"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="currentColor"
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            className={`${colorClass} transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {isComplete ? (
            <Check className="h-5 w-5 text-success" />
          ) : (
            <span className="text-xs font-semibold tabular-nums">{total === 0 ? '—' : `${pct}%`}</span>
          )}
        </div>
      </div>
      <div className="text-xs text-muted-foreground leading-tight">
        {total === 0 ? (
          <span>{t('staffCockpit.dayRing.empty', { defaultValue: 'Sem tarefas' })}</span>
        ) : (
          <>
            <div className="font-medium text-foreground tabular-nums">{done}/{total}</div>
            <div>{t('staffCockpit.dayRing.done', { defaultValue: 'concluídos hoje' })}</div>
          </>
        )}
      </div>
    </div>
  );
}
