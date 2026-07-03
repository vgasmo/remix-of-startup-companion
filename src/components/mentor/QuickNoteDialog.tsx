import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StickyNote, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';
import { track } from '@/lib/analytics';

interface QuickNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  startupName?: string;
}

export function QuickNoteDialog({ open, onOpenChange, workspaceId, startupName }: QuickNoteDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!content.trim() || !user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('consultant_notes').insert({
        workspace_id: workspaceId,
        author_id: user.id,
        content: content.trim(),
        is_private: false,
        visibility: 'team',
      });
      if (error) throw error;

      // Auto-log mentoring time (invisible to mentor UI, feeds Impact page).
      // Best-effort: swallow failures so note save is not blocked.
      try {
        await supabase.from('time_entries').insert({
          workspace_id: workspaceId,
          user_id: user.id,
          date: new Date().toISOString().split('T')[0],
          hours: 0.5,
          category: 'mentoring',
          description: 'Sessão de mentoria (auto)',
        });
      } catch { /* ignore */ }

      void track('mentor_session_logged', { workspaceId });
      notify.success(t('mentor.noteAdded', { defaultValue: 'Nota adicionada com sucesso' }));
      setContent('');
      onOpenChange(false);
    } catch (err) {
      logger.error('mentor_quick_note_save_failed', { workspaceId }, err);
      notify.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" />
            {t('mentor.quickNote', { defaultValue: 'Nota Rápida' })}
            {startupName && <span className="text-muted-foreground font-normal text-sm">— {startupName}</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground flex items-center gap-1 -mt-2 mb-2">
          <StickyNote className="h-3 w-3" />
          {t('mentor.noteVisibility', { defaultValue: 'Esta nota será visível para a equipa de staff.' })}
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t('mentor.quickNotePlaceholder', { defaultValue: 'Escreva a sua nota sobre esta startup...' })}
          className="min-h-[120px] resize-none"
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!content.trim() || saving} loading={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
