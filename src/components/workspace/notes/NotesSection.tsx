import { timeAgo } from '@/lib/dateLocale';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConsultantNotes, useCreateConsultantNote, useDeleteConsultantNote } from '@/hooks/useConsultantNotes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Lock, MessageSquare, Plus, Trash2, Unlock } from 'lucide-react';
import { notify } from "@/lib/notify";

interface NotesSectionProps {
  workspaceId: string;
  canManage: boolean;
}

export function NotesSection({ workspaceId, canManage }: NotesSectionProps) {
  const { t } = useTranslation();
  const [newNote, setNewNote] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);

  const { data: notes, isLoading } = useConsultantNotes(workspaceId);
  const createNote = useCreateConsultantNote();
  const deleteNote = useDeleteConsultantNote();

  const handleSubmit = async () => {
    if (!newNote.trim()) { notify.error(t('notes.enterNote')); return; }
    try {
      await createNote.mutateAsync({ workspaceId, content: newNote, isPrivate });
      setNewNote('');
      notify.success(t('notes.noteAdded'));
    } catch { notify.error(t('notes.failedToAddNote')); }
  };

  const handleDelete = async (noteId: string) => {
    try {
      await deleteNote.mutateAsync(noteId);
      notify.success(t('notes.noteDeleted'));
    } catch { notify.error(t('notes.failedToDeleteNote')); }
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t('notes.addInternalNote')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea placeholder={t('notes.notePlaceholder')} value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={4} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch id="private-toggle" checked={isPrivate} onCheckedChange={setIsPrivate} />
                <Label htmlFor="private-toggle" className="flex items-center gap-1">
                  {isPrivate ? (<><Lock className="h-4 w-4" />{t('notes.privateLabel')}</>) : (<><Unlock className="h-4 w-4" />{t('notes.visibleLabel')}</>)}
                </Label>
              </div>
              <Button onClick={handleSubmit} disabled={createNote.isPending || !newNote.trim()} loading={createNote.isPending}>
                <Plus className="h-4 w-4 mr-2" />
                {createNote.isPending ? t('notes.adding') : t('notes.addNote')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">{t('notes.notesHistory')}</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea  viewportClassName="max-h-[500px]">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse flex gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2"><div className="h-4 w-1/3 bg-muted rounded" /><div className="h-16 bg-muted rounded" /></div>
                  </div>
                ))}
              </div>
            ) : !notes?.length ? (
              <p className="text-center text-muted-foreground py-8">{t('notes.noNotesYet')} {canManage && t('notes.addFirstNote')}</p>
            ) : (
              <div className="space-y-4">
                {notes.map((note) => (
                  <div key={note.id} className="flex gap-3 p-3 rounded-lg bg-muted/50">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={note.author?.avatar_url || undefined} />
                      <AvatarFallback>{note.author?.full_name?.[0] || note.author?.email?.[0] || '?'}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{note.author?.full_name || note.author?.email || 'Unknown'}</span>
                          {note.is_private && <Badge variant="secondary" className="text-xs"><Lock className="h-3 w-3 mr-1" />{t('notes.private')}</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{timeAgo(new Date(note.created_at))}</span>
                          {canManage && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(note.id)} aria-label={t('common.delete')}><Trash2 className="h-3 w-3" /></Button>}
                        </div>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
