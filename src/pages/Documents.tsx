import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { pt as ptLocale, enUS } from 'date-fns/locale';
import {
  FileText, File, FileImage, FileVideo, FileAudio, FileSpreadsheet,
  Presentation, Link as LinkIcon, ExternalLink, Download, Search,
  FolderOpen, Building2, Filter, FileCheck, BookTemplate,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAllDocuments, AggregatedDocument } from '@/hooks/useAllDocuments';
import { useGetDocumentUrl } from '@/hooks/useDocuments';
import { useTemplates } from '@/hooks/useTemplates';
import { getLocalizedTemplateMeta } from '@/lib/templateCatalogI18n';
import { notify } from "@/lib/notify";

const DOCUMENT_CATEGORY_KEYS = [
  'all', 'pitch_deck', 'financial_model', 'legal', 'marketing', 'product', 'team', 'other',
] as const;

function normalizeCategoryKey(raw: string): string {
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, '_');
  const validKeys = ['pitch_deck', 'financial_model', 'legal', 'marketing', 'product', 'team', 'market', 'operations', 'funding', 'other'];
  return validKeys.includes(normalized) ? normalized : 'other';
}

function getCategoryLabel(key: string, t: (k: string, opts?: Record<string, string>) => string): string {
  if (key === 'all') return t('documents.allCategories', { defaultValue: 'Todas as categorias' });
  const normalizedKey = normalizeCategoryKey(key);
  return t(`documents.categories.${normalizedKey}`, { defaultValue: key });
}

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

export default function Documents() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith('pt') ? ptLocale : enUS;
  const { data: documents, isLoading: docsLoading } = useAllDocuments();
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const getDocumentUrl = useGetDocumentUrl();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('documents');

  const filtered = useMemo(() => {
    if (!documents) return [];
    return documents.filter(doc => {
      const matchesSearch = !search || 
        doc.name.toLowerCase().includes(search.toLowerCase()) ||
        doc.description?.toLowerCase().includes(search.toLowerCase()) ||
        doc.workspace_name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || normalizeCategoryKey(doc.category || 'other') === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [documents, search, categoryFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, { name: string; workspaceId: string; docs: AggregatedDocument[] }> = {};
    filtered.forEach(doc => {
      if (!map[doc.workspace_id]) {
        map[doc.workspace_id] = { name: doc.workspace_name, workspaceId: doc.workspace_id, docs: [] };
      }
      map[doc.workspace_id].docs.push(doc);
    });
    return Object.values(map);
  }, [filtered]);

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (!search) return templates;
    const q = search.toLowerCase();
    return templates.filter(tmpl => {
      const meta = getLocalizedTemplateMeta(tmpl, t);
      return meta.title.toLowerCase().includes(q) || meta.description?.toLowerCase().includes(q) || meta.categoryLabel.toLowerCase().includes(q);
    });
  }, [templates, search, t]);

  const handleOpen = async (doc: AggregatedDocument) => {
    if (doc.external_url) {
      window.open(doc.external_url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (doc.file_path) {
      try {
        const url = await getDocumentUrl(doc.file_path);
        window.open(url, '_blank');
      } catch {
        notify.error(t('documents.downloadFailed', { defaultValue: 'Falha no download' }));
      }
    }
  };

  return (
    <AppLayout
      title={t('documentsPage.title', { defaultValue: 'Documentos e Ferramentas' })}
      subtitle={t('documentsPage.subtitle', { defaultValue: 'Vista agregada dos documentos submetidos pelas startups e templates disponíveis para o programa.' })}
    >
      <div className="space-y-6">
        <p className="text-xs text-muted-foreground/70">
          {t('documentsPage.hint', { defaultValue: 'Procura guias, playbooks ou materiais de apoio?' })}{' '}
          <Link to="/resources" className="text-primary hover:underline font-medium">
            {t('documentsPage.hintLink', { defaultValue: 'Aceda aos Recursos →' })}
          </Link>
        </p>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <TabsList>
              <TabsTrigger value="documents" className="gap-1.5">
                <FileCheck className="h-4 w-4" />
                {t('documentsPage.submittedDocs', { defaultValue: 'Documentos' })}
              </TabsTrigger>
              <TabsTrigger value="templates" className="gap-1.5">
                <BookTemplate className="h-4 w-4" />
                {t('documentsPage.templates', { defaultValue: 'Templates' })}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={activeTab === 'documents' 
                  ? t('documentsPage.searchPlaceholder', { defaultValue: 'Pesquisar documentos...' })
                  : t('documentsPage.searchTemplates', { defaultValue: 'Pesquisar templates...' })
                }
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {activeTab === 'documents' && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORY_KEYS.map(key => (
                    <SelectItem key={key} value={key}>
                      {getCategoryLabel(key, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <TabsContent value="documents" className="space-y-4 mt-0">
            {documents && documents.length > 0 && (
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>{filtered.length} {t('documentsPage.documentsFound', { defaultValue: 'documentos' })}</span>
                {search && <span>• {t('documentsPage.filtered', { defaultValue: 'filtrado' })}</span>}
              </div>
            )}

            {docsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-32" />
                <Skeleton className="h-48" />
              </div>
            ) : grouped.length === 0 ? (
              <EmptyState
                icon={FolderOpen}
                title={t('documentsPage.emptyTitle', { defaultValue: 'Nenhum documento submetido' })}
                description={t('documentsPage.emptyDescription', { defaultValue: 'Aqui são agregados os ficheiros enviados pelas startups (pitch decks, modelos financeiros, contratos, etc.). Quando as equipas submeterem documentos nos seus espaços de trabalho, aparecerão nesta vista.' })}
                value={t('documentsPage.emptyHint', { defaultValue: 'Para templates e materiais de apoio, consulte o separador "Templates" acima ou a página de Recursos.' })}
              />
            ) : (
              <div className="space-y-6">
                {grouped.map(group => (
                  <Card key={group.workspaceId}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <Link to={`/workspace/${group.workspaceId}?tab=documents`} className="hover:underline">
                          {group.name}
                        </Link>
                        <Badge variant="secondary" className="ml-auto">{group.docs.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {group.docs.map(doc => {
                          const Icon = getFileIcon(doc.document_type);
                          return (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center shrink-0">
                                  <Icon className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate">
                                    {doc.name || t('documents.untitled', { defaultValue: 'Sem título' })}
                                  </p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                    {doc.category && (
                                      <Badge variant="outline" className="text-[10px] h-5">
                                        {getCategoryLabel(doc.category, t)}
                                      </Badge>
                                    )}
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
                                    <span>{format(new Date(doc.created_at), 'dd MMM yyyy', { locale: dateLocale })}</span>
                                  </div>
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => handleOpen(doc)} className="shrink-0" aria-label={t('common.open')}>
                                {doc.external_url ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                              </Button>
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

          <TabsContent value="templates" className="space-y-4 mt-0">
            {templatesLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <EmptyState
                icon={BookTemplate}
                title={t('documentsPage.noTemplates', { defaultValue: 'Sem templates disponíveis' })}
                description={t('documentsPage.noTemplatesDesc', { defaultValue: 'Os templates são modelos reutilizáveis (canvas, checklists, pitch structures) configurados pela equipa do programa. Quando estiverem disponíveis, aparecerão aqui.' })}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTemplates.map(tmpl => {
                  const meta = getLocalizedTemplateMeta(tmpl, t);
                  return (
                    <Card key={tmpl.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">{meta.title}</CardTitle>
                          <Badge variant="outline" className="text-xs shrink-0">{meta.categoryLabel}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {meta.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{meta.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {tmpl.is_global 
                            ? t('documentsPage.globalTemplate', { defaultValue: 'Template global' })
                            : t('documentsPage.programTemplate', { defaultValue: 'Template de programa' })
                          }
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
