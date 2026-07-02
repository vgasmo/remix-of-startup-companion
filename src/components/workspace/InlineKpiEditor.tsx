import { useState, useEffect } from 'react';
import { Save, Loader2, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);


interface KpiEntry {
  id: string;
  kpi_definition_id: string;
  value: number | null;
  target_value: number | null;
  definition: {
    id: string;
    name: string;
    unit: string | null;
    direction: string | null;
  };
}

interface InlineKpiEditorProps {
  workspaceId: string;
  className?: string;
}

export function InlineKpiEditor({ workspaceId, className }: InlineKpiEditorProps) {
  const [kpis, setKpis] = useState<KpiEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const currentMonth = format(new Date(), 'yyyy-MM-01');

  useEffect(() => {
    loadKpis();
  }, [workspaceId]);

  const loadKpis = async () => {
    setLoading(true);
    try {
      // Get workspace KPIs
      const { data: workspaceKpis, error: wkError } = await supabase
        .from('workspace_kpis')
        .select(`
          kpi_definition_id,
          target_value,
          kpi_definitions(id, name, unit, direction)
        `)
        .eq('workspace_id', workspaceId)
        .eq('active', true);

      if (wkError) throw wkError;

      // Get current month values
      const { data: kpiValues, error: kvError } = await supabase
        .from('kpi_values')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('period_month', currentMonth);

      if (kvError) throw kvError;

      const entries: KpiEntry[] = (workspaceKpis || []).map((wk: any) => {
        const existingValue = kpiValues?.find(kv => kv.kpi_definition_id === wk.kpi_definition_id);
        return {
          id: existingValue?.id || '',
          kpi_definition_id: wk.kpi_definition_id,
          value: existingValue?.value ?? null,
          target_value: wk.target_value,
          definition: wk.kpi_definitions,
        };
      });

      setKpis(entries);
      
      // Initialize values
      const initialValues: Record<string, string> = {};
      entries.forEach(kpi => {
        initialValues[kpi.kpi_definition_id] = kpi.value?.toString() || '';
      });
      setValues(initialValues);
    } catch (error) {
      logger.error('Error loading KPIs', {}, error);
      notify.error(t('workspace.erroAoCarregarKpis'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (kpiDefId: string) => {
    const valueStr = values[kpiDefId];
    const value = valueStr ? parseFloat(valueStr) : null;

    if (valueStr && isNaN(value as number)) {
      notify.error(t('workspace.valorInválido'));
      return;
    }

    // Optimistic update: snapshot previous state for rollback
    const previousKpis = kpis;
    setKpis(prev => prev.map(k => k.kpi_definition_id === kpiDefId ? { ...k, value } : k));
    setSaving(prev => ({ ...prev, [kpiDefId]: true }));

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('kpi_values')
        .upsert({
          workspace_id: workspaceId,
          kpi_definition_id: kpiDefId,
          period_month: currentMonth,
          value,
          created_by: user?.id,
        }, {
          onConflict: 'workspace_id,kpi_definition_id,period_month',
        });

      if (error) throw error;

      notify.success(t('workspace.kpiAtualizado'));
      queryClient.invalidateQueries({ queryKey: ['workspace-kpis', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['health-score', workspaceId] });
    } catch (error) {
      // Rollback on error
      setKpis(previousKpis);
      setValues(prev => ({
        ...prev,
        [kpiDefId]: previousKpis.find(k => k.kpi_definition_id === kpiDefId)?.value?.toString() || '',
      }));
      logger.error('Error saving KPI', {}, error);
      notify.error(t('workspace.erroAoGuardarKpi'));
    } finally {
      setSaving(prev => ({ ...prev, [kpiDefId]: false }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, kpiDefId: string) => {
    if (e.key === 'Enter') {
      handleSave(kpiDefId);
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t('kpis.monthTitle', { defaultValue: 'KPIs do Mês' })}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (kpis.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            KPIs do Mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center text-center py-6">
            <div className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center mb-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </div>
             <p className="text-sm font-medium text-foreground mb-0.5">{t('kpis.noneConfigured', 'Nenhum KPI configurado')}</p>
            <p className="text-xs text-muted-foreground max-w-[240px]">
               {t('kpis.configuredByStaff', 'Os KPIs serão configurados pelo consultor ou administrador do programa.')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            KPIs do Mês
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {format(new Date(), 'MMM yyyy')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {kpis.map((kpi) => (
            <div key={kpi.kpi_definition_id} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <label className="text-sm font-medium truncate block">
                  {kpi.definition?.name || 'KPI'}
                </label>
                {kpi.target_value && (
                  <span className="text-xs text-muted-foreground">
                    Meta: {kpi.target_value} {kpi.definition?.unit || ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={values[kpi.kpi_definition_id] || ''}
                  onChange={(e) => setValues(prev => ({ 
                    ...prev, 
                    [kpi.kpi_definition_id]: e.target.value 
                  }))}
                  onKeyDown={(e) => handleKeyDown(e, kpi.kpi_definition_id)}
                  placeholder="—"
                  className="w-24 h-8 text-right"
                />
                <span className="text-xs text-muted-foreground w-8">
                  {kpi.definition?.unit || ''}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={saving[kpi.kpi_definition_id]} loading={saving}
                  onClick={() => handleSave(kpi.kpi_definition_id)}
                 aria-label="Loading">
                  {saving[kpi.kpi_definition_id] ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
