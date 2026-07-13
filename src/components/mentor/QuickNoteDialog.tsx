import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StickyNote, Loader2, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  const [logTime, setLogTime] = useState(false);
  const [hours, setHours] = useState('0.5');
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

      // Explicit, opt-in time logging. No silent auto-insert — mentors now
      // control their own Impact numbers via the checkbox below.
      if (logTime) {
        const parsedHours = Number(hours);
        if (Number.isFinite(parsedHours) && parsedHours > 0) {
          const today = new Date().toISOString().split('T')[0];
          const { error: teErr } = await supabase.from('time_entries').insert({
            workspace_id: workspaceId,
            user_id: user.id,
            date: today,
            hours: parsedHours,
            category: 'mentoring',
            description: t('mentor.timeEntryDescription', { defaultValue: 'Sessão de mentoria' }),
          });
          if (teErr) {
            logger.warn('mentor_time_entry_failed', { workspaceId, err: teErr });
            notify.warn(t('mentor.timeEntryFailed', { defaultValue: 'Nota guardada, mas não foi possível registar o tempo.' }));
          }
        }
      }

      void track('mentor_session_logged', { workspaceId });
      notify.success(t('mentor.noteAdded', { defaultValue: 'Nota adicionada com sucesso' }));
      setContent('');
      setLogTime(false);
      setHours('0.5');
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

        <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              checked={logTime}
              onCheckedChange={(v) => setLogTime(v === true)}
              aria-label={t('mentor.logTimeOptional', { defaultValue: 'Registar tempo (opcional)' })}
            />
            <div className="flex-1">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />
                {t('mentor.logTimeOptional', { defaultValue: 'Registar tempo (opcional)' })}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('mentor.logTimeHelp', { defaultValue: 'As horas contam para o seu painel de Impacto.' })}
              </p>
            </div>
          </label>
          {logTime && (
            <div className="pl-6">
              <Label htmlFor="mentor-hours" className="text-xs">
                {t('mentor.hours', { defaultValue: 'Horas' })}
              </Label>
              <Input
                id="mentor-hours"
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="h-8 mt-1 max-w-[100px]"
              />
            </div>
          )}
        </div>

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
