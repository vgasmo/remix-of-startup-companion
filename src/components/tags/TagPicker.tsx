import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Tag as TagIcon, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useTags, useCreateTag, type Tag } from '@/hooks/useGlobalSearch';
import { cn } from '@/lib/utils';

interface TagPickerProps {
  selectedTags: Tag[];
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function TagPicker({
  selectedTags,
  onAddTag,
  onRemoveTag,
  disabled = false,
  placeholder = 'Add tags...',
  className,
  size = 'md',
}: TagPickerProps) {
  const { t } = useTranslation();
  const { data: allTags, isLoading: loadingTags } = useTags();
  const createTag = useCreateTag();
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const selectedTagIds = useMemo(() => new Set(selectedTags.map(t => t.id)), [selectedTags]);

  const availableTags = useMemo(() => {
    if (!allTags) return [];
    return allTags.filter(t => !selectedTagIds.has(t.id));
  }, [allTags, selectedTagIds]);

  const filteredTags = useMemo(() => {
    if (!searchValue.trim()) return availableTags;
    const search = searchValue.toLowerCase();
    return availableTags.filter(t => t.name.toLowerCase().includes(search));
  }, [availableTags, searchValue]);

  const canCreateNew = useMemo(() => {
    if (!searchValue.trim()) return false;
    const search = searchValue.toLowerCase().trim();
    return !allTags?.some(t => t.name.toLowerCase() === search);
  }, [searchValue, allTags]);

  const handleCreateTag = async () => {
    if (!searchValue.trim()) return;
    try {
      const newTag = await createTag.mutateAsync({ name: searchValue.trim() });
      if (newTag) {
        onAddTag(newTag.id);
        setSearchValue('');
      }
    } catch {
      // Error handled by mutation
    }
  };

  const handleSelectTag = (tagId: string) => {
    onAddTag(tagId);
    setSearchValue('');
  };

  const getTagColor = (color: string | null) => {
    if (!color) return 'bg-muted text-muted-foreground';
    // Simple color mapping
    const colors: Record<string, string> = {
      red: 'bg-destructive/10 text-destructive ',
      blue: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] ',
      green: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ',
      yellow: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ',
      purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      pink: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    };
    return colors[color] || 'bg-muted text-muted-foreground';
  };

  return (
    <div className={cn('flex flex-wrap gap-1.5 items-center', className)}>
      {/* Selected Tags */}
      {selectedTags.map(tag => (
        <Badge
          key={tag.id}
          variant="secondary"
          className={cn(
            'gap-1 pr-1',
            getTagColor(tag.color),
            size === 'sm' ? 'text-xs py-0' : ''
          )}
        >
          {tag.name}
          {!disabled && (
            <button
              type="button"
              onClick={() => onRemoveTag(tag.id)}
              className="ml-0.5 hover:bg-black/10 dark:hover:bg-white/10 rounded p-0.5"
              aria-label={`Remove ${tag.name}`}
            >
              <X className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
            </button>
          )}
        </Badge>
      ))}

      {/* Add Tag Button */}
      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 px-2 text-muted-foreground hover:text-foreground',
                size === 'sm' ? 'h-5 text-xs' : ''
              )}
            >
              <Plus className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
              <span className="ml-1">{selectedTags.length === 0 ? placeholder : 'Add'}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search or create tag..."
                value={searchValue}
                onValueChange={setSearchValue}
              />
              <CommandList>
                {loadingTags ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <CommandEmpty>
                      {canCreateNew ? (
                        <button
                          onClick={handleCreateTag}
                          className="w-full px-2 py-3 text-sm text-left hover:bg-muted flex items-center gap-2"
                          disabled={createTag.isPending}
                        >
                          {createTag.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          Create "{searchValue}"
                        </button>
                      ) : (
                        <span className="text-muted-foreground">{t('common.noResults', 'Nenhum resultado encontrado')}</span>
                      )}
                    </CommandEmpty>
                    <CommandGroup>
                      {filteredTags.map(tag => (
                        <CommandItem
                          key={tag.id}
                          value={tag.name}
                          onSelect={() => handleSelectTag(tag.id)}
                          className="gap-2"
                        >
                          <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{tag.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    {canCreateNew && filteredTags.length > 0 && (
                      <CommandGroup heading="Create new">
                        <CommandItem onSelect={handleCreateTag} className="gap-2">
                          <Plus className="h-3.5 w-3.5" />
                          Create "{searchValue}"
                        </CommandItem>
                      </CommandGroup>
                    )}
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
