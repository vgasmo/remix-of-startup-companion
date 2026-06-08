import { useTranslation } from 'react-i18next';
import { Flame, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StreakHeroProps {
  streakWeeks: number;
  className?: string;
}

export function StreakHero({ streakWeeks, className }: StreakHeroProps) {
  const { t } = useTranslation();

  // Don't show if no streak
  if (streakWeeks <= 0) return null;

  // Determine visual intensity based on streak length
  const isHotStreak = streakWeeks >= 4;
  const isMilestone =
    streakWeeks === 4 ||
    streakWeeks === 8 ||
    streakWeeks === 12 ||
    streakWeeks === 26 ||
    streakWeeks === 52;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-4 rounded-xl border transition-all',
        isHotStreak
          ? 'bg-gradient-to-r from-brand-red/10 via-brand-red/5 to-brand-red/[0.03] border-brand-red/30'
          : 'bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20',
        isMilestone && 'momentum-flash',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex items-center justify-center h-12 w-12 rounded-full',
          isHotStreak
            ? 'bg-gradient-to-br from-brand-red to-warning text-white'
            : 'bg-primary/20 text-primary',
        )}
      >
        {isHotStreak && <span className="momentum-pulse-ring" aria-hidden="true" />}
        {isHotStreak ? (
          <Flame className="h-6 w-6 relative" />
        ) : (
          <Sparkles className="h-5 w-5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-xl font-bold tabular-nums',
              isHotStreak ? 'text-brand-red' : 'text-foreground',
            )}
          >
            {streakWeeks}
          </span>
          <span className="text-sm text-muted-foreground">
            {t('streakHero.weeksStreak', 'week streak', { count: streakWeeks })}
          </span>
          {isMilestone && (
            <Badge variant="secondary" className="text-xs">
              🎉 {t('streakHero.milestone', 'Milestone!')}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {isHotStreak
            ? t('streakHero.onFire', "You're on fire! Keep the momentum going.")
            : t('streakHero.keepItUp', 'Keep coming back weekly to build your streak.')}
        </p>
      </div>
    </div>
  );
}
