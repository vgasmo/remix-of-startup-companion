import React, { useState } from 'react';
import { useSavedFilters, useSaveFilter, useDeleteSavedFilter, useSetDefaultFilter } from '@/hooks/useSavedFilters';
import { WorkspaceFilters } from '@/hooks/useWorkspaces';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Bookmark, Star, Trash2, Plus } from 'lucide-react';
import { notify } from "@/lib/notify";

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);


interface SavedFiltersDropdownProps {
  currentFilters: WorkspaceFilters;
  onApplyFilter: (filters: WorkspaceFilters) => void;
}

export function SavedFiltersDropdown({ currentFilters, onApplyFilter }: SavedFiltersDropdownProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(false);
  
  const { data: savedFilters } = useSavedFilters();
  const saveFilter = useSaveFilter();
  const deleteFilter = useDeleteSavedFilter();
  const setDefaultFilter = useSetDefaultFilter();

  const handleSave = async () => {
    if (!filterName.trim()) {
      notify.error(t('workspace.pleaseEnterAFilterName'));
      return;
    }

    try {
      await saveFilter.mutateAsync({
        name: filterName,
        filters: currentFilters,
        isDefault: setAsDefault,
      });
      notify.success(t('workspace.filterSaved'));
      setShowSaveDialog(false);
      setFilterName('');
      setSetAsDefault(false);
    } catch {
      notify.error(t('workspace.failedToSaveFilter'));
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteFilter.mutateAsync(id);
      notify.success(t('workspace.filterDeleted'));
    } catch {
      notify.error(t('workspace.failedToDeleteFilter'));
    }
  };

  const handleSetDefault = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await setDefaultFilter.mutateAsync(id);
      notify.success(t('workspace.defaultFilterUpdated'));
    } catch {
      notify.error(t('workspace.failedToSetDefault'));
    }
  };

  const hasActiveFilters = currentFilters.search || 
    currentFilters.programId !== 'all' || 
    currentFilters.stage !== 'all' || 
    currentFilters.health !== 'all' ||
    currentFilters.missingKpi ||
    currentFilters.overdueActions;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Bookmark className="h-4 w-4" />
            {t('filters.savedFilters', 'Saved Filters')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>{t('filters.savedFilters', 'Saved Filters')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {savedFilters?.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground text-center">
              {t('filters.noSavedFilters', 'No saved filters yet')}
            </div>
          ) : (
            savedFilters?.map((filter) => (
              <DropdownMenuItem
                key={filter.id}
                className="flex items-center justify-between cursor-pointer"
                onClick={() => onApplyFilter(filter.filters)}
              >
                <span className="flex items-center gap-2 truncate">
                  {filter.is_default && <Star className="h-3 w-3 text-[hsl(var(--warning))] fill-yellow-500" />}
                  {filter.name}
                </span>
                <div className="flex items-center gap-1">
                  {!filter.is_default && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e)= aria-label="Favorite"> handleSetDefault(filter.id, e)}
                     aria-label="Toggle favorite">
                      <Star className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={(e)= aria-label="Delete"> handleDelete(filter.id, e)}
                   aria-label="Delete">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </DropdownMenuItem>
            ))
          )}
          
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={!hasActiveFilters}
            onClick={() => setShowSaveDialog(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('filters.saveCurrentFilters', 'Save Current Filters')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('filters.saveFilter', 'Save Filter')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="filter-name">{t('filters.filterName', 'Filter Name')}</Label>
              <Input
                id="filter-name"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder={t('filters.filterNamePlaceholder', 'e.g., High Priority Startups')}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="set-default"
                checked={setAsDefault}
                onCheckedChange={(checked) => setSetAsDefault(checked === true)}
              />
              <Label htmlFor="set-default" className="text-sm font-normal">
                {t('filters.setAsDefault', 'Set as default filter')}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saveFilter.isPending}>
              {saveFilter.isPending ? t('common.saving', 'Saving...') : t('filters.saveFilter', 'Save Filter')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
