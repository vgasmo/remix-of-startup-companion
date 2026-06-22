import { useState } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import {
  Lightbulb,
  Plus,
  X,
  Clock,
  Users,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useSessionExercises,
  useAddSessionExercise,
  useRemoveSessionExercise,
  useExerciseLibrary,
  Exercise,
} from '@/hooks/useExerciseLibrary';
import { notify } from "@/lib/notify";
import { cn } from '@/lib/utils';

const t = i18n.t.bind(i18n);
interface SessionExercisesPickerProps {
  sessionId: string;
  canEdit: boolean;
}

const GROUP_SIZE_LABELS: Record<string, string> = {
  '1:1': '1:1',
  small_group: 'Small Group',
  cohort: 'Cohort',
};

export function SessionExercisesPicker({ sessionId, canEdit }: SessionExercisesPickerProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: sessionExercises, isLoading } = useSessionExercises(sessionId);
  const removeMutation = useRemoveSessionExercise(sessionId);

  const handleRemove = async (id: string) => {
    try {
      await removeMutation.mutateAsync(id);
      notify.success(t('sessions.exerciseRemoved'));
    } catch (error) {
      notify.error(t('sessions.failedToRemoveExercise'));
    }
  };

  const totalDuration = sessionExercises?.reduce(
    (sum, se) => sum + (se.exercise?.duration_minutes || 0),
    0
  ) || 0;

  if (isLoading) {
    return <Skeleton className="h-24" />;
  }

  return (
    <>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-[hsl(var(--warning))]" />
                  <CardTitle className="text-sm font-medium">
                    Exercises
                  </CardTitle>
                  {sessionExercises && sessionExercises.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {sessionExercises.length}
                    </Badge>
                  )}
                  {totalDuration > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {totalDuration} min
                    </span>
                  )}
                </div>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              {sessionExercises && sessionExercises.length > 0 ? (
                <div className="space-y-2">
                  {sessionExercises.map((se, index) => (
                    <div
                      key={se.id}
                      className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <GripVertical className="h-4 w-4" />
                        <span className="text-xs font-medium">{index + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {se.exercise?.title}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {se.exercise?.duration_minutes} min
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {GROUP_SIZE_LABELS[se.exercise?.group_size || '1:1']}
                          </span>
                        </div>
                        {se.notes && (
                          <p className="text-xs text-muted-foreground mt-1 italic">
                            {se.notes}
                          </p>
                        )}
                      </div>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={()=> handleRemove(se.id)}
                         aria-label={t('common.close')}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-3">
                  No exercises added yet
                </p>
              )}

              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowAddDialog(true)}
                  disabled={sessionExercises && sessionExercises.length >= 3}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Exercise
                  {sessionExercises && sessionExercises.length >= 3 && (
                    <span className="text-xs ml-1">(max 3)</span>
                  )}
                </Button>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <AddExerciseDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        sessionId={sessionId}
        excludeIds={sessionExercises?.map((se) => se.exercise_id) || []}
      />
    </>
  );
}

function AddExerciseDialog({
  open,
  onOpenChange,
  sessionId,
  excludeIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  excludeIds: string[];
}) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const { data: exercises, isLoading } = useExerciseLibrary({ status: 'approved' });
  const addMutation = useAddSessionExercise(sessionId);

  const availableExercises = exercises?.filter(
    (ex) => !excludeIds.includes(ex.id) &&
      (ex.title.toLowerCase().includes(search.toLowerCase()) ||
        ex.purpose?.toLowerCase().includes(search.toLowerCase()))
  );

  const handleAdd = async () => {
    if (!selectedId) return;
    try {
      await addMutation.mutateAsync({ exerciseId: selectedId, notes: notes.trim() || undefined });
      notify.success(t('sessions.exerciseAdded'));
      onOpenChange(false);
      setSelectedId(null);
      setNotes('');
      setSearch('');
    } catch (error) {
      notify.error(t('sessions.failedToAddExercise'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('sessions.addExercise', 'Adicionar Exercício')}</DialogTitle>
          <DialogDescription>
            Select an exercise to add to this session (max 3)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("common.placeholders.searchExercises")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <ScrollArea className="h-[250px] border rounded-lg">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : availableExercises?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No exercises found
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {availableExercises?.map((exercise) => (
                  <div
                    key={exercise.id}
                    className={cn(
                      'p-3 rounded-lg cursor-pointer transition-colors',
                      selectedId === exercise.id
                        ? 'bg-primary/10 border-2 border-primary'
                        : 'hover:bg-muted border-2 border-transparent'
                    )}
                    {...clickableProps(() => setSelectedId(exercise.id))}
                  >
                    <p className="font-medium text-sm">{exercise.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {exercise.duration_minutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {GROUP_SIZE_LABELS[exercise.group_size]}
                      </span>
                    </div>
                    {exercise.purpose && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {exercise.purpose}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {selectedId && (
            <div>
              <label className="text-sm font-medium">{t('sessions.notesOptional', 'Notas (opcional)')}</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("common.placeholders.exerciseNotes")}
                rows={2}
                className="mt-1"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!selectedId || addMutation.isPending}>
            Add Exercise
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
