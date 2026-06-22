import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Tag, FolderOpen, Loader2, GripVertical } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from "@/lib/notify";

interface TagCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
}

interface Tag {
  id: string;
  name: string;
  color: string | null;
  category_id: string | null;
  category?: { name: string; slug: string } | null;
}

const COLOR_OPTIONS = [
  { value: 'blue', label: 'Blue', class: 'bg-[hsl(var(--info))]' },
  { value: 'green', label: 'Green', class: 'bg-[hsl(var(--success))]' },
  { value: 'red', label: 'Red', class: 'bg-destructive' },
  { value: 'yellow', label: 'Yellow', class: 'bg-[hsl(var(--warning))]' },
  { value: 'purple', label: 'Purple', class: 'bg-primary/10' },
  { value: 'orange', label: 'Orange', class: 'bg-[hsl(var(--warning))]/10' },
  { value: 'pink', label: 'Pink', class: 'bg-primary/10' },
];

export function AdminTagCategoriesManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TagCategory | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ type: 'category' | 'tag'; id: string; name: string } | null>(null);

  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', color: '' });
  const [tagForm, setTagForm] = useState({ name: '', color: '', category_id: '' });

  // Fetch categories
  const { data: categories, isLoading: loadingCategories } = useQuery({
    queryKey: ['tag-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tag_categories')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data as TagCategory[];
    },
  });

  // Fetch tags with categories
  const { data: tags, isLoading: loadingTags } = useQuery({
    queryKey: ['tags-with-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('*, category:tag_categories(name, slug)')
        .order('name');
      if (error) throw error;
      return data as Tag[];
    },
  });

  // Create/update category
  const saveCategory = useMutation({
    mutationFn: async (data: { id?: string; name: string; description: string; color: string }) => {
      const slug = data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      if (data.id) {
        const { error } = await supabase
          .from('tag_categories')
          .update({ name: data.name, slug, description: data.description || null, color: data.color || null })
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const maxOrder = categories?.reduce((max, c) => Math.max(max, c.sort_order), 0) || 0;
        const { error } = await supabase
          .from('tag_categories')
          .insert({ name: data.name, slug, description: data.description || null, color: data.color || null, sort_order: maxOrder + 1 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tag-categories'] });
      notify.success(editingCategory ? t('admin.tags.categoryUpdated') : t('admin.tags.categoryCreated'));
      closeCategoryDialog();
    },
    onError: () => {
      notify.error(t('common.error'));
    },
  });

  // Create/update tag
  const saveTag = useMutation({
    mutationFn: async (data: { id?: string; name: string; color: string; category_id: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from('tags')
          .update({ name: data.name, color: data.color || null, category_id: data.category_id || null })
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tags')
          .insert({ name: data.name, color: data.color || null, category_id: data.category_id || null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags-with-categories'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      notify.success(editingTag ? t('admin.tags.tagUpdated') : t('admin.tags.tagCreated'));
      closeTagDialog();
    },
    onError: () => {
      notify.error(t('common.error'));
    },
  });

  // Delete item
  const deleteItem = useMutation({
    mutationFn: async ({ type, id }: { type: 'category' | 'tag'; id: string }) => {
      if (type === 'category') {
        // First remove category from tags
        await supabase.from('tags').update({ category_id: null }).eq('category_id', id);
        const { error } = await supabase.from('tag_categories').delete().eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tags').delete().eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tag-categories'] });
      queryClient.invalidateQueries({ queryKey: ['tags-with-categories'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      notify.success(t('common.deleted'));
      setDeleteDialogOpen(false);
      setDeletingItem(null);
    },
    onError: () => {
      notify.error(t('common.error'));
    },
  });

  const openCategoryDialog = (category?: TagCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({ name: category.name, description: category.description || '', color: category.color || '' });
    } else {
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '', color: '' });
    }
    setCategoryDialogOpen(true);
  };

  const closeCategoryDialog = () => {
    setCategoryDialogOpen(false);
    setEditingCategory(null);
    setCategoryForm({ name: '', description: '', color: '' });
  };

  const openTagDialog = (tag?: Tag) => {
    if (tag) {
      setEditingTag(tag);
      setTagForm({ name: tag.name, color: tag.color || '', category_id: tag.category_id || '' });
    } else {
      setEditingTag(null);
      setTagForm({ name: '', color: '', category_id: '' });
    }
    setTagDialogOpen(true);
  };

  const closeTagDialog = () => {
    setTagDialogOpen(false);
    setEditingTag(null);
    setTagForm({ name: '', color: '', category_id: '' });
  };

  const openDeleteDialog = (type: 'category' | 'tag', id: string, name: string) => {
    setDeletingItem({ type, id, name });
    setDeleteDialogOpen(true);
  };

  const getColorBadge = (color: string | null) => {
    if (!color) return null;
    const colorOpt = COLOR_OPTIONS.find(c => c.value === color);
    return <span className={`inline-block h-3 w-3 rounded-full ${colorOpt?.class || 'bg-muted'}`} />;
  };

  const isLoading = loadingCategories || loadingTags;

  return (
    <div className="space-y-6">
      {/* Categories Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              {t('admin.tags.categories', 'Tag Categories')}
            </CardTitle>
            <CardDescription>
              {t('admin.tags.categoriesDesc', 'Organize tags into categories for better filtering')}
            </CardDescription>
          </div>
          <Button onClick={() => openCategoryDialog()} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {t('admin.tags.addCategory', 'Add Category')}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ContentSkeleton type="list" count={3} />
          ) : !categories?.length ? (
            <EmptyState
              icon={FolderOpen}
              title={t('admin.tags.noCategories', 'No categories yet')}
              description={t('admin.tags.noCategoriesDesc', 'Create categories to organize your tags')}
              action={{ label: t('admin.tags.addCategory', 'Add Category'), onClick: () => openCategoryDialog() }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.description')}</TableHead>
                  <TableHead>{t('admin.tags.tagCount', 'Tags')}</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(cat => (
                  <TableRow key={cat.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getColorBadge(cat.color)}
                        <span className="font-medium">{cat.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {cat.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {tags?.filter(t => t.category_id === cat.id).length || 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={()=> openCategoryDialog(cat)} aria-label={t('common.edit')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={()=> openDeleteDialog('category', cat.id, cat.name)} aria-label={t('common.delete')}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tags Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              {t('admin.tags.allTags', 'All Tags')}
            </CardTitle>
            <CardDescription>
              {t('admin.tags.allTagsDesc', 'Manage tags and assign them to categories')}
            </CardDescription>
          </div>
          <Button onClick={() => openTagDialog()} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {t('admin.tags.addTag', 'Add Tag')}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ContentSkeleton type="list" count={5} />
          ) : !tags?.length ? (
            <EmptyState
              icon={Tag}
              title={t('admin.tags.noTags', 'No tags yet')}
              description={t('admin.tags.noTagsDesc', 'Create tags to organize workspaces and content')}
              action={{ label: t('admin.tags.addTag', 'Add Tag'), onClick: () => openTagDialog() }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('admin.tags.category', 'Category')}</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map(tag => (
                  <TableRow key={tag.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getColorBadge(tag.color)}
                        <span className="font-medium">{tag.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {tag.category ? (
                        <Badge variant="outline">{tag.category.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={()=> openTagDialog(tag)} aria-label={t('common.edit')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={()=> openDeleteDialog('tag', tag.id, tag.name)} aria-label={t('common.delete')}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? t('admin.tags.editCategory', 'Edit Category') : t('admin.tags.addCategory', 'Add Category')}
            </DialogTitle>
            <DialogDescription>
              {t('admin.tags.categoryDialogDesc', 'Categories help organize tags for easier filtering')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('common.name')}</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('admin.tags.categoryNamePlaceholder', 'e.g. Industry, Technology')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('common.description')}</Label>
              <Input
                value={categoryForm.description}
                onChange={(e) => setCategoryForm(f => ({ ...f, description: e.target.value }))}
                placeholder={t('admin.tags.categoryDescPlaceholder', 'Optional description')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('common.color')}</Label>
              <Select value={categoryForm.color || '__none__'} onValueChange={(v) => setCategoryForm(f => ({ ...f, color: v === '__none__' ? '' : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.tags.selectColor', 'Select color')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {COLOR_OPTIONS.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${c.class}`} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCategoryDialog}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={() => saveCategory.mutate({ id: editingCategory?.id, ...categoryForm })}
              disabled={!categoryForm.name.trim() || saveCategory.isPending}
            >
              {saveCategory.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tag Dialog */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTag ? t('admin.tags.editTag', 'Edit Tag') : t('admin.tags.addTag', 'Add Tag')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('common.name')}</Label>
              <Input
                value={tagForm.name}
                onChange={(e) => setTagForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('admin.tags.tagNamePlaceholder', 'e.g. SaaS, B2B')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('admin.tags.category', 'Category')}</Label>
              <Select value={tagForm.category_id || '__none__'} onValueChange={(v) => setTagForm(f => ({ ...f, category_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.tags.selectCategory', 'Select category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {categories?.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('common.color')}</Label>
              <Select value={tagForm.color || '__none__'} onValueChange={(v) => setTagForm(f => ({ ...f, color: v === '__none__' ? '' : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.tags.selectColor', 'Select color')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {COLOR_OPTIONS.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${c.class}`} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeTagDialog}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={() => saveTag.mutate({ id: editingTag?.id, ...tagForm })}
              disabled={!tagForm.name.trim() || saveTag.isPending}
            >
              {saveTag.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingItem?.type === 'category' 
                ? t('admin.tags.deleteCategoryWarning', 'This will remove the category from all associated tags. The tags themselves will not be deleted.')
                : t('admin.tags.deleteTagWarning', 'This will remove the tag from all workspaces.')}
              <br /><br />
              <strong>{deletingItem?.name}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingItem && deleteItem.mutate(deletingItem)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
