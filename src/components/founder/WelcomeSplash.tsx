import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { BrandSurface } from '@/components/ui/BrandSurface';
import { BrandChevron } from '@/components/ui/BrandChevron';

interface WelcomeSplashProps {
  userId?: string | null;
  onDismiss?: () => void;
}

/**
 * WelcomeSplash — one-time "stage curtain" moment shown to a brand-new
 * founder after the welcome wizard completes. Auto-dismisses after 5s.
 * Gated by localStorage key `welcomed_{userId}`.
 */
export function WelcomeSplash({ userId, onDismiss }: WelcomeSplashProps) {
  const { t } = useTranslation();
  const storageKey = userId ? `welcomed_${userId}` : null;

  const [visible, setVisible] = useState<boolean>(() => {
    if (!storageKey) return false;
    try {
      return localStorage.getItem(storageKey) !== '1';
    } catch {
      return false;
    }
  });

  // Mark as shown immediately so it never replays, even if the user reloads.
  useEffect(() => {
    if (!visible || !storageKey) return;
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      /* ignore */
    }
  }, [visible, storageKey]);

  // Auto-dismiss after 5s.
  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 5000);
    return () => window.clearTimeout(id);
  }, [visible, onDismiss]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('welcomeSplash.title', { defaultValue: 'Bem-vindo ao Startup Leiria' })}
      className="fixed inset-0 z-50 bg-background motion-safe:animate-fade-in"
    >
      <BrandSurface
        intensity="hero"
        className="surface-hero relative h-full w-full flex items-center justify-center overflow-hidden px-6"
      >
        <BrandChevron
          color="lime"
          size={420}
          strokeWidth={2}
          className="pointer-events-none absolute -right-20 -bottom-20 opacity-[0.07] motion-safe:animate-scale-in"
        />

        <div className="relative max-w-xl text-center space-y-5">
          <div className="flex justify-center motion-safe:animate-scale-in">
            <BrandChevron color="lime" size={56} strokeWidth={3} />
          </div>
          <h1 className="text-display text-foreground break-words">
            {t('welcomeSplash.title', { defaultValue: 'Bem-vindo ao Startup Leiria' })}
          </h1>
          <p className="text-body text-muted-foreground max-w-md mx-auto">
            {t('welcomeSplash.subtitle', {
              defaultValue: 'O seu espaço está pronto. Vamos começar a construir juntos.',
            })}
          </p>
          <div className="pt-2">
            <Button size="lg" onClick={dismiss} className="gap-2 btn-press">
              {t('welcomeSplash.cta', { defaultValue: 'Começar' })}
            </Button>
          </div>
        </div>
      </BrandSurface>
    </div>
  );
}
