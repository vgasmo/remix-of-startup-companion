import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Activity,
  Calendar,
  BarChart3,
  ClipboardCheck,
  Edit2,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  Info,
} from 'lucide-react';
import { notify } from "@/lib/notify";
import { useAuth } from '@/contexts/AuthContext';

interface HealthModel {
  id: string;
  program_id: string;
  weights_json: {
    actions: number;
    sessions: number;
    kpis: number;
    checkins: number;
  };
  thresholds_json: {
    thriving: number;
    healthy: number;
    stable: number;
    at_risk: number;
  };
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface Program {
  id: string;
  name: string;
  status: string | null;
  health_model?: HealthModel | null;
}

const DEFAULT_WEIGHTS = { actions: 30, sessions: 20, kpis: 30, checkins: 20 };
const DEFAULT_THRESHOLDS = { thriving: 85, healthy: 70, stable: 50, at_risk: 30 };

export function HealthModelViewer() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [editingModel, setEditingModel] = useState<Program | null>(null);
  const [editWeights, setEditWeights] = useState(DEFAULT_WEIGHTS);
  const [editThresholds, setEditThresholds] = useState(DEFAULT_THRESHOLDS);
  const [editEnabled, setEditEnabled] = useState(true);

  // Fetch programs with their health models
  const { data: programs, isLoading } = useQuery({
    queryKey: ['programs-with-health-models'],
    queryFn: async () => {
      const { data: progs, error: progError } = await supabase
        .from('programs')
        .select('id, name, status')
        .order('name');

      if (progError) throw progError;

      const { data: models } = await supabase
        .from('program_health_model')
        .select('*');

      const modelMap = new Map<string, HealthModel>();
      for (const m of models || []) {
        modelMap.set(m.program_id, m as unknown as HealthModel);
      }

      return (progs || []).map((p) => ({
        ...p,
        health_model: modelMap.get(p.id) || null,
      })) as Program[];
    },
  });

  // Upsert health model
  const upsertModel = useMutation({
    mutationFn: async ({
      programId,
      weights,
      thresholds,
      enabled,
    }: {
      programId: string;
      weights: typeof DEFAULT_WEIGHTS;
      thresholds: typeof DEFAULT_THRESHOLDS;
      enabled: boolean;
    }) => {
      const { data: existing } = await supabase
        .from('program_health_model')
        .select('id')
        .eq('program_id', programId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('program_health_model')
          .update({
            weights_json: weights,
            thresholds_json: thresholds,
            is_enabled: enabled,
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('program_health_model').insert({
          program_id: programId,
          weights_json: weights,
          thresholds_json: thresholds,
          is_enabled: enabled,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programs-with-health-models'] });
      notify.success(t('admin.healthModel.saved'));
      setEditingModel(null);
    },
    onError: (error: Error) => {
      notify.error(error.message);
    },
  });

  // Recompute health scores
  const recompute = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('recompute-health-scores');
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success(t('admin.healthModel.recomputed'));
    },
    onError: (error: Error) => {
      notify.error(error.message);
    },
  });

  const openEditDialog = (program: Program) => {
    const model = program.health_model;
    setEditWeights(model?.weights_json || DEFAULT_WEIGHTS);
    setEditThresholds(model?.thresholds_json || DEFAULT_THRESHOLDS);
    setEditEnabled(model?.is_enabled ?? true);
    setEditingModel(program);
  };

  const handleSave = () => {
    if (!editingModel) return;
    const sum = editWeights.actions + editWeights.sessions + editWeights.kpis + editWeights.checkins;
    if (sum !== 100) {
      notify.error(t('admin.healthModel.weightsMustSum', { sum }));
      return;
    }
    upsertModel.mutate({
      programId: editingModel.id,
      weights: editWeights,
      thresholds: editThresholds,
      enabled: editEnabled,
    });
  };

  const weightsSum = editWeights.actions + editWeights.sessions + editWeights.kpis + editWeights.checkins;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('admin.healthModel.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('admin.healthModel.description')}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => recompute.mutate()} disabled={recompute.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${recompute.isPending ? 'animate-spin' : ''}`} />
            {t('admin.healthModel.recomputeAll')}
          </Button>
        )}
      </div>

      {/* Calculation Windows Explanation */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="h-4 w-4" />
            {t('admin.healthModel.howCalculated')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="flex items-start gap-2">
              <Activity className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <span className="font-medium">{t('admin.healthModel.actions')}:</span>
                <p className="text-muted-foreground text-xs">{t('admin.healthModel.actionsDesc')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <span className="font-medium">{t('admin.healthModel.sessions')}:</span>
                <p className="text-muted-foreground text-xs">{t('admin.healthModel.sessionsDesc')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <BarChart3 className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <span className="font-medium">{t('admin.healthModel.kpis')}:</span>
                <p className="text-muted-foreground text-xs">{t('admin.healthModel.kpisDesc')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ClipboardCheck className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <span className="font-medium">{t('admin.healthModel.checkins')}:</span>
                <p className="text-muted-foreground text-xs">{t('admin.healthModel.checkinsDesc')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Programs List */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-3">
          {programs?.map((program) => (
            <ProgramHealthModelCard
              key={program.id}
              program={program}
              onEdit={() => openEditDialog(program)}
              canEdit={isAdmin}
            />
          ))}
          {programs?.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {t('admin.healthModel.noPrograms')}
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>

      {/* Edit Dialog */}
      <Dialog open={!!editingModel} onOpenChange={(open) => !open && setEditingModel(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('admin.healthModel.editModel')}: {editingModel?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <Label>{t('admin.healthModel.scoringEnabled')}</Label>
              <Switch checked={editEnabled} onCheckedChange={setEditEnabled} />
            </div>

            <Separator />

            {/* Weights */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('admin.healthModel.weightsMust100')}</Label>
                <Badge variant={weightsSum === 100 ? 'default' : 'destructive'}>
                  Total: {weightsSum}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(['actions', 'sessions', 'kpis', 'checkins'] as const).map((key) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs capitalize">{key}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={editWeights[key]}
                      onChange={(e) =>
                        setEditWeights((prev) => ({
                          ...prev,
                          [key]: parseInt(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Thresholds */}
            <div className="space-y-3">
              <Label>{t('admin.healthModel.thresholds')}</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    🌟 {t('admin.healthModel.thriving')} ≥
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={editThresholds.thriving}
                    onChange={(e) =>
                      setEditThresholds((prev) => ({
                        ...prev,
                        thriving: parseInt(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    ✅ {t('admin.healthModel.healthy')} ≥
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={editThresholds.healthy}
                    onChange={(e) =>
                      setEditThresholds((prev) => ({
                        ...prev,
                        healthy: parseInt(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    ➡️ {t('admin.healthModel.stable')} ≥
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={editThresholds.stable}
                    onChange={(e) =>
                      setEditThresholds((prev) => ({
                        ...prev,
                        stable: parseInt(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    ⚠️ {t('admin.healthModel.atRisk')} ≥
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={editThresholds.at_risk}
                    onChange={(e) =>
                      setEditThresholds((prev) => ({
                        ...prev,
                        at_risk: parseInt(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                🚨 {t('admin.healthModel.critical')}: {t('admin.healthModel.belowThreshold', { threshold: editThresholds.at_risk })}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingModel(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={upsertModel.isPending || weightsSum !== 100}>
              {upsertModel.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProgramHealthModelCard({
  program,
  onEdit,
  canEdit,
}: {
  program: Program;
  onEdit: () => void;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const model = program.health_model;
  const weights = model?.weights_json || DEFAULT_WEIGHTS;
  const thresholds = model?.thresholds_json || DEFAULT_THRESHOLDS;
  const isEnabled = model?.is_enabled ?? true;
  const hasModel = !!model;

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">{program.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    {hasModel ? (
                      isEnabled ? (
                        <Badge variant="default" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {t('admin.healthModel.modelConfigured')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          {t('admin.healthModel.disabled')}
                        </Badge>
                      )
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        {t('admin.healthModel.usingDefaults')}
                      </Badge>
                    )}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                )}
                <ChevronDown
                  className={`h-5 w-5 text-muted-foreground transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Weights Table */}
            <div>
              <h4 className="text-sm font-medium mb-2">{t('admin.healthModel.weightsMust100')}</h4>
              <Table>
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="flex items-center gap-2">
                      <Activity className="h-4 w-4" /> {t('admin.healthModel.actions')}
                    </TableCell>
                    <TableCell className="text-right">{weights.actions}%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> {t('admin.healthModel.sessions')}
                    </TableCell>
                    <TableCell className="text-right">{weights.sessions}%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" /> {t('admin.healthModel.kpis')}
                    </TableCell>
                    <TableCell className="text-right">{weights.kpis}%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4" /> {t('admin.healthModel.checkins')}
                    </TableCell>
                    <TableCell className="text-right">{weights.checkins}%</TableCell>
                  </TableRow>
                  <TableRow className="font-medium">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">
                      {weights.actions + weights.sessions + weights.kpis + weights.checkins}%
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Thresholds */}
            <div>
              <h4 className="text-sm font-medium mb-2">{t('admin.healthModel.thresholds')}</h4>
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                <div className="p-2 rounded bg-[hsl(var(--success))]/10">
                  <div className="font-medium">🌟 {t('admin.healthModel.thriving')}</div>
                  <div>≥ {thresholds.thriving}</div>
                </div>
                <div className="p-2 rounded bg-[hsl(var(--success))]/10 ">
                  <div className="font-medium">✅ {t('admin.healthModel.healthy')}</div>
                  <div>≥ {thresholds.healthy}</div>
                </div>
                <div className="p-2 rounded bg-[hsl(var(--info))]/10">
                  <div className="font-medium">➡️ {t('admin.healthModel.stable')}</div>
                  <div>≥ {thresholds.stable}</div>
                </div>
                <div className="p-2 rounded bg-[hsl(var(--warning))]/10">
                  <div className="font-medium">⚠️ {t('admin.healthModel.atRisk')}</div>
                  <div>≥ {thresholds.at_risk}</div>
                </div>
                <div className="p-2 rounded bg-destructive/10">
                  <div className="font-medium">🚨 {t('admin.healthModel.critical')}</div>
                  <div>&lt; {thresholds.at_risk}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
