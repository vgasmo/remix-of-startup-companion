import { CheckCircle, PartyPopper, Sparkles, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

type SuccessVariant = 'default' | 'celebration' | 'milestone' | 'achievement';

interface SuccessToastContentProps {
  title: string;
  description?: string;
  variant?: SuccessVariant;
}

const variantConfig: Record<SuccessVariant, { icon: typeof CheckCircle; gradient: string }> = {
  default: {
    icon: CheckCircle,
    gradient: 'from-success/20 to-success/5',
  },
  celebration: {
    icon: PartyPopper,
    gradient: 'from-accent/20 to-accent/5',
  },
  milestone: {
    icon: Trophy,
    gradient: 'from-primary/20 to-primary/5',
  },
  achievement: {
    icon: Sparkles,
    gradient: 'from-[hsl(var(--warning))]/20 to-[hsl(var(--warning))]/5',
  },
};

/**
 * Premium success toast content with celebration variants.
 * P1: Human-centered feedback for positive actions.
 * 
 * Usage with sonner:
 * toast.success(<SuccessToastContent title="..." variant="celebration" />)
 */
export function SuccessToastContent({ 
  title, 
  description, 
  variant = 'default' 
}: SuccessToastContentProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div className={cn(
      'flex items-start gap-3 p-1 rounded-lg bg-gradient-to-r',
      config.gradient
    )}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/20">
        <Icon className="h-4 w-4 text-success" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          {title}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Quick success message generator for common actions
 */
export const successMessages = {
  saved: (item: string) => ({ title: `${item} guardado`, variant: 'default' as const }),
  created: (item: string) => ({ title: `${item} criado`, variant: 'celebration' as const }),
  updated: (item: string) => ({ title: `${item} atualizado`, variant: 'default' as const }),
  deleted: (item: string) => ({ title: `${item} eliminado`, variant: 'default' as const }),
  completed: (item: string) => ({ title: `${item} concluído!`, variant: 'milestone' as const }),
  achieved: (item: string) => ({ title: `${item} conquistado!`, variant: 'achievement' as const }),
};
