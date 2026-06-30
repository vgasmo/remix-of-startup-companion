import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, UserCog } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ConsultantOption {
  id: string;
  full_name: string | null;
  email?: string | null;
}

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  triggerClassName?: string;
  size?: 'sm' | 'md';
  /** Pre-loaded options (skips internal query). */
  options?: ConsultantOption[];
  /** Show a "no consultant" item to clear the assignment. */
  allowUnassign?: boolean;
  /** Stop click propagation (useful inside table rows). */
  stopPropagation?: boolean;
}

const PAGE_SIZE = 50;

export function ConsultantCombobox({
  value,
  onChange,
  disabled,
  placeholder,
  triggerClassName,
  size = 'md',
  options,
  allowUnassign = true,
  stopPropagation = false,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: fetched } = useQuery({
    queryKey: ['consultants-list'],
    queryFn: async (): Promise<ConsultantOption[]> => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'consultor']);
      if (!roles?.length) return [];
      const ids = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from('profiles_safe')
        .select('id, full_name')
        .in('id', ids);
      return (profiles || []).sort((a, b) =>
        (a.full_name || '').localeCompare(b.full_name || ''),
      );
    },
    enabled: !options,
    staleTime: 5 * 60 * 1000,
  });

  const all = options ?? fetched ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) =>
      `${c.full_name || ''} ${c.email || ''}`.toLowerCase().includes(q),
    );
  }, [all, search]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visible.length;

  const selected = all.find((c) => c.id === value);
  const label =
    selected?.full_name ||
    selected?.email ||
    placeholder ||
    t('ecosystem.assignConsultant', { defaultValue: 'Atribuir...' });

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setSearch('');
          setVisibleCount(PAGE_SIZE);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          onClick={(e) => stopPropagation && e.stopPropagation()}
          className={cn(
            'justify-between font-normal',
            size === 'sm' ? 'h-8 text-xs' : 'h-10 text-sm',
            !selected && 'text-muted-foreground',
            triggerClassName,
          )}
        >
          <span className="flex items-center gap-1 truncate">
            {!selected && <UserCog className="h-3 w-3 shrink-0" />}
            <span className="truncate">{label}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[260px] p-0"
        align="start"
        onClick={(e) => stopPropagation && e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('ownership.searchConsultant', {
              defaultValue: 'Pesquisar consultor...',
            })}
            value={search}
            onValueChange={(v) => {
              setSearch(v);
              setVisibleCount(PAGE_SIZE);
            }}
          />
          <CommandList>
            <CommandEmpty>
              {t('ownership.noConsultantFound', {
                defaultValue: 'Nenhum consultor encontrado.',
              })}
            </CommandEmpty>
            <CommandGroup>
              {allowUnassign && (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      !value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="text-muted-foreground">
                    {t('ecosystem.noConsultant', { defaultValue: 'Sem consultor' })}
                  </span>
                </CommandItem>
              )}
              {visible.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === c.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{c.full_name || c.email || c.id}</span>
                </CommandItem>
              ))}
              {hasMore && (
                <CommandItem
                  value="__more__"
                  onSelect={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  className="justify-center text-xs text-muted-foreground"
                >
                  {t('common.loadMore', {
                    defaultValue: 'Carregar mais',
                  })}{' '}
                  ({filtered.length - visible.length})
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
