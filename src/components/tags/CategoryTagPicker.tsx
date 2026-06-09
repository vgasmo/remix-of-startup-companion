import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { X, Plus, Tag as TagIcon, Loader2, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

interface Tag {
  id: string;
  name: string;
  color: string | null;
  category_id: string | null;
}

interface TagCategory {
  id: string;
  name: string;
  slug: string;
}

interface CategoryTagPickerProps {
  selectedTagIds: string[];
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
  filterByCategory?: string; // Only show tags from this category
  allowCategoryFilter?: boolean; // Show category filter dropdown
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function CategoryTagPicker({
  selectedTagIds,
  onAddTag,
  onRemoveTag,
  filterByCategory,
  allowCategoryFilter = false,
  disabled = false,
  placeholder = 'Add tags...',
  className,
  size = 'md',
}: CategoryTagPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['tag-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tag_categories')
        .select('id, name, slug')
        .order('sort_order');
      if (error) throw error;
      return data as TagCategory[];
    },
  });

  // Fetch tags with category info
  const { data: allTags, isLoading } = useQuery({
    queryKey: ['tags-with-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('id, name, color, category_id')
        .order('name');
      if (error) throw error;
      return data as Tag[];
    },
  });

  // Get selected tag objects
  const selectedTags = useMemo(() => {
    if (!allTags) return [];
    return allTags.filter(t => selectedTagIds.includes(t.id));
  }, [allTags, selectedTagIds]);

  // Filter available tags
  const availableTags = useMemo(() => {
    if (!allTags) return [];
    let filtered = allTags.filter(t => !selectedTagIds.includes(t.id));
    
    // Apply category filter from prop
    if (filterByCategory) {
      filtered = filtered.filter(t => t.category_id === filterByCategory);
    }
    
    // Apply category filter from dropdown
    if (allowCategoryFilter && selectedCategory && selectedCategory !== 'all') {
      filtered = filtered.filter(t => t.category_id === selectedCategory);
    }
    
    // Apply search filter
    if (searchValue.trim()) {
      const search = searchValue.toLowerCase();
      filtered = filtered.filter(t => t.name.toLowerCase().includes(search));
    }
    
    return filtered;
  }, [allTags, selectedTagIds, filterByCategory, selectedCategory, searchValue, allowCategoryFilter]);

  // Group tags by category for display
  const groupedTags = useMemo(() => {
    if (!categories) return { uncategorized: availableTags };
    
    const groups: Record<string, Tag[]> = {};
    
    categories.forEach(cat => {
      const catTags = availableTags.filter(t => t.category_id === cat.id);
      if (catTags.length > 0) {
        groups[cat.name] = catTags;
      }
    });
    
    const uncategorized = availableTags.filter(t => !t.category_id);
    if (uncategorized.length > 0) {
      groups['Uncategorized'] = uncategorized;
    }
    
    return groups;
  }, [availableTags, categories]);

  const getTagColor = (color: string | null) => {
    if (!color) return 'bg-muted text-muted-foreground';
    const colors: Record<string, string> = {
      red: 'bg-destructive/10 text-destructive ',
      blue: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] ',
      green: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ',
      yellow: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ',
      purple: 'bg-primary/10 text-primary ',
      orange: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ',
      pink: 'bg-primary/10 text-primary ',
    };
    return colors[color] || 'bg-muted text-muted-foreground';
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Category Filter */}
      {allowCategoryFilter && categories && categories.length > 0 && (
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('admin.tags.filterByCategory', 'Filter by category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all', 'All Categories')}</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Selected Tags */}
      <div className="flex flex-wrap gap-1.5 items-center">
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
                  placeholder={t('admin.tags.searchTags', 'Search tags...')}
                  value={searchValue}
                  onValueChange={setSearchValue}
                />
                <CommandList>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : availableTags.length === 0 ? (
                    <CommandEmpty>
                      {t('admin.tags.noTagsFound', 'No tags found')}
                    </CommandEmpty>
                  ) : (
                    Object.entries(groupedTags).map(([groupName, groupTags], idx) => (
                      <CommandGroup key={groupName} heading={groupName}>
                        {groupTags.map(tag => (
                          <CommandItem
                            key={tag.id}
                            value={tag.name}
                            onSelect={() => {
                              onAddTag(tag.id);
                              setSearchValue('');
                            }}
                            className="gap-2"
                          >
                            <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{tag.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
