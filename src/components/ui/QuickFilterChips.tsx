import { Badge } from '@/components/ui/badge';
import { X, AlertCircle, Calendar, TrendingDown, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export interface QuickFilter {
  id: string;
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  count?: number;
  variant?: 'default' | 'destructive' | 'warning' | 'success';
}

interface QuickFilterChipsProps {
  filters: QuickFilter[];
  onToggle: (id: string) => void;
  className?: string;
}

export function QuickFilterChips({ filters, onToggle, className }: QuickFilterChipsProps) {
  const variantStyles = {
    default: 'bg-secondary hover:bg-secondary/80 text-secondary-foreground',
    destructive: 'bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/20',
    warning: 'bg-[hsl(var(--warning))]/10 hover:bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20',
    success: 'bg-[hsl(var(--success))]/10 hover:bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] border-[hsl(var(--success))]/20',
  };

  const activeStyles = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    warning: 'bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]',
    success: 'bg-[hsl(var(--success))] text-white hover:bg-[hsl(var(--success))]',
  };

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {filters.map((filter) => (
        <button
          key={filter.id}
          onClick={() => onToggle(filter.id)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200',
            filter.active 
              ? activeStyles[filter.variant || 'default']
              : variantStyles[filter.variant || 'default'],
            'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/50'
          )}
        >
          {filter.icon}
          {filter.label}
          {filter.count !== undefined && filter.count > 0 && (
            <Badge 
              variant="secondary" 
              className={cn(
                'ml-1 h-5 min-w-[20px] px-1.5 text-xs',
                filter.active && 'bg-white/20 text-inherit'
              )}
            >
              {filter.count}
            </Badge>
          )}
          {filter.active && <X className="h-3 w-3 ml-0.5" />}
        </button>
      ))}
    </div>
  );
}

// Preset quick filters for workspaces
export function useWorkspaceQuickFilters(stats: {
  critical: number;
  atRisk: number;
  overdue: number;
  meetingsToday: number;
  missingKpi: number;
}) {
  const { t } = useTranslation();
  
  return [
    {
      id: 'critical',
      label: t('health.levels.critical'),
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      count: stats.critical,
      variant: 'destructive' as const,
      active: false,
    },
    {
      id: 'at_risk',
      label: t('health.levels.at_risk'),
      icon: <TrendingDown className="h-3.5 w-3.5" />,
      count: stats.atRisk,
      variant: 'warning' as const,
      active: false,
    },
    {
      id: 'overdue',
      label: t('filters.overdueActions'),
      icon: <Clock className="h-3.5 w-3.5" />,
      count: stats.overdue,
      variant: 'destructive' as const,
      active: false,
    },
    {
      id: 'meetings_today',
      label: t('filters.meetingsToday'),
      icon: <Calendar className="h-3.5 w-3.5" />,
      count: stats.meetingsToday,
      variant: 'default' as const,
      active: false,
    },
  ];
}
