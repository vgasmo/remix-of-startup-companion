import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { format, addDays, startOfDay } from 'date-fns';
import {
  Search,
  Plus,
  Clock,
  Calendar,
  AlertTriangle,
  Mail,
  
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateSession, useWorkspaceMembers } from '@/hooks/useSessions';
import { useSessionTemplates } from '@/hooks/useSessionTemplates';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { useConsultantAvailability, useValidateBookingSlot } from '@/hooks/useConsultantCalendar';
import { useMentorAvailability } from '@/hooks/useMentorAvailability';
import { logger } from '@/lib/logger';
import { lisbonWallClockToUtcIso } from '@/lib/dateUtils';

interface CreateSessionDialogProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSessionDialog({ workspaceId, open, onOpenChange }: CreateSessionDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [duration, setDuration] = useState('60');
  const [agenda, setAgenda] = useState('');
  const [location, setLocation] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [sendInvites, setSendInvites] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [useManualTime, setUseManualTime] = useState(false);
  const [manualDateTime, setManualDateTime] = useState('');
  // Log a meeting that already happened off-platform (no invites, captures notes/decisions)
  const [logPast, setLogPast] = useState(false);
  const [notes, setNotes] = useState('');
  const [decisions, setDecisions] = useState('');


  const createMutation = useCreateSession(workspaceId);
  const { data: members } = useWorkspaceMembers(workspaceId);
  const { data: sessionTemplates } = useSessionTemplates();

  const assignedConsultant = useMemo(
    () => members?.find((m) => m.role === 'consultor') || null,
    [members]
  );
  const assignedMentors = useMemo(
    () => (members || []).filter((m) => m.role === 'mentor_externo'),
    [members]
  );

  const [meetingWith, setMeetingWith] = useState<'consultor' | 'mentor_externo'>('consultor');
  const [participantId, setParticipantId] = useState<string>('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  useEffect(() => {
    if (participantId) return;
    if (meetingWith === 'consultor' && assignedConsultant?.user_id) {
      setParticipantId(assignedConsultant.user_id);
      return;
    }
    if (meetingWith === 'mentor_externo' && assignedMentors[0]?.user_id) {
      setParticipantId(assignedMentors[0].user_id);
    }
  }, [participantId, meetingWith, assignedConsultant?.user_id, assignedMentors]);

  // Auto-default title when opening with a consultant/mentor in context
  useEffect(() => {
    if (!open || title.trim()) return;
    const participantName =
      meetingWith === 'consultor'
        ? assignedConsultant?.profile?.full_name || assignedConsultant?.profile?.email
        : assignedMentors.find((m) => m.user_id === participantId)?.profile?.full_name;
    if (participantName) {
      setTitle(t('sessions.defaultTitleWith', { name: participantName, defaultValue: `Sessão com ${participantName}` }));
    }
  }, [open, meetingWith, assignedConsultant, assignedMentors, participantId, t, title]);

  const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined;
  const { data: consultantAvailability, isLoading: loadingConsultantAvailability } = useConsultantAvailability(
    workspaceId,
    meetingWith === 'consultor' ? dateStr : undefined,
    Number(duration)
  );
  const { data: mentorWeeklyAvailability } = useMentorAvailability(
    meetingWith === 'mentor_externo' ? participantId : undefined
  );

  const availableSlots = useMemo(() => {
    if (!dateStr || useManualTime) return [];
    const durationMinutes = Number.parseInt(duration || '60', 10);

    if (meetingWith === 'consultor') {
      const rawSlots = consultantAvailability?.slots ?? [];
      const slotStarts = rawSlots
        .map((s: unknown) => (typeof s === 'string' ? s : (s as { start?: string })?.start))
        .filter(Boolean) as string[];
      return slotStarts;
    }

    const date = new Date(`${dateStr}T00:00:00`);
    const day = date.getDay();
    const windows = (mentorWeeklyAvailability || []).filter((w) => w.day_of_week === day && w.is_active);
    if (windows.length === 0) return [];

    const slots: string[] = [];
    for (const w of windows) {
      const start = new Date(`${dateStr}T${w.start_time}:00`);
      const end = new Date(`${dateStr}T${w.end_time}:00`);
      let cur = new Date(start);
      while (cur.getTime() + durationMinutes * 60000 <= end.getTime()) {
        slots.push(cur.toISOString());
        cur = new Date(cur.getTime() + 30 * 60000);
      }
    }
    return Array.from(new Set(slots)).sort();
  }, [dateStr, duration, meetingWith, consultantAvailability, mentorWeeklyAvailability, useManualTime]);

  const getWorkspaceInfo = async () => {
    const { data } = await supabase
      .from('workspaces')
      .select(`id, startup:startups(name), program:programs(name)`)
      .eq('id', workspaceId)
      .maybeSingle();
    return data;
  };

  const getCurrentUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle();
    return data;
  };

  const validateSlotMutation = useValidateBookingSlot();

  /**
   * Detect overlapping scheduled sessions to prevent double-booking.
   * Uses UTC timestamps so timezone (e.g. Europe/Lisbon vs browser TZ) doesn't
   * cause false positives/negatives. Checks:
   *  - existing sessions in the same workspace overlapping the requested window
   *  - mentor_bookings for the same mentor overlapping the requested window
   */
  const findSchedulingConflict = async (
    startIsoUtc: string,
    durationMinutes: number,
  ): Promise<string | null> => {
    const startMs = new Date(startIsoUtc).getTime();
    if (!Number.isFinite(startMs)) return null;
    const endMs = startMs + durationMinutes * 60000;

    // Search window: any session starting up to 4h before could still overlap.
    const windowStart = new Date(startMs - 4 * 60 * 60000).toISOString();
    const windowEnd = new Date(endMs).toISOString();

    // 1) Same-workspace duplicate / overlap
    const { data: wsSessions } = await supabase
      .from('sessions')
      .select('id, title, scheduled_at, duration')
      .eq('workspace_id', workspaceId)
      .gte('scheduled_at', windowStart)
      .lt('scheduled_at', windowEnd)
      .returns<Array<{ id: string; title: string; scheduled_at: string; duration: number | null }>>();

    for (const s of wsSessions || []) {
      const sStart = new Date(s.scheduled_at).getTime();
      const sEnd = sStart + ((s.duration ?? 60) * 60000);
      if (sStart < endMs && sEnd > startMs) {
        return t('sessions.conflictWorkspace', {
          title: s.title,
          defaultValue: `Já existe uma sessão neste horário: "${s.title}".`,
        });
      }
    }

    // 2) Mentor already booked at that time (across workspaces)
    if (meetingWith === 'mentor_externo' && participantId) {
      const dayStr = new Date(startMs).toISOString().slice(0, 10);
      const { data: bookings } = await supabase
        .from('mentor_bookings')
        .select('id, requested_date, requested_start_time, requested_end_time, status')
        .eq('mentor_id', participantId)
        .in('status', ['pending', 'confirmed'])
        .eq('requested_date', dayStr);

      for (const b of bookings || []) {
        const bStart = new Date(`${b.requested_date}T${b.requested_start_time}`).getTime();
        const bEnd = new Date(`${b.requested_date}T${b.requested_end_time}`).getTime();
        if (Number.isFinite(bStart) && Number.isFinite(bEnd) && bStart < endMs && bEnd > startMs) {
          return t('sessions.conflictMentor', {
            defaultValue: 'O mentor já tem uma reserva neste horário.',
          });
        }
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let scheduledAtISO: string;

    if (useManualTime) {
      if (!title.trim() || !manualDateTime) {
        if (!title.trim()) setShowMoreOptions(true); // reveal the title field
        notify.error(!title.trim()
          ? t('sessions.titleRequiredHint', { defaultValue: 'Indique um título para a sessão.' })
          : t('common.error'));
        return;
      }
      // Manual datetime-local input is a wall-clock string. Treat it as
      // Europe/Lisbon (the canonical app timezone) so the saved UTC instant
      // matches what the user typed regardless of their browser timezone.
      scheduledAtISO = lisbonWallClockToUtcIso(manualDateTime);
    } else {
      if (!title.trim() || !selectedDate || !selectedSlot) {
        if (!title.trim()) setShowMoreOptions(true);
        notify.error(!title.trim()
          ? t('sessions.titleRequiredHint', { defaultValue: 'Indique um título para a sessão.' })
          : t('sessions.selectDateAndSlot', 'Please select a date and time slot'));
        return;
      }


      // selectedSlot comes from check-consultant-availability and is a
      // wall-clock string in Europe/Lisbon (e.g. "2026-04-29T09:00:00").
      // Convert explicitly so non-Lisbon browsers still produce the correct UTC.
      const startUtcIso = lisbonWallClockToUtcIso(selectedSlot);

      if (meetingWith === 'consultor' && !logPast) {
        const durationMinutes = Number.parseInt(duration || '60', 10);
        const start = new Date(startUtcIso);
        const end = new Date(start.getTime() + durationMinutes * 60000);

        const validation = await validateSlotMutation.mutateAsync({
          workspaceId,
          startTime: startUtcIso,
          endTime: end.toISOString(),
        });

        if (validation.checked && !validation.available) {
          notify.error(t('sessions.slotBusy', 'Esse horário está ocupado no calendário do consultor.'));
          return;
        }

        if (!validation.checked && validation.reason) {
          notify.warn(
            t('sessions.slotNotVerified', 'Não foi possível confirmar a disponibilidade no calendário; por favor confirme com o consultor.'),
          );
        }
      }

      scheduledAtISO = startUtcIso;
    }

    // Universal conflict guard — same-workspace duplicates + mentor overlap.
    // Skipped for logging past off-platform meetings (that's a record, not a booking).
    if (!logPast) {
      const conflict = await findSchedulingConflict(scheduledAtISO, parseInt(duration));
      if (conflict) {
        notify.error(conflict);
        return;
      }
    }

    setIsSending(true);
    try {
      const session = await createMutation.mutateAsync({
        title: title.trim(),
        scheduled_at: scheduledAtISO,
        duration: parseInt(duration),
        agenda: agenda.trim() || null,
        notes: logPast ? (notes.trim() || null) : null,
        decisions: logPast ? (decisions.trim() || null) : null,
        location: location.trim() || null,
        join_url: joinUrl.trim() || null,
        source: logPast ? 'off_platform' : null,
      });

      if (!logPast && sendInvites && members && members.length > 0) {

        try {
          const [workspaceInfo, currentUser] = await Promise.all([
            getWorkspaceInfo(),
            getCurrentUserProfile(),
          ]);

          const recipientEmails = members
            .filter(m => m.profile?.email)
            .map(m => m.profile!.email);

          if (recipientEmails.length > 0) {
            const { error } = await supabase.functions.invoke('send-session-invite', {
              body: {
                sessionId: session.id,
                workspaceId,
                title: title.trim(),
                scheduledAt: scheduledAtISO,
                duration: parseInt(duration),
                agenda: agenda.trim() || undefined,
                location: location.trim() || undefined,
                joinUrl: joinUrl.trim() || undefined,
                recipientEmails,
                organizerName: currentUser?.full_name || currentUser?.email || 'Mentor',
                startupName: (workspaceInfo?.startup as { name: string } | null)?.name || 'Startup',
              },
            });

            if (error) {
              logger.error('Failed to send invites', {}, error);
            }
          }
        } catch (emailError) {
          logger.error('Email sending error', {}, emailError);
        }
      }

      notify.success(t('sessions.sessionCreated'));
      onOpenChange(false);
      resetForm();
    } catch (error) {
      notify.error(t('common.error'));
    } finally {
      setIsSending(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setSelectedDate(undefined);
    setSelectedSlot('');
    setManualDateTime('');
    setDuration('60');
    setAgenda('');
    setLocation('');
    setJoinUrl('');
    setSendInvites(true);
    setSelectedTemplate('');
    setLogPast(false);
    setNotes('');
    setDecisions('');
  };


  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = sessionTemplates?.find(t => t.id === templateId);
    if (template) {
      if (template.name && !title) setTitle(template.name);
      if (template.agenda_template) setAgenda(template.agenda_template);
    }
  };

  const memberCount = members?.filter(m => m.profile?.email).length || 0;
  const hasConsultant = consultantAvailability?.consultantName || consultantAvailability?.consultantEmail;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {logPast
              ? t('sessions.logPastTitle', 'Registar reunião realizada')
              : t('sessions.scheduleSession', 'Schedule Session')}
          </DialogTitle>
          <DialogDescription>
            {logPast
              ? t('sessions.logPastDesc', 'Adicione uma reunião que já aconteceu fora da app, com notas e decisões.')
              : hasConsultant
                ? t('sessions.scheduleWithConsultant', 'Schedule based on {{name}}\'s availability', { name: consultantAvailability?.consultantName || consultantAvailability?.consultantEmail })
                : t('sessions.scheduleSessionDesc', 'Schedule a new mentoring session')
            }
          </DialogDescription>

        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Log a past meeting (already happened off-platform) */}
          <div className="flex items-start gap-3 p-3 rounded-lg border border-dashed bg-muted/30">
            <Checkbox
              id="log-past"
              checked={logPast}
              onCheckedChange={(checked) => {
                const v = !!checked;
                setLogPast(v);
                if (v) {
                  setUseManualTime(true);
                  setSendInvites(false);
                  setSelectedSlot('');
                }
              }}
              className="mt-0.5"
            />
            <div className="flex-1">
              <Label htmlFor="log-past" className="cursor-pointer font-medium">
                {t('sessions.logPast', 'Reunião já realizada (registar fora da app)')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('sessions.logPastHelp', 'Registe uma reunião que já aconteceu com data passada, notas e decisões. Não envia convites nem sincroniza com o calendário.')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowMoreOptions((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            {showMoreOptions
              ? t('sessions.hideMoreOptions', 'Ocultar opções avançadas')
              : t('sessions.showMoreOptions', 'Mais opções (título, participantes, agenda, ligação)')}
          </button>

          {showMoreOptions && (<>


          {sessionTemplates && sessionTemplates.length > 0 && (
            <div className="space-y-2">
              <Label>{t('sessions.useTemplateOptional', 'Use Template (optional)')}</Label>
              <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder={t('sessions.selectTemplate', 'Select a template...')} />
                </SelectTrigger>
                <SelectContent>
                  {sessionTemplates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">{t('sessions.titleRequired', 'Title *')}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('sessions.titlePlaceholder', 'Monthly check-in')}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('sessions.meetingWith', 'Sessão com')}</Label>
              <Select
                value={meetingWith}
                onValueChange={(v) => {
                  const next = v as 'consultor' | 'mentor_externo';
                  setMeetingWith(next);
                  setParticipantId('');
                  setSelectedSlot('');
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultor">{t('sessions.withConsultant', 'Consultor')}</SelectItem>
                  <SelectItem value="mentor_externo">{t('sessions.withMentor', 'Mentor')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('sessions.participant', 'Participante')}</Label>
              <Select
                value={participantId}
                onValueChange={(v) => { setParticipantId(v); setSelectedSlot(''); }}
                disabled={meetingWith === 'consultor' ? !assignedConsultant?.user_id : assignedMentors.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('sessions.selectParticipant', 'Selecionar...')} />
                </SelectTrigger>
                <SelectContent>
                  {meetingWith === 'consultor' ? (
                    assignedConsultant ? (
                      <SelectItem value={assignedConsultant.user_id}>
                        {assignedConsultant.profile?.full_name || assignedConsultant.profile?.email || 'Consultor'}
                      </SelectItem>
                    ) : (
                      <SelectItem value="__none" disabled>
                        {t('sessions.noConsultantAssigned', 'Sem consultor atribuído')}
                      </SelectItem>
                    )
                  ) : assignedMentors.length > 0 ? (
                    assignedMentors.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.profile?.full_name || m.profile?.email || 'Mentor'}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__none" disabled>
                      {t('sessions.noMentorAssigned', 'Sem mentor atribuído')}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          </>)}



          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md transition-colors ${!useManualTime ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
              onClick={() => setUseManualTime(false)}
            >
              <Calendar className="h-3.5 w-3.5 inline mr-1.5" />
              {t('sessions.availableSlots', 'Available Slots')}
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md transition-colors ${useManualTime ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
              onClick={() => setUseManualTime(true)}
            >
              <Clock className="h-3.5 w-3.5 inline mr-1.5" />
              {t('sessions.manualTime', 'Manual Time')}
            </button>
          </div>

          {useManualTime ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduled_at">{t('sessions.dateTime', 'Date & Time *')}</Label>
                <Input
                  id="scheduled_at"
                  type="datetime-local"
                  value={manualDateTime}
                  onChange={(e) => setManualDateTime(e.target.value)}
                  required={useManualTime}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">{t('sessions.duration', 'Duration')}</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">60 min</SelectItem>
                    <SelectItem value="90">90 min</SelectItem>
                    <SelectItem value="120">120 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>{t('sessions.selectDate', 'Select Date *')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <Calendar className="h-4 w-4 mr-2" />
                      {selectedDate ? format(selectedDate, 'PPP') : t('sessions.pickDate', 'Pick a date')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => { setSelectedDate(date); setSelectedSlot(''); }}
                      fromDate={startOfDay(new Date())}
                      toDate={addDays(new Date(), 60)}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {selectedDate && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t('sessions.selectTimeSlot', 'Select Time Slot *')}</Label>
                    {meetingWith === 'consultor' && loadingConsultantAvailability && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t('sessions.checkingAvailability', 'Checking availability...')}
                      </span>
                    )}
                  </div>

                  {meetingWith === 'consultor' && loadingConsultantAvailability ? (
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3, 4, 5, 6].map(i => (
                        <Skeleton key={i} className="h-9" />
                      ))}
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="text-center py-4 bg-muted/30 rounded-lg">
                      <Clock className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {t('sessions.noSlotsAvailable', 'No available slots for this date')}
                      </p>
                      <Button type="button" variant="link" size="sm" onClick={() => setUseManualTime(true)}>
                        {t('sessions.useManualTimeInstead', 'Use manual time instead')}
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                      {availableSlots.map((slotStart) => {
                        const timeStr =
                          typeof slotStart === 'string' && slotStart.includes('T')
                            ? slotStart.slice(11, 16)
                            : format(new Date(slotStart), 'HH:mm');
                        const isSelected = selectedSlot === slotStart;
                        return (
                          <Button
                            key={slotStart}
                            type="button"
                            variant={isSelected ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedSlot(slotStart)}
                            className="text-xs"
                          >
                            {timeStr}
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  {meetingWith === 'consultor' && consultantAvailability?.warning && (
                    <p className="text-xs text-[hsl(var(--warning))] flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {consultantAvailability.warning}
                    </p>
                  )}

                  <div className="space-y-2 pt-2">
                    <Label htmlFor="duration">{t('sessions.duration', 'Duration')}</Label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 min</SelectItem>
                        <SelectItem value="60">60 min</SelectItem>
                        <SelectItem value="90">90 min</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </>
          )}

          {showMoreOptions && (
          <div className="space-y-2">
            <Label htmlFor="agenda">{t('sessions.agenda', 'Agenda')}</Label>
            <Textarea
              id="agenda"
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder={t('sessions.agendaPlaceholder', 'Topics to discuss...')}
              rows={2}
            />
          </div>
          )}

          {logPast && (
            <>
              <div className="space-y-2">
                <Label htmlFor="notes">{t('sessions.notes', 'Notas da reunião')}</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('sessions.notesPlaceholder', 'O que se discutiu, pontos relevantes...')}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="decisions">{t('sessions.decisions', 'Decisões / próximos passos')}</Label>
                <Textarea
                  id="decisions"
                  value={decisions}
                  onChange={(e) => setDecisions(e.target.value)}
                  placeholder={t('sessions.decisionsPlaceholder', 'Decisões tomadas e próximos passos...')}
                  rows={3}
                />
              </div>
            </>
          )}

          {showMoreOptions && (<>
          <div className="space-y-2">
            <Label htmlFor="location">{t('sessions.location', 'Location')}</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('sessions.locationPlaceholder', 'Meeting room or address')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="joinUrl">
              Meeting Link
              <span className="text-muted-foreground text-xs ml-1">(optional if using Teams sync)</span>
            </Label>
            <Input
              id="joinUrl"
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
              placeholder="Optional - Teams link added automatically if synced"
            />
          </div>
          </>)}


          {!logPast && (
            <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
              <Checkbox
                id="send-invites"
                checked={sendInvites}
                onCheckedChange={(checked) => setSendInvites(!!checked)}
              />
              <div className="flex-1">
                <Label htmlFor="send-invites" className="cursor-pointer font-medium">
                  {t('sessions.sendInvites', 'Send calendar invites')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {memberCount > 0
                    ? t('sessions.sendInvitesHelp', { count: memberCount, defaultValue: `Email ${memberCount} workspace member(s) with calendar invite` })
                    : t('sessions.sendInvitesNone', 'No workspace members to invite')}
                </p>
              </div>
            </div>
          )}


          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || isSending} loading={createMutation.isPending}>
              {(createMutation.isPending || isSending) ? 'Scheduling...' : 'Schedule Session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
