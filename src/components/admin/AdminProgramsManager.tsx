import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, GripVertical, Wand2, FileEdit, Calendar, Flag, Video, Save, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { 
  usePrograms, 
  useCreateProgram, 
  useUpdateProgram, 
  useDeleteProgram,
  useStages,
  useCreateStage,
  useUpdateStage,
  useDeleteStage,
} from '@/hooks/useAdminData';
import { useProgramSetupDrafts, useCreateProgramDraft } from '@/hooks/useProgramSetup';
import { supabase } from '@/lib/supabaseClient';
import { format } from 'date-fns';

interface Program {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  program_type?: 'incubation' | 'acceleration';
}

interface Stage {
  id: string;
  name: string;
  description: string | null;
  position: number;
  program_id: string;
}

function StagesManager({ programId }: { programId: string }) {
  const { t } = useTranslation();
  const { data: stages, isLoading } = useStages(programId);
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();

  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', position: 0 });
  const [deleteTarget, setDeleteTarget] = useState<Stage | null>(null);

  const handleCreate = () => {
    const nextPos = stages?.length ? Math.max(...stages.map(s => s.position)) + 1 : 0;
    setFormData({ name: '', description: '', position: nextPos });
    setIsCreating(true);
  };

  const handleEdit = (stage: Stage) => {
    setFormData({ name: stage.name, description: stage.description || '', position: stage.position });
    setEditingStage(stage);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    if (editingStage) {
      await updateStage.mutateAsync({ id: editingStage.id, program_id: programId, ...formData });
    } else {
      await createStage.mutateAsync({ ...formData, program_id: programId });
    }
    setEditingStage(null);
    setIsCreating(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteStage.mutateAsync({ id: deleteTarget.id, program_id: programId });
    setDeleteTarget(null);
  };

  if (isLoading) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="pl-6 border-l border-border/50 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{t('adminPrograms.stages')}</span>
        <Button variant="ghost" size="sm" onClick={handleCreate}>
          <Plus className="h-3 w-3 mr-1" />
          {t('adminPrograms.addStage')}
        </Button>
      </div>
      
      {stages?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('adminPrograms.noStages')}</p>
      ) : (
        <div className="space-y-1">
          {stages?.map(stage => (
            <div key={stage.id} className="flex items-center gap-2 p-2 rounded bg-muted/30 group">
              <GripVertical className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground w-6">{stage.position}</span>
              <span className="flex-1 text-sm">{stage.name}</span>
              <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={()=> handleEdit(stage)} aria-label={t('common.edit')}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={()=> setDeleteTarget(stage)} aria-label={t('common.delete')}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isCreating || !!editingStage} onOpenChange={(open) => { if (!open) { setIsCreating(false); setEditingStage(null); }}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStage ? t('adminPrograms.editStage') : t('adminPrograms.newStage')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('adminPrograms.name')} *</Label>
              <Input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>{t('adminPrograms.position')}</Label>
              <Input type="number" value={formData.position} onChange={e => setFormData(f => ({ ...f, position: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <Label>{t('adminPrograms.description')}</Label>
              <Textarea value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreating(false); setEditingStage(null); }}>{t('adminPrograms.cancel')}</Button>
            <Button onClick={handleSave}>{editingStage ? t('adminPrograms.update') : t('adminPrograms.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('adminPrograms.deleteStage')}</AlertDialogTitle>
            <AlertDialogDescription>{t('adminPrograms.deleteStageDescription', { name: deleteTarget?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('adminPrograms.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">{t('adminPrograms.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
function GatesWeeksManager({ programId }: { programId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: gates, isLoading: gatesLoading } = useQuery({
    queryKey: ['program-gates', programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('program_gates')
        .select('*')
        .eq('program_id', programId)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: weeks, isLoading: weeksLoading } = useQuery({
    queryKey: ['program-weeks', programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('program_weeks')
        .select('*')
        .eq('program_id', programId)
        .order('week_number');
      if (error) throw error;
      return data;
    },
  });

  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('10:00');
  const [editUrl, setEditUrl] = useState('');

  const updateWeek = useMutation({
    mutationFn: async (params: { weekId: string; scheduled_at: string | null; meeting_url: string | null }) => {
      const { error } = await supabase
        .from('program_weeks')
        .update({ scheduled_at: params.scheduled_at, meeting_url: params.meeting_url })
        .eq('id', params.weekId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['program-weeks', programId] });
      queryClient.invalidateQueries({ queryKey: ['acceleration-calendar', programId] });
    },
  });

  const startEditing = (week: any) => {
    setEditingWeekId(week.id);
    if (week.scheduled_at) {
      const d = new Date(week.scheduled_at);
      setEditDate(format(d, 'yyyy-MM-dd'));
      setEditTime(format(d, 'HH:mm'));
    } else {
      setEditDate('');
      setEditTime('10:00');
    }
    setEditUrl(week.meeting_url || '');
  };

  const handleSave = async (weekId: string) => {
    let scheduled_at: string | null = null;
    if (editDate) {
      const [h, m] = editTime.split(':').map(Number);
      const d = new Date(editDate + 'T00:00:00');
      d.setHours(h || 0, m || 0, 0, 0);
      scheduled_at = d.toISOString();
    }
    await updateWeek.mutateAsync({ weekId, scheduled_at, meeting_url: editUrl.trim() || null });
    setEditingWeekId(null);
  };

  if (gatesLoading || weeksLoading) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="pl-6 border-l border-border/50 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <Flag className="h-3.5 w-3.5" />
          {t('adminPrograms.gates')} ({gates?.length || 0})
        </span>
        <Button variant="outline" size="sm" onClick={() => navigate(`/admin/programs/${programId}/setup`)}>
          <FileEdit className="h-3 w-3 mr-1" />
          {t('adminPrograms.editInWizard', { defaultValue: 'Editar no Wizard' })}
        </Button>
      </div>
      <div>
        {gates?.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-1">{t('adminPrograms.noGates')}</p>
        ) : (
          <div className="space-y-1 mt-2">
            {gates?.map(gate => (
              <div key={gate.id} className="flex items-center gap-2 p-2 rounded bg-muted/30">
                <Flag className="h-3 w-3 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">{gate.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t('adminPrograms.weeksRange', { start: gate.target_start_week, end: gate.target_end_week })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {t('adminPrograms.weeks')} ({weeks?.length || 0})
          <span className="text-xs text-muted-foreground/60 ml-1">
            — {t('adminPrograms.clickToSchedule', { defaultValue: 'clique ✏️ para agendar sessões' })}
          </span>
        </span>
        {weeks?.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-1">{t('adminPrograms.noWeeks')}</p>
        ) : (
          <div className="space-y-1 mt-2">
            {weeks?.map(week => {
              const deliverables = Array.isArray(week.deliverables_json) ? week.deliverables_json as Record<string, unknown>[] : [];
              const isEditing = editingWeekId === week.id;
              const hasSchedule = !!(week as any).scheduled_at;
              const hasUrl = !!(week as any).meeting_url;

              return (
                <div key={week.id} className="flex flex-col gap-1 p-2 rounded bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-8 shrink-0">S{week.week_number}</span>
                    <span className="flex-1 text-sm">{week.title}</span>
                    {deliverables.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {deliverables.length} {t('adminPrograms.deliverables')}
                      </Badge>
                    )}
                    {hasSchedule && !isEditing && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date((week as any).scheduled_at), 'dd/MM HH:mm')}
                      </span>
                    )}
                    {hasUrl && !isEditing && (
                      <a href={(week as any).meeting_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary flex items-center gap-0.5 hover:underline"
                        onClick={e => e.stopPropagation()}>
                        <Video className="h-3 w-3" />
                        Link
                      </a>
                    )}
                    {!isEditing && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEditing(week)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {isEditing && (
                    <div className="flex items-center gap-2 ml-8">
                      <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                        className="h-7 w-[130px] text-xs" />
                      <Input type="time" value={editTime} onChange={e => setEditTime(e.target.value)}
                        className="h-7 w-[80px] text-xs" />
                      <Input type="url" placeholder="URL da sessão (Teams, Zoom...)" value={editUrl}
                        onChange={e => setEditUrl(e.target.value)} className="h-7 flex-1 text-xs" />
                      <Button size="sm" className="h-7 w-7 p-0" onClick={() => handleSave(week.id)} disabled={updateWeek.isPending}>
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingWeekId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminProgramsManager() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: programs, isLoading } = usePrograms();
  const { data: drafts } = useProgramSetupDrafts();
  const createProgram = useCreateProgram();
  const updateProgram = useUpdateProgram();
  const deleteProgram = useDeleteProgram();
  const createDraft = useCreateProgramDraft();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Program | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', start_date: '', end_date: '', program_type: 'incubation' as 'incubation' | 'acceleration' });

  const getProgramDraft = (programId: string) => drafts?.find(d => d.program_id === programId);
  const hasNewProgramDraft = drafts?.some(d => !d.program_id);

  const handleNewProgramWizard = async () => {
    const existingDraft = drafts?.find(d => !d.program_id);
    if (existingDraft) {
      navigate(`/admin/programs/new/${existingDraft.id}`);
    } else {
      const draft = await createDraft.mutateAsync({});
      navigate(`/admin/programs/new/${draft.id}`);
    }
  };

  const handleSetupProgram = async (programId: string) => {
    const existingDraft = getProgramDraft(programId);
    if (existingDraft) {
      navigate(`/admin/programs/${programId}/setup/${existingDraft.id}`);
    } else {
      const draft = await createDraft.mutateAsync({ programId });
      navigate(`/admin/programs/${programId}/setup/${draft.id}`);
    }
  };

  const handleCreate = () => {
    setFormData({ name: '', description: '', start_date: '', end_date: '', program_type: 'incubation' });
    setIsCreating(true);
  };

  const handleEdit = (program: Program) => {
    setFormData({
      name: program.name,
      description: program.description || '',
      start_date: program.start_date || '',
      end_date: program.end_date || '',
      program_type: program.program_type || 'incubation',
    });
    setEditingProgram(program);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    if (editingProgram) {
      await updateProgram.mutateAsync({ 
        id: editingProgram.id, 
        name: formData.name,
        description: formData.description || undefined,
        start_date: formData.start_date || undefined,
        end_date: formData.end_date || undefined,
        program_type: formData.program_type,
      });
    } else {
      await createProgram.mutateAsync({
        name: formData.name,
        description: formData.description || undefined,
        start_date: formData.start_date || undefined,
        end_date: formData.end_date || undefined,
        program_type: formData.program_type,
      });
    }
    setEditingProgram(null);
    setIsCreating(false);
  };

  const handleToggleActive = async (program: Program) => {
    await updateProgram.mutateAsync({ id: program.id, is_active: !program.is_active });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteProgram.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('adminPrograms.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('adminPrograms.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          {hasNewProgramDraft && (
            <Button variant="outline" onClick={() => {
              const existingDraft = drafts?.find(d => !d.program_id);
              if (existingDraft) navigate(`/admin/programs/new/${existingDraft.id}`);
            }}>
              <Wand2 className="h-4 w-4 mr-1" />
              {t('adminPrograms.continueDraft')}
            </Button>
          )}
          <Button onClick={handleNewProgramWizard} disabled={createDraft.isPending}>
            <Wand2 className="h-4 w-4 mr-1" />
            {t('adminPrograms.newProgramWizard')}
          </Button>
          <Button variant="outline" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t('adminPrograms.quickCreate')}
          </Button>
        </div>
      </div>

      {programs?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('adminPrograms.emptyState')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {programs?.map(program => (
            <Collapsible key={program.id} open={expandedId === program.id} onOpenChange={(open) => setExpandedId(open ? program.id : null)}>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={t('common.expand')}>
                        {expandedId === program.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{program.name}</h3>
                        <Badge variant={program.is_active ? 'default' : 'secondary'}>
                          {program.is_active ? t('adminPrograms.active') : t('adminPrograms.inactive')}
                        </Badge>
                        {program.program_type === 'acceleration' && (
                          <Badge variant="outline" className="text-primary border-primary/30">
                            {t('adminPrograms.acceleration')}
                          </Badge>
                        )}
                        {getProgramDraft(program.id) && (
                          <Badge variant="outline" className="text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30">
                            {t('adminPrograms.draft')}
                          </Badge>
                        )}
                        {program.is_active && getProgramDraft(program.id) && (
                          <Badge
                            variant="outline"
                            className="text-destructive border-destructive/40"
                            title={t('adminPrograms.inconsistentStateTooltip')}
                          >
                            ⚠ {t('adminPrograms.inconsistentState')}
                          </Badge>
                        )}
                      </div>
                      {program.description && <p className="text-sm text-muted-foreground truncate">{program.description}</p>}
                      {(program.start_date || program.end_date) && (
                        <p className="text-xs text-muted-foreground">
                          {program.start_date && format(new Date(program.start_date), 'MMM d, yyyy')}
                          {program.start_date && program.end_date && ' – '}
                          {program.end_date && format(new Date(program.end_date), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm">
                          {program.program_type === 'acceleration' ? <Calendar className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                          {program.program_type === 'acceleration' ? t('adminPrograms.gatesAndWeeks') : t('adminPrograms.stages')}
                          {expandedId === program.id ? <ChevronDown className="h-3 w-3 ml-1" /> : <ChevronRight className="h-3 w-3 ml-1" />}
                        </Button>
                      </CollapsibleTrigger>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetupProgram(program.id)}
                        disabled={createDraft.isPending}
                      >
                        <FileEdit className="h-3 w-3 mr-1" />
                        {getProgramDraft(program.id) ? t('adminPrograms.continueSetup') : t('adminPrograms.setup')}
                      </Button>
                      <Switch checked={program.is_active} onCheckedChange={() => handleToggleActive(program)} />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={()=> handleEdit(program)} aria-label={t('common.edit')}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={()=> setDeleteTarget(program)} aria-label={t('common.delete')}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <CollapsibleContent className="mt-4">
                    {program.program_type === 'acceleration' ? (
                      <GatesWeeksManager programId={program.id} />
                    ) : (
                      <StagesManager programId={program.id} />
                    )}
                  </CollapsibleContent>
                </CardContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}

      <Dialog open={isCreating || !!editingProgram} onOpenChange={(open) => { if (!open) { setIsCreating(false); setEditingProgram(null); }}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProgram ? t('adminPrograms.editProgram') : t('adminPrograms.newProgram')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('adminPrograms.name')} *</Label>
              <Input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder={t('adminPrograms.namePlaceholder')} />
            </div>
            <div>
              <Label>{t('adminPrograms.description')}</Label>
              <Textarea value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminPrograms.startDate')}</Label>
                <Input type="date" value={formData.start_date} onChange={e => setFormData(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <Label>{t('adminPrograms.endDate')}</Label>
                <Input type="date" value={formData.end_date} onChange={e => setFormData(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>{t('adminPrograms.programType', { defaultValue: 'Tipo de Programa' })}</Label>
              <div className="flex gap-2 mt-1.5">
                <Button
                  type="button"
                  variant={formData.program_type === 'incubation' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData(f => ({ ...f, program_type: 'incubation' }))}
                >
                  {t('adminPrograms.incubation', { defaultValue: 'Incubação' })}
                </Button>
                <Button
                  type="button"
                  variant={formData.program_type === 'acceleration' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData(f => ({ ...f, program_type: 'acceleration' }))}
                >
                  {t('adminPrograms.acceleration', { defaultValue: 'Aceleração' })}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreating(false); setEditingProgram(null); }}>{t('adminPrograms.cancel')}</Button>
            <Button onClick={handleSave}>{editingProgram ? t('adminPrograms.update') : t('adminPrograms.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('adminPrograms.deleteProgram')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('adminPrograms.deleteProgramDescription', { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('adminPrograms.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">{t('adminPrograms.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}