import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// intentional: A/B/C taxonomy palette — distinct hue per ecosystem category, not state semantics
const CATEGORY_CONFIG: Record<string, { label: string; className: string }> = {
  A: {
    label: 'A',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-bold',
  },
  B: {
    label: 'B',
    className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 font-bold',
  },
  C: {
    label: 'C',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-bold',
  },
};

interface CategoryBadgeProps {
  category: string | null | undefined;
  className?: string;
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  if (!category) return null;
  const config = CATEGORY_CONFIG[category.toUpperCase()];
  if (!config) return <Badge variant="outline" className={className}>{category}</Badge>;

  return (
    <Badge variant="outline" className={cn(config.className, 'text-xs px-2', className)}>
      {config.label}
    </Badge>
  );
}
