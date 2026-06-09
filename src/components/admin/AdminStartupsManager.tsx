import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Pencil, Trash2, Download, Search, Phone, CheckCircle, Upload, FileText, Loader2, AlertTriangle, Mail, Send, Archive, ArchiveRestore } from 'lucide-react';
import { notify } from "@/lib/notify";
import { startupSchema } from '@/lib/validations';
import { logger } from '@/lib/logger';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

interface FormState {
  name: string;
  description: string;
  website: string;
  nif: string;
  main_contact_name: string;
  main_contact_email: string;
  main_contact_phone: string;
  has_startup_portugal_status: boolean;
  startup_portugal_document_path: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  website: '',
  nif: '',
  main_contact_name: '',
  main_contact_email: '',
  main_contact_phone: '',
  has_startup_portugal_status: false,
  startup_portugal_document_path: '',
};

export function AdminStartupsManager() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStartup, setEditingStartup] = useState<{ id: string } | null>(null);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [sendingInviteFor, setSendingInviteFor] = useState<string | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const { confirm, dialogProps } = useConfirmDialog();
  
  // Bulk selection state
  const [selectedStartups, setSelectedStartups] = useState<Set<string>>(new Set());
  const [isBulkStageOpen, setIsBulkStageOpen] = useState(false);
  const [bulkStage, setBulkStage] = useState<string>('');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const { data: startups, isLoading } = useQuery({
    queryKey: ['admin-startups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('startups')
        .select(`
          *,
          workspaces!workspaces_startup_id_fkey(
            id,
            stage,
            status,
            program:programs(name)
          )
        `)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<FormState> & { name: string }) => {
      const { error } = await supabase.from('startups').insert([{
        name: data.name,
        description: data.description || null,
        website: data.website || null,
        nif: data.nif || null,
        main_contact_name: data.main_contact_name || null,
        main_contact_email: data.main_contact_email || null,
        main_contact_phone: data.main_contact_phone || null,
        has_startup_portugal_status: data.has_startup_portugal_status || false,
        startup_portugal_document_path: data.startup_portugal_document_path || null,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-startups'] });
      notify.success(t('admin.startupsManager.startupCreated'));
      resetForm();
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<FormState>) => {
      const { error } = await supabase.from('startups').update({
        name: data.name,
        description: data.description || null,
        website: data.website || null,
        nif: data.nif || null,
        main_contact_name: data.main_contact_name || null,
        main_contact_email: data.main_contact_email || null,
        main_contact_phone: data.main_contact_phone || null,
        has_startup_portugal_status: data.has_startup_portugal_status || false,
        startup_portugal_document_path: data.startup_portugal_document_path || null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-startups'] });
      notify.success(t('admin.startupsManager.startupUpdated'));
      resetForm();
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  // Soft-archive mutation (default destructive action). Restorable via undo toast or
  // by toggling "show archived" and clicking restore on the row.
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('startups')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: userRes.user?.id ?? null,
        })
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['admin-startups'] });
      notify.success(t('admin.startupsManager.startupArchived'), {
        duration: 8000,
        action: {
          label: t('common.undo'),
          onClick: () => restoreMutation.mutate(id),
        },
      });
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('startups')
        .update({ archived_at: null, archived_by: null, archived_reason: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-startups'] });
      notify.success(t('admin.startupsManager.startupRestored'));
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  // Permanent delete remains available but is gated behind an explicit confirm
  // and only offered for already-archived startups.
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('startups').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-startups'] });
      notify.success(t('admin.startupsManager.startupDeleted'));
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingStartup(null);
    setValidationErrors({});
    setIsDialogOpen(false);
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>, startupId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      notify.error(t('admin.startupsManager.invalidFileType'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify.error(t('admin.startupsManager.fileTooLarge'));
      return;
    }

    setIsUploadingDoc(true);
    try {
      const targetId = startupId || editingStartup?.id || 'new';
      const fileExt = file.name.split('.').pop();
      const filePath = `${targetId}/startup-portugal-doc.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('startup-documents')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('startup-documents')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, startup_portugal_document_path: publicUrl }));
      notify.success(t('admin.startupsManager.documentUploaded'));
    } catch (error: any) {
      notify.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setIsUploadingDoc(false);
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors({});

    // Validate Startup Portugal document requirement
    if (formData.has_startup_portugal_status && !formData.startup_portugal_document_path) {
      notify.error(t('admin.startupsManager.documentRequired'));
      return;
    }

    const parseResult = startupSchema.safeParse({ name: formData.name, description: formData.description, website: formData.website });
    
    if (!parseResult.success) {
      const errors: Record<string, string> = {};
      parseResult.error.errors.forEach(err => {
        if (err.path[0]) {
          errors[err.path[0].toString()] = err.message;
        }
      });
      setValidationErrors(errors);
      notify.error(parseResult.error.errors[0]?.message || 'Validation error');
      return;
    }

    if (editingStartup) {
      updateMutation.mutate({ id: editingStartup.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const openEdit = (startup: any) => {
    setEditingStartup({ id: startup.id });
    setFormData({
      name: startup.name || '',
      description: startup.description || '',
      website: startup.website || '',
      nif: startup.nif || '',
      main_contact_name: startup.main_contact_name || '',
      main_contact_email: startup.main_contact_email || '',
      main_contact_phone: startup.main_contact_phone || '',
      has_startup_portugal_status: startup.has_startup_portugal_status || false,
      startup_portugal_document_path: startup.startup_portugal_document_path || '',
    });
    setIsDialogOpen(true);
  };

  // Filter startups
  const filteredStartups = startups?.filter(startup => {
    const matchesSearch = !search || 
      startup.name.toLowerCase().includes(search.toLowerCase()) ||
      startup.nif?.toLowerCase().includes(search.toLowerCase()) ||
      startup.main_contact_name?.toLowerCase().includes(search.toLowerCase());
    
    const workspaceStage = startup.workspaces?.[0]?.stage;
    const matchesStage = stageFilter === 'all' || !stageFilter || workspaceStage === stageFilter;
    
    const isArchived = !!(startup as any).archived_at;
    const matchesArchived = showArchived ? isArchived : !isArchived;

    return matchesSearch && matchesStage && matchesArchived;
  });

  // Export to CSV
  const handleExport = () => {
    if (!filteredStartups?.length) {
      notify.error(t('admin.startupsManager.noDataToExport'));
      return;
    }

    const headers = [t('admin.startupsManager.name'), t('admin.startupsManager.nif'), t('admin.startupsManager.mainContact'), t('admin.startupsManager.contactEmail'), t('admin.startupsManager.contactPhone'), t('admin.startupsManager.stage'), 'Program', t('admin.startupsManager.website'), t('admin.startupsManager.legallyRecognized'), t('admin.startupsManager.description')];
    const rows = filteredStartups.map(s => {
      const workspace = s.workspaces?.[0];
      return [
        s.name,
        s.nif || '',
        s.main_contact_name || '',
        s.main_contact_email || '',
        s.main_contact_phone || '',
        workspace?.stage || '',
        (workspace?.program as any)?.name || '',
        s.website || '',
        s.has_startup_portugal_status ? 'Yes' : 'No',
        s.description?.replace(/"/g, '""') || '',
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `startups-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    notify.success(t('admin.startupsManager.exported', { count: filteredStartups.length }));
  };

  const uniqueStages = [...new Set(startups?.flatMap(s => s.workspaces?.map(w => w.stage) || []).filter(Boolean))];

  const handleSendInvite = async (startup: any) => {
    if (!startup.main_contact_email) {
      notify.error(t('admin.startupsManager.noEmailForInvite'));
      return;
    }
    
    const workspace = startup.workspaces?.[0];
    if (!workspace?.id) {
      notify.error(t('admin.startupsManager.noWorkspaceForInvite'));
      return;
    }

    setSendingInviteFor(startup.id);
    try {
      const { error } = await supabase.functions.invoke('send-workspace-invite', {
        body: {
          workspaceId: workspace.id,
          email: startup.main_contact_email,
          role: 'founder',
        },
      });

      if (error) throw error;
      notify.success(t('invite.sentTo') + ' ' + startup.main_contact_email);
    } catch (err: any) {
      logger.error('Failed to send invite', {}, err);
      notify.error(t('invite.error'));
    } finally {
      setSendingInviteFor(null);
    }
  };

  // Bulk stage update handler
  const handleBulkStageUpdate = async () => {
    if (!bulkStage || selectedStartups.size === 0) return;
    
    setIsBulkProcessing(true);
    try {
      const workspaceIds = filteredStartups
        ?.filter(s => selectedStartups.has(s.id) && s.workspaces?.[0]?.id)
        .map(s => s.workspaces![0].id) || [];
      
      for (const workspaceId of workspaceIds) {
        await supabase
          .from('workspaces')
          .update({ stage: bulkStage as 'ideation' | 'validation' | 'mvp' | 'growth' | 'scale' })
          .eq('id', workspaceId);
      }
      
      notify.success(t('admin.stageUpdateSuccess', { count: workspaceIds.length, stage: bulkStage, defaultValue: `${workspaceIds.length} workspaces atualizados para ${bulkStage}` }));
      setSelectedStartups(new Set());
      setBulkStage('');
      setIsBulkStageOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-startups'] });
    } catch (err: any) {
      notify.error(t('admin.stageUpdateFailed', 'Erro ao atualizar estágios'));
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const toggleStartupSelection = (id: string) => {
    const newSet = new Set(selectedStartups);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedStartups(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedStartups.size === filteredStartups?.length) {
      setSelectedStartups(new Set());
    } else {
      setSelectedStartups(new Set(filteredStartups?.map(s => s.id) || []));
    }
  };

  const stages = ['ideation', 'validation', 'mvp', 'growth', 'scale'];

  return (
    <>
    <ConfirmDialog {...dialogProps} />
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
        <CardTitle>{t('admin.startupsManager.title')}</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('admin.startupsManager.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-48"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder={t('admin.startupsManager.allStages')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.startupsManager.allStages')}</SelectItem>
              {uniqueStages.map(stage => (
                <SelectItem key={stage} value={stage}>{stage}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={showArchived ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowArchived(v => !v)}
          >
            <Archive className="h-4 w-4 mr-2" />
            {showArchived ? t('admin.startupsManager.viewActive') : t('admin.startupsManager.viewArchived')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            {t('admin.startupsManager.exportCsv')}
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" />{t('admin.startupsManager.addStartup')}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingStartup ? t('admin.startupsManager.editStartup') : t('admin.startupsManager.createStartup')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="name">{t('admin.startupsManager.name')} *</Label>
                    <Input 
                      id="name" 
                      value={formData.name} 
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                      maxLength={100}
                      required 
                    />
                    {validationErrors.name && (
                      <p className="text-sm text-destructive mt-1">{validationErrors.name}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="nif">{t('admin.startupsManager.taxId')}</Label>
                    <Input 
                      id="nif" 
                      value={formData.nif} 
                      onChange={(e) => setFormData({ ...formData, nif: e.target.value })} 
                      placeholder="PT123456789"
                      maxLength={20}
                    />
                  </div>
                  
                  <div className="col-span-2 space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="has_startup_portugal_status" 
                        checked={formData.has_startup_portugal_status} 
                        onCheckedChange={(checked) => setFormData({ ...formData, has_startup_portugal_status: !!checked })} 
                      />
                      <Label htmlFor="has_startup_portugal_status" className="cursor-pointer text-sm">
                        {t('admin.startupsManager.startupPortugalStatus')}
                      </Label>
                    </div>

                    {/* Document upload for Startup Portugal certification */}
                    {formData.has_startup_portugal_status && (
                      <div className="ml-6 p-3 rounded-lg border bg-muted/30 space-y-2">
                        <Label className="text-sm flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {t('admin.startupsManager.certificationDocument')} *
                        </Label>
                        
                        {formData.startup_portugal_document_path ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[hsl(var(--success))] border-[hsl(var(--success))]/30">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {t('admin.startupsManager.documentAttached')}
                            </Badge>
                            <a 
                              href={formData.startup_portugal_document_path} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              {t('admin.startupsManager.viewDocument')}
                            </a>
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setFormData({ ...formData, startup_portugal_document_path: '' })}
                            >
                              {t('common.remove')}
                            </Button>
                          </div>
                        ) : (
                          <div>
                            <input
                              ref={docInputRef}
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg"
                              onChange={(e) => handleDocumentUpload(e)}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => docInputRef.current?.click()}
                              disabled={isUploadingDoc}
                            >
                              {isUploadingDoc ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4 mr-2" />
                              )}
                              {isUploadingDoc ? t('common.loading') : t('admin.startupsManager.uploadDocument')}
                            </Button>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('admin.startupsManager.acceptedFormats')}
                            </p>
                          </div>
                        )}

                        {formData.has_startup_portugal_status && !formData.startup_portugal_document_path && (
                          <Alert variant="destructive" className="py-2">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                              {t('admin.startupsManager.documentRequiredWarning')}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {t('admin.startupsManager.mainContact')}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label htmlFor="main_contact_name">{t('admin.startupsManager.contactName')}</Label>
                      <Input 
                        id="main_contact_name" 
                        value={formData.main_contact_name} 
                        onChange={(e) => setFormData({ ...formData, main_contact_name: e.target.value })} 
                        placeholder="João Silva"
                      />
                    </div>
                    <div>
                      <Label htmlFor="main_contact_email">{t('admin.startupsManager.contactEmail')}</Label>
                      <Input 
                        id="main_contact_email" 
                        type="email"
                        value={formData.main_contact_email} 
                        onChange={(e) => setFormData({ ...formData, main_contact_email: e.target.value })} 
                        placeholder="joao@startup.pt"
                      />
                    </div>
                    <div>
                      <Label htmlFor="main_contact_phone">{t('admin.startupsManager.contactPhone')}</Label>
                      <Input 
                        id="main_contact_phone" 
                        value={formData.main_contact_phone} 
                        onChange={(e) => setFormData({ ...formData, main_contact_phone: e.target.value })} 
                        placeholder="+351 912 345 678"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <Label htmlFor="website">{t('admin.startupsManager.website')}</Label>
                  <Input 
                    id="website" 
                    value={formData.website} 
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })} 
                    placeholder="https://..." 
                  />
                  {validationErrors.website && (
                    <p className="text-sm text-destructive mt-1">{validationErrors.website}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="description">{t('admin.startupsManager.description')}</Label>
                  <Textarea 
                    id="description" 
                    value={formData.description} 
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                    maxLength={2000}
                    rows={3}
                  />
                  {validationErrors.description && (
                    <p className="text-sm text-destructive mt-1">{validationErrors.description}</p>
                  )}
                </div>

                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="w-full">{editingStartup ? t('admin.startupsManager.update') : t('admin.startupsManager.create')}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">{t('admin.startupsManager.loading')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.startupsManager.name')}</TableHead>
                <TableHead>{t('admin.startupsManager.nif')}</TableHead>
                <TableHead>{t('admin.startupsManager.mainContact')}</TableHead>
                <TableHead>{t('admin.startupsManager.stage')}</TableHead>
                <TableHead>{t('admin.startupsManager.status')}</TableHead>
                <TableHead>{t('admin.startupsManager.startupPortugal', { defaultValue: 'Startup Portugal' })}</TableHead>
                <TableHead className="w-24">{t('admin.startupsManager.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStartups?.map((startup) => {
                const workspace = startup.workspaces?.[0];
                return (
                  <TableRow key={startup.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {workspace?.id ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/workspace/${workspace.id}`)}
                            className="font-medium text-left text-primary hover:underline focus:outline-none focus-visible:underline"
                          >
                            {startup.name}
                          </button>
                        ) : (
                          <span className="font-medium">{startup.name}</span>
                        )}
                        {startup.has_startup_portugal_status && (
                          <Badge variant="outline" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1 text-[hsl(var(--success))]" />
                            {t('admin.startupsManager.startupPortugal')}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{startup.nif || '-'}</TableCell>
                    <TableCell>
                      {startup.main_contact_name ? (
                        <div className="text-sm">
                          <div>{startup.main_contact_name}</div>
                          {startup.main_contact_email && (
                            <div className="text-muted-foreground text-xs">{startup.main_contact_email}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {workspace?.stage ? (
                        <Badge variant="secondary">{workspace.stage}</Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {workspace?.status ? (
                        <Badge variant={workspace.status === 'active' ? 'default' : 'outline'}>
                          {workspace.status}
                        </Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {startup.has_startup_portugal_status ? (
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-xs border-[hsl(var(--success))]/30 text-[hsl(var(--success))] "
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {t('admin.startupsManager.certified', { defaultValue: 'Certificada' })}
                          </Badge>
                          {startup.startup_portugal_document_path && (
                            <a
                              href={startup.startup_portugal_document_path}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                              title={t('admin.startupsManager.viewCertification', { defaultValue: 'Ver documento de certificação' })}
                            >
                              <FileText className="h-3 w-3" />
                              PDF
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(startup)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {startup.main_contact_email && workspace?.id && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleSendInvite(startup)}
                                  disabled={sendingInviteFor === startup.id}
                                >
                                  {sendingInviteFor === startup.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Mail className="h-4 w-4 text-primary" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t('admin.startupsManager.inviteFounder')}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {(startup as any).archived_at ? (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => restoreMutation.mutate(startup.id)}
                                    disabled={restoreMutation.isPending}
                                  >
                                    <ArchiveRestore className="h-4 w-4 text-primary" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('admin.startupsManager.restore')}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => confirm({
                                      title: t('admin.startupsManager.deleteForever'),
                                      description: t('admin.startupsManager.deleteForeverConfirm', { name: startup.name }),
                                      variant: 'destructive',
                                      confirmLabel: t('admin.startupsManager.deleteForever'),
                                      onConfirm: () => deleteMutation.mutate(startup.id),
                                    })}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('admin.startupsManager.deleteForever')}</TooltipContent>
                              </Tooltip>
                            </>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => archiveMutation.mutate(startup.id)}
                                  disabled={archiveMutation.isPending}
                                >
                                  <Archive className="h-4 w-4 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('admin.startupsManager.archive')}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredStartups?.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{t('admin.startupsManager.noStartups')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
    </>
  );
}
