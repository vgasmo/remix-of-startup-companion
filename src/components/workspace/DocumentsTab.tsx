import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { 
  Upload, 
  Link as LinkIcon, 
  FileText, 
  Download, 
  Trash2, 
  ExternalLink,
  File,
  FileImage,
  FileVideo,
  FileAudio,
  FileSpreadsheet,
  Presentation,
  AlertTriangle,
  MessageSquare,
  Calculator,
  Wrench,
  FolderLock,
  GraduationCap,
} from 'lucide-react';
import { ProgramMaterialsPanel } from './ProgramMaterialsPanel';
import { DocumentFeedbackButton } from './DocumentFeedbackButton';
import { DocumentReviewPanel, DocumentReviewBadge } from './DocumentReviewPanel';
import { useQuickWinToast } from '@/hooks/useQuickWinToast';
import { format } from 'date-fns';
import { 
  useDocuments, 
  useUploadDocument, 
  useAddExternalLink, 
  useDeleteDocument,
  useGetDocumentUrl,
  Document 
} from '@/hooks/useDocuments';
import { useTemplateInstances, useTemplates } from '@/hooks/useTemplates';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { useTrackEngagement } from '@/hooks/useEngagementEvents';
import { useTranslation } from 'react-i18next';
import { FinancialModelPanel } from './FinancialModelPanel';
import { TemplatesTab } from './TemplatesTab';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import { DataroomTab } from './DataroomTab';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface DocumentsTabProps {
  workspaceId: string;
  canWrite: boolean;
  isFounder?: boolean;
  isStaff?: boolean;
  isMentor?: boolean;
}

const CATEGORY_KEYS = [
  { key: 'pitch_deck', labelKey: 'documents.categoryPitchDeck' },
  { key: 'one_pager', labelKey: 'documents.categoryOnePager' },
  { key: 'financial_model', labelKey: 'documents.categoryFinancialModel' },
  { key: 'team', labelKey: 'documents.categoryTeam' },
  { key: 'traction', labelKey: 'documents.categoryTraction' },
  { key: 'market', labelKey: 'documents.categoryMarket' },
  { key: 'legal', labelKey: 'documents.categoryLegal' },
  { key: 'marketing', labelKey: 'documents.categoryMarketing' },
  { key: 'product', labelKey: 'documents.categoryProduct' },
  { key: 'other', labelKey: 'documents.categoryOther' },
];

type DocumentSubTab = 'all' | 'financial' | 'tools' | 'program' | 'dataroom';

const SUB_TABS: { id: DocumentSubTab; labelKey: string; icon: typeof FileText }[] = [
  { id: 'all', labelKey: 'documents.subTabs.all', icon: FileText },
  { id: 'financial', labelKey: 'documents.subTabs.financial', icon: Calculator },
  { id: 'tools', labelKey: 'documents.subTabs.tools', icon: Wrench },
  { id: 'program', labelKey: 'documents.subTabs.program', icon: GraduationCap },
  { id: 'dataroom', labelKey: 'documents.subTabs.dataroom', icon: FolderLock },
];

function getFileIcon(documentType: string) {
  if (documentType === 'link') return LinkIcon;
  if (documentType.startsWith('image/')) return FileImage;
  if (documentType.startsWith('video/')) return FileVideo;
  if (documentType.startsWith('audio/')) return FileAudio;
  if (documentType.includes('spreadsheet') || documentType.includes('excel') || documentType.includes('csv')) return FileSpreadsheet;
  if (documentType.includes('presentation') || documentType.includes('powerpoint')) return Presentation;
  if (documentType.includes('pdf') || documentType.includes('document') || documentType.includes('word')) return FileText;
  return File;
}

export function DocumentsTab({ workspaceId, canWrite, isFounder = false, isStaff = false, isMentor = false }: DocumentsTabProps) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: documents, isLoading } = useDocuments(workspaceId);
  const { data: templateInstances = [] } = useTemplateInstances(workspaceId);
  const { data: templates = [] } = useTemplates();
  const uploadMutation = useUploadDocument();
  const addLinkMutation = useAddExternalLink();
  const deleteMutation = useDeleteDocument();
  const getDocumentUrl = useGetDocumentUrl();
  const { confirm, dialogProps } = useConfirmDialog();

  // Sub-tab state from URL
  const subParam = (searchParams.get('sub') as DocumentSubTab) || 'all';
  const [activeSubTab, setActiveSubTab] = useState<DocumentSubTab>(
    ['all', 'financial', 'tools', 'program', 'dataroom'].includes(subParam) ? subParam : 'all'
  );

  const [uploadOpen, setUploadOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [description, setDescription] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [externalLinkConfirmOpen, setExternalLinkConfirmOpen] = useState(false);
  const [pendingExternalUrl, setPendingExternalUrl] = useState<string | null>(null);
  const [reviewDoc, setReviewDoc] = useState<{ id: string; name: string } | null>(null);
  const [highlightedDocId, setHighlightedDocId] = useState<string | null>(null);

  const canReview = isStaff || isMentor;

  // Sync sub-tab to URL
  const handleSubTabChange = (sub: DocumentSubTab) => {
    setActiveSubTab(sub);
    const newParams = new URLSearchParams(searchParams);
    if (sub === 'all') {
      newParams.delete('sub');
    } else {
      newParams.set('sub', sub);
    }
    setSearchParams(newParams, { replace: true });
  };

  // Sync from URL changes
  useEffect(() => {
    const sub = searchParams.get('sub') as DocumentSubTab;
    if (sub && ['all', 'financial', 'tools', 'program', 'dataroom'].includes(sub)) {
      setActiveSubTab(sub);
    } else if (!sub) {
      setActiveSubTab('all');
    }
  }, [searchParams]);

  // B6 Fix: Auto-open upload dialog with pre-selected category via query param
  useEffect(() => {
    const uploadCategory = searchParams.get('upload');
    if (uploadCategory && canWrite) {
      const categoryKeyMap: Record<string, string> = {
        'pitch_deck': 'pitch_deck',
        'pitch-deck': 'pitch_deck',
        'pitchdeck': 'pitch_deck',
        'financial_model': 'financial_model',
        'financial-model': 'financial_model',
        'one_pager': 'one_pager',
        'traction': 'traction',
        'market': 'market',
        'team': 'team',
        'legal': 'legal',
        'marketing': 'marketing',
        'product': 'product',
        'other': 'other',
      };
      const mappedCategoryKey = categoryKeyMap[uploadCategory.toLowerCase()] || 'other';
      
      const validCategoryKeys = CATEGORY_KEYS.map(c => c.key);
      if (validCategoryKeys.includes(mappedCategoryKey)) {
        setSelectedCategory(mappedCategoryKey);
      }
      setUploadOpen(true);
      
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('upload');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams, canWrite]);

  useEffect(() => {
    const legacyDocId = searchParams.get('doc');
    if (!legacyDocId) return;

    const matchedInstance = templateInstances.find((instance) => instance.id === legacyDocId);
    const matchedTemplateId = matchedInstance?.template_id || templates.find((template) => template.id === legacyDocId)?.id;
    if (!matchedTemplateId) return;

    const newParams = new URLSearchParams(searchParams);
    newParams.set('sub', 'tools');
    newParams.set('openTemplate', matchedTemplateId);
    newParams.delete('doc');
    setActiveSubTab('tools');
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams, templateInstances, templates]);

  // Deep-link from notifications: ?document=<id> scrolls to and highlights the file.
  useEffect(() => {
    const docId = searchParams.get('document');
    if (!docId || !documents?.length) return;
    const target = documents.find((d) => d.id === docId);
    if (!target) return;

    setHighlightedDocId(docId);
    // Defer to next paint so the row exists in the DOM.
    requestAnimationFrame(() => {
      const el = document.getElementById(`document-row-${docId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    const newParams = new URLSearchParams(searchParams);
    newParams.delete('document');
    setSearchParams(newParams, { replace: true });

    const timer = window.setTimeout(() => setHighlightedDocId(null), 3500);
    return () => window.clearTimeout(timer);
  }, [searchParams, setSearchParams, documents]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadMutation.mutateAsync({
        workspaceId,
        file,
        category: selectedCategory || undefined,
        description: description || undefined,
      });

      notify.success(
        t('documents.uploadSuccess', { defaultValue: '✅ Documento enviado com sucesso!' }),
        { duration: 4000 }
      );
    } catch {
      notify.error(
        t('documents.uploadFailed', { defaultValue: 'Falha ao enviar documento' }),
        { duration: 4000 }
      );
    }

    setUploadOpen(false);
    setSelectedCategory('');
    setDescription('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddLink = async () => {
    if (!linkName.trim() || !linkUrl.trim()) {
      notify.error(t('documents.provideNameAndUrl'));
      return;
    }

    await addLinkMutation.mutateAsync({
      workspaceId,
      name: linkName,
      url: linkUrl,
      category: selectedCategory || undefined,
      description: description || undefined,
    });

    setLinkOpen(false);
    setLinkName('');
    setLinkUrl('');
    setSelectedCategory('');
    setDescription('');
  };

  const trackEngagement = useTrackEngagement(workspaceId);
  const handleDownload = async (doc: Document) => {
    // Track document open (best-effort, never blocks).
    trackEngagement.mutate({
      eventType: 'view',
      targetType: 'document',
      targetId: doc.id,
      metadata: { kind: doc.external_url ? 'link' : 'file' },
    });

    if (doc.external_url) {
      setPendingExternalUrl(doc.external_url);
      setExternalLinkConfirmOpen(true);
      return;
    }

    if (doc.file_path) {
      try {
        const url = await getDocumentUrl(doc.file_path);
        window.open(url, '_blank');
      } catch {
        notify.error(t('documents.downloadFailed'));
      }
    }
  };
  
  const confirmOpenExternalLink = () => {
    if (pendingExternalUrl) {
      window.open(pendingExternalUrl, '_blank', 'noopener,noreferrer');
    }
    setExternalLinkConfirmOpen(false);
    setPendingExternalUrl(null);
  };
  
  const cancelOpenExternalLink = () => {
    setExternalLinkConfirmOpen(false);
    setPendingExternalUrl(null);
  };

  const handleDelete = (doc: Document) => {
    confirm({
      title: t('documents.deleteTitle', { defaultValue: 'Eliminar documento?' }),
      description: t('documents.deleteConfirm', { defaultValue: 'Tem a certeza que quer eliminar "{{name}}"? Esta ação não pode ser desfeita.', name: doc.name }),
      confirmLabel: t('common.delete'),
      onConfirm: async () => {
        await deleteMutation.mutateAsync({ document: doc, workspaceId });
        notify.success(t('documents.documentDeleted', { defaultValue: 'Documento eliminado' }));
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const groupedDocuments = documents?.reduce((acc, doc) => {
    const cat = doc.category || t('documents.uncategorized');
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {} as Record<string, Document[]>) || {};

  const sortedCategories = Object.keys(groupedDocuments).sort((a, b) => {
    const uncategorized = t('documents.uncategorized');
    if (a === uncategorized) return 1;
    if (b === uncategorized) return -1;
    return a.localeCompare(b);
  });

  return (
    <>
    <div className="space-y-6">
      {/* Section intro */}
      <div>
        <p className="text-sm text-muted-foreground">
          {t('documents.sectionIntro', { defaultValue: 'Ficheiros e entregáveis específicos desta startup — pitch decks, modelos financeiros, contratos e outros documentos de trabalho.' })}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {t('documents.sectionIntroHint', { defaultValue: 'Para guias, templates e materiais de apoio do programa,' })}{' '}
          <a href="/resources" className="text-primary hover:underline font-medium">
            {t('documents.sectionIntroHintLink', { defaultValue: 'consulte os Recursos →' })}
          </a>
        </p>
      </div>
      <AlertDialog open={externalLinkConfirmOpen} onOpenChange={setExternalLinkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />
              {t('documents.openingExternalLink')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{t('documents.aboutToOpen')}</p>
              <p className="font-mono text-sm bg-muted p-2 rounded break-all">
                {pendingExternalUrl}
              </p>
              <p className="text-[hsl(var(--warning))]">
                {t('documents.externalLinkWarning')}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelOpenExternalLink}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmOpenExternalLink}>
              {t('documents.openLink')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sub-tabs navigation */}
      <div className="flex items-center gap-1 border-b" role="tablist" aria-label={t('documents.subTabs.label', { defaultValue: 'Secções de documentos' })}>
        {SUB_TABS.map((sub) => {
          const Icon = sub.icon;
          const isActive = activeSubTab === sub.id;
          return (
            <button
              key={sub.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`doc-panel-${sub.id}`}
              id={`doc-tab-${sub.id}`}
              onClick={() => handleSubTabChange(sub.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              )}
            >
              <Icon className="h-4 w-4" />
              {t(sub.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Sub-tab panels */}
      {activeSubTab === 'financial' && (
        <div role="tabpanel" id="doc-panel-financial" aria-labelledby="doc-tab-financial">
          <WidgetErrorBoundary name="Financial Model">
            <FinancialModelPanel workspaceId={workspaceId} canWrite={canWrite} />
          </WidgetErrorBoundary>
        </div>
      )}

      {activeSubTab === 'tools' && (
        <div role="tabpanel" id="doc-panel-tools" aria-labelledby="doc-tab-tools">
          <TemplatesTab workspaceId={workspaceId} canWrite={canWrite} isFounder={isFounder} />
        </div>
      )}

      {activeSubTab === 'program' && (
        <div role="tabpanel" id="doc-panel-program" aria-labelledby="doc-tab-program">
          <WidgetErrorBoundary name="Program Materials">
            <ProgramMaterialsPanel workspaceId={workspaceId} />
          </WidgetErrorBoundary>
        </div>
      )}

      {activeSubTab === 'dataroom' && (
        <div role="tabpanel" id="doc-panel-dataroom" aria-labelledby="doc-tab-dataroom">
          <DataroomTab workspaceId={workspaceId} canWrite={canWrite} isStaff={isStaff} isMentor={isMentor} />
        </div>
      )}

      {activeSubTab === 'all' && (
        <div role="tabpanel" id="doc-panel-all" aria-labelledby="doc-tab-all">
          {/* Pinned Financial Model summary */}
          <FinancialModelPanel workspaceId={workspaceId} canWrite={canWrite} />

          {/* Upload Actions */}
          {canWrite && (
            <div className="flex gap-2 mt-6">
              <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Upload className="h-4 w-4 mr-2" />
                    {t('documents.uploadFile')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('documents.uploadDocument')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>{t('documents.category')}</Label>
                      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('documents.selectCategory')} />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_KEYS.map((cat) => (
                            <SelectItem key={cat.key} value={cat.key}>{t(cat.labelKey)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t('documents.descriptionOptional')}</Label>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t('documents.descriptionPlaceholder')}
                      />
                    </div>
                    <div>
                      <Label>{t('documents.file')}</Label>
                      <Input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileUpload}
                        disabled={uploadMutation.isPending}
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <LinkIcon className="h-4 w-4 mr-2" />
                    {t('documents.addLink')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('documents.addExternalLink')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>{t('documents.name')}</Label>
                      <Input
                        value={linkName}
                        onChange={(e) => setLinkName(e.target.value)}
                        placeholder={t('documents.namePlaceholder')}
                      />
                    </div>
                    <div>
                      <Label>{t('documents.url')}</Label>
                      <Input
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder={t('documents.urlPlaceholder')}
                      />
                    </div>
                    <div>
                      <Label>{t('documents.category')}</Label>
                      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('documents.selectCategory')} />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_KEYS.map((cat) => (
                            <SelectItem key={cat.key} value={cat.key}>{t(cat.labelKey)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t('documents.descriptionOptional')}</Label>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t('documents.descriptionPlaceholder')}
                      />
                    </div>
                    <Button 
                      onClick={handleAddLink} 
                      disabled={addLinkMutation.isPending}
                      className="w-full"
                    >
                      {t('documents.addLink')}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* Documents List */}
          <div className="mt-6">
            {sortedCategories.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={t('emptyStates.documents.title', { defaultValue: 'Sem documentos nesta startup' })}
                description={t('emptyStates.documents.description', { defaultValue: 'Aqui ficam os ficheiros e entregáveis da startup: pitch decks, modelos financeiros, one-pagers, documentos legais e outros. Carregue ficheiros ou adicione links para começar.' })}
                value={t('emptyStates.documents.hint', { defaultValue: 'Utilize as sub-abas acima para aceder ao Modelo Financeiro, Ferramentas ou Data Room.' })}
                action={canWrite ? {
                  label: t('documents.uploadFile'),
                  onClick: () => setUploadOpen(true),
                  icon: Upload,
                } : undefined}
                secondaryAction={canWrite ? {
                  label: t('documents.addLink'),
                  onClick: () => setLinkOpen(true),
                } : undefined}
              />
            ) : (
              sortedCategories.map((category) => {
                  const docs = groupedDocuments[category] || [];
                  if (docs.length === 0) return null;

                  const categoryLabel = CATEGORY_KEYS.find(c => c.key === category)
                    ? t(CATEGORY_KEYS.find(c => c.key === category)!.labelKey)
                    : category;

                  return (
                    <Card key={category} className="mb-4 rounded-xl border-border/60 overflow-hidden">
                      <CardHeader className="pb-2 pt-4 px-5">
                        <CardTitle className="text-base font-semibold flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <File className="h-4 w-4 text-primary" />
                          </div>
                          {categoryLabel}
                          <Badge variant="secondary" className="ml-auto text-[10px] font-normal">{docs.length} {docs.length === 1 ? 'ficheiro' : 'ficheiros'}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-5 pb-4">
                        <div className="space-y-1.5">
                          {docs.map((doc) => {
                            const Icon = getFileIcon(doc.document_type);
                            const isLink = doc.document_type === 'link';
                            return (
                              <div
                                key={doc.id}
                                id={`document-row-${doc.id}`}
                                className={cn(
                                  "flex items-center justify-between p-3 rounded-lg border border-border/40 bg-card hover:bg-accent/50 transition-colors group",
                                  highlightedDocId === doc.id && "ring-2 ring-primary bg-primary/5 animate-pulse"
                                )}
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className={cn(
                                    "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                                    isLink ? "bg-[hsl(var(--info))]/10" : "bg-muted"
                                  )}>
                                    <Icon className={cn("h-5 w-5", isLink ? "text-[hsl(var(--info))]" : "text-muted-foreground")} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm truncate">{doc.name || t('documents.untitled', { defaultValue: 'Sem título' })}</p>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                      {doc.uploader && (
                                        <div className="flex items-center gap-1">
                                          <Avatar className="h-4 w-4">
                                            <AvatarImage src={doc.uploader.avatar_url || undefined} />
                                            <AvatarFallback className="text-[8px]">
                                              {doc.uploader.full_name?.charAt(0) || '?'}
                                            </AvatarFallback>
                                          </Avatar>
                                          <span className="truncate max-w-[100px]">{doc.uploader.full_name}</span>
                                        </div>
                                      )}
                                      <span className="text-muted-foreground/40">•</span>
                                      <span>{format(new Date(doc.created_at), 'dd MMM yyyy')}</span>
                                      {isLink && (
                                        <>
                                          <span className="text-muted-foreground/40">•</span>
                                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-normal">{t('common.link', 'Link')}</Badge>
                                        </>
                                      )}
                                    </div>
                                    {doc.description && (
                                      <p className="text-xs text-muted-foreground/70 mt-1 truncate max-w-md">
                                        {doc.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                                  {/* Review badge + button for staff/mentors on all docs */}
                                  {canReview && (
                                    <>
                                      <DocumentReviewBadge documentId={doc.id} />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setReviewDoc({ id: doc.id, name: doc.name })}
                                        title={t('review.viewReview', { defaultValue: 'Avaliar entregável' })}
                                       aria-label={t('common._iconOpenChat')}>
                                        <MessageSquare className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                  {/* Founders can request feedback */}
                                  {!canReview && (
                                    <DocumentFeedbackButton documentId={doc.id} documentName={doc.name} workspaceId={workspaceId} />
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={()= aria-label="Open link"> handleDownload(doc)}
                                    title={doc.external_url ? t('documents.openLink') : t('common.download', { defaultValue: 'Download' })}
                                   aria-label={t('common.open')}>
                                    {doc.external_url ? (
                                      <ExternalLink className="h-4 w-4" />
                                    ) : (
                                      <Download className="h-4 w-4" />
                                    )}
                                  </Button>
                                  {canWrite && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={()= aria-label="Delete"> handleDelete(doc)}
                                      disabled={deleteMutation.isPending}
                                      className="text-destructive hover:text-destructive h-8 w-8"
                                     aria-label={t('common.delete')}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
            )}
          </div>
        </div>
      )}
    </div>
    
    <ConfirmDialog {...dialogProps} />

    {/* Review panel for any document (staff/mentor) */}
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
