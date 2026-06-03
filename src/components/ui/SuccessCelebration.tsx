import { useEffect, useState } from 'react';
import { clickableProps } from '@/lib/clickable';

import confetti from 'canvas-confetti';
import { CheckCircle2, PartyPopper, Sparkles, Star, Trophy, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

type CelebrationType = 'confetti' | 'sparkle' | 'trophy' | 'rocket';

interface SuccessCelebrationProps {
  show: boolean;
  type?: CelebrationType;
  title?: string;
  subtitle?: string;
  duration?: number;
  onComplete?: () => void;
  className?: string;
}

/**
 * P2: Success celebration component with confetti and animations
 * Use for milestone completions, KPI updates, session bookings, etc.
 */
export function SuccessCelebration({
  show,
  type = 'confetti',
  title = 'Great job!',
  subtitle,
  duration = 3000,
  onComplete,
  className,
}: SuccessCelebrationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);

      // Trigger confetti
      if (type === 'confetti') {
        const end = Date.now() + 1500;
        const colors = ['#c8e600', '#cc2936', '#22c55e', '#f59e0b']; // brand colors

        (function frame() {
          confetti({
            particleCount: 3,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors,
          });
          confetti({
            particleCount: 3,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors,
          });

          if (Date.now() < end) {
            requestAnimationFrame(frame);
          }
        })();
      }

      // Auto-dismiss
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [show, type, duration, onComplete]);

  if (!visible) return null;

  const icons = {
    confetti: PartyPopper,
    sparkle: Sparkles,
    trophy: Trophy,
    rocket: Rocket,
  };

  const Icon = icons[type];

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in',
        className
      )}
      {...clickableProps(() => {
        setVisible(false);
        onComplete?.();
      }, { label: 'Dismiss celebration' })}
    >

      <div className="relative animate-bounce-in">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-accent/30 to-primary/30 rounded-full blur-3xl scale-150 animate-pulse" />
        
        {/* Main content */}
        <div className="relative bg-card rounded-3xl p-8 shadow-2xl border text-center max-w-sm mx-4">
          {/* Icon */}
          <div className="h-20 w-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center shadow-lg shadow-accent/30 animate-bounce-gentle">
            <Icon className="h-10 w-10 text-accent-foreground" />
          </div>

          {/* Stars around */}
          <Star className="absolute top-4 left-4 h-4 w-4 text-accent animate-pulse" />
          <Star className="absolute top-8 right-6 h-3 w-3 text-primary animate-pulse" style={{ animationDelay: '0.3s' }} />
          <Star className="absolute bottom-12 left-8 h-5 w-5 text-accent animate-pulse" style={{ animationDelay: '0.6s' }} />

          {/* Text */}
          <h2 className="font-heading text-2xl font-bold text-foreground mb-2">{title}</h2>
          {subtitle && (
            <p className="text-muted-foreground">{subtitle}</p>
          )}

          {/* Check mark */}
          <div className="mt-6 flex justify-center">
            <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Click anywhere to continue
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Trigger a quick confetti burst without the full celebration modal
 */
export function triggerConfetti() {
  const colors = ['#c8e600', '#cc2936', '#22c55e', '#f59e0b'];
  
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors,
  });
}

/**
 * Trigger a small confetti burst from a specific element
 */
export function triggerLocalConfetti(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const x = (rect.left + rect.width / 2) / window.innerWidth;
  const y = (rect.top + rect.height / 2) / window.innerHeight;
  
  confetti({
    particleCount: 50,
    spread: 60,
    origin: { x, y },
    colors: ['#c8e600', '#cc2936', '#22c55e'],
  });
}