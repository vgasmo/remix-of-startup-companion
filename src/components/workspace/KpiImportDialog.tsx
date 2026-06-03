import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Download, Link2, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { useWorkspaceKpiDefinitions } from '@/hooks/useKpis';

interface KpiImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

const STRIPE_METRICS = [
  { key: 'mrr', labelKey: 'kpis.stripe.mrr', category: 'Financial' },
  { key: 'active_customers', labelKey: 'kpis.stripe.activeCustomers', category: 'Customers' },
  { key: 'total_customers', labelKey: 'kpis.stripe.totalCustomers', category: 'Customers' },
  { key: 'monthly_revenue', labelKey: 'kpis.stripe.monthlyRevenue', category: 'Financial' },
];

export function KpiImportDialog({ open, onOpenChange, workspaceId }: KpiImportDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: workspaceKpis } = useWorkspaceKpiDefinitions(workspaceId);
  
  const [source, setSource] = useState<'stripe' | 'manual'>('stripe');
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [previewData, setPreviewData] = useState<{ metric: string; value: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = async () => {
    setImporting(true);
    setError(null);
    setPreviewData(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('import-kpi-data', {
        body: { workspace_id: workspaceId, source },
      });

      if (fnError) throw fnError;
      if (data.error) {
        setError(data.message || data.error);
        return;
      }

      setPreviewData(data.imported || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    if (!previewData?.length) return;

    setImporting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('import-kpi-data', {
        body: { workspace_id: workspaceId, source, kpi_mappings: mappings },
      });

      if (fnError) throw fnError;
      if (data.error) {
        setError(data.message || data.error);
        return;
      }

      notify.success(t('kpis.importSuccess', 'KPIs imported successfully'));
      queryClient.invalidateQueries({ queryKey: ['kpi-values', workspaceId] });
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Failed to import data');
      notify.error(t('kpis.importError', 'Failed to import KPIs'));
    } finally {
      setImporting(false);
    }
  };

  const updateMapping = (metric: string, kpiDefId: string) => {
    setMappings(prev => ({
      ...prev,
      [metric]: kpiDefId,
    }));
  };

  const validMappingsCount = Object.values(mappings).filter(v => v).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t('kpis.importTitle', 'Import KPI Data')}
          </DialogTitle>
          <DialogDescription>
            {t('kpis.importDescription', 'Automatically import KPI values from connected integrations')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source Selection */}
          <div className="space-y-2">
            <Label>{t('kpis.dataSource', 'Data Source')}</Label>
            <Select value={source} onValueChange={(v) => setSource(v as 'stripe')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stripe">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Stripe (Financial & Subscription Data)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Preview Button */}
          {!previewData && !error && (
            <Button 
              onClick={handlePreview} 
              disabled={importing}
              variant="outline"
              className="w-full"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.loading', 'Loading...')}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  {t('kpis.fetchPreview', 'Fetch Data Preview')}
                </>
              )}
            </Button>
          )}

          {/* Error State */}
          {error && (
            <Card className="border-destructive bg-destructive/10">
              <CardContent className="pt-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">{t('kpis.importError', 'Import Error')}</p>
                    <p className="text-sm text-muted-foreground">{error}</p>
                    {source === 'stripe' && (
                      <Button 
                        variant="link" 
                        size="sm" 
                        className="px-0 mt-2"
                        onClick={() => setError(null)}
                      >
                        {t('common.tryAgain', 'Try Again')}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview & Mapping */}
          {previewData && previewData.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('kpis.mapToKpis', 'Map to KPIs')}</Label>
                <Badge variant="secondary">
                  {validMappingsCount}/{previewData.length} mapped
                </Badge>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {previewData.map((item) => {
                  const metricInfo = STRIPE_METRICS.find(m => m.key === item.metric);
                  return (
                    <Card key={item.metric} className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {metricInfo ? t(metricInfo.labelKey) : item.metric}
                          </p>
                          <p className="text-lg font-bold text-primary">
                            {typeof item.value === 'number' 
                              ? item.value.toLocaleString() 
                              : item.value}
                          </p>
                        </div>
                        <Select 
                          value={mappings[item.metric] || ''} 
                          onValueChange={(v) => updateMapping(item.metric, v)}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder={t('kpis.selectKpi', 'Select KPI')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__skip__">
                              <span className="text-muted-foreground">{t('kpis.skipImport', 'Skip')}</span>
                            </SelectItem>
                            {workspaceKpis?.map((wk) => (
                              <SelectItem key={wk.id} value={wk.kpi_definition_id}>
                                {wk.definition?.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </Card>
                  );
                })}
              </div>

              <Button 
                onClick={handleImport}
                disabled={importing || validMappingsCount === 0}
                className="w-full"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('kpis.importing', 'Importing...')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {t('kpis.importMapped', `Import ${validMappingsCount} KPI(s)`)}
                  </>
                )}
              </Button>
            </div>
          )}

          {previewData && previewData.length === 0 && (
            <Card className="border-muted">
              <CardContent className="pt-4 text-center text-muted-foreground">
                <p>{t('kpis.noDataFound', 'No data found from this source')}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
