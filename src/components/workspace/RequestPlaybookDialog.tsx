import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';

interface RequestPlaybookDialogProps {
  workspaceId: string;
  playbookId?: string;
  playbookTitle?: string;
  trigger?: React.ReactNode;
}

/**
 * Dialog for founders to request a specific or custom playbook.
 * Uses edge function to create consultant_notes since founders cannot insert directly.
 */
export function RequestPlaybookDialog({ 
  workspaceId, 
  playbookId, 
  playbookTitle,
  trigger 
}: RequestPlaybookDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState('');
  const [urgency, setUrgency] = useState<'this_week' | 'this_month'>('this_month');
  const [context, setContext] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Prefill goal when requesting a specific playbook
  useEffect(() => {
    if (open && playbookTitle) {
      setGoal(t('requestPlaybook.prefillGoal', { title: playbookTitle }));
    }
  }, [open, playbookTitle, t]);

  const handleSubmit = async () => {
    if (!goal.trim()) {
      notify.error(t('requestPlaybook.goalRequired'));
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Call edge function to create the request (bypasses RLS)
      const response = await supabase.functions.invoke('request-playbook', {
        body: {
          workspaceId,
          playbookId,
          playbookTitle,
          goal,
          urgency,
          context,
        },
      });

      if (response.error) throw response.error;

      notify.success(t('requestPlaybook.submitted'));
      queryClient.invalidateQueries({ queryKey: ['consultant-notes', workspaceId] });
      setOpen(false);
      // Reset form
      setGoal('');
      setContext('');
      setUrgency('this_month');
    } catch (error: unknown) {
      logger.error('Failed to submit playbook request', {}, error);
      // Keep dialog open on failure so user can retry
      notify.error(t('requestPlaybook.failed'), {
        description: t('requestPlaybook.failedHint'),
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <MessageSquarePlus className="h-4 w-4" />
            {t('requestPlaybook.trigger')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {playbookTitle 
              ? t('requestPlaybook.titleSpecific', { title: playbookTitle })
              : t('requestPlaybook.title')
            }
          </DialogTitle>
          <DialogDescription>
            {playbookTitle 
              ? t('requestPlaybook.descriptionSpecific')
              : t('requestPlaybook.description')
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="goal">{t('requestPlaybook.goalLabel')} *</Label>
            <Textarea
              id="goal"
              placeholder={t('requestPlaybook.goalPlaceholder')}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label>{t('requestPlaybook.urgencyLabel')}</Label>
            <RadioGroup value={urgency} onValueChange={(v) => setUrgency(v as typeof urgency)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="this_week" id="this_week" />
                <Label htmlFor="this_week" className="font-normal">
                  {t('requestPlaybook.thisWeek')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="this_month" id="this_month" />
                <Label htmlFor="this_month" className="font-normal">
                  {t('requestPlaybook.thisMonth')}
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="context">{t('requestPlaybook.contextLabel')}</Label>
            <Textarea
              id="context"
              placeholder={t('requestPlaybook.contextPlaceholder')}
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !goal.trim()}>
            {isSubmitting ? (
              <>{t('common.sending')}</>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {t('requestPlaybook.submit')}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
