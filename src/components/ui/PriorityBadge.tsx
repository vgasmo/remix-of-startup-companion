import { cn } from '@/lib/utils';
import { Star, ArrowUp, Minus, Archive } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type WorkspacePriority = 'star' | 'high' | 'standard' | 'maintenance';

interface PriorityBadgeProps {
  priority: WorkspacePriority | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const priorityConfig: Record<WorkspacePriority, { 
  labelKey: string; 
  icon: React.ReactNode;
  className: string;
}> = {
  star: { 
    labelKey: 'priorities.star', 
    icon: <Star className="h-3 w-3 fill-current" />,
    className: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30 ' 
  },
  high: { 
    labelKey: 'priorities.high', 
    icon: <ArrowUp className="h-3 w-3" />,
    className: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/30 ' 
  },
  standard: { 
    labelKey: 'priorities.standard', 
    icon: <Minus className="h-3 w-3" />,
    className: 'bg-muted text-muted-foreground border-border' 
  },
  maintenance: { 
    labelKey: 'priorities.maintenance', 
    icon: <Archive className="h-3 w-3" />,
    className: 'bg-muted text-muted-foreground border-border ' 
  },
};

export function PriorityBadge({ priority, size = 'md', showLabel = true, className }: PriorityBadgeProps) {
  const { t } = useTranslation();
  
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2 py-1 gap-1.5',
    lg: 'text-sm px-2.5 py-1.5 gap-2 font-medium',
  };

  const normalizedPriority = priority || 'standard';
  const config = priorityConfig[normalizedPriority];
  
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border font-medium",
      sizeClasses[size],
      config.className,
      className
    )}>
      {config.icon}
      {showLabel && <span>{t(config.labelKey)}</span>}
    </span>
  );
}

export function getPriorityLabel(priority: WorkspacePriority | null | undefined): string {
  // Fallback for non-component contexts — returns EN key fallback
  return priorityConfig[priority || 'standard'].labelKey;
}

export function getPriorityOrder(priority: WorkspacePriority | null | undefined): number {
  const order: Record<WorkspacePriority, number> = {
    star: 0,
    high: 1,
    standard: 2,
    maintenance: 3,
  };
  return order[priority || 'standard'];
}
