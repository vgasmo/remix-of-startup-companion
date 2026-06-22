import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, FileText, Code, Upload, FileSpreadsheet, Copy, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  useTemplates, 
  useCreateTemplate, 
  useUpdateTemplate, 
  useDeleteTemplate,
  type Template,
  type TemplateSchema,
} from '@/hooks/useTemplates';
import { INITIAL_TEMPLATES } from '@/data/initialTemplates';
import { notify } from "@/lib/notify";
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

const FINANCIAL_MODEL_TEMPLATE_PATH = 'templates/Template_Avaliacao_Startup_Ecossistema.xlsm';
const FINANCIAL_MODEL_BUCKET = 'public-assets';

export function AdminTemplatesManager() {
  const { t } = useTranslation();
  const { isAdmin, isConsultor } = useAuth();
  const canUploadAssets = isAdmin || isConsultor;
  
  const { data: templates, isLoading, refetch } = useTemplates();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  
  // Asset upload state
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const assetFileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    schema_json: '',
  });

  // Get the public URL for the financial model template
  const getTemplatePublicUrl = () => {
    const { data } = supabase.storage
      .from(FINANCIAL_MODEL_BUCKET)
      .getPublicUrl(FINANCIAL_MODEL_TEMPLATE_PATH);
    return data.publicUrl;
  };

  // MIME types for Excel files
  const XLSM_MIME = 'application/vnd.ms-excel.sheet.macroEnabled.12';
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canUploadAssets) {
      notify.error(t('adminTemplates.uploadPermissionDenied', { defaultValue: 'Não tem permissão para carregar ficheiros' }));
      return;
    }
    
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isXlsm = fileName.endsWith('.xlsm');
    const isXlsx = fileName.endsWith('.xlsx');
    
    if (!isXlsm && !isXlsx) {
      notify.error(t('adminTemplates.uploadExcelOnly', { defaultValue: 'Carregue um ficheiro Excel (.xlsm ou .xlsx)' }));
      return;
    }

    // Determine correct MIME type based on extension (browser MIME detection can be unreliable)
    const contentType = isXlsm ? XLSM_MIME : XLSX_MIME;

    setIsUploadingAsset(true);
    try {
      // Upload with upsert to overwrite existing
      const { error } = await supabase.storage
        .from(FINANCIAL_MODEL_BUCKET)
        .upload(FINANCIAL_MODEL_TEMPLATE_PATH, file, {
          upsert: true,
          contentType,
        });

      if (error) {
        // Check for MIME/type restriction errors
        if (error.message?.includes('mime') || error.message?.includes('type') || error.message?.includes('not allowed')) {
          throw new Error('Your storage configuration restricts this file type. Please upload via Supabase Storage console or use an .xlsx fallback.');
        }
        throw error;
      }

      const publicUrl = getTemplatePublicUrl();
      setAssetUrl(publicUrl);
      notify.success(t('adminTemplates.uploadSuccess', { defaultValue: 'Modelo carregado com sucesso' }));
    } catch (error: any) {
      logger.error('Upload error', {}, error);
      notify.error(t('adminTemplates.uploadFailed', { defaultValue: 'Falha ao carregar o modelo' }));
    } finally {
      setIsUploadingAsset(false);
      if (assetFileInputRef.current) assetFileInputRef.current.value = '';
    }
  };

  const handleCopyAssetUrl = async () => {
    const url = getTemplatePublicUrl();
    try {
      await navigator.clipboard.writeText(url);
      notify.success(t('adminTemplates.copiedToClipboard', { defaultValue: 'Copiado para a área de transferência' }));
    } catch {
      notify.error(t('adminTemplates.copyFailed', { defaultValue: 'Falha ao copiar' }));
    }
  };

  const handleCreate = () => {
    setFormData({ name: '', description: '', category: '', schema_json: '{\n  "sections": []\n}' });
    setIsCreating(true);
  };

  const handleEdit = (template: Template) => {
    setFormData({
      name: template.name,
      description: template.description || '',
      category: template.category || '',
      schema_json: template.schema_json ? JSON.stringify(template.schema_json, null, 2) : '{\n  "sections": []\n}',
    });
    setEditingTemplate(template);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      notify.error(t('adminTemplates.nameRequired', { defaultValue: 'O nome é obrigatório' }));
      return;
    }

    let schema: TemplateSchema | undefined;
    try {
      if (formData.schema_json.trim()) {
        schema = JSON.parse(formData.schema_json);
      }
    } catch {
      notify.error(t('adminTemplates.invalidJson', { defaultValue: 'JSON inválido no esquema' }));
      return;
    }

    try {
      if (editingTemplate) {
        await updateTemplate.mutateAsync({
          id: editingTemplate.id,
          name: formData.name,
          description: formData.description || null,
          category: formData.category || null,
          schema_json: schema,
        });
        notify.success(t('adminTemplates.templateUpdated', { defaultValue: 'Modelo atualizado' }));
      } else {
        await createTemplate.mutateAsync({
          name: formData.name,
          description: formData.description || undefined,
          category: formData.category || undefined,
          schema_json: schema,
          is_global: true,
        });
        notify.success(t('adminTemplates.templateCreated', { defaultValue: 'Modelo criado' }));
      }
      setEditingTemplate(null);
      setIsCreating(false);
    } catch {
      notify.error(t('adminTemplates.templatesFailed', { defaultValue: 'Falha ao guardar o modelo' }));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTemplate.mutateAsync(deleteTarget.id);
      notify.success(t('adminTemplates.templateDeleted', { defaultValue: 'Modelo eliminado' }));
      setDeleteTarget(null);
    } catch {
      notify.error(t('adminTemplates.deleteFailed', { defaultValue: 'Falha ao eliminar o modelo' }));
    }
  };

  const handleSeedTemplates = async () => {
    try {
      for (const template of INITIAL_TEMPLATES) {
        // Check if template already exists
        const existing = templates?.find(t => t.name === template.name);
        if (!existing) {
          await createTemplate.mutateAsync({
            name: template.name,
            description: template.description,
            category: template.category,
            schema_json: template.schema_json,
            is_global: true,
          });
        }
      }
      await refetch();
      notify.success(t('adminTemplates.seedSuccess', { defaultValue: 'Modelos iniciais criados' }));
    } catch {
      notify.error(t('adminTemplates.seedFailed', { defaultValue: 'Falha ao criar modelos iniciais' }));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  const groupedTemplates = templates?.reduce((acc, t) => {
    const cat = t.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {} as Record<string, Template[]>) || {};

  return (
    <div className="space-y-6">
      {/* Assets Section - Admin Only */}
      {canUploadAssets && (
        <Card>
          <CardHeader className="pb-3">
             <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              {t('adminTemplates.programAssets', { defaultValue: 'Recursos do Programa' })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex-1">
                <h4 className="font-medium text-sm">{t('adminTemplates.financialModelTemplate', { defaultValue: 'Modelo Financeiro' })}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('adminTemplates.financialModelDesc', { defaultValue: 'O modelo .xlsm canónico disponível para todas as startups descarregarem' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={assetFileInputRef}
                  type="file"
                  accept=".xlsm,.xlsx"
                  className="hidden"
                  onChange={handleAssetUpload}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => assetFileInputRef.current?.click()}
                  disabled={isUploadingAsset}
                >
                  {isUploadingAsset ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-1" />
                  )}
                  {isUploadingAsset ? t('common.uploading', { defaultValue: 'A carregar...' }) : t('adminTemplates.uploadTemplate', { defaultValue: 'Carregar Modelo' })}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyAssetUrl}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  {t('adminTemplates.copyUrl', { defaultValue: 'Copiar URL' })}
                </Button>
              </div>
            </div>
            {assetUrl && (
              <p className="text-xs text-muted-foreground">
                {t('adminTemplates.lastUploadedNote', { defaultValue: 'URL do último modelo carregado copiado. As startups podem descarregar em Workspace > Modelo Financeiro.' })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Separator />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('adminTemplates.templatesLibrary', { defaultValue: 'Biblioteca de Modelos' })}</h2>
          <p className="text-sm text-muted-foreground">{t('adminTemplates.templatesLibraryDesc', { defaultValue: 'Gerir modelos disponíveis para todos os workspaces' })}</p>
        </div>
        <div className="flex items-center gap-2">
          {(!templates || templates.length === 0) && (
            <Button variant="outline" onClick={handleSeedTemplates}>
              {t('adminTemplates.seedInitial', { defaultValue: 'Criar Modelos Iniciais' })}
            </Button>
          )}
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t('adminTemplates.newTemplate', { defaultValue: 'Novo Modelo' })}
          </Button>
        </div>
      </div>

      {templates?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            {t('adminTemplates.noTemplatesYet', { defaultValue: 'Ainda sem modelos. Clique em "Criar Modelos Iniciais" para adicionar modelos iniciais.' })}
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedTemplates).map(([category, catTemplates]) => (
          <div key={category}>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">{t(`templates.categories.${category}`, { defaultValue: category })}</h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {catTemplates.map(template => (
                <Card key={template.id} className="group">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm">{template.name}</h4>
                        {template.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          {template.is_global && (
                            <Badge variant="secondary" className="text-xs">Global</Badge>
                          )}
                          {template.schema_json?.sections?.length ? (
                            <span className="text-xs text-muted-foreground">
                              {t('adminTemplates.sections', { defaultValue: '{{count}} secções', count: template.schema_json.sections.length })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=> handleEdit(template)} aria-label={t('common.edit')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=> setDeleteTarget(template)} aria-label={t('common.delete')}>
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

      {/* Edit/Create Dialog */}
      <Dialog open={isCreating || !!editingTemplate} onOpenChange={(open) => {
        if (!open) {
          setIsCreating(false);
          setEditingTemplate(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] !flex !flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? t('adminTemplates.editTemplate', { defaultValue: 'Editar Modelo' }) : t('adminTemplates.newTemplate', { defaultValue: 'Novo Modelo' })}</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="basic" className="flex-1">
            <TabsList>
              <TabsTrigger value="basic">{t('adminTemplates.basicInfo', { defaultValue: 'Informação Básica' })}</TabsTrigger>
              <TabsTrigger value="schema">
                <Code className="h-3.5 w-3.5 mr-1" />
                {t('adminTemplates.schemaJson', { defaultValue: 'Esquema (JSON)' })}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="basic" className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('common.name', { defaultValue: 'Nome' })} *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  placeholder={t('adminTemplates.namePlaceholder', { defaultValue: 'ex.: Lean Canvas' })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('common.description', { defaultValue: 'Descrição' })}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                  placeholder={t('adminTemplates.descriptionPlaceholder', { defaultValue: 'Breve descrição deste modelo' })}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">{t('common.category', { defaultValue: 'Categoria' })}</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}
                  placeholder={t('adminTemplates.categoryPlaceholder', { defaultValue: 'ex.: Estratégia, Finanças, Crescimento' })}
                />
              </div>
            </TabsContent>
            
            <TabsContent value="schema" className="py-4">
              <div className="space-y-2">
                <Label>{t('adminTemplates.schemaJson', { defaultValue: 'Esquema JSON' })}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('adminTemplates.schemaDescription', { defaultValue: 'Defina secções e campos. Tipos de campo: texto, área de texto, número, checkbox, checklist' })}
                </p>
                <Textarea
                  value={formData.schema_json}
                  onChange={e => setFormData(f => ({ ...f, schema_json: e.target.value }))}
                  className="font-mono text-xs"
                  rows={20}
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreating(false);
              setEditingTemplate(null);
            }}>
              {t('common.cancel', { defaultValue: 'Cancelar' })}
            </Button>
            <Button onClick={handleSave} disabled={createTemplate.isPending || updateTemplate.isPending}>
              {editingTemplate ? t('common.update', { defaultValue: 'Atualizar' }) : t('common.create', { defaultValue: 'Criar' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('adminTemplates.deleteTitle', { defaultValue: 'Eliminar Modelo' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('adminTemplates.deleteDescription', { defaultValue: 'Tem a certeza de que pretende eliminar "{{name}}"? Isto também eliminará todas as instâncias deste modelo nos workspaces.', name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', { defaultValue: 'Cancelar' })}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete', { defaultValue: 'Eliminar' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
