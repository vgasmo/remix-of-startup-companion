import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Target, Settings2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  useKpiDefinitions, 
  useCreateKpiDefinition, 
  useUpdateKpiDefinition, 
  useDeleteKpiDefinition,
  useWorkspaceKpis,
  useUpsertWorkspaceKpi,
  useAllWorkspaces,
} from '@/hooks/useAdminData';

interface KpiDefinition {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  category: string | null;
  direction: string | null;
  is_global: boolean;
  program_id: string | null;
}

const CATEGORY_KEYS = ['Growth', 'Revenue', 'Product', 'Team', 'Fundraising', 'Other'] as const;
const DIRECTION_VALUES = ['up', 'down', 'target'] as const;

export function AdminKpisManager() {
  const { t } = useTranslation();
  const { data: kpis, isLoading } = useKpiDefinitions();
  const { data: workspaceKpis } = useWorkspaceKpis();
  const { data: workspaces } = useAllWorkspaces();

  const createKpi = useCreateKpiDefinition();
  const updateKpi = useUpdateKpiDefinition();
  const deleteKpi = useDeleteKpiDefinition();
  const upsertWorkspaceKpi = useUpsertWorkspaceKpi();

  const [editingKpi, setEditingKpi] = useState<KpiDefinition | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KpiDefinition | null>(null);
  const [configWsKpi, setConfigWsKpi] = useState<KpiDefinition | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    unit: '',
    category: '',
    direction: 'up',
    is_global: true,
  });

  const directionLabel = (value: string) => {
    const map: Record<string, string> = {
      up: t('adminKpis.directionUp'),
      down: t('adminKpis.directionDown'),
      target: t('adminKpis.directionTarget'),
    };
    return map[value] || value;
  };

  const categoryLabel = (value: string) => {
    const map: Record<string, string> = {
      Growth: t('adminKpis.categoryGrowth'),
      Revenue: t('adminKpis.categoryRevenue'),
      Product: t('adminKpis.categoryProduct'),
      Team: t('adminKpis.categoryTeam'),
      Fundraising: t('adminKpis.categoryFundraising'),
      Other: t('adminKpis.categoryOther'),
    };
    return map[value] || value;
  };

  const handleCreate = () => {
    setFormData({ name: '', description: '', unit: '', category: '', direction: 'up', is_global: true });
    setIsCreating(true);
  };

  const handleEdit = (kpi: KpiDefinition) => {
    setFormData({
      name: kpi.name,
      description: kpi.description || '',
      unit: kpi.unit || '',
      category: kpi.category || '',
      direction: kpi.direction || 'up',
      is_global: kpi.is_global,
    });
    setEditingKpi(kpi);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    if (editingKpi) {
      await updateKpi.mutateAsync({ id: editingKpi.id, ...formData });
    } else {
      await createKpi.mutateAsync(formData);
    }
    setEditingKpi(null);
    setIsCreating(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteKpi.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  const getWorkspaceKpiConfig = (wsId: string, kpiId: string) => {
    return workspaceKpis?.find(wk => wk.workspace_id === wsId && wk.kpi_definition_id === kpiId);
  };

  const handleToggleRequired = async (wsId: string, kpiId: string, currentRequired: boolean) => {
    await upsertWorkspaceKpi.mutateAsync({ 
      workspace_id: wsId, 
      kpi_definition_id: kpiId, 
      required: !currentRequired,
      active: true,
    });
  };

  const handleSetTarget = async (wsId: string, kpiId: string, target: number | undefined) => {
    await upsertWorkspaceKpi.mutateAsync({ 
      workspace_id: wsId, 
      kpi_definition_id: kpiId, 
      target_value: target,
      active: true,
    });
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

  const groupedKpis = kpis?.reduce((acc, kpi) => {
    const cat = kpi.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(kpi);
    return acc;
  }, {} as Record<string, KpiDefinition[]>) || {};

  return (
    <div className="space-y-6">
      <Tabs defaultValue="definitions">
        <TabsList>
          <TabsTrigger value="definitions">{t('adminKpis.definitions')}</TabsTrigger>
          <TabsTrigger value="workspace-config">{t('adminKpis.workspaceConfig')}</TabsTrigger>
        </TabsList>

        <TabsContent value="definitions" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t('adminKpis.definitionsTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('adminKpis.definitionsSubtitle')}</p>
            </div>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1" />
              {t('adminKpis.newKpi')}
            </Button>
          </div>

          {Object.keys(groupedKpis).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t('adminKpis.emptyState')}
              </CardContent>
            </Card>
          ) : (
            Object.entries(groupedKpis).map(([category, catKpis]) => (
              <div key={category}>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">{categoryLabel(category)}</h3>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {catKpis.map(kpi => (
                    <Card key={kpi.id} className="group">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-sm">{kpi.name}</h4>
                              {kpi.unit && <span className="text-xs text-muted-foreground">({kpi.unit})</span>}
                            </div>
                            {kpi.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{kpi.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {directionLabel(kpi.direction || 'up')}
                              </Badge>
                              {kpi.is_global && <Badge variant="secondary" className="text-xs">{t('adminKpis.global')}</Badge>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() = aria-label={t('common.edit')}> handleEdit(kpi)} aria-label={t('common.edit', { defaultValue: 'Editar' })}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() = aria-label={t('common.delete')}> setDeleteTarget(kpi)} aria-label={t('common.delete', { defaultValue: 'Eliminar' })}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="workspace-config" className="space-y-6 mt-6">
          <div>
            <h2 className="text-lg font-semibold">{t('adminKpis.workspaceKpiTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('adminKpis.workspaceKpiSubtitle')}</p>
          </div>

          {workspaces?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t('adminKpis.noWorkspaces')}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {workspaces?.map(ws => (
                <Card key={ws.id}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium">
                      {ws.startup?.name || t('adminKpis.unknown')} 
                      <span className="text-muted-foreground font-normal ml-2">({ws.program?.name})</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {kpis?.map(kpi => {
                        const config = getWorkspaceKpiConfig(ws.id, kpi.id);
                        return (
                          <div key={kpi.id} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                            <Checkbox 
                              checked={config?.required || false}
                              onCheckedChange={() => handleToggleRequired(ws.id, kpi.id, config?.required || false)}
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm">{kpi.name}</span>
                              {config?.required && (
                                <span className="text-xs text-muted-foreground ml-1">({t('adminKpis.required')})</span>
                              )}
                            </div>
                            {config?.target_value !== undefined && config?.target_value !== null && (
                              <Badge variant="outline" className="text-xs">
                                {t('adminKpis.target')}: {config.target_value}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreating || !!editingKpi} onOpenChange={(open) => { if (!open) { setIsCreating(false); setEditingKpi(null); }}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingKpi ? t('adminKpis.editKpi') : t('adminKpis.newKpiDefinition')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('adminKpis.name')} *</Label>
              <Input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder={t('adminKpis.namePlaceholder')} />
            </div>
            <div>
              <Label>{t('adminKpis.description')}</Label>
              <Textarea value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminKpis.unit')}</Label>
                <Input value={formData.unit} onChange={e => setFormData(f => ({ ...f, unit: e.target.value }))} placeholder={t('adminKpis.unitPlaceholder')} />
              </div>
              <div>
                <Label>{t('adminKpis.category')}</Label>
                <Select value={formData.category} onValueChange={v => setFormData(f => ({ ...f, category: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('adminKpis.selectCategory')} />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_KEYS.map(cat => (
                      <SelectItem key={cat} value={cat}>{categoryLabel(cat)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t('adminKpis.direction')}</Label>
              <Select value={formData.direction} onValueChange={v => setFormData(f => ({ ...f, direction: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTION_VALUES.map(d => (
                    <SelectItem key={d} value={d}>{directionLabel(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formData.is_global} onCheckedChange={v => setFormData(f => ({ ...f, is_global: v }))} />
              <Label>{t('adminKpis.globalLabel')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreating(false); setEditingKpi(null); }}>{t('adminKpis.cancel')}</Button>
            <Button onClick={handleSave}>{editingKpi ? t('adminKpis.update') : t('adminKpis.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('adminKpis.deleteKpi')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('adminKpis.deleteKpiDescription', { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('adminKpis.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">{t('adminKpis.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}