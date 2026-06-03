import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Check, X, Upload, FileText, TrendingUp,
  Users, DollarSign, Lightbulb, BarChart3,
  Eye, BookOpen, Loader2,
} from 'lucide-react';
import { useDocuments, useUploadDocument } from '@/hooks/useDocuments';
import { useSearchParams } from 'react-router-dom';
import { DocumentReviewPanel, DocumentReviewBadge } from './DocumentReviewPanel';
import { notify } from "@/lib/notify";

interface DataroomChecklistProps {
  workspaceId: string;
  canWrite: boolean;
  isStaff: boolean;
  isMentor: boolean;
}

interface ChecklistItem {
  id: string;
  labelKey: string;
  icon: typeof FileText;
  categoryKey: string;
  required: boolean;
  templateId?: string;
  templateName?: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'pitch_deck', labelKey: 'dataroomChecklist.pitchDeck', icon: Lightbulb, categoryKey: 'pitch_deck', required: true, templateId: '479fa1ff-066f-409f-bd03-9a9242d559bf', templateName: 'Pitch Deck Checklist' },
  { id: 'one_pager', labelKey: 'dataroomChecklist.onePager', icon: FileText, categoryKey: 'one_pager', required: true, templateId: 'a1b2c3d4-1111-4aaa-bbbb-000000000001', templateName: 'One-Pager Checklist' },
  { id: 'financial_model', labelKey: 'dataroomChecklist.financialModel', icon: DollarSign, categoryKey: 'financial_model', required: true, templateId: 'a1b2c3d4-2222-4aaa-bbbb-000000000002', templateName: 'Modelo Financeiro Checklist' },
  { id: 'team', labelKey: 'dataroomChecklist.teamDeck', icon: Users, categoryKey: 'team', required: false, templateId: 'a1b2c3d4-3333-4aaa-bbbb-000000000003', templateName: 'Apresentação da Equipa Checklist' },
  { id: 'traction', labelKey: 'dataroomChecklist.tractionReport', icon: TrendingUp, categoryKey: 'traction', required: false, templateId: 'a1b2c3d4-4444-4aaa-bbbb-000000000004', templateName: 'Relatório de Tração Checklist' },
  { id: 'market', labelKey: 'dataroomChecklist.marketAnalysis', icon: BarChart3, categoryKey: 'market', required: false, templateId: 'c9cca57a-bbde-4a4a-a136-efbd1c858e66', templateName: 'Competitor Analysis' },
];

export function DataroomChecklist({ workspaceId, canWrite, isStaff, isMentor }: DataroomChecklistProps) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: documents } = useDocuments(workspaceId);
  const uploadMutation = useUploadDocument();
  const [reviewDoc, setReviewDoc] = useState<{ id: string; name: string } | null>(null);
  const [uploadItem, setUploadItem] = useState<ChecklistItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canReview = isStaff || isMentor;

  const getDocForCategory = (categoryKey: string) => {
    return documents?.find(
      d => d.category === categoryKey ||
        d.name.toLowerCase().includes(categoryKey.replace('_', ' ')) ||
        d.name.toLowerCase().includes(categoryKey.replace('_', '-'))
    );
  };

  const handleUpload = (item: ChecklistItem) => {
    setUploadItem(item);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadItem) return;

    try {
      await uploadMutation.mutateAsync({
        workspaceId,
        file,
        category: uploadItem.categoryKey,
        description: t(uploadItem.labelKey, { defaultValue: uploadItem.id }),
      });
      notify.success(t('documents.uploadSuccess', { defaultValue: 'Document uploaded successfully' }));
      setUploadItem(null);
    } catch {
      notify.error(t('documents.uploadFailed', { defaultValue: 'Upload failed' }));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenTemplate = (item: ChecklistItem) => {
    const params: Record<string, string> = { tab: 'documents', sub: 'tools' };
    if (item.templateId) {
      params.openTemplate = item.templateId;
    }
    setSearchParams(params, { replace: true });
  };

  const completedCount = CHECKLIST_ITEMS.filter(item => getDocForCategory(item.categoryKey)).length;
  const requiredCount = CHECKLIST_ITEMS.filter(item => item.required).length;
  const requiredCompleted = CHECKLIST_ITEMS.filter(item => item.required && getDocForCategory(item.categoryKey)).length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-primary" />
                {t('dataroomChecklist.title', { defaultValue: 'Documentos para Investidor' })}
              </CardTitle>
              <CardDescription>
                {t('dataroomChecklist.description', {
                  defaultValue: 'Checklist de documentos essenciais para o Data Room',
                })}
              </CardDescription>
            </div>
            <Badge variant={requiredCompleted === requiredCount ? 'default' : 'secondary'}>
              {completedCount}/{CHECKLIST_ITEMS.length}
            </Badge>
          </div>
          <div className="w-full bg-muted rounded-full h-2 mt-2">
            <div
              className="bg-primary rounded-full h-2 transition-all"
              style={{ width: `${(completedCount / CHECKLIST_ITEMS.length) * 100}%` }}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {CHECKLIST_ITEMS.map((item) => {
              const doc = getDocForCategory(item.categoryKey);
              const Icon = item.icon;
              const hasDoc = !!doc;

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/30"
                >
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                    hasDoc ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {hasDoc ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  </div>

                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${hasDoc ? '' : 'text-muted-foreground'}`}>
                        {t(item.labelKey, { defaultValue: item.id })}
                      </span>
                      {item.required && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {t('common.required', { defaultValue: 'Obrigatório' })}
                        </Badge>
                      )}
                    </div>
                    {hasDoc && doc.name && (
                      <p className="text-xs text-muted-foreground truncate">{doc.name}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Review badge and button for ALL deliverables with uploaded docs */}
                    {hasDoc && canReview && (
                      <>
                        <DocumentReviewBadge documentId={doc.id} />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReviewDoc({ id: doc.id, name: doc.name || t(item.labelKey, { defaultValue: item.id }) })}
                          title={t('dataroomChecklist.viewReview', { defaultValue: 'Ver avaliação' })}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {/* Founders can see badge (read-only) */}
                    {hasDoc && !canReview && (
                      <DocumentReviewBadge documentId={doc.id} />
                    )}
                    {!hasDoc && canWrite && (
                      <div className="flex items-center gap-1">
                        {item.templateId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenTemplate(item)}
                            title={t('dataroomChecklist.useTemplate', { defaultValue: 'Usar template' })}
                          >
                            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                            {t('dataroomChecklist.template', { defaultValue: 'Template' })}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUpload(item)}
                        >
                          <Upload className="h-3.5 w-3.5 mr-1.5" />
                          {t('common.upload', { defaultValue: 'Upload' })}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Inline upload dialog */}
      <Dialog open={!!uploadItem} onOpenChange={(open) => !open && setUploadItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              {uploadItem && t(uploadItem.labelKey, { defaultValue: uploadItem.id })}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.ppt,.pptx,.key,.xls,.xlsx,.xlsm,.csv,.doc,.docx"
              onChange={handleFileSelected}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
            >
              {uploadMutation.isPending ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">
                    {t('common.uploading', { defaultValue: 'A enviar...' })}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {t('documents.clickToUpload', { defaultValue: 'Click to select a file' })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, PPT, PPTX, XLS, XLSX, DOC, DOCX
                  </p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review panel for ANY deliverable */}
      {reviewDoc && (
        <DocumentReviewPanel
          documentId={reviewDoc.id}
          documentName={reviewDoc.name}
          workspaceId={workspaceId}
          isStaff={isStaff}
          isMentor={isMentor}
          onClose={() => setReviewDoc(null)}
        />
      )}
    </>
  );
}
