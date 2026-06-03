import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, formatDistanceToNow } from 'date-fns';
import { useCreateConsultantNote } from '@/hooks/useConsultantNotes';
import { useCreateStaffTask } from '@/hooks/useStaffTasks';
import { useSessions } from '@/hooks/useSessions';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CardHeader } from '@/components/ui/card';
import {
  Plus, CheckCircle2, Sparkles, ChevronDown, Lightbulb, AlertTriangle, ArrowRight, Calendar, FileText,
} from 'lucide-react';
import { notify } from "@/lib/notify";

interface SessionInsightsSectionProps {
  workspaceId: string;
  startupId?: string;
  canManage: boolean;
  userId?: string;
}

export function SessionInsightsSection({ workspaceId, startupId, canManage, userId }: SessionInsightsSectionProps) {
  const { t } = useTranslation();
  const { data: sessions, isLoading } = useSessions(workspaceId);
  const createNote = useCreateConsultantNote();
  const createTask = useCreateStaffTask();

  const sessionsWithAI = sessions?.filter(s =>
    s.ai_summary || (s.ai_decisions && s.ai_decisions.length > 0) ||
    (s.ai_action_suggestions && s.ai_action_suggestions.length > 0) ||
    (s.ai_risks && s.ai_risks.length > 0)
  ).slice(0, 5) || [];

  const handleSaveAsNote = async (content: string, sessionTitle: string) => {
    try {
      await createNote.mutateAsync({ workspaceId, content: `[From session: ${sessionTitle}]\n\n${content}`, isPrivate: false });
      notify.success(t('notes.savedAsNote', { defaultValue: 'Saved as note' }));
    } catch {
      notify.error(t('notes.failedToSave', { defaultValue: 'Failed to save note' }));
    }
  };

  const handleCreateTask = async (suggestion: { title: string; description: string; priority: string }) => {
    if (!userId) return;
    try {
      await createTask.mutateAsync({
        title: suggestion.title, description: suggestion.description, task_type: 'follow_up',
        priority: suggestion.priority || 'medium', due_date: null, assignee_id: userId,
        workspace_id: workspaceId, related_startup_id: startupId || null,
      });
      notify.success(t('notes.taskCreated'));
    } catch {
      notify.error(t('notes.failedToCreate'));
    }
  };

  if (isLoading) {
    return <Card><CardContent className="py-6"><div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-24" />)}</div></CardContent></Card>;
  }

  if (sessionsWithAI.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">{t('notes.noAiInsightsYet', { defaultValue: 'No AI insights yet' })}</p>
          <p className="text-sm mt-1 max-w-sm mx-auto">
            {t('notes.aiInsightsDesc', { defaultValue: 'Session insights will appear here after running AI analysis on your sessions.' })}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 text-sm">
            <Lightbulb className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">
              {t('notes.aiInsightsHint', { defaultValue: 'AI insights from your sessions can be saved as notes or converted to tasks.' })}
            </span>
          </div>
        </CardContent>
      </Card>

      {sessionsWithAI.map(session => (
        <SessionInsightCard key={session.id} session={session} canManage={canManage} onSaveAsNote={handleSaveAsNote} onCreateTask={handleCreateTask} />
      ))}
    </div>
  );
}

interface SessionInsightCardProps {
  session: {
    id: string; title: string; scheduled_at: string;
    ai_summary: string | null; ai_decisions: string[] | null;
    ai_action_suggestions: { title: string; description: string; priority: string }[] | null;
    ai_risks: { risk: string; severity: string }[] | null;
    ai_generated_at: string | null;
  };
  canManage: boolean;
  onSaveAsNote: (content: string, sessionTitle: string) => void;
  onCreateTask: (suggestion: { title: string; description: string; priority: string }) => void;
}

function SessionInsightCard({ session, canManage, onSaveAsNote, onCreateTask }: SessionInsightCardProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{session.title}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-0.5">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(session.scheduled_at), 'MMM d, yyyy')}
                    {session.ai_generated_at && (
                      <span className="text-xs">• AI generated {formatDistanceToNow(new Date(session.ai_generated_at), { addSuffix: true })}</span>
                    )}
                  </CardDescription>
                </div>
              </div>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {session.ai_summary && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium flex items-center gap-2"><FileText className="h-4 w-4" />{t('notes.summary', { defaultValue: 'Summary' })}</h4>
                  {canManage && <Button variant="ghost" size="sm" onClick={() => onSaveAsNote(session.ai_summary!, session.title)}><Plus className="h-3 w-3 mr-1" />{t('notes.saveAsNote', { defaultValue: 'Save as Note' })}</Button>}
                </div>
                <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">{session.ai_summary}</p>
              </div>
            )}

            {session.ai_decisions && session.ai_decisions.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t('notes.decisions', { defaultValue: 'Decisions' })} ({session.ai_decisions.length})</h4>
                  {canManage && <Button variant="ghost" size="sm" onClick={() => onSaveAsNote(`Decisions:\n${session.ai_decisions!.map((d, i) => `${i + 1}. ${d}`).join('\n')}`, session.title)}><Plus className="h-3 w-3 mr-1" />{t('notes.saveAsNote', { defaultValue: 'Save as Note' })}</Button>}
                </div>
                <ul className="space-y-1">
                  {session.ai_decisions.map((decision, idx) => (
                    <li key={idx} className="text-sm flex items-start gap-2 bg-green-50 dark:bg-green-950/20 p-2 rounded"><CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />{decision}</li>
                  ))}
                </ul>
              </div>
            )}

            {session.ai_risks && session.ai_risks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />{t('notes.risksIdentified', { defaultValue: 'Risks Identified' })} ({session.ai_risks.length})</h4>
                <ul className="space-y-1">
                  {session.ai_risks.map((risk, idx) => (
                    <li key={idx} className="text-sm flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <span className="flex-1">{risk.risk}</span>
                      <Badge variant="outline" className="text-xs">{risk.severity}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {session.ai_action_suggestions && session.ai_action_suggestions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" />{t('notes.suggestedActions', { defaultValue: 'Suggested Actions' })} ({session.ai_action_suggestions.length})</h4>
                <ul className="space-y-2">
                  {session.ai_action_suggestions.map((suggestion, idx) => (
                    <li key={idx} className="text-sm bg-primary/5 border border-primary/20 p-3 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium">{suggestion.title}</p>
                          {suggestion.description && <p className="text-muted-foreground text-xs mt-1">{suggestion.description}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{suggestion.priority}</Badge>
                          {canManage && <Button variant="outline" size="sm" onClick={() => onCreateTask(suggestion)}><ArrowRight className="h-3 w-3 mr-1" />{t('notes.createTaskBtn', { defaultValue: 'Create Task' })}</Button>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
