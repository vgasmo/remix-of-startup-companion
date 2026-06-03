import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceTimeEntries, useCreateTimeEntry, useDeleteTimeEntry, useTimeEntrySummary } from '@/hooks/useTimeTracking';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { notify } from "@/lib/notify";
import { Clock, Plus, Trash2, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface TimeTrackingTabProps {
  workspaceId: string;
}

const CATEGORIES = ['mentoring', 'review', 'planning', 'admin', 'other'] as const;

export function TimeTrackingTab({ workspaceId }: TimeTrackingTabProps) {
  const { t } = useTranslation();
  const { data: entries, isLoading } = useWorkspaceTimeEntries(workspaceId);
  const { data: summary } = useTimeEntrySummary();
  const createEntry = useCreateTimeEntry();
  const deleteEntry = useDeleteTimeEntry();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    hours: '',
    description: '',
    category: 'mentoring',
  });

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      mentoring: t('time.mentoring'),
      review: t('time.review'),
      planning: t('time.planning'),
      admin: t('time.admin'),
      other: t('time.other'),
    };
    return labels[category] || category;
  };

  const handleSubmit = async () => {
    if (!formData.hours || parseFloat(formData.hours) <= 0) {
      notify.error(t('time.validHoursRequired'));
      return;
    }
    try {
      await createEntry.mutateAsync({
        workspace_id: workspaceId,
        date: formData.date,
        hours: parseFloat(formData.hours),
        description: formData.description || undefined,
        category: formData.category,
      });
      notify.success(t('time.timeLogged'));
      setDialogOpen(false);
      setFormData({ date: new Date().toISOString().split('T')[0], hours: '', description: '', category: 'mentoring' });
    } catch (error: any) {
      notify.error(error.message || t('time.failedToLog'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('time.deleteConfirm'))) return;
    try {
      await deleteEntry.mutateAsync(id);
      notify.success(t('time.timeDeleted'));
    } catch (error: any) {
      notify.error(error.message || t('time.failedToDelete'));
    }
  };

  const totalForWorkspace = entries?.reduce((sum, e) => sum + Number(e.hours), 0) || 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
        <CardContent><div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div></CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalForWorkspace.toFixed(1)}h</div>
            <p className="text-sm text-muted-foreground">{t('time.thisWorkspace')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{summary?.thisMonth.toFixed(1) || 0}h</div>
            <p className="text-sm text-muted-foreground">{t('time.thisMonthAll')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{summary?.totalHours.toFixed(1) || 0}h</div>
            <p className="text-sm text-muted-foreground">{t('time.allTimeAll')}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t('time.timeEntries')}
            </CardTitle>
            <CardDescription>{t('time.trackTimeSpent')}</CardDescription>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('time.logTime')}
          </Button>
        </CardHeader>
        <CardContent>
          {!entries?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('time.noTimeEntries')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map(entry => (
                <div key={entry.id} className="flex items-center gap-4 p-3 rounded-lg border bg-card">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{format(new Date(entry.date), 'MMM d, yyyy')}</span>
                      <span className="text-primary font-semibold">{Number(entry.hours).toFixed(1)}h</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted capitalize">{getCategoryLabel(entry.category || 'other')}</span>
                    </div>
                    {entry.description && <p className="text-sm text-muted-foreground">{entry.description}</p>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(entry.id)} className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('time.logTime')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('time.date')}</Label>
                <Input type="date" value={formData.date} onChange={e => setFormData(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t('time.hours')} *</Label>
                <Input type="number" step="0.5" min="0.5" value={formData.hours} onChange={e => setFormData(f => ({ ...f, hours: e.target.value }))} placeholder="1.5" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('time.category')}</Label>
              <Select value={formData.category} onValueChange={v => setFormData(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{getCategoryLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('notes.description')}</Label>
              <Textarea value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} placeholder={t('time.whatDidYouWorkOn')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSubmit} disabled={createEntry.isPending}>{t('time.logTime')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
