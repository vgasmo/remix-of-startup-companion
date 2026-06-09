import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
  MessageSquare,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  Loader2,
  Star,
  Sparkles,
} from 'lucide-react';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from "@/lib/notify";
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';

interface MentorPostSessionFeedbackProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  sessionTitle: string;
  workspaceId: string;
  startupName: string;
}

export function MentorPostSessionFeedback({
  open,
  onOpenChange,
  sessionId,
  sessionTitle,
  workspaceId,
  startupName,
}: MentorPostSessionFeedbackProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [clarified, setClarified] = useState('');
  const [blocked, setBlocked] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [structuring, setStructuring] = useState(false);

  /** Calls generate-session-summary to auto-structure raw notes */
  const handleStructureNotes = async () => {
    const rawText = [clarified, blocked, nextSteps].filter(Boolean).join('\n');
    if (!rawText.trim()) {
      notify.error(t('mentorFeedback.structureEmpty', { defaultValue: 'Write some notes first.' }));
      return;
    }
    setStructuring(true);
    try {
      const { data, error } = await invokeWithAuth('generate-session-summary', {
        body: { 
          session_id: sessionId,
          raw_notes: rawText,
          language: t('common.langCode', { defaultValue: 'en' }) === 'pt' ? 'pt' : 'en',
        },
      });
      if (error) throw error;
      const result = data as any;
      if (result?.summary) setClarified(result.summary);
      if (result?.action_items) setNextSteps(Array.isArray(result.action_items) ? result.action_items.join('\n') : result.action_items);
      if (result?.private_note) setBlocked(result.private_note);
      notify.success(t('mentorFeedback.structured', { defaultValue: 'Notes structured. Please review before submitting.' }));
    } catch {
      notify.error(t('mentorFeedback.structureError', { defaultValue: 'Could not structure notes. Try again.' }));
    } finally {
      setStructuring(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    
    setSubmitting(true);
    try {
      // Save feedback to session_feedback
      const feedbackText = [
        clarified && `**Clarified:** ${clarified}`,
        blocked && `**Blocked:** ${blocked}`,
        nextSteps && `**Next Steps:** ${nextSteps}`,
      ].filter(Boolean).join('\n\n');

      const { error } = await supabase
        .from('session_feedback')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          rating: rating || 3,
          feedback: feedbackText,
          is_public: true, // Visible to founders and consultants
        });

      if (error) throw error;

      // Log activity
      await supabase.from('activity_log').insert({
        user_id: user.id,
        workspace_id: workspaceId,
        entity_type: 'session',
        entity_id: sessionId,
        action: 'added_mentor_feedback',
        metadata: { rating, has_blockers: !!blocked },
      });

      notify.success(t('mentorFeedback.saved'));
      queryClient.invalidateQueries({ queryKey: ['session-feedback', sessionId] });
      onOpenChange(false);
      
      // Reset form
      setClarified('');
      setBlocked('');
      setNextSteps('');
      setRating(0);
    } catch (error) {
      logger.error('Failed to save feedback', {}, error);
      notify.error(t('mentorFeedback.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            {t('mentorFeedback.title')}
          </DialogTitle>
          <DialogDescription>
            {t('mentorFeedback.description', { startup: startupName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Session Rating */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('mentorFeedback.sessionRating')}</Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className={`p-1 transition-colors ${
                    value <= rating ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground/30'
                  }`}
                >
                  <Star className={`h-6 w-6 ${value <= rating ? 'fill-current' : ''}`} />
                </button>
              ))}
            </div>
          </div>

          {/* What was clarified */}
          <div className="space-y-2">
            <Label htmlFor="clarified" className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
              {t('mentorFeedback.whatClarified')}
            </Label>
            <Textarea
              id="clarified"
              placeholder={t('mentorFeedback.clarifiedPlaceholder')}
              value={clarified}
              onChange={(e) => setClarified(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          {/* What's blocked */}
          <div className="space-y-2">
            <Label htmlFor="blocked" className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-[hsl(var(--warning))]" />
              {t('mentorFeedback.whatBlocked')}
            </Label>
            <Textarea
              id="blocked"
              placeholder={t('mentorFeedback.blockedPlaceholder')}
              value={blocked}
              onChange={(e) => setBlocked(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Recommended next steps */}
          <div className="space-y-2">
            <Label htmlFor="nextSteps" className="flex items-center gap-2 text-sm">
              <Lightbulb className="h-4 w-4 text-primary" />
              {t('mentorFeedback.recommendedNextSteps')}
            </Label>
            <Textarea
              id="nextSteps"
              placeholder={t('mentorFeedback.nextStepsPlaceholder')}
              value={nextSteps}
              onChange={(e) => setNextSteps(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 mr-auto"
            onClick={handleStructureNotes}
            disabled={structuring || submitting}
          >
            {structuring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {t('mentorFeedback.structureNotes', { defaultValue: 'Clean up & Structure' })}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <MessageSquare className="h-4 w-4 mr-2" />
            )}
            {t('mentorFeedback.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
