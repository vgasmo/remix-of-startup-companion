import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notify } from "@/lib/notify";
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { 
  FolderLock, Plus, Link2, Copy, Trash2, 
  Eye, EyeOff, FileText, TrendingUp, LinkIcon, GripVertical,
  Calendar, Download, XCircle, Clock, Users, Sparkles, BookTemplate, ExternalLink
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';
import { getDateLocale } from '@/lib/dateLocale';
import {
  useDataroom,
  useDataroomItems,
  useDataroomShareLinks,
  useEnsureDataroom,
  useCreateDataroomItem,
  useUpdateDataroomItem,
  useDeleteDataroomItem,
  useCreateShareLink,
  useRevokeShareLink,
} from '@/hooks/useDataroom';
import { useDocuments } from '@/hooks/useDocuments';
import { useInvestorUpdates, useGenerateInvestorUpdate } from '@/hooks/useInvestorUpdates';
import { InvestorTemplateLibrary } from './InvestorTemplateLibrary';
import { DataroomChecklist } from './DataroomChecklist';
interface DataroomTabProps {
  workspaceId: string;
  canWrite?: boolean;
  isStaff?: boolean;
  isMentor?: boolean;
}

export function DataroomTab({ workspaceId, canWrite = false, isStaff = false, isMentor = false }: DataroomTabProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { confirm, dialogProps } = useConfirmDialog();
  const { data: dataroom, isLoading: loadingDataroom } = useDataroom(workspaceId);
  const { data: items, isLoading: loadingItems } = useDataroomItems(dataroom?.id);
  const { data: shareLinks } = useDataroomShareLinks(dataroom?.id);
  const { data: documents } = useDocuments(workspaceId);
  const { data: investorUpdates } = useInvestorUpdates(workspaceId);
  
  const ensureDataroom = useEnsureDataroom();
  const createItem = useCreateDataroomItem();
  const updateItem = useUpdateDataroomItem();
  const deleteItem = useDeleteDataroomItem();
  const createShareLink = useCreateShareLink();
  const revokeShareLink = useRevokeShareLink();
  const generateInvestorUpdate = useGenerateInvestorUpdate();
  
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [generateUpdateOpen, setGenerateUpdateOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [isGenerating, setIsGenerating] = useState(false);
  const [itemType, setItemType] = useState<'document' | 'investor_update' | 'link'>('document');
  const [itemForm, setItemForm] = useState({
    title: '',
    description: '',
    document_id: '',
    investor_update_id: '',
    url: '',
    visibility: 'investors' as 'investors' | 'internal',
  });
  const [linkForm, setLinkForm] = useState({
    expires_in_days: 7,
    allow_download: true,
  });
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  
  // Ensure dataroom exists
  useEffect(() => {
    if (!loadingDataroom && !dataroom && canWrite) {
      ensureDataroom.mutate(workspaceId);
    }
  }, [loadingDataroom, dataroom, workspaceId, canWrite]);
  
  const handleGenerateUpdate = async () => {
    setIsGenerating(true);
    try {
      const result = await generateInvestorUpdate.mutateAsync({ workspaceId, month: selectedMonth });
      setGenerateUpdateOpen(false);
      
      // Auto-add to dataroom if we have one
      if (dataroom?.id && result?.id) {
        await createItem.mutateAsync({
          dataroom_id: dataroom.id,
          type: 'investor_update',
          title: `Investor Update - ${format(new Date(selectedMonth + '-01'), 'MMM yyyy', { locale: dateLocale })}`,
          investor_update_id: result.id,
          visibility: 'investors',
        });
      }
      
      notify.success(
        t('investorUpdates.updateGenerated', { defaultValue: '✅ Atualização gerada com sucesso!' }),
        {
          description: t('investorUpdates.updateGeneratedDesc', { defaultValue: 'A atualização foi adicionada ao Data Room automaticamente.' }),
          duration: 5000,
        }
      );
    } catch (error: any) {
      notify.error(
        t('investorUpdates.failedToGenerate', { defaultValue: 'Falha ao gerar atualização' }),
        {
          description: error?.message || t('common.tryAgain', { defaultValue: 'Por favor tente novamente.' }),
          duration: 5000,
        }
      );
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleAddItem = async () => {
    if (!dataroom?.id) return;
    
    try {
      await createItem.mutateAsync({
        dataroom_id: dataroom.id,
        type: itemType,
        title: itemForm.title || (itemType === 'link' ? 'Link Externo' : 'Item'),
        description: itemForm.description || undefined,
        document_id: itemType === 'document' ? itemForm.document_id || undefined : undefined,
        investor_update_id: itemType === 'investor_update' ? itemForm.investor_update_id || undefined : undefined,
        url: itemType === 'link' ? itemForm.url || undefined : undefined,
        visibility: itemForm.visibility,
      });
      notify.success(t('dataroom.itemAdded'));
      setAddItemOpen(false);
      setItemForm({ title: '', description: '', document_id: '', investor_update_id: '', url: '', visibility: 'investors' });
    } catch (error: any) {
      notify.error(error.message || t('dataroom.failedToAdd'));
    }
  };
  
  const handleCreateLink = async () => {
    try {
      const result = await createShareLink.mutateAsync({
        workspace_id: workspaceId,
        expires_in_days: linkForm.expires_in_days > 0 ? linkForm.expires_in_days : undefined,
        allow_download: linkForm.allow_download,
      });
      setCreatedLink(result.url);
      notify.success(t('dataroom.linkCreated'));
    } catch (error: any) {
      notify.error(error.message || t('dataroom.failedToCreateLink'));
    }
  };
  
  const handleRevokeLink = (linkId: string) => {
    confirm({
      title: t('dataroom.revokeTitle'),
      description: t('dataroom.confirmRevoke'),
      variant: 'destructive',
      confirmLabel: t('common.confirm'),
      onConfirm: async () => {
        try {
          await revokeShareLink.mutateAsync(linkId);
          notify.success(t('dataroom.linkRevoked'));
        } catch (error: any) {
          notify.error(t('dataroom.failedToRevoke'));
        }
      },
    });
  };
  
  const handleDeleteItem = (id: string) => {
    confirm({
      title: t('dataroom.deleteTitle'),
      description: t('dataroom.confirmDelete'),
      variant: 'destructive',
      confirmLabel: t('common.delete'),
      onConfirm: async () => {
        try {
          await deleteItem.mutateAsync(id);
          notify.success(t('dataroom.itemDeleted'));
        } catch (error: any) {
          notify.error(t('dataroom.failedToDelete'));
        }
      },
    });
  };
  
  const handleToggleVisibility = async (item: any) => {
    try {
      await updateItem.mutateAsync({
        id: item.id,
        visibility: item.visibility === 'investors' ? 'internal' : 'investors',
      });
      notify.success(t('dataroom.visibilityUpdated'));
    } catch (error: any) {
      notify.error(error.message);
    }
  };
  
  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    notify.success(t('common.linkCopied'));
  };
  
  const activeLinks = shareLinks?.filter(l => !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date())) || [];
  const expiredLinks = shareLinks?.filter(l => l.revoked_at || (l.expires_at && new Date(l.expires_at) <= new Date())) || [];
  
  if (loadingDataroom || loadingItems) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
        <CardContent><div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div></CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      <Tabs defaultValue="dataroom" className="space-y-6">
      {/* Header with tabs and actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <TabsList>
          <TabsTrigger value="dataroom" className="gap-2">
            <FolderLock className="h-4 w-4" />
            {t('dataroom.title')}
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <BookTemplate className="h-4 w-4" />
            {t('investorUpdates.templateLibraryTitle', { defaultValue: 'Documentos adicionais para investidores' })}
          </TabsTrigger>
        </TabsList>
        {canWrite && (
          <div className="flex gap-2">
            <Button onClick={() => setGenerateUpdateOpen(true)} className="gap-2">
              <Sparkles className="h-4 w-4" />
              {t('investorUpdates.generateUpdate')}
            </Button>
            <Button variant="outline" onClick={() => { setAddLinkOpen(true); setCreatedLink(null); }} className="gap-2">
              <Link2 className="h-4 w-4" />
              {t('dataroom.createLink')}
            </Button>
          </div>
        )}
      </div>
      
      {/* Templates Tab */}
      <TabsContent value="templates" className="mt-6">
        <InvestorTemplateLibrary />
      </TabsContent>
      
      {/* Dataroom Tab */}
      <TabsContent value="dataroom" className="mt-6 space-y-6">
      {/* Pitch Deck Checklist */}
      <DataroomChecklist workspaceId={workspaceId} canWrite={canWrite} isStaff={isStaff} isMentor={isMentor} />
      
      {/* Dataroom Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderLock className="h-5 w-5" />
              {t('dataroom.title')}
            </CardTitle>
            <CardDescription>{t('dataroom.description')}</CardDescription>
          </div>
          {canWrite && (
            <Button onClick={() => setAddItemOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('dataroom.addItem')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!items?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderLock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('dataroom.emptyState')}</p>
              {canWrite && (
                <Button variant="outline" className="mt-4" onClick={() => setAddItemOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('dataroom.addFirstItem')}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                  {canWrite && <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />}
                  
                  <div className="flex-shrink-0">
                    {item.type === 'document' && <FileText className="h-5 w-5 text-[hsl(var(--info))]" />}
                    {item.type === 'investor_update' && <TrendingUp className="h-5 w-5 text-[hsl(var(--success))]" />}
                    {item.type === 'link' && <LinkIcon className="h-5 w-5 text-primary" />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium truncate">{item.title}</h4>
                      <Badge variant={item.visibility === 'investors' ? 'default' : 'secondary'} className="text-xs">
                        {item.visibility === 'investors' ? (
                          <><Eye className="h-3 w-3 mr-1" /> {t('dataroom.public')}</>
                        ) : (
                          <><EyeOff className="h-3 w-3 mr-1" /> {t('dataroom.internal')}</>
                        )}
                      </Badge>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground truncate">{item.description}</p>
                    )}
                    {item.document && (
                      <p className="text-xs text-muted-foreground">{item.document.name}</p>
                    )}
                    {item.investor_update && (
                      <p className="text-xs text-muted-foreground">
                        {t('dataroom.updateMonth')}: {format(new Date(item.investor_update.month), 'MMMM yyyy', { locale: getDateLocale() })}
                      </p>
                    )}
                  </div>
                  
                  {canWrite && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleToggleVisibility(item)} title={t('dataroom.toggleVisibility')} aria-label={t('common._iconHide')}>
                        {item.visibility === 'investors' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.id)} className="text-destructive" aria-label={t('common.delete')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Share Links */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              {t('dataroom.shareLinks')}
            </CardTitle>
            <CardDescription>{t('dataroom.shareLinksDesc')}</CardDescription>
          </div>
          {canWrite && (
            <Button onClick={() => { setAddLinkOpen(true); setCreatedLink(null); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t('dataroom.createLink')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {activeLinks.length === 0 && expiredLinks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('dataroom.noLinks')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeLinks.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('dataroom.activeLinks')} ({activeLinks.length})</h4>
                  <div className="space-y-2">
                    {activeLinks.map((link) => (
                      <div key={link.id} className="flex items-center gap-3 p-3 rounded-lg border bg-[hsl(var(--success))]/5 border-[hsl(var(--success))]/20">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="text-[hsl(var(--success))] border-[hsl(var(--success))]/30">
                              {t('dataroom.active')}
                            </Badge>
                            {link.allow_download && (
                              <Badge variant="secondary" className="text-xs">
                                <Download className="h-3 w-3 mr-1" /> Download
                              </Badge>
                            )}
                            <span className="text-muted-foreground">
                              <Users className="h-3 w-3 inline mr-1" />
                              {link.access_count} {t('dataroom.views')}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                            <span>{t('dataroom.created')}: {format(new Date(link.created_at), 'dd/MM/yyyy HH:mm')}</span>
                            {link.expires_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {t('dataroom.expires')}: {formatDistanceToNow(new Date(link.expires_at), { locale: getDateLocale(), addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => copyLink(`${window.location.origin}/dataroom/shared/${link.id}`)}>
                            <Copy className="h-3 w-3 mr-1" />
                            {t('common.copy')}
                          </Button>
                          {canWrite && (
                            <Button variant="outline" size="sm" onClick={() => handleRevokeLink(link.id)} className="text-destructive border-destructive/50">
                              <XCircle className="h-3 w-3 mr-1" />
                              {t('dataroom.revoke')}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {expiredLinks.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('dataroom.expiredLinks')} ({expiredLinks.length})</h4>
                  <div className="space-y-2">
                    {expiredLinks.slice(0, 5).map((link) => (
                      <div key={link.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 opacity-60">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="secondary">{link.revoked_at ? t('dataroom.revoked') : t('dataroom.expired')}</Badge>
                            <span className="text-muted-foreground text-xs">
                              {link.access_count} {t('dataroom.views')}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </TabsContent>
    </Tabs>
      
    {/* Generate Update Dialog */}
      <Dialog open={generateUpdateOpen} onOpenChange={setGenerateUpdateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('investorUpdates.generateUpdate')}</DialogTitle>
            <DialogDescription>{t('investorUpdates.generateDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('investorUpdates.selectMonth')}</Label>
              <Input 
                type="month" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateUpdateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleGenerateUpdate} disabled={isGenerating} loading={isGenerating}>
              {isGenerating ? t('common.generating') : t('investorUpdates.generate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add Item Dialog */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dataroom.addToDataroom')}</DialogTitle>
            <DialogDescription>{t('dataroom.addItemDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('dataroom.itemType')}</Label>
              <Select value={itemType} onValueChange={(v: any) => setItemType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="document">{t('dataroom.typeDocument')}</SelectItem>
                  <SelectItem value="investor_update">{t('dataroom.typeInvestorUpdate')}</SelectItem>
                  <SelectItem value="link">{t('dataroom.typeLink')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {itemType === 'document' && (
              <div className="space-y-2">
                <Label>{t('documents.selectDocument')}</Label>
                <Select value={itemForm.document_id} onValueChange={(v) => {
                  const doc = documents?.find((d: any) => d.id === v);
                  setItemForm(f => ({ ...f, document_id: v, title: doc?.name || f.title }));
                }}>
                  <SelectTrigger><SelectValue placeholder={t('documents.selectPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    {documents?.map((doc: any) => (
                      <SelectItem key={doc.id} value={doc.id}>{doc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {itemType === 'investor_update' && (
              <div className="space-y-2">
                <Label>{t('dataroom.selectUpdate')}</Label>
                <Select value={itemForm.investor_update_id} onValueChange={(v) => {
                  const update = investorUpdates?.find((u: any) => u.id === v);
                  setItemForm(f => ({ 
                    ...f, 
                    investor_update_id: v, 
                    title: update ? `Investor Update - ${format(new Date(update.month), 'MMM yyyy', { locale: dateLocale })}` : f.title 
                  }));
                }}>
                  <SelectTrigger><SelectValue placeholder={t('dataroom.selectUpdatePlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    {investorUpdates?.map((update: any) => (
                      <SelectItem key={update.id} value={update.id}>
                        {format(new Date(update.month), 'MMMM yyyy', { locale: getDateLocale() })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {itemType === 'link' && (
              <div className="space-y-2">
                <Label>URL</Label>
                <Input 
                  type="url" 
                  placeholder="https://..." 
                  value={itemForm.url} 
                  onChange={(e) => setItemForm(f => ({ ...f, url: e.target.value }))} 
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label>{t('common.title')}</Label>
              <Input 
                value={itemForm.title} 
                onChange={(e) => setItemForm(f => ({ ...f, title: e.target.value }))} 
                placeholder={t('dataroom.titlePlaceholder')}
              />
            </div>
            
            <div className="space-y-2">
              <Label>{t('common.description')} ({t('common.optional')})</Label>
              <Textarea 
                value={itemForm.description} 
                onChange={(e) => setItemForm(f => ({ ...f, description: e.target.value }))} 
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="visibility">{t('dataroom.visibleToInvestors')}</Label>
              <Switch
                id="visibility"
                checked={itemForm.visibility === 'investors'}
                onCheckedChange={(checked) => setItemForm(f => ({ ...f, visibility: checked ? 'investors' : 'internal' }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleAddItem} disabled={createItem.isPending} loading={createItem.isPending}>
              {createItem.isPending ? t('common.saving') : t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Create Link Dialog */}
      <Dialog open={addLinkOpen} onOpenChange={setAddLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dataroom.createShareLink')}</DialogTitle>
            <DialogDescription>{t('dataroom.createLinkDesc')}</DialogDescription>
          </DialogHeader>
          
          {createdLink ? (
            <div className="space-y-4">
              <div className="p-4 bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/20 rounded-lg">
                <p className="text-sm font-medium text-[hsl(var(--success))] mb-2">{t('dataroom.linkReady')}</p>
                <div className="flex gap-2">
                  <Input value={createdLink} readOnly className="font-mono text-xs" />
                  <Button onClick={() => copyLink(createdLink)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button className="w-full" variant="outline" onClick={() => window.open(createdLink, '_blank')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('dataroom.openLink')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('dataroom.expiresIn')}</Label>
                <Select 
                  value={String(linkForm.expires_in_days)} 
                  onValueChange={(v) => setLinkForm(f => ({ ...f, expires_in_days: parseInt(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t('dataroom.never')}</SelectItem>
                    <SelectItem value="1">1 {t('dataroom.day')}</SelectItem>
                    <SelectItem value="7">7 {t('dataroom.days')}</SelectItem>
                    <SelectItem value="30">30 {t('dataroom.days')}</SelectItem>
                    <SelectItem value="90">90 {t('dataroom.days')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="allow-download">{t('dataroom.allowDownload')}</Label>
                <Switch
                  id="allow-download"
                  checked={linkForm.allow_download}
                  onCheckedChange={(checked) => setLinkForm(f => ({ ...f, allow_download: checked }))}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLinkOpen(false)}>
              {createdLink ? t('common.close') : t('common.cancel')}
            </Button>
            {!createdLink && (
              <Button onClick={handleCreateLink} disabled={createShareLink.isPending} loading={createShareLink.isPending}>
                {createShareLink.isPending ? t('common.creating') : t('dataroom.createLink')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
