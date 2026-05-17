import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, FileText, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const STARTUP_TYPES = ['b2b', 'b2c', 'marketplace', 'deep_tech', 'impact', 'saas'];
const STARTUP_STAGES = ['idea', 'validation', 'early_traction', 'growth', 'scale'];
const CATEGORIES = ['guide', 'checklist', 'example', 'template'];
const humanize = (s: string) => s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

interface SupportMaterial {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  startup_type: string | null;
  startup_stage: string | null;
  tags: string[];
  content_markdown: string | null;
  status: string;
  created_at: string;
}

export function AdminSupportMaterialsManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingMaterial, setEditingMaterial] = useState<SupportMaterial | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SupportMaterial | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    startup_type: '',
    startup_stage: '',
    tags: '',
    content_markdown: '',
    status: 'approved',
  });

  // Fetch ALL materials (not just approved) for admin view
  const { data: materials, isLoading } = useQuery({
    queryKey: ['admin-support-materials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_materials')
        .select('*')
        .order('title');
      if (error) throw error;
      return data as SupportMaterial[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Omit<SupportMaterial, 'id' | 'created_at'>) => {
      const { error } = await supabase
        .from('support_materials')
        .insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-materials'] });
      queryClient.invalidateQueries({ queryKey: ['support-materials'] });
      toast.success(t('admin.materialCreated'));
      setIsCreating(false);
    },
    onError: () => toast.error(t('admin.failedToCreateMaterial')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<SupportMaterial> & { id: string }) => {
      const { error } = await supabase
        .from('support_materials')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-materials'] });
      queryClient.invalidateQueries({ queryKey: ['support-materials'] });
      toast.success(t('admin.materialUpdated'));
      setEditingMaterial(null);
    },
    onError: () => toast.error(t('admin.failedToUpdateMaterial')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('support_materials')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-materials'] });
      queryClient.invalidateQueries({ queryKey: ['support-materials'] });
      toast.success(t('admin.materialDeleted'));
      setDeleteTarget(null);
    },
    onError: () => toast.error(t('admin.failedToDeleteMaterial')),
  });

  const handleCreate = () => {
    setFormData({
      title: '',
      description: '',
      category: '',
      startup_type: '',
      startup_stage: '',
      tags: '',
      content_markdown: '',
      status: 'approved',
    });
    setIsCreating(true);
  };

  const handleEdit = (material: SupportMaterial) => {
    setFormData({
      title: material.title,
      description: material.description || '',
      category: material.category || '',
      startup_type: material.startup_type || '',
      startup_stage: material.startup_stage || '',
      tags: material.tags?.join(', ') || '',
      content_markdown: material.content_markdown || '',
      status: material.status || 'draft',
    });
    setEditingMaterial(material);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error(t('admin.titleIsRequired'));
      return;
    }

    const payload = {
      title: formData.title,
      description: formData.description || null,
      category: formData.category || null,
      startup_type: formData.startup_type || null,
      startup_stage: formData.startup_stage || null,
      tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      content_markdown: formData.content_markdown || null,
      status: formData.status,
    };

    if (editingMaterial) {
      updateMutation.mutate({ id: editingMaterial.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleStatus = (material: SupportMaterial) => {
    const newStatus = material.status === 'approved' ? 'draft' : 'approved';
    updateMutation.mutate({ id: material.id, status: newStatus });
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

  const approvedCount = materials?.filter(m => m.status === 'approved').length || 0;
  const draftCount = materials?.filter(m => m.status !== 'approved').length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('admin.supportMaterials.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('admin.supportMaterials.description')} • {approvedCount} {t('admin.supportMaterials.approved')}, {draftCount} {t('admin.supportMaterials.drafts')}
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1" />
          {t('admin.supportMaterials.newMaterial')}
        </Button>
      </div>

      {materials?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            {t('admin.supportMaterials.noMaterials')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {materials?.map(material => (
            <Card key={material.id} className="group">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm line-clamp-1">{material.title}</h4>
                      {material.status !== 'approved' && (
                        <Badge variant="outline" className="text-xs text-amber-600">{t('admin.supportMaterials.draft')}</Badge>
                      )}
                    </div>
                    {material.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {material.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {material.category && (
                        <Badge variant="secondary" className="text-xs">{material.category}</Badge>
                      )}
                      {material.startup_type && (
                        <Badge variant="outline" className="text-xs">{humanize(material.startup_type)}</Badge>
                      )}
                      {material.startup_stage && (
                        <Badge variant="outline" className="text-xs">{humanize(material.startup_stage)}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7" 
                      onClick={() => toggleStatus(material)}
                      title={material.status === 'approved' ? t('admin.supportMaterials.hideFromConsultants') : t('admin.supportMaterials.showToConsultants')}
                    >
                      {material.status === 'approved' ? (
                        <Eye className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(material)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(material)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={isCreating || !!editingMaterial} onOpenChange={(open) => {
        if (!open) {
          setIsCreating(false);
          setEditingMaterial(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMaterial ? t('common.edit') : t('admin.supportMaterials.newMaterial')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('common.title', 'Title')} *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={e => setFormData(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g., Customer Discovery Interview Guide"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">{t('common.description', 'Description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder={t('documents.descriptionPlaceholder')}
                rows={2}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('admin.supportMaterials.category')}</Label>
                <Select 
                  value={formData.category || 'none'} 
                  onValueChange={(v) => setFormData(f => ({ ...f, category: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('documents.selectCategory')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('common.none', 'None')}</SelectItem>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>{t('admin.supportMaterials.status')}</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(v) => setFormData(f => ({ ...f, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        {t('admin.supportMaterials.approvedVisible')}
                      </span>
                    </SelectItem>
                    <SelectItem value="draft">{t('admin.supportMaterials.draftHidden')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('admin.supportMaterials.startupType')}</Label>
                <Select 
                  value={formData.startup_type || 'any'} 
                  onValueChange={(v) => setFormData(f => ({ ...f, startup_type: v === 'any' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.supportMaterials.anyType')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">{t('admin.supportMaterials.anyType')}</SelectItem>
                    {STARTUP_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>{t('admin.supportMaterials.startupStage')}</Label>
                <Select 
                  value={formData.startup_stage || 'any'} 
                  onValueChange={(v) => setFormData(f => ({ ...f, startup_stage: v === 'any' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.supportMaterials.anyStage')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">{t('admin.supportMaterials.anyStage')}</SelectItem>
                    {STARTUP_STAGES.map(stage => (
                      <SelectItem key={stage} value={stage}>{humanize(stage)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="tags">{t('admin.supportMaterials.tags')}</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={e => setFormData(f => ({ ...f, tags: e.target.value }))}
                placeholder={t('admin.supportMaterials.tagsPlaceholder')}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="content">{t('admin.supportMaterials.content')}</Label>
              <Textarea
                id="content"
                value={formData.content_markdown}
                onChange={e => setFormData(f => ({ ...f, content_markdown: e.target.value }))}
                placeholder={t('admin.supportMaterials.contentPlaceholder')}
                className="font-mono text-sm"
                rows={12}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreating(false);
              setEditingMaterial(null);
            }}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingMaterial ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.supportMaterials.deleteMaterial')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.supportMaterials.deleteConfirm', { title: deleteTarget?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
