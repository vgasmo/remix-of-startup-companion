import { useState } from 'react';
import { RefreshCw, Download, Loader2, FileText, Check, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  useHealthModelTemplates, 
  useCreateHealthModelTemplate, 
  useApplyHealthModelTemplate,
  useRecomputeHealth 
} from '@/hooks/useHealthHistory';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);


interface AdminHealthToolsProps {
  programId?: string;
  className?: string;
}

export function AdminHealthTools({ programId, className }: AdminHealthToolsProps) {
  const [recomputeLoading, setRecomputeLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');

  const { data: templates, isLoading: templatesLoading } = useHealthModelTemplates();
  const createTemplate = useCreateHealthModelTemplate();
  const applyTemplate = useApplyHealthModelTemplate();
  const recomputeHealth = useRecomputeHealth();

  // Get current program health model
  const { data: currentModel } = useQuery({
    queryKey: ['program-health-model', programId],
    queryFn: async () => {
      if (!programId) return null;
      const { data, error } = await supabase
        .from('program_health_model')
        .select('*')
        .eq('program_id', programId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!programId,
  });

  const handleRecompute = async () => {
    setRecomputeLoading(true);
    try {
      const result = await recomputeHealth.mutateAsync(
        programId ? { program_id: programId } : undefined
      );
      notify.success(t('admin.recalculadoResultupdatedworkspacesWorkspacesResulthistorysnapshotsSnapshots', { alertsCreated: result.alertsCreated }));
    } catch (error) {
      logger.error('Recompute error', {}, error);
      notify.error(t('admin.erroAoRecalcularHealthScores'));
    } finally {
      setRecomputeLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!programId) {
      notify.error(t('admin.selecioneUmPrograma'));
      return;
    }

    setExportLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-cohort-health-pdf', {
        body: { program_id: programId },
      });

      if (error) throw error;

      if (data.report_url) {
        window.open(data.report_url, '_blank');
        notify.success(t('admin.relatórioGeradoComSucesso'));
      }
    } catch (error) {
      logger.error('Export error', {}, error);
      notify.error(t('admin.erroAoGerarRelatório'));
    } finally {
      setExportLoading(false);
    }
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplate || !programId) {
      notify.error(t('admin.selecioneUmTemplateEUm'));
      return;
    }

    try {
      await applyTemplate.mutateAsync({ templateId: selectedTemplate, programId });
      notify.success(t('admin.templateAplicadoComSucesso'));
    } catch (error) {
      logger.error('Apply template error', {}, error);
      notify.error(t('admin.erroAoAplicarTemplate'));
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!currentModel || !newTemplateName) {
      notify.error(t('admin.nomeÉObrigatório'));
      return;
    }

    try {
      await createTemplate.mutateAsync({
        name: newTemplateName,
        description: newTemplateDesc || undefined,
        weights_json: currentModel.weights_json,
        thresholds_json: currentModel.thresholds_json,
      });
      notify.success(t('admin.templateCriadoComSucesso'));
      setShowSaveDialog(false);
      setNewTemplateName('');
      setNewTemplateDesc('');
    } catch (error) {
      logger.error('Save template error', {}, error);
      notify.error(t('admin.erroAoCriarTemplate'));
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{t('admin.healthTools', 'Ferramentas de Health')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recompute Section */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div>
            <p className="text-sm font-medium">{t('admin.recomputeHealth', 'Recalcular Health Scores')}</p>
            <p className="text-xs text-muted-foreground">
              {programId ? t('admin.healthThisProgram', 'Workspaces deste programa') : t('admin.healthAllActive', 'Todos os workspaces ativos')}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecompute}
            disabled={recomputeLoading} loading={recomputeLoading}
          >
            {recomputeLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {t('admin.recalculate', 'Recalcular')}
          </Button>
        </div>

        {/* Export PDF Section */}
        {programId && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <p className="text-sm font-medium">{t('admin.exportReport', 'Exportar Relatório')}</p>
              <p className="text-xs text-muted-foreground">{t('admin.cohortHealthPdf', 'Health do cohort em PDF')}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={exportLoading} loading={exportLoading}
            >
              {exportLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {t('common.export', 'Exportar')}
            </Button>
          </div>
        )}

        {/* Templates Section */}
        <div className="space-y-3 p-3 rounded-lg bg-muted/50">
          <p className="text-sm font-medium">{t('admin.healthTemplates', 'Templates de Health Model')}</p>
          
          <div className="flex gap-2">
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={t('admin.selectTemplate', 'Selecionar template')} />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.is_default && <Badge variant="secondary" className="ml-2 text-xs">Default</Badge>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleApplyTemplate}
              disabled={!selectedTemplate || !programId || applyTemplate.isPending} loading={applyTemplate.isPending}
            >
              {applyTemplate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
          </div>

          {currentModel && programId && (
            <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full">
                  <FileText className="h-4 w-4 mr-2" />
                  {t('admin.saveCurrentAsTemplate', 'Guardar modelo atual como template')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('admin.saveAsTemplate', 'Guardar como Template')}</DialogTitle>
                  <DialogDescription>
                    {t('admin.createReusableTemplate', 'Crie um template reutilizável a partir do modelo atual.')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('common.name', 'Nome')}</Label>
                    <Input
                      id="name"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="Ex: Programa Intensivo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="desc">{t('common.descriptionOptional', 'Descrição (opcional)')}</Label>
                    <Textarea
                      id="desc"
                      value={newTemplateDesc}
                      onChange={(e) => setNewTemplateDesc(e.target.value)}
                      placeholder="Descreva quando usar este template..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                    {t('common.cancel', 'Cancelar')}
                  </Button>
                  <Button 
                    onClick={handleSaveAsTemplate}
                    disabled={!newTemplateName || createTemplate.isPending} loading={createTemplate.isPending}
                  >
                    {createTemplate.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    {t('common.save', 'Guardar')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
