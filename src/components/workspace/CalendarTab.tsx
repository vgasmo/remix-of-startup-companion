import { useState } from 'react';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  parseISO,
} from 'date-fns';
import { pt, enUS } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Trash2,
  Edit2,
  Video,
  Mail,
  Send,
  Users,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SessionFormFields, type SessionFormData } from './calendar/SessionFormFields';
import { cn } from '@/lib/utils';
import { useCalendarSessions, useCreateSession, useUpdateSession, useDeleteSession, useWorkspaceMembers, Session } from '@/hooks/useSessions';
import { useSessionTemplates } from '@/hooks/useSessionTemplates';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';
import { invokeWithAuth } from "@/lib/invokeWithAuth";

interface CalendarTabProps {
  workspaceId: string;
  canWrite: boolean;
  startupName?: string;
}

export function CalendarTab({ workspaceId, canWrite, startupName }: CalendarTabProps) {
  const { t, i18n } = useTranslation();
  const dateFnsLocale = i18n.language === 'pt' ? pt : enUS;
  const { data: sessions = [], isLoading } = useCalendarSessions(workspaceId);
  const { data: workspaceMembers = [] } = useWorkspaceMembers(workspaceId);
  const { data: sessionTemplates } = useSessionTemplates();
  const { profile, user } = useAuth();
  const createSession = useCreateSession(workspaceId);
  const updateSession = useUpdateSession(workspaceId);
  const deleteSession = useDeleteSession(workspaceId);
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [sendInviteSession, setSendInviteSession] = useState<Session | null>(null);
  const [quickInviteEmails, setQuickInviteEmails] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  // Get member emails for auto-complete (exclude current user)
  const memberEmails = workspaceMembers
    .filter((m) => m.profile?.email && m.user_id !== user?.id)
    .map((m) => ({
      email: m.profile!.email,
      name: m.profile?.full_name || m.profile!.email,
      avatar: m.profile?.avatar_url,
      role: m.role,
    }));

  const defaultInviteEmails = () => {
    const preferredRoles = new Set(['founder', 'consultor', 'mentor_externo']);
    const emails = memberEmails
      .filter((m) => preferredRoles.has(m.role))
      .map((m) => m.email);
    return [...new Set(emails)].join(', ');
  };

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    agenda: '',
    date: '',
    startTime: '',
    duration: '60',
    location: '',
    joinUrl: '',
    sendInvites: true,
    inviteEmails: '',
    sessionType: 'general',
  });

  const resetForm = () => {
    setFormData({
      title: '',
      agenda: '',
      date: '',
      startTime: '',
      duration: '60',
      location: '',
      joinUrl: '',
      sendInvites: true,
      inviteEmails: '',
      sessionType: 'general',
    });
    setSelectedTemplate('');
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = sessionTemplates?.find(t => t.id === templateId);
    if (template) {
      if (template.name && !formData.title) {
        setFormData(prev => ({ ...prev, title: template.name }));
      }
      if (template.agenda_template) {
        setFormData(prev => ({ ...prev, agenda: template.agenda_template || '' }));
      }
    }
  };

  // Compute end time from start + duration for display
  const computeEndTime = (startTime: string, duration: number): string => {
    if (!startTime) return '';
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + duration;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMins = totalMinutes % 60;
    return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
  };

  // Send session invite
  const sendSessionInvite = async (session: Session, emails: string[]) => {
    if (emails.length === 0) return;

    try {
      setIsSendingInvite(true);
      const duration = session.duration || 60;
      const endsAt = new Date(new Date(session.scheduled_at).getTime() + duration * 60000).toISOString();
      
      const { data, error } = await invokeWithAuth('send-session-invite', {
        body: {
          sessionId: session.id,
          workspaceId: session.workspace_id,
          title: session.title,
          scheduledAt: session.scheduled_at,
          duration: duration,
          agenda: session.agenda,
          location: session.location,
          joinUrl: session.join_url,
          recipientEmails: emails,
          organizerName: profile?.full_name || 'Team Member',
          startupName: startupName || 'Startup',
        },
      });

      if (error) throw error;

      notify.success(t('sessions.invitesSent', { defaultValue: 'Convites de calendário enviados para {{count}} destinatário(s)', count: emails.length }));
      return data;
    } catch (error) {
      logger.error('Error sending session invite', {}, error);
      notify.error(t('sessions.inviteSendError', { defaultValue: 'Erro ao enviar convites de calendário' }));
      throw error;
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleAddSession = async () => {
    if (!formData.title || !formData.date || !formData.startTime) return;

    try {
      const scheduled_at = new Date(`${formData.date}T${formData.startTime}`).toISOString();
      const duration = parseInt(formData.duration);

      const newSession = await createSession.mutateAsync({
        title: formData.title,
        agenda: formData.agenda || null,
        scheduled_at,
        duration,
        notes: null,
        decisions: null,
        location: formData.location || null,
        join_url: formData.joinUrl || null,
        session_type: formData.sessionType || 'general',
      });

      // Send invites if checkbox is checked and emails are provided
      if (formData.sendInvites && formData.inviteEmails.trim() && newSession) {
        const emails = formData.inviteEmails
          .split(/[,;\n]/)
          .map(e => e.trim())
          .filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
        
        if (emails.length > 0) {
          try {
            await sendSessionInvite(newSession, emails);
          } catch (inviteError) {
            logger.error('Failed to send invites but session was created', {}, inviteError);
          }
        }
      }

      notify.success(t('sessions.sessionScheduled'));
      resetForm();
      setIsAddDialogOpen(false);
    } catch (error) {
      logger.error('Error creating session', {}, error);
      notify.error(t('sessions.createSession') + ' ' + t('common.error').toLowerCase());
    }
  };

  const handleEditSession = async () => {
    if (!editingSession || !formData.title || !formData.date || !formData.startTime) return;

    const scheduled_at = new Date(`${formData.date}T${formData.startTime}`).toISOString();
    const duration = parseInt(formData.duration);

    try {
      await updateSession.mutateAsync({
        id: editingSession.id,
        title: formData.title,
        agenda: formData.agenda || null,
        scheduled_at,
        duration,
        location: formData.location || null,
        join_url: formData.joinUrl || null,
      });

      notify.success(t('sessions.sessionUpdated'));
      resetForm();
      setEditingSession(null);
      setIsEditDialogOpen(false);
    } catch (error) {
      logger.error('Error updating session', {}, error);
      notify.error(t('sessions.editSession') + ' ' + t('common.error').toLowerCase());
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await deleteSession.mutateAsync(id);
      notify.success(t('sessions.sessionDeleted'));
      setDeleteConfirmId(null);
    } catch (error) {
      logger.error('Error deleting session', {}, error);
      notify.error(t('sessions.deleteSession') + ' ' + t('common.error').toLowerCase());
    }
  };

  const openEditDialog = (session: Session) => {
    const startDate = parseISO(session.scheduled_at);
    
    setFormData({
      title: session.title,
      agenda: session.agenda || '',
      date: format(startDate, 'yyyy-MM-dd'),
      startTime: format(startDate, 'HH:mm'),
      duration: String(session.duration || 60),
      location: session.location || '',
      joinUrl: session.join_url || '',
      sendInvites: false,
      inviteEmails: '',
      sessionType: (session as any).session_type || 'general',
    });
    setEditingSession(session);
    setIsEditDialogOpen(true);
  };

  const openAddDialogWithDate = (date: Date) => {
    setFormData((prev) => ({
      ...prev,
      date: format(date, 'yyyy-MM-dd'),
      inviteEmails: prev.inviteEmails.trim() ? prev.inviteEmails : defaultInviteEmails(),
    }));
    setIsAddDialogOpen(true);
  };

  // Calendar grid calculations
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Get sessions for a specific day
  const getSessionsForDay = (date: Date) => {
    return sessions.filter((session) => isSameDay(parseISO(session.scheduled_at), date));
  };

  // Get sessions for selected date
  const selectedDaySessions = selectedDate ? getSessionsForDay(selectedDate) : [];

  // Localized weekday names
  const weekDays = [
    t('calendar.mon', { defaultValue: 'Seg' }),
    t('calendar.tue', { defaultValue: 'Ter' }),
    t('calendar.wed', { defaultValue: 'Qua' }),
    t('calendar.thu', { defaultValue: 'Qui' }),
    t('calendar.fri', { defaultValue: 'Sex' }),
    t('calendar.sat', { defaultValue: 'Sáb' }),
    t('calendar.sun', { defaultValue: 'Dom' }),
  ];

  const renderFormFields = (isEdit: boolean) => (
    <SessionFormFields
      isEdit={isEdit}
      formData={formData}
      setFormData={setFormData}
      sessionTemplates={sessionTemplates}
      selectedTemplate={selectedTemplate}
      onTemplateSelect={handleTemplateSelect}
      memberEmails={memberEmails}
    />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Calendar View */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-4">
            <CardTitle className="text-lg font-semibold capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: dateFnsLocale })}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
               aria-label={t('common.previous')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => setCurrentMonth(new Date())}
              >
                {t('calendar.today', { defaultValue: 'Hoje' })}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
               aria-label={t('common.next')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {canWrite && (
            <Dialog
              open={isAddDialogOpen}
              onOpenChange={(open) => {
                setIsAddDialogOpen(open);
                if (!open) resetForm();
              }}
            >
              <Button onClick={() => {
                setFormData((prev) => ({
                  ...prev,
                  date: format(new Date(), 'yyyy-MM-dd'),
                  inviteEmails: defaultInviteEmails(),
                }));
                setIsAddDialogOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                {t('sessions.addSession')}
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('sessions.scheduleSession')}</DialogTitle>
                  <DialogDescription>
                    {t('sessions.createNewSession')}
                  </DialogDescription>
                </DialogHeader>
                {renderFormFields(false)}
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setIsAddDialogOpen(false); resetForm(); }}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={handleAddSession}
                    disabled={createSession.isPending || !formData.title || !formData.date || !formData.startTime} loading={createSession.isPending}
                  >
                    {createSession.isPending ? t('sessions.scheduling') : t('sessions.scheduleSession')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {/* Week day headers */}
          <div className="grid grid-cols-7 mb-2">
            {weekDays.map((day) => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const daySessions = getSessionsForDay(day);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDate && isSameDay(day, selectedDate);

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'relative min-h-[80px] p-1 text-left rounded-lg border transition-colors',
                    isCurrentMonth ? 'bg-background' : 'bg-muted/30 text-muted-foreground',
                    isToday && 'ring-2 ring-primary',
                    isSelected && 'bg-primary/10 border-primary',
                    !isSelected && 'hover:bg-muted/50',
                    canWrite && 'cursor-pointer'
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-sm',
                      isToday && 'bg-primary text-primary-foreground font-semibold'
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {daySessions.slice(0, 2).map((session) => {
                      const offPlatform = session.source === 'off_platform';
                      return (
                        <div
                          key={session.id}
                          className={cn(
                            'text-xs truncate px-1 py-0.5 rounded font-medium',
                            offPlatform
                              ? 'bg-muted text-muted-foreground border border-dashed border-muted-foreground/40'
                              : 'bg-primary/20 text-primary'
                          )}
                          title={offPlatform ? t('sessions.loggedOffPlatform', { defaultValue: 'Reunião registada após acontecer' }) : undefined}
                        >
                          {format(parseISO(session.scheduled_at), 'HH:mm')} {session.title}
                        </div>
                      );
                    })}
                    {daySessions.length > 2 && (
                      <div className="text-xs text-muted-foreground px-1">
                        +{daySessions.length - 2} {t('sessions.more')}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Day Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg capitalize">
            {selectedDate ? format(selectedDate, 'EEEE, d MMMM', { locale: dateFnsLocale }) : t('sessions.selectDate')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedDate ? (
            <ScrollArea className="h-[400px]">
              {selectedDaySessions.length > 0 ? (
                <div className="space-y-3">
                  {selectedDaySessions.map((session) => {
                    const endTime = new Date(new Date(session.scheduled_at).getTime() + (session.duration || 60) * 60000);
                    return (
                      <div
                        key={session.id}
                        className="p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-medium text-sm">{session.title}</h4>
                            {session.source === 'off_platform' && (
                              <Badge variant="outline" className="text-[10px] gap-1 border-dashed">
                                <FileText className="h-3 w-3" />
                                {t('sessions.loggedOffPlatform', { defaultValue: 'Registada após reunião' })}
                              </Badge>
                            )}
                          </div>
                          {canWrite && (
                            <div className="flex gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                title={t('sessions.sendCalendarInvite', { defaultValue: 'Enviar convite de calendário' })}
                                onClick={()=> {
                                  setSendInviteSession(session);
                                  if (!quickInviteEmails.trim()) {
                                    setQuickInviteEmails(defaultInviteEmails());
                                  }
                                }}
                               aria-label={t('common.email')}>
                                <Mail className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => openEditDialog(session)}
                               aria-label={t('common.edit')}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => setDeleteConfirmId(session.id)}
                               aria-label={t('common.delete')}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Clock className="h-3 w-3" />
                          {format(parseISO(session.scheduled_at), 'HH:mm')} - {format(endTime, 'HH:mm')}
                        </div>
                        {session.agenda && (
                          <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1">
                            <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{session.agenda}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {session.location && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <MapPin className="h-3 w-3" />
                              {session.location}
                            </Badge>
                          )}
                          {session.join_url && (
                            <a
                              href={sanitizeUrl(session.join_url)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Badge variant="outline" className="text-xs gap-1 hover:bg-primary/10">
                                <Video className="h-3 w-3" />
                                {t('sessions.joinCall')}
                              </Badge>
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">{t('sessions.noSessionsScheduled')}</p>
                  {canWrite && (
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-2"
                      onClick={() => openAddDialogWithDate(selectedDate)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t('sessions.addSession')}
                    </Button>
                  )}
                </div>
              )}
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t('sessions.clickToViewSessions')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) { resetForm(); setEditingSession(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sessions.editSession')}</DialogTitle>
            <DialogDescription>
              {t('sessions.updateSessionDetails')}
            </DialogDescription>
          </DialogHeader>
          {renderFormFields(true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); resetForm(); setEditingSession(null); }}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleEditSession}
              disabled={updateSession.isPending || !formData.title || !formData.date || !formData.startTime} loading={updateSession.isPending}
            >
              {updateSession.isPending ? t('sessions.saving') : t('sessions.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sessions.deleteSession', { defaultValue: 'Eliminar sessão' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('sessions.deleteConfirm', { defaultValue: 'Tem a certeza que quer eliminar esta sessão? Esta ação não pode ser revertida.' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDeleteSession(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete', { defaultValue: 'Eliminar' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Invite Dialog */}
      <Dialog open={!!sendInviteSession} onOpenChange={(open) => { if (!open) { setSendInviteSession(null); setQuickInviteEmails(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sessions.sendCalendarInvite', { defaultValue: 'Enviar convite de calendário' })}</DialogTitle>
            <DialogDescription>
              {t('sessions.sendInviteDescription', { defaultValue: 'Enviar convite (.ics) para participantes de "{{title}}"', title: sendInviteSession?.title })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="quickEmails">{t('sessions.recipientEmails', { defaultValue: 'Emails dos destinatários' })}</Label>
              {memberEmails.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      const allEmails = memberEmails.map(m => m.email).join(', ');
                      setQuickInviteEmails(quickInviteEmails ? `${quickInviteEmails}, ${allEmails}` : allEmails);
                    }}
                  >
                    <Users className="h-3 w-3 mr-1" />
                    {t('sessions.addAll', { defaultValue: 'Adicionar todos ({{count}})', count: memberEmails.length })}
                  </Button>
                </div>
              )}
              <Textarea
                id="quickEmails"
                value={quickInviteEmails}
                onChange={(e) => setQuickInviteEmails(e.target.value)}
                placeholder={t('sessions.enterEmails', { defaultValue: 'Introduza emails (separados por vírgulas ou linhas)' })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSendInviteSession(null); setQuickInviteEmails(''); }}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={async () => {
                if (!sendInviteSession) return;
                const emails = quickInviteEmails
                  .split(/[,;\n]/)
                  .map(e => e.trim())
                  .filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
                
                if (emails.length > 0) {
                  await sendSessionInvite(sendInviteSession, emails);
                  setSendInviteSession(null);
                  setQuickInviteEmails('');
                } else {
                  notify.error(t('sessions.enterValidEmail', { defaultValue: 'Introduza pelo menos um email válido' }));
                }
              }}
              disabled={isSendingInvite || !quickInviteEmails.trim()}
            >
              {isSendingInvite ? (
                <>
                  <Send className="h-4 w-4 mr-2 animate-pulse" />
                  {t('sessions.sending', { defaultValue: 'A enviar...' })}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {t('sessions.sendInviteBtn', { defaultValue: 'Enviar convite' })}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
