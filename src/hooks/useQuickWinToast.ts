import { useTranslation } from 'react-i18next';
import { notify } from "@/lib/notify";
import confetti from 'canvas-confetti';

type QuickWinType = 
  | 'pitch_deck_uploaded'
  | 'kpi_added'
  | 'milestone_completed'
  | 'weekly_wins_submitted'
  | 'monthly_wins_submitted'
  | 'investor_update_created'
  | 'dataroom_link_created'
  | 'first_session_scheduled'
  | 'mentor_requested';

const QUICK_WIN_CONFETTI_DELAY = 100;

/**
 * Hook for showing celebratory "quick win" toasts when founders complete key actions.
 * Helps build momentum and positive reinforcement.
 */
export function useQuickWinToast() {
  const { t } = useTranslation();

  const showQuickWin = (type: QuickWinType, options?: { skipConfetti?: boolean }) => {
    const messages: Record<QuickWinType, { title: string; description: string }> = {
      pitch_deck_uploaded: {
        title: t('quickWins.pitchDeckUploaded.title'),
        description: t('quickWins.pitchDeckUploaded.description'),
      },
      kpi_added: {
        title: t('quickWins.kpiAdded.title'),
        description: t('quickWins.kpiAdded.description'),
      },
      milestone_completed: {
        title: t('quickWins.milestoneCompleted.title'),
        description: t('quickWins.milestoneCompleted.description'),
      },
      weekly_wins_submitted: {
        title: t('quickWins.weeklyWinsSubmitted.title'),
        description: t('quickWins.weeklyWinsSubmitted.description'),
      },
      monthly_wins_submitted: {
        title: t('quickWins.monthlyWinsSubmitted.title', 'Monthly Wins Submitted! 🎉'),
        description: t('quickWins.monthlyWinsSubmitted.description', 'Great job tracking your progress this month!'),
      },
      investor_update_created: {
        title: t('quickWins.investorUpdateCreated.title'),
        description: t('quickWins.investorUpdateCreated.description'),
      },
      dataroom_link_created: {
        title: t('quickWins.dataroomLinkCreated.title'),
        description: t('quickWins.dataroomLinkCreated.description'),
      },
      first_session_scheduled: {
        title: t('quickWins.firstSessionScheduled.title'),
        description: t('quickWins.firstSessionScheduled.description'),
      },
      mentor_requested: {
        title: t('quickWins.mentorRequested.title'),
        description: t('quickWins.mentorRequested.description'),
      },
    };

    const message = messages[type];
    
    // Show toast
    notify.success(message.title, {
      description: message.description,
      duration: 4000,
    });

    // Trigger confetti for significant wins
    if (!options?.skipConfetti) {
      const significantWins: QuickWinType[] = [
        'pitch_deck_uploaded',
        'milestone_completed',
        'investor_update_created',
        'first_session_scheduled',
      ];

      if (significantWins.includes(type)) {
        setTimeout(() => {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.7 },
            colors: ['#84cc16', '#22c55e', '#10b981'],
          });
        }, QUICK_WIN_CONFETTI_DELAY);
      }
    }
  };

  return { showQuickWin };
}