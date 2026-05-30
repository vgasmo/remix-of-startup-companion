import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCreateExercise, useUpdateExercise, Exercise } from '@/hooks/useExerciseLibrary';
import { CONTEXT_TAGS } from './ExerciseLibraryTab';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ExerciseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: Exercise | null;
}

interface ExerciseStep {
  step: number;
  title: string;
  description: string;
  duration?: number;
}

export function ExerciseFormDialog({ open, onOpenChange, exercise }: ExerciseFormDialogProps) {
  const { t } = useTranslation();
  const createMutation = useCreateExercise();
  const updateMutation = useUpdateExercise();

  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [groupSize, setGroupSize] = useState<'1:1' | 'small_group' | 'cohort'>('1:1');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [materialsNeeded, setMaterialsNeeded] = useState<string[]>(['']);
  const [steps, setSteps] = useState<ExerciseStep[]>([{ step: 1, title: '', description: '', duration: 5 }]);
  const [facilitatorTips, setFacilitatorTips] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [commonPitfalls, setCommonPitfalls] = useState('');
  const [variations, setVariations] = useState('');
  const [isApproved, setIsApproved] = useState(false);

  useEffect(() => {
    if (exercise) {
      setTitle(exercise.title);
      setPurpose(exercise.purpose || '');
      setDurationMinutes(exercise.duration_minutes);
      setGroupSize(exercise.group_size);
      setSelectedTags(exercise.startup_context_tags);
      setMaterialsNeeded(exercise.materials_needed.length > 0 ? exercise.materials_needed : ['']);
      setSteps(exercise.step_by_step.length > 0 ? exercise.step_by_step : [{ step: 1, title: '', description: '', duration: 5 }]);
      setFacilitatorTips(exercise.facilitator_tips || '');
      setSuccessCriteria(exercise.success_criteria || '');
      setCommonPitfalls(exercise.common_pitfalls || '');
      setVariations(exercise.variations || '');
      setIsApproved(exercise.status === 'approved');
    } else {
      resetForm();
    }
  }, [exercise, open]);

  const resetForm = () => {
    setTitle(''); setPurpose(''); setDurationMinutes(30); setGroupSize('1:1');
    setSelectedTags([]); setMaterialsNeeded(['']);
    setSteps([{ step: 1, title: '', description: '', duration: 5 }]);
    setFacilitatorTips(''); setSuccessCriteria(''); setCommonPitfalls('');
    setVariations(''); setIsApproved(false);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const addMaterial = () => setMaterialsNeeded((prev) => [...prev, '']);
  const removeMaterial = (index: number) => setMaterialsNeeded((prev) => prev.filter((_, i) => i !== index));
  const updateMaterial = (index: number, value: string) => setMaterialsNeeded((prev) => prev.map((m, i) => (i === index ? value : m)));

  const addStep = () => setSteps((prev) => [...prev, { step: prev.length + 1, title: '', description: '', duration: 5 }]);
  const removeStep = (index: number) => setSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, step: i + 1 })));
  const updateStep = (index: number, field: keyof ExerciseStep, value: string | number) => setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error(t('consultor.titleIsRequired')); return; }
    const exerciseStatus: 'draft' | 'approved' = isApproved ? 'approved' : 'draft';
    const data = {
      title: title.trim(), purpose: purpose.trim() || null, duration_minutes: durationMinutes,
      group_size: groupSize, startup_context_tags: selectedTags,
      materials_needed: materialsNeeded.filter((m) => m.trim()),
      step_by_step: steps.filter((s) => s.title.trim() || s.description.trim()),
      facilitator_tips: facilitatorTips.trim() || null, success_criteria: successCriteria.trim() || null,
      common_pitfalls: commonPitfalls.trim() || null, variations: variations.trim() || null,
      status: exerciseStatus,
    };
    try {
      if (exercise) {
        await updateMutation.mutateAsync({ id: exercise.id, ...data });
        toast.success(t('consultor.exerciseUpdated'));
      } else {
        await createMutation.mutateAsync(data);
        toast.success(t('consultor.exerciseCreated'));
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(t('consultor.failedToSaveExercise'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] !flex !flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{exercise ? t('exercises.editExercise', 'Editar Exercício') : t('exercises.createNew', 'Criar Novo Exercício')}</DialogTitle>
          <DialogDescription>{t('exercises.formDesc', 'Defina os detalhes do exercício, passos e orientações de facilitação.')}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-4">
          <div className="space-y-6 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="title">{t('exercises.title', 'Título *')}</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Customer Discovery Interview Roleplay" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="purpose">{t('exercises.purpose', 'Objetivo')}</Label>
                <Textarea id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t('exercises.purposePlaceholder', 'Quando e porquê usar este exercício')} rows={2} />
              </div>
              <div>
                <Label>{t('exercises.duration', 'Duração (minutos)')}</Label>
                <Input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 30)} min={5} max={180} />
              </div>
              <div>
                <Label>{t('exercises.groupSize', 'Tamanho do Grupo')}</Label>
                <Select value={groupSize} onValueChange={(v) => setGroupSize(v as typeof groupSize)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1:1">1:1</SelectItem>
                    <SelectItem value="small_group">{t('exercises.smallGroup', 'Grupo Pequeno (2-5)')}</SelectItem>
                    <SelectItem value="cohort">{t('exercises.cohort', 'Coorte (6+)')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{t('exercises.tags', 'Tags de Contexto')}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {CONTEXT_TAGS.map((tag) => (
                  <Badge key={tag} variant={selectedTags.includes(tag) ? 'default' : 'outline'} className={cn('cursor-pointer transition-colors', selectedTags.includes(tag) && 'bg-primary')} onClick={() => toggleTag(tag)}>
                    {tag.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label>{t('exercises.materials', 'Materiais Necessários')}</Label>
              <div className="space-y-2 mt-2">
                {materialsNeeded.map((material, index) => (
                  <div key={index} className="flex gap-2">
                    <Input value={material} onChange={(e) => updateMaterial(index, e.target.value)} placeholder={t('exercises.materialPlaceholder', 'ex: Quadro branco, post-its')} />
                    {materialsNeeded.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeMaterial(index)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addMaterial}>
                  <Plus className="h-4 w-4 mr-1" />{t('exercises.addMaterial', 'Adicionar material')}
                </Button>
              </div>
            </div>

            <div>
              <Label>{t('exercises.stepByStep', 'Instruções Passo a Passo')}</Label>
              <div className="space-y-3 mt-2">
                {steps.map((step, index) => (
                  <div key={index} className="p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{t('exercises.step', 'Passo')} {step.step}</span>
                      {steps.length > 1 && (<Button variant="ghost" size="sm" onClick={() => removeStep(index)}><Trash2 className="h-3 w-3" /></Button>)}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_80px]">
                      <Input value={step.title} onChange={(e) => updateStep(index, 'title', e.target.value)} placeholder={t('exercises.stepTitlePlaceholder', 'Título do passo')} />
                      <Input type="number" value={step.duration || ''} onChange={(e) => updateStep(index, 'duration', parseInt(e.target.value) || 0)} placeholder="min" min={0} />
                    </div>
                    <Textarea value={step.description} onChange={(e) => updateStep(index, 'description', e.target.value)} placeholder={t('exercises.stepDescPlaceholder', 'O que acontece neste passo')} rows={2} className="mt-2" />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addStep}>
                  <Plus className="h-4 w-4 mr-1" />{t('exercises.addStep', 'Adicionar passo')}
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              <div>
                <Label>{t('exercises.facilitatorTips', 'Dicas de Facilitador')}</Label>
                <Textarea value={facilitatorTips} onChange={(e) => setFacilitatorTips(e.target.value)} placeholder={t('exercises.facilitatorTipsPlaceholder', 'O que observar, como redirecionar, observações-chave')} rows={3} />
              </div>
              <div>
                <Label>{t('exercises.successCriteria', 'Critérios de Sucesso')}</Label>
                <Textarea value={successCriteria} onChange={(e) => setSuccessCriteria(e.target.value)} placeholder={t('exercises.successCriteriaPlaceholder', 'Como saber se o exercício correu bem?')} rows={2} />
              </div>
              <div>
                <Label>{t('exercises.commonPitfalls', 'Erros Comuns')}</Label>
                <Textarea value={commonPitfalls} onChange={(e) => setCommonPitfalls(e.target.value)} placeholder={t('exercises.commonPitfallsPlaceholder', 'Erros a evitar, coisas que costumam correr mal')} rows={2} />
              </div>
              <div>
                <Label>{t('exercises.variations', 'Variações (opcional)')}</Label>
                <Textarea value={variations} onChange={(e) => setVariations(e.target.value)} placeholder={t('exercises.variationsPlaceholder', 'Formas alternativas de realizar este exercício')} rows={2} />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="font-medium text-sm">{t('exercises.approved', 'Aprovado')}</p>
                <p className="text-xs text-muted-foreground">{t('exercises.approvedDesc', 'Exercícios aprovados ficam visíveis para todos os consultores')}</p>
              </div>
              <Switch checked={isApproved} onCheckedChange={setIsApproved} />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancelar')}</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
            {exercise ? t('exercises.saveChanges', 'Guardar Alterações') : t('exercises.createExercise', 'Criar Exercício')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
