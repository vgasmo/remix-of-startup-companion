import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionFeedback, useMySessionFeedback, useSubmitFeedback } from '@/hooks/useSessionFeedback';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { notify } from "@/lib/notify";
import { Star, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SessionFeedbackProps {
  sessionId: string;
  sessionTitle: string;
}

export function SessionFeedbackCard({ sessionId, sessionTitle }: SessionFeedbackProps) {
  const { t } = useTranslation();
  const { data: allFeedback } = useSessionFeedback(sessionId);
  const { data: myFeedback } = useMySessionFeedback(sessionId);
  const submitFeedback = useSubmitFeedback();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rating, setRating] = useState(myFeedback?.rating || 0);
  const [feedback, setFeedback] = useState(myFeedback?.feedback || '');
  const [hoveredStar, setHoveredStar] = useState(0);

  const handleSubmit = async () => {
    if (rating === 0) {
      notify.error(t('sessions.pleaseSelectARating'));
      return;
    }
    try {
      await submitFeedback.mutateAsync({
        session_id: sessionId,
        rating,
        feedback: feedback.trim() || undefined,
        is_public: true,
      });
      notify.success(t('sessions.feedbackSubmitted'));
      setDialogOpen(false);
    } catch (error: any) {
      notify.error(error.message || t('common.errorGeneric'));
    }
  };

  const avgRating = allFeedback?.length 
    ? (allFeedback.reduce((sum, f) => sum + f.rating, 0) / allFeedback.length).toFixed(1)
    : null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Star className="h-4 w-4" />
              Session Feedback
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Rate and comment on this session (visible to all participants)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            setRating(myFeedback?.rating || 0);
            setFeedback(myFeedback?.feedback || '');
            setDialogOpen(true);
          }}>
            {myFeedback ? 'Edit Feedback' : 'Give Feedback'}
          </Button>
        </CardHeader>
        <CardContent>
          {avgRating && (
            <div className="flex items-center gap-2 mb-4">
              <div className="flex">
                {[1, 2, 3, 4, 5].map(star => (
                  <Star key={star} className={`h-5 w-5 ${star <= parseFloat(avgRating) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                ))}
              </div>
              <span className="font-medium">{avgRating}</span>
              <span className="text-muted-foreground">({allFeedback?.length} review{allFeedback?.length !== 1 ? 's' : ''})</span>
            </div>
          )}
          
          {allFeedback?.filter(f => f.feedback).slice(0, 3).map(f => (
            <div key={f.id} className="flex gap-3 py-3 border-t first:border-t-0">
              <Avatar className="h-8 w-8">
                <AvatarImage src={f.user?.avatar_url || undefined} />
                <AvatarFallback>{f.user?.full_name?.[0] || '?'}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{f.user?.full_name || 'Anonymous'}</span>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star key={star} className={`h-3 w-3 ${star <= f.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{f.feedback}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}</p>
              </div>
            </div>
          ))}
          
          {!allFeedback?.length && (
            <p className="text-sm text-muted-foreground">{t('sessions.noFeedback', 'Sem feedback ainda. Seja o primeiro!')}</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sessions.rateSession', { title: sessionTitle, defaultValue: 'Avaliar Sessão: {{title}}' })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('sessions.rating', 'Avaliação')}</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(0)}
                    onClick={() => setRating(star)}
                    className="p-1"
                  >
                    <Star className={`h-8 w-8 transition-colors ${
                      star <= (hoveredStar || rating) 
                        ? 'fill-yellow-400 text-yellow-400' 
                        : 'text-muted-foreground hover:text-yellow-300'
                    }`} />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('sessions.commentsOptional', 'Comentários (opcional)')}</p>
              <Textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Share your thoughts about this session..."
                rows={4}
              />
            </div>
          </div>
           <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel', { defaultValue: 'Cancelar' })}</Button>
            <Button onClick={handleSubmit} disabled={submitFeedback.isPending}>{t('common.submit', { defaultValue: 'Submeter' })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
