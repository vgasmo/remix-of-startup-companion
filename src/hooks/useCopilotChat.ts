import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`;
const STREAM_TIMEOUT_MS = 25_000;

/**
 * Shared streaming chat hook that talks to the `copilot-chat` edge function.
 * Used by:
 *  - GlobalEcosystemCopilot (FAB)
 *  - CommandPalette (Cmd+K Ask AI)
 *  - GlobalSearchInput (top-bar Ask AI)
 *  - Search page (Ask AI panel)
 */
export function useCopilotChat() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsThinking(false);
  }, []);

  const send = useCallback(async (content: string) => {
    const text = content.trim();
    if (!text || isThinking) return;

    const userMsg: CopilotMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setIsThinking(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
    let assistantSoFar = '';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        toast.error(t('errors.sessionExpired', { defaultValue: 'Session expired. Please sign in again.' }));
        setIsThinking(false);
        return;
      }

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) {
          toast.error(t('errors.rateLimitReached', { defaultValue: 'Rate limit reached. Please wait a few minutes.' }));
        } else if (resp.status === 402) {
          toast.error(t('errors.aiCreditsExhausted', { defaultValue: 'AI credits exhausted. Please add credits.' }));
        } else {
          toast.error(t('errors.aiProcessingError', { defaultValue: 'Error processing with AI. Please try again.' }));
        }
        setIsThinking(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let streamDone = false;

      const upsert = (delta: string) => {
        assistantSoFar += delta;
        const snap = assistantSoFar;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: snap } : m));
          }
          return [...prev, { id: crypto.randomUUID(), role: 'assistant', content: snap }];
        });
      };

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, nl);
          textBuffer = textBuffer.slice(nl + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) upsert(delta);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      if (!assistantSoFar) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: t('copilot.emptyResponse', { defaultValue: 'Não consegui processar o pedido. Tente reformular a pergunta.' }),
        }]);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        if (!assistantSoFar) {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: t('copilot.timeout', { defaultValue: 'O pedido excedeu o tempo limite. Tente novamente.' }),
          }]);
        }
        return;
      }
      logger.warn('copilot_stream_error', { message: err?.message });
      setIsAvailable(false);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: t('copilot.unavailable', { defaultValue: 'O assistente IA não está disponível neste momento.' }),
      }]);
    } finally {
      clearTimeout(timeout);
      setIsThinking(false);
    }
  }, [messages, isThinking, t]);

  return { messages, isThinking, isAvailable, send, reset };
}
