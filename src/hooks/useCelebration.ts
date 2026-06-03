/**
 * useCelebration — fire confetti + toast for milestone-class events.
 * Idempotent via the `workspace_celebrations` table: each event_key fires
 * exactly once per workspace.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { notify } from "@/lib/notify";
import confetti from 'canvas-confetti';
import { supabase } from '@/lib/supabaseClient';

export type CelebrationEvent =
  | 'first_template_submitted'
  | 'first_milestone_completed'
  | 'first_checkin_submitted';

const COPY: Record<CelebrationEvent, { titleKey: string; descKey: string; fallback: { title: string; desc: string } }> = {
  first_template_submitted: {
    titleKey: 'celebrations.firstTemplate.title',
    descKey: 'celebrations.firstTemplate.desc',
    fallback: { title: 'Primeiro template entregue! 🎉', desc: 'Continue com este momentum.' },
  },
  first_milestone_completed: {
    titleKey: 'celebrations.firstMilestone.title',
    descKey: 'celebrations.firstMilestone.desc',
    fallback: { title: 'Marco concluído! 🚀', desc: 'Mais um passo no caminho.' },
  },
  first_checkin_submitted: {
    titleKey: 'celebrations.firstCheckin.title',
    descKey: 'celebrations.firstCheckin.desc',
    fallback: { title: 'Primeiro check-in submetido ✅', desc: 'A consistência traz resultados.' },
  },
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function fireConfetti() {
  if (prefersReducedMotion()) return;
  const end = Date.now() + 600;
  const colors = ['#c82333', '#fbbf24', '#10b981'];
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
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

export function useCelebration() {
  const { t } = useTranslation();

  const celebrate = useCallback(
    async (workspaceId: string, event: CelebrationEvent) => {
      // Idempotency: insert; unique (workspace_id, event_key) blocks repeats.
      const { error } = await supabase
        .from('workspace_celebrations')
        .insert({ workspace_id: workspaceId, event_key: event });

      // 23505 = unique violation → already fired, do nothing.
      if (error && (error as any).code !== '23505') {
        // Swallow — celebrations are non-critical visibility, not core flow.
        console.warn('[celebration] insert failed', error);
        return;
      }
      if (error) return; // duplicate, skip UI

      const c = COPY[event];
      fireConfetti();
      notify.success(t(c.titleKey, c.fallback.title), {
        description: t(c.descKey, c.fallback.desc),
        duration: 5000,
      });
    },
    [t]
  );

  return { celebrate };
}
