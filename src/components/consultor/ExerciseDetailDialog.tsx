import { useTranslation } from 'react-i18next';
import { Clock, Users, Tag, CheckCircle2, AlertTriangle, Lightbulb, Target, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Exercise } from '@/hooks/useExerciseLibrary';
import { GROUP_SIZE_LABELS } from './ExerciseLibraryTab';

interface ExerciseDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: Exercise;
}

export function ExerciseDetailDialog({ open, onOpenChange, exercise }: ExerciseDetailDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] !flex !flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-xl">{exercise.title}</DialogTitle>
            {exercise.status === 'approved' && (
              <Badge variant="secondary" className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Approved
              </Badge>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-4">
          <div className="space-y-6 py-2">
            {/* Meta */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {exercise.duration_minutes} minutes
              </span>
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted">
                <Users className="h-4 w-4 text-muted-foreground" />
                {GROUP_SIZE_LABELS[exercise.group_size] || exercise.group_size}
              </span>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {exercise.startup_context_tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  <Tag className="h-2.5 w-2.5 mr-1" />
                  {tag.replace('_', ' ')}
                </Badge>
              ))}
            </div>

            {/* Purpose */}
            {exercise.purpose && (
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-[hsl(var(--warning))]" />
                  Purpose
                </h3>
                <p className="text-sm text-muted-foreground">{exercise.purpose}</p>
              </div>
            )}

            <Separator />

            {/* Materials */}
            {exercise.materials_needed.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">{t('exercises.materials', 'Materials Needed')}</h3>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {exercise.materials_needed.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Steps */}
            {exercise.step_by_step.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3">{t('exercises.stepByStep', 'Step-by-Step')}</h3>
                <div className="space-y-3">
                  {exercise.step_by_step.map((step, index) => (
                    <div key={index} className="flex gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
                        {step.step}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{step.title}</p>
                          {step.duration && (
                            <span className="text-xs text-muted-foreground">
                              {step.duration} min
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Facilitator Tips */}
            {exercise.facilitator_tips && (
              <div className="p-3 rounded-lg bg-[hsl(var(--info))]/10 border border-[hsl(var(--info))]/30">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-[hsl(var(--info))]">
                  <Lightbulb className="h-4 w-4" />
                  Facilitator Tips
                </h3>
                <p className="text-sm text-[hsl(var(--info))]">
                  {exercise.facilitator_tips}
                </p>
              </div>
            )}

            {/* Success Criteria */}
            {exercise.success_criteria && (
              <div className="p-3 rounded-lg bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/30">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-[hsl(var(--success))]">
                  <Target className="h-4 w-4" />
                  Success Criteria
                </h3>
                <p className="text-sm text-[hsl(var(--success))]">
                  {exercise.success_criteria}
                </p>
              </div>
            )}

            {/* Common Pitfalls */}
            {exercise.common_pitfalls && (
              <div className="p-3 rounded-lg bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-[hsl(var(--warning))]">
                  <AlertTriangle className="h-4 w-4" />
                  Common Pitfalls
                </h3>
                <p className="text-sm text-[hsl(var(--warning))]">
                  {exercise.common_pitfalls}
                </p>
              </div>
            )}

            {/* Variations */}
            {exercise.variations && (
              <div>
                <h3 className="text-sm font-semibold mb-2">{t('exercises.variations', 'Variations')}</h3>
                <p className="text-sm text-muted-foreground">{exercise.variations}</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
