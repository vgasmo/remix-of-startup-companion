import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Sparkles, Star, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { generateKpisForStages, suggestCoreKpis, getStageLabel, type StageKpiConfig } from '@/lib/kpiAutoGenerator';
import type { DraftStage, DraftStageKpis, DraftKpi, DraftCoreKpi } from '@/hooks/useProgramSetup';
import type { Database } from '@/integrations/supabase/types';

type StartupStage = Database['public']['Enums']['startup_stage'];

interface WizardKpisStepProps {
  stages: DraftStage[];
  kpis: DraftStageKpis[];
  coreKpis: DraftCoreKpi[];
  onUpdate: (kpis: DraftStageKpis[], coreKpis: DraftCoreKpi[]) => void;
}

export function WizardKpisStep({ stages, kpis, coreKpis, onUpdate }: WizardKpisStepProps) {
  const { t } = useTranslation();
  const activeStages = stages.filter((s) => s.is_active).map((s) => s.stage_key);

  // Auto-generate KPIs, ensuring all active stages have entries
  const buildStageKpis = useCallback((existing: DraftStageKpis[]): DraftStageKpis[] => {
    const result: DraftStageKpis[] = [];
    for (const stageKey of activeStages) {
      const existingStage = existing.find((s) => s.stage_key === stageKey);
      if (existingStage && existingStage.kpis.length > 0) {
        result.push(existingStage);
      } else {
        // Generate defaults for missing stages
        const generated = generateKpisForStages([stageKey]);
        if (generated.length > 0) {
          result.push({
            stage_key: stageKey,
            kpis: generated[0].kpis.map(k => ({ ...k, unit: k.unit || '#' })),
          });
        }
      }
    }
    return result;
  }, [activeStages.join(',')]);

  const [stageKpis, setStageKpis] = useState<DraftStageKpis[]>(() => buildStageKpis(kpis || []));

  // Sync when active stages change (e.g. user activates growth/scale)
  useEffect(() => {
    setStageKpis((prev) => {
      const updated = buildStageKpis(prev);
      // Only update if there's a real change (new stages added/removed)
      const prevKeys = prev.map(s => s.stage_key).sort().join(',');
      const updatedKeys = updated.map(s => s.stage_key).sort().join(',');
      if (prevKeys !== updatedKeys) return updated;
      return prev;
    });
  }, [buildStageKpis]);

  const [localCoreKpis, setLocalCoreKpis] = useState<DraftCoreKpi[]>(() => {
    if (coreKpis && coreKpis.length > 0) return coreKpis;
    // Convert to StageKpiConfig format for suggestCoreKpis
    const initKpis = buildStageKpis(kpis || []);
    const stageKpiConfigs: StageKpiConfig[] = initKpis.map(sk => ({
      stage_key: sk.stage_key,
      kpis: sk.kpis.map(k => ({
        name: k.name,
        unit: k.unit || '#',
        category: k.category || 'general',
        description: k.description || '',
        direction: (k.direction || 'up') as 'up' | 'down',
        is_required: k.is_required,
        order_index: k.order_index,
        target_value: k.target_value,
      })),
    }));
    const suggested = suggestCoreKpis(stageKpiConfigs);
    return suggested.map((k, idx) => ({
      name: k.name,
      order_index: idx,
    }));
  });

  // Debounced update
  useEffect(() => {
    const timer = setTimeout(() => {
      onUpdate(stageKpis, localCoreKpis);
    }, 500);
    return () => clearTimeout(timer);
  }, [stageKpis, localCoreKpis, onUpdate]);

  const handleKpiToggle = (stageKey: StartupStage, kpiName: string, included: boolean) => {
    // For now, we'll just mark as required/optional
    // In a full implementation, you'd remove from list
  };

  const handleKpiChange = (
    stageKey: StartupStage,
    kpiIndex: number,
    field: keyof DraftKpi,
    value: unknown
  ) => {
    setStageKpis((prev) =>
      prev.map((sk) =>
        sk.stage_key === stageKey
          ? {
              ...sk,
              kpis: sk.kpis.map((k, i) =>
                i === kpiIndex ? { ...k, [field]: value } : k
              ),
            }
          : sk
      )
    );
  };

  const handleAddKpi = (stageKey: StartupStage) => {
    const stage = stageKpis.find((s) => s.stage_key === stageKey);
    const newKpi: DraftKpi = {
      name: 'New KPI',
      unit: '#',
      category: 'custom',
      description: '',
      direction: 'up',
      is_required: false,
      order_index: stage?.kpis.length || 0,
    };

    setStageKpis((prev) =>
      prev.map((sk) =>
        sk.stage_key === stageKey
          ? { ...sk, kpis: [...sk.kpis, newKpi] }
          : sk
      )
    );
  };

  const handleRemoveKpi = (stageKey: StartupStage, kpiIndex: number) => {
    setStageKpis((prev) =>
      prev.map((sk) =>
        sk.stage_key === stageKey
          ? { ...sk, kpis: sk.kpis.filter((_, i) => i !== kpiIndex) }
          : sk
      )
    );
  };

  const toggleCoreKpi = (kpiName: string) => {
    const exists = localCoreKpis.find((c) => c.name === kpiName);
    if (exists) {
      setLocalCoreKpis((prev) => prev.filter((c) => c.name !== kpiName));
    } else if (localCoreKpis.length < 6) {
      setLocalCoreKpis((prev) => [
        ...prev,
        { name: kpiName, order_index: prev.length },
      ]);
    }
  };

  // Get all unique KPIs for core selection
  const allKpiNames = new Set<string>();
  stageKpis.forEach((sk) => sk.kpis.forEach((k) => allKpiNames.add(k.name)));

  return (
    <div className="space-y-6">
      {/* Auto-generation notice */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>{t('admin.wizard.kpisAutoGenerated')}</span>
          </div>
        </CardContent>
      </Card>

      {/* Core KPIs Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-warning" />
            {t('admin.wizard.coreKpisTitle')} ({localCoreKpis.length}/6)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            {t('admin.wizard.coreKpisDescription')}
          </p>
          <div className="flex flex-wrap gap-2">
            {Array.from(allKpiNames).map((name) => {
              const isCore = localCoreKpis.some((c) => c.name === name);
              return (
                <Badge
                  key={name}
                  variant={isCore ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleCoreKpi(name)}
                >
                  {isCore && <Star className="h-3 w-3 mr-1" />}
                  {name}
                </Badge>
              );
            })}
          </div>
          {localCoreKpis.length < 3 && (
            <p className="text-xs text-destructive mt-2">
              {t('admin.wizard.selectMoreCoreKpis', { count: 3 - localCoreKpis.length })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* KPIs by Stage */}
      <Tabs defaultValue={activeStages[0]} className="w-full">
        <TabsList className="flex-wrap h-auto">
          {activeStages.map((stageKey) => {
            const stage = stages.find((s) => s.stage_key === stageKey);
            const kpiCount = stageKpis.find((s) => s.stage_key === stageKey)?.kpis.length || 0;
            return (
              <TabsTrigger key={stageKey} value={stageKey} className="gap-1">
                {stage?.name || getStageLabel(stageKey)}
                <Badge variant="secondary" className="ml-1 text-xs">
                  {kpiCount}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {activeStages.map((stageKey) => {
          const stageData = stageKpis.find((s) => s.stage_key === stageKey);
          return (
            <TabsContent key={stageKey} value={stageKey} className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {stageData?.kpis.map((kpi, idx) => (
                    <div
                      key={idx}
                      className="p-3 border rounded-lg bg-card flex items-start gap-3"
                    >
                      <div className="flex flex-col gap-1 pt-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={()=> {
                            if (idx === 0) return;
                            const newKpis = [...stageData.kpis];
                            [newKpis[idx], newKpis[idx - 1]] = [newKpis[idx - 1], newKpis[idx]];
                            setStageKpis((prev) =>
                              prev.map((s) =>
                                s.stage_key === stageKey ? { ...s, kpis: newKpis } : s
                              )
                            );
                          }}
                          disabled={idx === 0}
                         aria-label={t('common.collapse')}>
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={()=> {
                            if (idx === stageData.kpis.length - 1) return;
                            const newKpis = [...stageData.kpis];
                            [newKpis[idx], newKpis[idx + 1]] = [newKpis[idx + 1], newKpis[idx]];
                            setStageKpis((prev) =>
                              prev.map((s) =>
                                s.stage_key === stageKey ? { ...s, kpis: newKpis } : s
                              )
                            );
                          }}
                          disabled={idx === stageData.kpis.length - 1}
                         aria-label={t('common.expand')}>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="flex-1 grid gap-2 md:grid-cols-4">
                        <div className="space-y-1">
                          <Label className="text-xs">{t('common.name')}</Label>
                          <Input
                            value={kpi.name}
                            onChange={(e) =>
                              handleKpiChange(stageKey, idx, 'name', e.target.value)
                            }
                            className="h-8"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('admin.wizard.kpiUnit')}</Label>
                          <Input
                            value={kpi.unit || ''}
                            onChange={(e) =>
                              handleKpiChange(stageKey, idx, 'unit', e.target.value)
                            }
                            className="h-8"
                            placeholder="#, %, €"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('admin.wizard.kpiTarget')}</Label>
                          <Input
                            type="number"
                            value={kpi.target_value || ''}
                            onChange={(e) =>
                              handleKpiChange(stageKey, idx, 'target_value', Number(e.target.value) || undefined)
                            }
                            className="h-8"
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`required-${stageKey}-${idx}`}
                              checked={kpi.is_required}
                              onCheckedChange={(checked) =>
                                handleKpiChange(stageKey, idx, 'is_required', checked)
                              }
                            />
                            <Label htmlFor={`required-${stageKey}-${idx}`} className="text-xs">
                              {t('admin.wizard.kpiRequired')}
                            </Label>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={()=> handleRemoveKpi(stageKey, idx)}
                           aria-label={t('common.delete')}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleAddKpi(stageKey)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t('admin.wizard.addKpi')}
                  </Button>
                </div>
              </ScrollArea>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}