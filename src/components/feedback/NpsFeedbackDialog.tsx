import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Heart, Meh, Frown, X, Sparkles } from 'lucide-react';
import { useNpsFeedback } from '@/hooks/useNpsFeedback';
import { notify } from "@/lib/notify";

interface NpsFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NpsFeedbackDialog({ open, onOpenChange }: NpsFeedbackDialogProps) {
  const { t } = useTranslation();
  const { submitFeedback, dismissPrompt, dismissPermanently } = useNpsFeedback();
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const scoreOptions = [
    { value: 0, emoji: '😢', label: '0' },
    { value: 1, emoji: '😕', label: '1' },
    { value: 2, emoji: '😕', label: '2' },
    { value: 3, emoji: '😐', label: '3' },
    { value: 4, emoji: '😐', label: '4' },
    { value: 5, emoji: '😐', label: '5' },
    { value: 6, emoji: '🙂', label: '6' },
    { value: 7, emoji: '🙂', label: '7' },
    { value: 8, emoji: '😊', label: '8' },
    { value: 9, emoji: '😍', label: '9' },
    { value: 10, emoji: '🤩', label: '10' },
  ];

  const handleSubmit = async () => {
    if (score === null) return;

    setSubmitting(true);
    const success = await submitFeedback(score, feedback || undefined);
    setSubmitting(false);

    if (success) {
      setSubmitted(true);
      notify.success(t('nps.thankYou', 'Thank you for your feedback!'));
      setTimeout(() => {
        onOpenChange(false);
      }, 2000);
    } else {
      notify.error(t('nps.error', 'Failed to submit feedback'));
    }
  };

  const handleDismiss = () => {
    dismissPrompt();
    onOpenChange(false);
  };

  const handleDismissPermanently = () => {
    dismissPermanently();
    onOpenChange(false);
  };

  const getScoreColor = (value: number) => {
    if (value <= 2) return 'border-red-400 bg-red-50 dark:bg-red-950/30';
    if (value <= 4) return 'border-orange-400 bg-orange-50 dark:bg-orange-950/30';
    if (value <= 6) return 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30';
    if (value <= 8) return 'border-lime-400 bg-lime-50 dark:bg-lime-950/30';
    return 'border-green-400 bg-green-50 dark:bg-green-950/30';
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-8">
            <div className="h-16 w-16 mx-auto rounded-full bg-gradient-to-br from-accent to-primary/60 flex items-center justify-center mb-4 animate-bounce-in">
              <Sparkles className="h-8 w-8 text-accent-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {t('nps.thankYouTitle', 'Thanks for sharing!')}
            </h3>
            <p className="text-muted-foreground">
              {t('nps.thankYouMessage', 'O seu feedback ajuda-nos a melhorar a plataforma.')}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" />
              {t('nps.title', 'How are we doing?')}
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={handleDismiss} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription>
            {t('nps.description', 'Qual a probabilidade de recomendar a Startup Leiria a outro fundador ou mentor?')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Score selector */}
          <div className="space-y-3">
            <div className="flex justify-between text-xs text-muted-foreground px-1">
              <span className="flex items-center gap-1">
                <Frown className="h-3 w-3" />
                {t('nps.notLikely', 'Not likely')}
              </span>
              <span className="flex items-center gap-1">
                {t('nps.veryLikely', 'Very likely')}
                <Heart className="h-3 w-3" />
              </span>
            </div>
            
            <div className="grid grid-cols-11 gap-1">
              {scoreOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setScore(option.value)}
                  className={cn(
                    'aspect-square rounded-lg border-2 transition-all flex flex-col items-center justify-center text-sm font-medium hover:scale-105',
                    score === option.value
                      ? getScoreColor(option.value) + ' scale-110 shadow-md'
                      : 'border-muted bg-muted/30 hover:border-muted-foreground/30'
                  )}
                >
                  <span className="text-lg leading-none">{option.emoji}</span>
                  <span className="text-[10px] mt-0.5">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Feedback text */}
          {score !== null && (
            <div className="space-y-2 animate-fade-in">
              <label className="text-sm font-medium">
                {score >= 7 
                  ? t('nps.whatDoYouLove', 'O que mais gosta na plataforma?')
                  : t('nps.howCanWeImprove', 'Como podemos melhorar?')}
              </label>
              <Textarea
                placeholder={t('nps.feedbackPlaceholder', 'Your feedback helps us build a better product...')}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={handleDismissPermanently} className="text-muted-foreground">
              {t('nps.dontAskAgain', "Don't ask again")}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDismiss}>
                {t('common.later', 'Later')}
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={score === null || submitting}
              >
                {submitting ? t('common.submitting', 'Submitting...') : t('common.submit', 'Submit')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
