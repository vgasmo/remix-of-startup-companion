import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@/lib/logger';
import { useTranslation } from 'react-i18next';
import { Sparkles, X, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { supabaseClient } from '@/lib/supabaseClient';

interface AiPulseCardProps {
  workspaceId: string;
  healthScore?: string | null;
  overdueCount?: number;
  className?: string;
}

const PULSE_COOLDOWN_KEY = 'ai-pulse-last-fired';
const PULSE_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const PULSE_DISMISSED_KEY = 'ai-pulse-dismissed';
const PULSE_TIMEOUT_MS = 15_000; // 15s max wait

/** Static fallback tips when AI backend is unavailable */
function getStaticTip(healthScore: string | null | undefined, overdueCount: number, t: (k: string, o?: any) => string): string {
  if (overdueCount >= 2) {
    return t('aiPulse.fallback.overdue', {
      defaultValue: 'Tem {{count}} ações em atraso. Priorize as mais críticas e atualize o estado das concluídas.',
      count: overdueCount,
    });
  }
  if (healthScore === 'critical') {
    return t('aiPulse.fallback.critical', {
      defaultValue: 'A saúde da sua startup está em estado crítico. Reveja os KPIs pendentes e agende uma sessão com o seu consultor.',
    });
  }
  if (healthScore === 'at_risk') {
    return t('aiPulse.fallback.atRisk', {
      defaultValue: 'A sua startup está em risco. Atualize os KPIs deste mês e verifique as ações pendentes.',
    });
  }
  return t('aiPulse.fallback.generic', {
    defaultValue: 'Mantenha os seus KPIs atualizados e reveja as ações pendentes regularmente.',
  });
}

export function AiPulseCard({ workspaceId, healthScore, overdueCount = 0, className }: AiPulseCardProps) {
  const { t } = useTranslation();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const hasFired = useRef(false);

  const shouldTrigger = useCallback(() => {
    const needsPulse = healthScore === 'at_risk' || healthScore === 'critical' || overdueCount >= 2;
    if (!needsPulse) return false;

    const lastFired = localStorage.getItem(`${PULSE_COOLDOWN_KEY}-${workspaceId}`);
    if (lastFired) {
      const elapsed = Date.now() - parseInt(lastFired, 10);
      if (elapsed < PULSE_COOLDOWN_MS) return false;
    }

    const dismissedSession = sessionStorage.getItem(`${PULSE_DISMISSED_KEY}-${workspaceId}`);
    if (dismissedSession === 'true') return false;

    return true;
  }, [healthScore, overdueCount, workspaceId]);

  useEffect(() => {
    if (hasFired.current || !shouldTrigger() || !workspaceId) return;
    hasFired.current = true;

    const fetchPulse = async () => {
      // Pre-flight: if URL not configured, skip AI entirely
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        setSuggestion(getStaticTip(healthScore, overdueCount, t));
        setIsFallback(true);
        return;
      }

      setLoading(true);
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), PULSE_TIMEOUT_MS);

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.access_token) {
          setSuggestion(getStaticTip(healthScore, overdueCount, t));
          setIsFallback(true);
          return;
        }

        localStorage.setItem(`${PULSE_COOLDOWN_KEY}-${workspaceId}`, Date.now().toString());

        const prompt = overdueCount >= 2
          ? `I have ${overdueCount} overdue actions and my health score is "${healthScore || 'unknown'}". Give me 2-3 concise, actionable next steps to get back on track. Be direct, under 80 words.`
          : `My startup health is "${healthScore}". Give me 2-3 concise, actionable next steps to improve. Be direct, under 80 words.`;

        const resp = await fetch(
          `${supabaseUrl}/functions/v1/copilot-chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              messages: [{ role: 'user', content: prompt }],
            }),
            signal: abortController.signal,
          }
        );

        if (!resp.ok || !resp.body) {
          setSuggestion(getStaticTip(healthScore, overdueCount, t));
          setIsFallback(true);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let result = '';
        let textBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);
            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) result += delta;
            } catch { /* skip */ }
          }
        }

        if (result.trim()) {
          setSuggestion(result.trim());
        } else {
          setSuggestion(getStaticTip(healthScore, overdueCount, t));
          setIsFallback(true);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          logger.warn('ai_pulse_unavailable', { reason: 'fallback' });
        }
        setSuggestion(getStaticTip(healthScore, overdueCount, t));
        setIsFallback(true);
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchPulse, 2000);
    return () => clearTimeout(timer);
  }, [shouldTrigger, workspaceId, healthScore, overdueCount, t]);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(`${PULSE_DISMISSED_KEY}-${workspaceId}`, 'true');
  };

  if (dismissed || (!loading && !suggestion)) return null;

  return (
    <Card className={cn(
      'border-primary/20 overflow-hidden transition-all duration-500 animate-in fade-in slide-in-from-top-2',
      className,
    )}>
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent pointer-events-none" />
      <CardContent className="relative p-4">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            {isFallback
              ? <Lightbulb className="h-4 w-4 text-primary" />
              : <Sparkles className="h-4 w-4 text-primary" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wide">
                {isFallback
                  ? t('aiPulse.titleFallback', { defaultValue: 'Sugestão' })
                  : t('aiPulse.title', { defaultValue: 'Sugestão IA' })
                }
              </h4>
            </div>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ) : (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                {suggestion}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
           aria-label={t('common.close')}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
