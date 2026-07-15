// SessionCompletionDialog
// Phase 3 (P0-4 fix): capture the exact evidence that impact reporting
// depends on so we never need to backfill fabricated completions.
// - actual_duration_minutes MUST be supplied (no default from planned duration)
// - primary_consultant_id is required
// - session_template_id is optional
// - per-participant attendance is upserted
// Emits a canonical `session_completed` tool_usage event via useCompleteSession.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { notify } from '@/lib/notify';
import { useCompleteSession } from '@/hooks/useSessions';
import { supabase } from '@/lib/supabaseClient';

type AttendanceStatus = 'attended' | 'absent' | 'excused' | 'unknown';

interface Participant {
  user_id: string;
  full_name: string | null;
  role: string | null;
  attendance_status: AttendanceStatus;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: {
    id: string;
    workspace_id: string;
    title: string;
    duration: number | null; // planned; used only as prefilled hint
    primary_consultant_id?: string | null;
    session_template_id?: string | null;
  };
  onCompleted?: () => void;
}

export function SessionCompletionDialog({ open, onOpenChange, session, onCompleted }: Props) {
  const { t } = useTranslation();
  const [actualDuration, setActualDuration] = useState<string>('');
  const [primaryConsultantId, setPrimaryConsultantId] = useState<string>(session.primary_consultant_id ?? '');
  const [templateId, setTemplateId] = useState<string>(session.session_template_id ?? '');
  const [notes, setNotes] = useState('');
  const [decisions, setDecisions] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [staff, setStaff] = useState<Array<{ id: string; full_name: string | null }>>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);

  const complete = useCompleteSession();

  useEffect(() => {
    if (!open) return;
    // Release-hardening P0: actual duration must be entered explicitly,
    // never inferred from planned duration.
    setActualDuration('');
    setPrimaryConsultantId(session.primary_consultant_id ?? '');
    setTemplateId(session.session_template_id ?? '');
    setNotes('');
    setDecisions('');
    (async () => {
      setLoadingRefs(true);
      try {
        // Load invited/scheduled participants
        const [{ data: sp }, { data: staffData }, { data: tmpls }] = await Promise.all([
          supabase.from('session_participants').select('user_id, role, attendance_status').eq('session_id', session.id),
          supabase.from('user_roles').select('user_id').in('role', ['admin', 'consultor']),
          supabase.from('session_templates').select('id, name').limit(200),
        ]);
        const uids = [...new Set((sp ?? []).map(r => r.user_id))];
        const profiles = uids.length > 0
          ? (await supabase.from('profiles_safe').select('id, full_name').in('id', uids)).data ?? []
          : [];
        const nameById = new Map(profiles.map(p => [p.id, p.full_name]));
        setParticipants(((sp ?? []) as Array<{ user_id: string; role: string | null; attendance_status: string }>).map(p => ({
          user_id: p.user_id,
          full_name: nameById.get(p.user_id) ?? null,
          role: p.role,
          attendance_status: (['attended', 'absent', 'excused', 'unknown'].includes(p.attendance_status)
            ? p.attendance_status
            : 'unknown') as AttendanceStatus,
        })));

        const staffIds = [...new Set((staffData ?? []).map(r => r.user_id))];
        if (staffIds.length > 0) {
          const { data: sp2 } = await supabase.from('profiles_safe').select('id, full_name').in('id', staffIds);
          setStaff(sp2 ?? []);
        }
        setTemplates(tmpls ?? []);
      } finally {
        setLoadingRefs(false);
      }
    })();
  }, [open, session.id, session.duration, session.primary_consultant_id, session.session_template_id]);

  const canSubmit = !!primaryConsultantId && Number(actualDuration) > 0 && !complete.isPending;

  const submit = async () => {
    const mins = Math.round(Number(actualDuration));
    if (!mins || mins <= 0) { notify.error(t('sessions.completion.durationRequired', 'Duração real obrigatória (> 0)')); return; }
    if (!primaryConsultantId) { notify.error(t('sessions.completion.consultantRequired', 'Consultor principal obrigatório')); return; }
    try {
      await complete.mutateAsync({
        session_id: session.id,
        workspace_id: session.workspace_id,
        actual_duration_minutes: mins,
        primary_consultant_id: primaryConsultantId,
        session_template_id: templateId || null,
        notes: notes || null,
        decisions: decisions || null,
        attendance: participants.map(p => ({
          user_id: p.user_id,
          attendance_status: p.attendance_status,
          role: p.role,
        })),
      });
      notify.success(t('sessions.completion.success', 'Sessão marcada como completada'));
      onOpenChange(false);
      onCompleted?.();
    } catch (e) {
      notify.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('sessions.completion.title', 'Completar sessão')}</DialogTitle>
          <DialogDescription>
            {t('sessions.completion.subtitle', 'Registe a duração real, consultor principal e presenças. Estes campos alimentam o relatório de impacto.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm font-medium">{session.title}</div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sc-duration" className="text-xs">
                {t('sessions.completion.actualDuration', 'Duração real (min)')} *
              </Label>
              <Input id="sc-duration" type="number" min={1} value={actualDuration}
                onChange={e => setActualDuration(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-consultant" className="text-xs">
                {t('sessions.completion.primaryConsultant', 'Consultor principal')} *
              </Label>
              <Select value={primaryConsultantId} onValueChange={setPrimaryConsultantId}>
                <SelectTrigger id="sc-consultant"><SelectValue placeholder="…" /></SelectTrigger>
                <SelectContent>
                  {staff.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name ?? s.id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sc-template" className="text-xs">
              {t('sessions.completion.template', 'Modelo de sessão (opcional)')}
            </Label>
            <Select value={templateId || 'none'} onValueChange={v => setTemplateId(v === 'none' ? '' : v)}>
              <SelectTrigger id="sc-template"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t('sessions.completion.attendance', 'Presenças')}</Label>
            <ScrollArea className="h-40 border rounded p-2">
              {loadingRefs ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> a carregar…</div>
              ) : participants.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  {t('sessions.completion.noParticipants', 'Nenhum participante convidado registado.')}
                </div>
              ) : (
                <div className="space-y-1">
                  {participants.map(p => (
                    <div key={p.user_id} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate">{p.full_name ?? p.user_id.slice(0, 8)}</span>
                      <span className="text-muted-foreground">{p.role ?? ''}</span>
                      <Select value={p.attendance_status}
                        onValueChange={v => setParticipants(list => list.map(x => x.user_id === p.user_id ? { ...x, attendance_status: v as AttendanceStatus } : x))}>
                        <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="attended">{t('sessions.completion.attended', 'Presente')}</SelectItem>
                          <SelectItem value="absent">{t('sessions.completion.absent', 'Ausente')}</SelectItem>
                          <SelectItem value="excused">{t('sessions.completion.excused', 'Justificado')}</SelectItem>
                          <SelectItem value="unknown">{t('sessions.completion.unknown', 'Desconhecido')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sc-notes" className="text-xs">{t('sessions.completion.notes', 'Notas')}</Label>
            <Textarea id="sc-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sc-decisions" className="text-xs">{t('sessions.completion.decisions', 'Decisões')}</Label>
            <Textarea id="sc-decisions" rows={2} value={decisions} onChange={e => setDecisions(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancelar')}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {complete.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('sessions.completion.submit', 'Marcar como completada')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SessionCompletionDialog;
