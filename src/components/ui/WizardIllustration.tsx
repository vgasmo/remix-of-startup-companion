// intentional: decorative wizard illustration palette — per-step accent hues, not state semantics
import { ReactNode } from 'react';
import {
  Sparkles,
  TrendingUp,
  Target,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Building2,
  Layers,
  BarChart3,
  BookOpen,
  Bell,
  Rocket,
  PartyPopper,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardIllustrationProps {
  type:
    | 'welcome'
    | 'kpis'
    | 'milestones'
    | 'meeting'
    | 'complete'
    | 'basics'
    | 'stages'
    | 'playbooks'
    | 'alerts'
    | 'review'
    | 'weeksGates';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const illustrations: Record<
  WizardIllustrationProps['type'],
  { icon: React.ElementType; gradient: string; accent: string }
> = {
  welcome: {
    icon: Sparkles,
    gradient: 'from-primary/20 via-primary/10 to-transparent',
    accent: 'text-primary',
  },
  kpis: {
    icon: TrendingUp,
    gradient: 'from-emerald-500/20 via-emerald-500/10 to-transparent',
    accent: 'text-emerald-500',
  },
  milestones: {
    icon: Target,
    gradient: 'from-amber-500/20 via-amber-500/10 to-transparent',
    accent: 'text-amber-500',
  },
  meeting: {
    icon: Calendar,
    gradient: 'from-blue-500/20 via-blue-500/10 to-transparent',
    accent: 'text-blue-500',
  },
  complete: {
    icon: PartyPopper,
    gradient: 'from-green-500/20 via-green-500/10 to-transparent',
    accent: 'text-green-500',
  },
  basics: {
    icon: Building2,
    gradient: 'from-violet-500/20 via-violet-500/10 to-transparent',
    accent: 'text-violet-500',
  },
  stages: {
    icon: Layers,
    gradient: 'from-orange-500/20 via-orange-500/10 to-transparent',
    accent: 'text-orange-500',
  },
  playbooks: {
    icon: BookOpen,
    gradient: 'from-cyan-500/20 via-cyan-500/10 to-transparent',
    accent: 'text-cyan-500',
  },
  alerts: {
    icon: Bell,
    gradient: 'from-rose-500/20 via-rose-500/10 to-transparent',
    accent: 'text-rose-500',
  },
  review: {
    icon: Rocket,
    gradient: 'from-primary/20 via-primary/10 to-transparent',
    accent: 'text-primary',
  },
  weeksGates: {
    icon: CalendarDays,
    gradient: 'from-teal-500/20 via-teal-500/10 to-transparent',
    accent: 'text-teal-500',
  },
};

const sizeClasses = {
  sm: { container: 'h-12 w-12', icon: 'h-6 w-6', ring: 'h-16 w-16' },
  md: { container: 'h-16 w-16', icon: 'h-8 w-8', ring: 'h-24 w-24' },
  lg: { container: 'h-20 w-20', icon: 'h-10 w-10', ring: 'h-28 w-28' },
};

export function WizardIllustration({
  type,
  className,
  size = 'md',
}: WizardIllustrationProps) {
  const config = illustrations[type] || illustrations.welcome;
  const Icon = config.icon;
  const sizes = sizeClasses[size];

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      {/* Outer animated ring */}
      <div
        className={cn(
          'absolute rounded-full bg-gradient-to-br opacity-50 animate-pulse',
          config.gradient,
          sizes.ring
        )}
      />
      {/* Inner solid circle */}
      <div
        className={cn(
          'relative rounded-full bg-gradient-to-br flex items-center justify-center shadow-lg',
          config.gradient,
          sizes.container
        )}
      >
        <Icon className={cn(sizes.icon, config.accent, 'animate-bounce-gentle')} />
      </div>
    </div>
  );
}
