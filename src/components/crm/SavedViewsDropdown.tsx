import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, Plus, Trash2, Star, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useCrmSavedViews, useSaveCrmView, useDeleteCrmView, CrmSavedView, SavedViewType } from '@/hooks/useCrmSavedViews';
import { useQueryClient } from '@tanstack/react-query';
import { deferredDelete } from '@/lib/deferredDelete';
import { notify } from "@/lib/notify";

interface SavedViewsDropdownProps {
  viewType: SavedViewType;
  currentFilters: Record<string, unknown>;
  onApplyView: (filters: Record<string, unknown>) => void;
}

export function SavedViewsDropdown({ viewType, currentFilters, onApplyView }: SavedViewsDropdownProps) {
  const { t } = useTranslation();
  const { data: views } = useCrmSavedViews(viewType);
  const saveView = useSaveCrmView();
  const deleteView = useDeleteCrmView();
  const queryClient = useQueryClient();
  const [saveDialog, setSaveDialog] = useState(false);
  const [viewName, setViewName] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const handleSave = async () => {
    if (!viewName.trim()) return;
    try {
      await saveView.mutateAsync({
        name: viewName.trim(),
        viewType,
        filters: currentFilters,
        isDefault,
      });
      notify.success(t('savedViews.saved'));
      setSaveDialog(false);
      setViewName('');
      setIsDefault(false);
    } catch {
      notify.error(t('savedViews.saveFailed'));
    }
  };

  const handleDelete = (id: string) => {
    deferredDelete<CrmSavedView>({
      queryClient,
      queryKey: ['crm-saved-views', viewType],
      itemId: id,
      deletedLabel: t('savedViews.deleted'),
      undoLabel: t('common.undo'),
      mutate: (vid) => deleteView.mutateAsync(vid),
    });
  };

  const handleApply = (view: CrmSavedView) => {
    const { _viewType, ...filters } = view.filters_json;
    onApplyView(filters);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 h-8">
            <Bookmark className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">{t('savedViews.title')}</span>
            {views && views.length > 0 && (
              <Badge variant="secondary" className="h-4 w-4 p-0 text-[10px] flex items-center justify-center rounded-full">
                {views.length}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {views && views.length > 0 ? (
            <>
              {views.map(view => (
                <DropdownMenuItem
                  key={view.id}
                  className="flex items-center justify-between"
                  onClick={() => handleApply(view)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {view.is_default && <Star className="h-3 w-3 text-[hsl(var(--warning))] flex-shrink-0" />}
                    <span className="truncate">{view.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(view.id);
                    }}
                    className="text-muted-foreground hover:text-destructive ml-2 flex-shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t('savedViews.noViews')}
            </div>
          )}
          <DropdownMenuItem onClick={() => setSaveDialog(true)}>
            <Plus className="h-3.5 w-3.5 mr-2" />
            {t('savedViews.saveCurrentView')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveDialog} onOpenChange={setSaveDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('savedViews.saveView')}</DialogTitle>
            <DialogDescription>
              {t('savedViews.saveDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t('savedViews.viewName')}</Label>
              <Input
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder={t('savedViews.namePlaceholder')}
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} id="default-view" />
              <Label htmlFor="default-view" className="text-sm">
                {t('savedViews.setAsDefault')}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={!viewName.trim() || saveView.isPending} loading={saveView.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
