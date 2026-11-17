import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// intentional: A/B/C taxonomy palette — distinct hue per ecosystem category, not state semantics
const CATEGORY_CONFIG: Record<string, { label: string; className: string }> = {
  A: {
    label: 'A',
    className: 'bg-success/15 text-success border-success/30 font-bold',
  },
  B: {
    label: 'B',
    className: 'bg-primary/15 text-primary border-primary/30 font-bold',
  },
  C: {
    label: 'C',
    className: 'bg-warning/15 text-warning-strong border-warning/30 font-bold',
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
