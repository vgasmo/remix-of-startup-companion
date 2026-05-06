import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LifeBuoy, Sparkles, Search, CalendarClock, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { useFounderStuckSignal } from '@/hooks/useFounderStuckSignal';

interface FounderHelpNudgeProps {
  /** Workspace id, used for "Book a session" deep-link. */
  workspaceId?: string;
  /** Whether a consultant is associated and bookable. */
  hasConsultant?: boolean;
  /** Contextual starter prompt for the AI assistant. */
  aiStarterPrompt?: string;
  /** Force trigger (e.g., user dismissed checklist while setup incomplete). */
  forceTrigger?: boolean;
  /** Disable trigger (e.g., dashboard not ready yet). */
  enabled?: boolean;
  /** Page label for analytics. */
  pageLabel?: string;
}

function track(event: string, payload: Record<string, unknown> = {}) {
  // Lightweight analytics: log + dispatch a custom event so any analytics layer can pick it up
  logger.info(event, payload);
  try {
    window.dispatchEvent(new CustomEvent('analytics:event', { detail: { event, ...payload } }));
  } catch { /* ignore */ }
}

/**
 * Calm, non-blocking help nudge for founders who appear stuck.
 * Bottom-right on desktop, full-width inline at the bottom on mobile.
 */
export function FounderHelpNudge({
  workspaceId,
  hasConsultant,
  aiStarterPrompt,
  forceTrigger = false,
  enabled = true,
  pageLabel,
}: FounderHelpNudgeProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show, dismiss, acknowledge, isFounder } = useFounderStuckSignal({
    enabled,
    forceTrigger,
  });

  // Fire "shown" once per appearance
  useEffect(() => {
    if (show) track('founder_help_nudge_shown', { page: pageLabel, workspaceId });
  }, [show, pageLabel, workspaceId]);

  if (!isFounder || !show) return null;

  const handleAskAI = () => {
    track('founder_help_nudge_ask_ai', { page: pageLabel, workspaceId });
    acknowledge();
    try {
      window.dispatchEvent(
        new CustomEvent('copilot:open', {
          detail: {
            prompt:
              aiStarterPrompt ||
              t('founderHelpNudge.defaultPrompt', {
                defaultValue: 'Estou um pouco perdido. Por onde devo começar agora?',
              }),
          },
        })
      );
    } catch { /* ignore */ }
  };

  const handleSearch = () => {
    track('founder_help_nudge_search', { page: pageLabel, workspaceId });
    acknowledge();
    // Try to open the global command palette via a custom event;
    // fall back to /search?q=<contextual beginner query>.
    const opened = window.dispatchEvent(
      new CustomEvent('command-palette:open', {
        detail: { query: t('founderHelpNudge.searchQuery', { defaultValue: 'como começar' }) },
      })
    );
    // dispatchEvent always returns true unless preventDefault was used; use it as a hint only.
    const q = encodeURIComponent(
      t('founderHelpNudge.searchQuery', { defaultValue: 'como começar' })
    );
    if (!opened) {
      navigate(`/search?q=${q}`);
      return;
    }
    // Always navigate as a guaranteed fallback; the palette listener (if present)
    // will have already opened by the time this runs.
    navigate(`/search?q=${q}`);
  };

  const handleBookSession = () => {
    track('founder_help_nudge_book_session', { page: pageLabel, workspaceId });
    acknowledge();
    if (workspaceId) {
      navigate(`/workspace/${workspaceId}?tab=agenda`);
    } else {
      navigate('/agenda');
    }
  };

  const handleDismiss = () => {
    track('founder_help_nudge_dismissed', { page: pageLabel, workspaceId });
    dismiss();
  };

  return (
    <div
      className={cn(
        'fixed z-40 px-3 sm:px-0',
        // Mobile: full-width docked, above the floating copilot FAB
        'left-0 right-0 bottom-40',
        // Desktop: bottom-right card
        'sm:left-auto sm:right-6 sm:bottom-24 sm:w-[360px]'
      )}
      role="region"
      aria-label={t('founderHelpNudge.aria', { defaultValue: 'Sugestão de ajuda' })}
    >
      <Card className="border-primary/20 bg-card/95 backdrop-blur shadow-xl rounded-2xl">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-primary/10 shrink-0">
              <LifeBuoy className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-snug">
                {t('founderHelpNudge.title', { defaultValue: 'Sentes-te perdido? Podemos ajudar.' })}
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {t('founderHelpNudge.subtitle', {
                  defaultValue:
                    'Pergunta ao assistente, pesquisa o guia ou marca tempo com o teu consultor.',
                })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 -mt-1 -mr-1 text-muted-foreground"
              onClick={handleDismiss}
              aria-label={t('common.dismiss', { defaultValue: 'Dispensar' })}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-1.5 h-8" onClick={handleAskAI}>
              <Sparkles className="h-3.5 w-3.5" />
              {t('founderHelpNudge.askAi', { defaultValue: 'Perguntar à IA' })}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={handleSearch}>
              <Search className="h-3.5 w-3.5" />
              {t('founderHelpNudge.searchHelp', { defaultValue: 'Pesquisar ajuda' })}
            </Button>
            {hasConsultant && (
              <button
                onClick={handleBookSession}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 ml-auto"
              >
                <CalendarClock className="h-3 w-3" />
                {t('founderHelpNudge.bookSession', { defaultValue: 'Marcar sessão' })}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
