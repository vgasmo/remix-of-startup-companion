import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, CheckCircle, XCircle, Clock, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePlaybookEvidence, useSubmitEvidence, useReviewEvidence, PlaybookEvidence } from '@/hooks/usePlaybookEvidence';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { pt, enUS } from 'date-fns/locale';

interface PlaybookEvidenceDialogProps {
  workspaceId: string;
  playbookItemId: string;
  playbookItemTitle: string;
  canWrite?: boolean;
}

export function PlaybookEvidenceDialog({ workspaceId, playbookItemId, playbookItemTitle, canWrite }: PlaybookEvidenceDialogProps) {
  const { t, i18n } = useTranslation();
  const { isConsultor, isAdmin } = useAuth();
  const isStaff = isConsultor || isAdmin;
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: allEvidence } = usePlaybookEvidence(workspaceId);
  const submitEvidence = useSubmitEvidence();
  const reviewEvidence = useReviewEvidence();

  const evidence = allEvidence?.filter(e => e.playbook_item_id === playbookItemId) || [];
  const hasApproved = evidence.some(e => e.review_status === 'approved');
  const hasPending = evidence.some(e => e.review_status === 'pending');
  const locale = i18n.language === 'pt' ? pt : enUS;

  const handleSubmit = async () => {
    if (!notes.trim() && !file) return;
    await submitEvidence.mutateAsync({
      workspaceId,
      playbookItemId,
      file: file || undefined,
      notes: notes.trim() || undefined,
    });
    setNotes('');
    setFile(null);
  };

  const handleReview = (evidenceId: string, status: 'approved' | 'rejected') => {
    reviewEvidence.mutate({
      evidenceId,
      status,
      reviewNotes: reviewNotes.trim() || undefined,
      workspaceId,
    });
    setReviewNotes('');
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      approved: 'border-green-500 text-green-600',
      rejected: 'border-destructive text-destructive',
      pending: 'border-amber-500 text-amber-600',
    };
    return (
      <Badge variant="outline" className={`gap-1 ${variants[status] || ''}`}>
        {statusIcon(status)}
        {t(`playbooks.evidence.${status}`, status)}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-7"
          title={t('playbooks.evidence.submit', 'Submeter evidência')}
        >
          {hasApproved ? (
            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
          ) : hasPending ? (
            <Clock className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          <span className="text-xs">
            {hasApproved 
              ? t('playbooks.evidence.verified', 'Verificado') 
              : hasPending 
                ? t('playbooks.evidence.pending', 'Pendente')
                : t('playbooks.evidence.addEvidence', 'Evidência')}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] !flex !flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('playbooks.evidence.title', 'Evidência')} — {playbookItemTitle}
          </DialogTitle>
        </DialogHeader>

        {/* Existing evidence */}
        {evidence.length > 0 && (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-3">
              {evidence.map(ev => (
                <div key={ev.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    {statusBadge(ev.review_status)}
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true, locale })}
                    </span>
                  </div>
                  {ev.notes && <p className="text-sm">{ev.notes}</p>}
                  {ev.file_path && (
                    <div className="flex items-center gap-1 text-xs text-primary">
                      <FileText className="h-3 w-3" />
                      {ev.file_path.split('/').pop()}
                    </div>
                  )}
                  {ev.review_notes && (
                    <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-2">
                      {ev.review_notes}
                    </p>
                  )}

                  {/* Staff review actions */}
                  {isStaff && ev.review_status === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <Textarea
                        placeholder={t('playbooks.evidence.reviewNote', 'Nota de review...')}
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        className="text-sm h-16"
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-green-600 border-green-500 hover:bg-green-50"
                          onClick={() => handleReview(ev.id, 'approved')}
                          disabled={reviewEvidence.isPending}
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-destructive border-destructive hover:bg-destructive/5"
                          onClick={() => handleReview(ev.id, 'rejected')}
                          disabled={reviewEvidence.isPending}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Submit new evidence (founders only) */}
        {canWrite && !isStaff && (
          <div className="shrink-0 space-y-3 border-t pt-3">
            <Textarea
              placeholder={t('playbooks.evidence.notesPlaceholder', 'Descreva o que fez, resultados obtidos...')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-sm"
            />
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="gap-1"
              >
                <Upload className="h-3.5 w-3.5" />
                {file ? file.name : t('playbooks.evidence.attachFile', 'Anexar ficheiro')}
              </Button>
              <div className="flex-1" />
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitEvidence.isPending || (!notes.trim() && !file)}
                className="gap-1"
              >
                <Send className="h-3.5 w-3.5" />
                {t('playbooks.evidence.submit', 'Submeter')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}