import { useState, useCallback, useEffect } from 'react';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { Plus, Trash2, Calendar, Target, Clock, CheckCircle2, Circle, AlertTriangle, GripVertical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SortableList } from '@/components/ui/SortableList';
import { EmptyState } from '@/components/ui/EmptyState';
import { BrandChevron } from '@/components/ui/BrandChevron';
import { useMilestones, useCreateMilestone, useUpdateMilestone, useDeleteMilestone, useReorderMilestones, type Milestone } from '@/hooks/useMilestones';
import { notify } from "@/lib/notify";
import { useTranslation } from 'react-i18next';
import { useQuickWinToast } from '@/hooks/useQuickWinToast';
import { triggerMilestoneCelebration } from '@/lib/confetti';
import { toTitleCase } from '@/lib/textUtils';
import type { Database } from '@/integrations/supabase/types';


type MilestoneStatus = Database['public']['Enums']['milestone_status'];

interface MilestonesTabProps {
  workspaceId: string;
  canWrite: boolean;
}

function useStatusConfig() {
  const { t } = useTranslation();
  return {
    not_started: { label: t('milestones.planned'), color: 'bg-muted text-muted-foreground', icon: Circle },
    in_progress: { label: t('milestones.inProgress'), color: 'bg-primary/20 text-primary', icon: Clock },
    completed: { label: t('milestones.done'), color: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ', icon: CheckCircle2 },
    delayed: { label: t('milestones.delayed'), color: 'bg-destructive/20 text-destructive', icon: AlertTriangle },
  } as Record<MilestoneStatus, { label: string; color: string; icon: typeof Circle }>;
}

export function MilestonesTab({ workspaceId, canWrite }: MilestonesTabProps) {
  const { t } = useTranslation();
  const { data: milestones, isLoading, error } = useMilestones(workspaceId);
  const createMilestone = useCreateMilestone(workspaceId);
  const updateMilestone = useUpdateMilestone(workspaceId);
  const deleteMilestone = useDeleteMilestone(workspaceId);
  const reorderMilestones = useReorderMilestones(workspaceId);
  const { showQuickWin } = useQuickWinToast();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Milestone | null>(null);
  const [celebrating, setCelebrating] = useState<{ id: string; title: string } | null>(null);
  const [newMilestone, setNewMilestone] = useState({
    title: '',
    description: '',
    target_date: '',
  });

  useEffect(() => {
    if (!celebrating) return;
    const tid = window.setTimeout(() => setCelebrating(null), 2000);
    return () => window.clearTimeout(tid);
  }, [celebrating]);


  const handleCreate = async () => {
    if (!newMilestone.title.trim()) {
      notify.error(t('milestones.titleRequired'));
      return;
    }
    try {
      await createMilestone.mutateAsync({
        title: newMilestone.title,
        description: newMilestone.description || undefined,
        target_date: newMilestone.target_date || null,
      });
      notify.success(t('milestones.milestoneCreated'));
      setCreateDialogOpen(false);
      setNewMilestone({ title: '', description: '', target_date: '' });
    } catch {
      notify.error(t('milestones.failedToCreate'));
    }
  };

  const handleStatusChange = async (milestone: Milestone, status: MilestoneStatus) => {
    if (!canWrite) return;
    try {
      await updateMilestone.mutateAsync({ id: milestone.id, status });
      if (status === 'completed') {
        showQuickWin('milestone_completed');
        const gateKey = `celebrated_milestone_${milestone.id}`;
        if (typeof window !== 'undefined' && !window.localStorage.getItem(gateKey)) {
          window.localStorage.setItem(gateKey, '1');
          triggerMilestoneCelebration();
          setCelebrating({ id: milestone.id, title: milestone.title });
        }
      }
    } catch {
      notify.error(t('milestones.failedToUpdate'));
    }
  };


  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !canWrite) return;
    try {
      await deleteMilestone.mutateAsync(deleteTarget.id);
      notify.success(t('milestones.milestoneDeleted'));
      setDeleteTarget(null);
    } catch {
      notify.error(t('milestones.failedToDelete'));
    }
  };

  if (isLoading) {
    return (
    <div className="space-y-4 relative">
      {celebrating && (
        <div
          className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-center motion-reduce:hidden"
          aria-hidden="true"
        >
          <div className="animate-scale-in flex flex-col items-center gap-3">
            <div className="rounded-full bg-primary/10 p-6 ring-4 ring-primary/20 shadow-[0_0_60px_-10px_hsl(var(--primary)/0.55)]">
              <BrandChevron size={56} color="lime" strokeWidth={3} />
            </div>
            <div className="rounded-full bg-card/95 backdrop-blur px-4 py-1.5 border border-primary/30 shadow-lg">
              <span className="label-eyebrow text-primary-strong text-[11px]">
                {t('milestones.levelUp', { defaultValue: 'Level up' })}
              </span>
              <span className="ml-2 text-sm font-semibold text-foreground">
                {toTitleCase(celebrating.title)}
              </span>
            </div>
          </div>
        </div>
      )}

        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="py-8 text-center text-destructive">
          {t('milestones.failedToLoad')}
        </CardContent>
      </Card>
    );
  }

  const sortedMilestones = milestones || [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        {canWrite && (
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t('milestones.addMilestone')}
          </Button>
        )}
        <div className="text-sm text-muted-foreground">
          {t('milestones.completedCount', { 
            completed: sortedMilestones.filter(m => m.status === 'completed').length,
            total: sortedMilestones.length 
          })}
        </div>
      </div>

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">{t('milestones.list')}</TabsTrigger>
          <TabsTrigger value="timeline">{t('milestones.timeline')}</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-2 animate-fade-in">
          {sortedMilestones.length === 0 ? (
            <EmptyState
              icon={Target}
              title={t('emptyStates.milestones.title')}
              description={t('emptyStates.milestones.description')}
              action={canWrite ? {
                label: t('milestones.addMilestone'),
                onClick: () => setCreateDialogOpen(true),
                icon: Plus,
              } : undefined}
            />
          ) : (
            <SortableList
              items={sortedMilestones}
              disabled={!canWrite}
              onReorder={(reordered) => {
                const updates = reordered.map((m, i) => ({ id: m.id, position: i }));
                reorderMilestones.mutateAsync(updates).catch(() => {
                  notify.error(t('milestones.failedToReorder'));
                });
              }}
              renderItem={(milestone, index, dragHandle) => (
                <MilestoneListItem
                  key={milestone.id}
                  milestone={milestone}
                  canWrite={canWrite}
                  onStatusChange={handleStatusChange}
                  onDelete={(m) => setDeleteTarget(m)}
                  dragHandle={dragHandle}
                />
              )}
            />
          )}
        </TabsContent>

        <TabsContent value="timeline">
          <TimelineView milestones={sortedMilestones} />
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('milestones.newMilestone')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('milestones.titleLabel')} *</Label>
              <Input
                id="title"
                value={newMilestone.title}
                onChange={e => setNewMilestone(m => ({ ...m, title: e.target.value }))}
                placeholder={t('milestones.titlePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('milestones.descriptionLabel')}</Label>
              <Textarea
                id="description"
                value={newMilestone.description}
                onChange={e => setNewMilestone(m => ({ ...m, description: e.target.value }))}
                placeholder={t('milestones.descriptionPlaceholder')}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target_date">{t('milestones.targetDate')}</Label>
              <Input
                id="target_date"
                type="date"
                value={newMilestone.target_date}
                onChange={e => setNewMilestone(m => ({ ...m, target_date: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={createMilestone.isPending}>
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('milestones.deleteMilestone')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('milestones.deleteConfirm', { title: deleteTarget?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface MilestoneListItemProps {
  milestone: Milestone;
  canWrite: boolean;
  onStatusChange: (milestone: Milestone, status: MilestoneStatus) => void;
  onDelete: (milestone: Milestone) => void;
  dragHandle?: React.ReactNode;
}

function MilestoneListItem({
  milestone,
  canWrite,
  onStatusChange,
  onDelete,
  dragHandle,
}: MilestoneListItemProps) {
  const { t } = useTranslation();
  const STATUS_CONFIG = useStatusConfig();
  const config = STATUS_CONFIG[milestone.status];
  const StatusIcon = config.icon;
  
  const isOverdue = milestone.target_date && 
    isPast(parseISO(milestone.target_date)) && 
    !isToday(parseISO(milestone.target_date)) &&
    milestone.status !== 'completed';

  return (
    <Card className={`transition-all ${isOverdue ? 'border-destructive/50' : ''}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          {/* Drag handle */}
          {canWrite && dragHandle && (
            <div className="pt-1">
              {dragHandle}
            </div>
          )}

          {/* Status icon */}
          <StatusIcon className={`h-5 w-5 mt-0.5 shrink-0 ${
            milestone.status === 'completed' ? 'text-[hsl(var(--success))]' :
            milestone.status === 'in_progress' ? 'text-primary' :
            milestone.status === 'delayed' ? 'text-destructive' :
            'text-muted-foreground'
          }`} />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className={`font-medium ${milestone.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                  {toTitleCase(milestone.title)}
                </h4>
                {milestone.description && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {milestone.description}
                  </p>
                )}
              </div>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={()= aria-label="Delete"> onDelete(milestone)}
                 aria-label={t('common.delete')}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              )}
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {canWrite ? (
                <Select 
                  value={milestone.status} 
                  onValueChange={(v) => onStatusChange(milestone, v as MilestoneStatus)}
                >
                  <SelectTrigger className="h-7 w-auto px-2 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">{t('milestones.planned')}</SelectItem>
                    <SelectItem value="in_progress">{t('milestones.inProgress')}</SelectItem>
                    <SelectItem value="completed">{t('milestones.done')}</SelectItem>
                    <SelectItem value="delayed">{t('milestones.delayed')}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline" className={`text-xs ${config.color}`}>
                  {config.label}
                </Badge>
              )}

              {milestone.target_date && (
                <Badge 
                  variant="outline" 
                  className={`text-xs ${isOverdue ? 'text-destructive border-destructive' : ''}`}
                >
                  <Calendar className="h-3 w-3 mr-1" />
                  {format(parseISO(milestone.target_date), 'MMM d, yyyy')}
                  {isOverdue && ` (${t('common.overdue')})`}
                </Badge>
              )}

              {milestone.completed_at && (
                <span className="text-xs text-muted-foreground">
                  {t('milestones.completedOn', { date: format(parseISO(milestone.completed_at), 'MMM d') })}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface TimelineViewProps {
  milestones: Milestone[];
}

function TimelineView({ milestones }: TimelineViewProps) {
  const { t } = useTranslation();
  const STATUS_CONFIG = useStatusConfig();
  
  if (milestones.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title={t('emptyStates.milestones.title')}
        description={t('emptyStates.milestones.description')}
        variant="inline"
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{t('milestones.milestoneTimeline')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-border" />
          
          <div className="space-y-4">
            {milestones.map((milestone, index) => {
              const config = STATUS_CONFIG[milestone.status];
              const StatusIcon = config.icon;
              const isLast = index === milestones.length - 1;
              
              return (
                <div key={milestone.id} className="relative flex items-start gap-4 pl-8">
                  {/* Timeline dot */}
                  <div className={`absolute left-0 w-6 h-6 rounded-full flex items-center justify-center ${
                    milestone.status === 'completed' ? 'bg-[hsl(var(--success))]/10' :
                    milestone.status === 'in_progress' ? 'bg-primary/20' :
                    milestone.status === 'delayed' ? 'bg-destructive/20' :
                    'bg-muted'
                  }`}>
                    <StatusIcon className={`h-3.5 w-3.5 ${
                      milestone.status === 'completed' ? 'text-[hsl(var(--success))]' :
                      milestone.status === 'in_progress' ? 'text-primary' :
                      milestone.status === 'delayed' ? 'text-destructive' :
                      'text-muted-foreground'
                    }`} />
                  </div>
                  
                  {/* Content */}
                  <div className={`flex-1 pb-4 ${isLast ? '' : 'border-b border-dashed'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className={`text-sm font-medium ${
                          milestone.status === 'completed' ? 'line-through text-muted-foreground' : ''
                        }`}>
                          {toTitleCase(milestone.title)}
                        </h4>
                        {milestone.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {milestone.description}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className={`text-xs shrink-0 ${config.color}`}>
                        {config.label}
                      </Badge>
                    </div>
                    {milestone.target_date && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(milestone.target_date), 'MMM d, yyyy')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
