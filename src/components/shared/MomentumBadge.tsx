import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { MomentumBand } from '@/hooks/useWorkspaceMomentum';

interface MomentumBadgeProps {
  band: MomentumBand;
  score?: number;
  size?: 'sm' | 'md';
  className?: string;
}

const BAND_LABEL: Record<MomentumBand, string> = {
  strong: 'Forte',
  steady: 'Estável',
  slowing: 'A abrandar',
  at_risk: 'Em risco',
};

const BAND_TONE: Record<MomentumBand, string> = {
  strong: 'bg-success/15 text-success border-success/30',
  steady: 'bg-info/15 text-info border-info/30',
  slowing: 'bg-warning/15 text-warning border-warning/30',
  at_risk: 'bg-destructive/15 text-destructive border-destructive/30',
};

export function MomentumBadge({ band, score, size = 'md', className }: MomentumBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        BAND_TONE[band],
        size === 'sm' ? 'h-5 px-1.5 text-[10px]' : 'h-6 px-2 text-xs',
        'font-medium',
        className,
      )}
      title={typeof score === 'number' ? `Momentum: ${score}/100` : undefined}
    >
      {BAND_LABEL[band]}{typeof score === 'number' ? ` · ${score}` : ''}
    </Badge>
  );
}
