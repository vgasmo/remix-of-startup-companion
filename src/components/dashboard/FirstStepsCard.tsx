import { useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, ArrowRight, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export interface FirstStepItem {
  id: string;
  label: string;
  description?: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

interface FirstStepsCardProps {
  /** Unique storage key suffix, e.g. "consultor" | "backoffice" | "admin" | "mentor" */
  storageScope: string;
  title: string;
  subtitle?: string;
  items: FirstStepItem[];
  className?: string;
}

/**
 * Dismissible "primeiros passos" card shown once per user+role.
 * Persistence uses localStorage: `sl-first-steps-{userId}-{scope}`.
 * Kept intentionally lightweight — no DB writes.
 */
export function FirstStepsCard({ storageScope, title, subtitle, items, className }: FirstStepsCardProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const storageKey = user?.id ? `sl-first-steps-${user.id}-${storageScope}` : null;
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    if (!storageKey) return;
    try {
      setDismissed(localStorage.getItem(storageKey) === '1');
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  if (dismissed || !items.length) return null;

  const handleDismiss = () => {
    if (storageKey) {
      try { localStorage.setItem(storageKey, '1'); } catch { /* ignore */ }
    }
    setDismissed(true);
  };

  return (
    <Card className={cn('border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background', className)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 flex-shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold font-heading">{title}</h3>
                {subtitle && (
                  <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 -mr-1 -mt-1 text-muted-foreground hover:text-foreground"
                onClick={handleDismiss}
                aria-label={t('common.dismiss', { defaultValue: 'Dispensar' })}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ul className="mt-3 space-y-1.5">
              {items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      className="group flex items-center gap-3 rounded-md border border-transparent px-2 py-2 text-sm hover:border-border hover:bg-muted/50 transition-colors"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                        {i + 1}
                      </span>
                      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 truncate">
                        <span className="font-medium">{item.label}</span>
                        {item.description && (
                          <span className="text-muted-foreground"> — {item.description}</span>
                        )}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
