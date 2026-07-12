import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, isPast } from 'date-fns';
import { lisbonWallClockToUtcIso, utcIsoToLisbonWallClock } from '@/lib/dateUtils';
import { Input } from '@/components/ui/input';
import {
  Plus,
  Download,
  Star,
  Sparkles,
  Play,
  CheckCircle2,
  Mail,
  Video,
  Copy,
  ExternalLink,
  ListChecks,
  CalendarClock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUpdateSession, useSessionActionItems, useWorkspaceMembers, useCreateActionItem } from '@/hooks/useSessions';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { downloadICSFile } from '@/lib/icsExport';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import { SessionFeedbackCard } from '@/components/sessions/SessionFeedbackCard';
import { SessionAIPanel } from '@/components/sessions/SessionAIPanel';
import { SessionPrepCard } from '@/components/sessions/SessionPrepCard';
import { RoleSpecificPrepCard } from '@/components/sessions/RoleSpecificPrepCard';
import { CollaborativeNotesEditor } from '@/components/sessions/CollaborativeNotesEditor';
import { VoiceToTextButton } from '@/components/sessions/VoiceToTextButton';
import { SessionTranscriptsViewer } from '@/components/sessions/SessionTranscriptsViewer';
import { SessionExercisesPicker } from '@/components/sessions/SessionExercisesPicker';
import { QualityGateCard } from '@/components/consultor/QualityGateCard';
import { useAddTranscript } from '@/hooks/useSessionArtifacts';
import { AddActionItemDialog } from './AddActionItemDialog';
import { logger } from '@/lib/logger';
import { invokeWithAuth } from "@/lib/invokeWithAuth";

interface SessionDetailDialogProps {
  workspaceId: string;
  session: any;
  canWrite: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFacilitator: (session: any) => void;
}

export function SessionDetailDialog({ workspaceId, session, canWrite, open, onOpenChange, onOpenFacilitator }: SessionDetailDialogProps) {
  const { t } = useTranslation();
  const { isAdmin, isConsultor, isFounder } = useAuth();
  const isStaff = isAdmin || isConsultor;
  const canUseFacilitator = isStaff;

  const [notes, setNotes] = useState(session.notes || '');
  const [decisions, setDecisions] = useState(session.decisions || '');
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [refreshKey, setRefreshKey] = useState(0);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleValue, setRescheduleValue] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);

  const updateMutation = useUpdateSession(workspaceId);
  const createActionItem = useCreateActionItem(workspaceId);
  const { data: actionItems, isLoading: actionsLoading, refetch: refetchActions } = useSessionActionItems(session.id);
  const { data: members } = useWorkspaceMembers(workspaceId);
  const addTranscript = useAddTranscript();

  const handleConvertDecisionsToActions = async () => {
    const text = (decisions || '').trim();
    if (!text) {
      notify.error(t('sessions.noDecisionsToConvert', { defaultValue: 'Nenhuma decisão para converter.' }));
      return;
    }
    const lines = text
      .split(/\r?\n+/)
      .map((l) => l.replace(/^\s*([-*•\d.)]+)\s*/, '').trim())
      .filter((l) => l.length > 2);
    if (lines.length === 0) {
      notify.error(t('sessions.noDecisionsToConvert', { defaultValue: 'Nenhuma decisão para converter.' }));
      return;
    }
    let created = 0;
    for (const title of lines) {
      try {
        await createActionItem.mutateAsync({
          title: title.slice(0, 240),
          session_id: session.id,
          priority: 'medium',
        });
        created += 1;
      } catch (err) {
        logger.warn('decision_to_action_failed', { error: String(err) });
      }
    }
    if (created > 0) {
      notify.success(
        t('sessions.decisionsConverted', {
          defaultValue: '{{count}} ação(ões) criadas a partir das decisões.',
          count: created,
        })
      );
      refetchActions();
    } else {
      notify.error(t('common.error'));
    }
  };

  const handleVoiceTranscript = async (text: string) => {
    setNotes(prev => prev ? `${prev}\n\n${text}` : text);
    try {
      await addTranscript.mutateAsync({
        sessionId: session.id,
        transcriptText: text,
        source: 'voice'
      });
    } catch (error) {
      logger.error('Failed to save transcript', {}, error);
    }
  };

  const handleRefreshAI = () => {
    setRefreshKey(prev => prev + 1);
    refetchActions();
  };

  const handleResendInvites = async () => {
    const recipientEmails = members
      ?.filter(m => m.profile?.email)
      .map(m => m.profile!.email) || [];

    if (recipientEmails.length === 0) {
      notify.error(t('sessions.noWorkspaceMembersWithEmail'));
      return;
    }

    setIsResending(true);
    try {
      const { data: workspaceInfo } = await supabase
        .from('workspaces')
        .select(`startup:startups(name)`)
        .eq('id', workspaceId)
        .maybeSingle();

      const { data: { user } } = await supabase.auth.getUser();
      let organizerName = 'Mentor';
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .maybeSingle();
        organizerName = profile?.full_name || profile?.email || 'Mentor';
      }

      const { error } = await invokeWithAuth('send-session-invite', {
        body: {
          sessionId: session.id,
          workspaceId,
          title: session.title,
          scheduledAt: session.scheduled_at,
          duration: session.duration || 60,
          agenda: session.agenda || undefined,
          recipientEmails,
          organizerName,
          startupName: (workspaceInfo?.startup as { name: string } | null)?.name || 'Startup',
        },
      });

      if (error) {
        logger.error('Failed to resend invites', {}, error);
        notify.error(t('sessions.failedToResendInvites'));
      } else {
        notify.success(t('sessions.sent', { length: recipientEmails.length }));
      }
    } catch (error) {
      logger.error('Resend error', {}, error);
      notify.error(t('sessions.failedToResendInvites'));
    } finally {
      setIsResending(false);
    }
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        id: session.id,
        notes: notes.trim() || null,
        decisions: decisions.trim() || null,
      });
      notify.success(t('sessions.sessionUpdated'));
    } catch (error) {
      notify.error(t('sessions.failedToUpdateSession'));
    }
  };

  const isPastSession = isPast(new Date(session.scheduled_at));

  const handleExportICS = () => {
    downloadICSFile({
      title: session.title,
      description: session.agenda || session.notes || '',
      startDate: new Date(session.scheduled_at),
      durationMinutes: session.duration || 60,
      meetingLink: session.join_url || undefined,
    });
    notify.success(t('sessions.icsExported', { defaultValue: 'Sessão exportada para calendário' }));
  };

  const handleCopyJoinUrl = async () => {
    if (!session.join_url) return;
    try {
      await navigator.clipboard.writeText(session.join_url);
      notify.success(t('sessions.joinUrlCopied'));
    } catch {
      notify.error(t('common.error'));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{session.title}</DialogTitle>
                <DialogDescription>
                  {format(new Date(session.scheduled_at), 'EEEE, MMMM d, yyyy')} at {format(new Date(session.scheduled_at), 'h:mm a')}
                  {session.duration && ` • ${session.duration} min`}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" type="button" onClick={handleExportICS}
                  title={t('sessions.exportIcs', { defaultValue: 'Exportar para calendário (.ics)' })}>
                  <Download className="h-4 w-4 mr-1" />.ics
                </Button>
                {canWrite && (
                  <Button variant="outline" size="sm" type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Prefill with the current scheduled_at as a Lisbon wall-clock,
                      // matching the save convention (browser TZ is not used).
                      try {
                        setRescheduleValue(utcIsoToLisbonWallClock(session.scheduled_at));
                      } catch { /* ignore */ }

                      setRescheduleOpen(true);
                    }}>
                    <CalendarClock className="h-4 w-4 mr-1" />
                    {t('sessions.reschedule', { defaultValue: 'Reagendar' })}
                  </Button>
                )}
                {canUseFacilitator && (
                  <Button variant="outline" size="sm" type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenFacilitator(session); }}>
                    <Play className="h-4 w-4 mr-1" />
                    {t('sessions.facilitatorMode', { defaultValue: 'Modo Facilitador' })}
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full ${isStaff ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <TabsTrigger value="prep">{t('sessions.prep', 'Prep')}</TabsTrigger>
              <TabsTrigger value="details">{t('sessions.detailsNotes', 'Details & Notes')}</TabsTrigger>
              {isStaff && (
                <TabsTrigger value="ai" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  {t('sessions.ai.label', 'AI')}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="prep" className="mt-4 space-y-4">
              <RoleSpecificPrepCard sessionId={session.id} workspaceId={workspaceId} />
              {isStaff && (
                <>
                  <QualityGateCard entityType="session" entityId={session.id} entityData={session} workspaceId={workspaceId} />
                  <SessionExercisesPicker sessionId={session.id} canEdit={canWrite} />
                </>
              )}
              {!isStaff && <SessionPrepCard sessionId={session.id} workspaceId={workspaceId} />}
            </TabsContent>

            <TabsContent value="details" className="space-y-6 mt-4">
              {isStaff && canWrite && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{t('sessions.calendarInvites', 'Calendar Invites')}</p>
                      <p className="text-xs text-muted-foreground">
                        {members?.filter(m => m.profile?.email).length || 0} {t('sessions.workspaceMembers', 'workspace members')}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleResendInvites} disabled={isResending} loading={isResending}>
                    <Mail className="h-4 w-4 mr-1" />
                    {isResending ? t('common.sending', 'Sending...') : t('sessions.resendInvites', 'Resend Invites')}
                  </Button>
                </div>
              )}

              {/* Teams / online meeting join URL — populated by Outlook sync */}
              {session.join_url ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <Video className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{t('sessions.teamsMeetingLabel')}</p>
                        <a
                          href={session.join_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline break-all block mt-0.5"
                        >
                          {session.join_url}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={handleCopyJoinUrl} title={t('common.copy', 'Copy')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button asChild size="sm">
                        <a href={session.join_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          {t('sessions.joinCall', 'Join meeting')}
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                isStaff && (
                  <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3 flex items-center gap-2">
                    <Video className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      {t('sessions.teamsMeetingPending')}
                    </p>
                  </div>
                )
              )}

              {session.location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium">{t('sessions.locationLabel', 'Local')}:</span>
                  <span>{session.location}</span>
                </div>
              )}

              {session.agenda && (
                <div>
                  <Label className="text-muted-foreground">{t('sessions.agenda', 'Agenda')}</Label>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{session.agenda}</p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="notes">{t('sessions.sessionNotes', 'Session Notes')}</Label>
                  {isStaff && canWrite && <VoiceToTextButton onTranscript={handleVoiceTranscript} />}
                </div>
                {canWrite ? (
                  isStaff ? (
                    <CollaborativeNotesEditor
                      value={notes}
                      onChange={setNotes}
                      workspaceId={workspaceId}
                      sessionId={session.id}
                      placeholder={t('sessions.addNotesPlaceholder', 'Add notes from this session...')}
                      members={members || []}
                    />
                  ) : (
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t('sessions.addNotesPlaceholder', 'Add notes from this session...')}
                      rows={5}
                    />
                  )
                ) : (
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg min-h-[80px]">
                    {notes || t('sessions.noNotesRecorded', 'No notes recorded')}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="decisions">{t('sessions.keyDecisions', 'Key Decisions')}</Label>
                  {canWrite && decisions.trim().length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleConvertDecisionsToActions}
                      disabled={createActionItem.isPending} loading={createActionItem.isPending}
                    >
                      <ListChecks className="h-4 w-4 mr-1" />
                      {t('sessions.convertDecisionsToActions', { defaultValue: 'Transformar em ações' })}
                    </Button>
                  )}
                </div>
                {canWrite ? (
                  <Textarea
                    id="decisions"
                    value={decisions}
                    onChange={(e) => setDecisions(e.target.value)}
                    placeholder={t('sessions.keyDecisionsPlaceholder', 'Key decisions made during this session...')}
                    rows={3}
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg min-h-[60px]">
                    {decisions || t('sessions.noDecisionsRecorded', 'No decisions recorded')}
                  </p>
                )}
              </div>

              {isStaff && (
                <div className="space-y-2">
                  <Label>{t('sessions.sessionTranscripts', 'Session Transcripts')}</Label>
                  <SessionTranscriptsViewer sessionId={session.id} />
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t('sessions.actionItemsFromSession', 'Action Items from this Session')}</Label>
                  {isStaff && canWrite && (
                    <Button variant="outline" size="sm" onClick={() => setShowActionDialog(true)}>
                      <Plus className="h-4 w-4 mr-1" />
                      {t('sessions.addActionItem', 'Add Action Item')}
                    </Button>
                  )}
                </div>
                {actionsLoading ? (
                  <Skeleton className="h-20" />
                ) : actionItems?.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground bg-muted/50 rounded-lg">
                    <CheckCircle2 className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('sessions.noActionItems', 'No action items from this session')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {actionItems?.map(item => (
                      <div key={item.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className={`h-2 w-2 rounded-full ${
                          item.status === 'completed' ? 'bg-[hsl(var(--success))]' :
                          item.status === 'in_progress' ? 'bg-[hsl(var(--info))]' : 'bg-muted-foreground'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.title}</p>
                          {item.due_date && (
                            <p className="text-xs text-muted-foreground">
                              {t('sessions.dueDate', 'Due')}: {format(new Date(item.due_date), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                        <Badge variant={
                          item.status === 'completed' ? 'default' :
                          item.status === 'in_progress' ? 'secondary' : 'outline'
                        } className="text-xs">
                          {item.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isPastSession && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    {t('sessions.sessionFeedback', 'Session Feedback')}
                  </Label>
                  <SessionFeedbackCard sessionId={session.id} sessionTitle={session.title} />
                </div>
              )}
            </TabsContent>

            {isStaff && (
              <TabsContent value="ai" className="mt-4">
                <WidgetErrorBoundary name="Session AI">
                  <SessionAIPanel
                    key={refreshKey}
                    workspaceId={workspaceId}
                    sessionId={session.id}
                    session={session}
                    canWrite={canWrite}
                    onRefresh={handleRefreshAI}
                  />
                </WidgetErrorBoundary>
              </TabsContent>
            )}
          </Tabs>

          {canWrite && (
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.close', 'Close')}</Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending} loading={updateMutation.isPending}>
                {updateMutation.isPending ? t('common.saving', 'Saving...') : t('common.saveChanges', 'Save Changes')}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <AddActionItemDialog
        workspaceId={workspaceId}
        sessionId={session.id}
        open={showActionDialog}
        onOpenChange={setShowActionDialog}
      />

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('sessions.reschedule', { defaultValue: 'Reagendar' })}</DialogTitle>
            <DialogDescription>
              {t('sessions.rescheduleDesc', { defaultValue: 'Escolha uma nova data e hora para esta sessão.' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reschedule-dt">{t('sessions.dateTime', { defaultValue: 'Data e hora' })}</Label>
            <Input
              id="reschedule-dt"
              type="datetime-local"
              value={rescheduleValue}
              onChange={(e) => setRescheduleValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>{t('common.cancel')}</Button>
            <Button
              disabled={!rescheduleValue || isRescheduling}
              loading={isRescheduling}
              onClick={async () => {
                if (!rescheduleValue) return;
                setIsRescheduling(true);
                try {
                  const iso = lisbonWallClockToUtcIso(rescheduleValue);
                  await updateMutation.mutateAsync({ id: session.id, scheduled_at: iso });
                  notify.success(t('sessions.rescheduled', { defaultValue: 'Sessão reagendada' }));
                  setRescheduleOpen(false);
                } catch {
                  notify.error(t('sessions.failedToUpdateSession'));
                } finally {
                  setIsRescheduling(false);
                }
              }}
            >
              {t('sessions.reschedule', { defaultValue: 'Reagendar' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
