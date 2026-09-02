import { timeAgo } from '@/lib/dateLocale';
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Building2, Users, ExternalLink, Calendar, AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Archive, Trash2, ShieldCheck, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { InlineConsultantSelect } from './InlineConsultantSelect';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { StageBadge } from '@/components/ui/StageBadge';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EcosystemItem } from '@/hooks/useEcosystemItems';
import { useWorkspaceTiers } from '@/hooks/useWorkspaceTiers';
import { InlineTierSelect } from './InlineTierSelect';


const PAGE_SIZE_OPTIONS = [25, 50, 100];

interface Props {
  items: EcosystemItem[];
  onOpenItem: (item: EcosystemItem) => void;
  /** Total rows available on the server (for accurate "showing x of y") */
  totalCount?: number;
  /** Server-side infinite pagination hooks */
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
}

export function EcosystemTable({ items, onOpenItem, totalCount, hasNextPage, isFetchingNextPage, fetchNextPage }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmDialog();
  const [confirmDelete, setConfirmDelete] = useState<EcosystemItem | null>(null);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  type SortKey = 'name' | 'stage' | 'health' | 'consultant' | 'updated';
  type SortDir = 'asc' | 'desc';
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortKey(null); setSortDir('asc'); }
  };
  const ariaSortFor = (key: SortKey): 'ascending' | 'descending' | 'none' =>
    sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ArrowUpDown className="h-3 w-3 opacity-50" /> :
    sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;

  const sortedItems = useMemo(() => {
    if (!sortKey) return items;
    const collator = new Intl.Collator('pt', { sensitivity: 'base' });
    const cmp = (a: EcosystemItem, b: EcosystemItem) => {
      const getVal = (it: EcosystemItem): string | number => {
        switch (sortKey) {
          case 'name': return it.name || '';
          case 'stage': return (it.stage || '') as string;
          case 'health': {
            const raw = it.health_score as unknown;
            const n = raw == null || raw === '' ? NaN : Number(raw);
            return Number.isFinite(n) ? n : -Infinity;
          }
          case 'consultant': return it.owner_name || '';
          case 'updated': return it.last_activity_at ? new Date(it.last_activity_at).getTime() : 0;
        }
      };
      const va = getVal(a); const vb = getVal(b);
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? collator.compare(va, vb) : collator.compare(vb, va);
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    };
    return [...items].sort(cmp);
  }, [items, sortKey, sortDir]);


  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const paginatedItems = useMemo(
    () => sortedItems.slice(page * pageSize, (page + 1) * pageSize),
    [sortedItems, page, pageSize],
  );

  // Bulk fetch tier assignments for the paginated workspaces
  const visibleWorkspaceIds = useMemo(
    () => paginatedItems.filter((it) => it.item_type === 'workspace' && it.workspace_id)
      .map((it) => it.workspace_id as string),
    [paginatedItems],
  );
  const { data: tierMap = {} } = useWorkspaceTiers(visibleWorkspaceIds);

  // Reset page when pageSize changes
  const safeSetPageSize = (size: number) => {
    setPageSize(size);
    setPage(0);
  };

  const handleArchiveWorkspace = async (item: EcosystemItem) => {
    if (!item.workspace_id) return;
    try {
      // Snapshot previous status for undo
      const { data: prev } = await supabase
        .from('workspaces')
        .select('status')
        .eq('id', item.workspace_id)
        .maybeSingle();
      const prevStatus = (prev?.status as string) || 'active';

      const { error } = await supabase
        .from('workspaces')
        .update({ status: 'archived' })
        .eq('id', item.workspace_id);
      if (error) throw error;
      notify.success(t('ecosystem.workspaceArchived', { defaultValue: 'Workspace arquivado' }), {
        duration: 8000,
        action: {
          label: t('common.undo', { defaultValue: 'Anular' }),
          onClick: async () => {
            try {
              const { error: restoreErr } = await supabase
                .from('workspaces')
                .update({ status: prevStatus })
                .eq('id', item.workspace_id!);
              if (restoreErr) throw restoreErr;
              notify.success(t('ecosystem.workspaceRestored', { defaultValue: 'Workspace restaurado' }));
            } catch {
              notify.error(t('common.undoFailed', { defaultValue: 'Não foi possível anular' }));
            } finally {
              queryClient.invalidateQueries({ queryKey: ['ecosystem-items-v2'] });
            }
          },
        },
      });
      queryClient.invalidateQueries({ queryKey: ['ecosystem-items-v2'] });
    } catch (err: any) {
      notify.error(t('ecosystem.archiveError', { defaultValue: 'Erro ao arquivar workspace' }), {
        description: err?.message,
      });
    }
  };

  const handleDeleteLead = async (item: EcosystemItem) => {
    if (!item.funnel_item_id) return;
    try {
      // Pre-check for blocking references (contracts have ON DELETE NO ACTION)
      const [{ count: contractCount }, { count: intakeCount }] = await Promise.all([
        supabase
          .from('startup_contracts')
          .select('id', { count: 'exact', head: true })
          .eq('funnel_item_id', item.funnel_item_id),
        supabase
          .from('contract_intakes')
          .select('id', { count: 'exact', head: true })
          .eq('funnel_item_id', item.funnel_item_id),
      ]);

      if ((contractCount || 0) > 0) {
        notify.error(
          t('ecosystem.deleteBlockedByContract', { defaultValue: 'Não é possível eliminar: existe(m) contrato(s) associado(s) a esta lead.' })
        );
        return;
      }

      // Snapshot full lead row + intake ids for undo
      const { data: snapshot } = await supabase
        .from('funnel_items')
        .select('*')
        .eq('id', item.funnel_item_id)
        .maybeSingle();

      const { data: detachedIntakes } = (intakeCount || 0) > 0
        ? await supabase
            .from('contract_intakes')
            .select('id')
            .eq('funnel_item_id', item.funnel_item_id)
        : { data: [] as { id: string }[] };

      // Detach intakes (FK is SET NULL but we make it explicit for clarity)
      if ((intakeCount || 0) > 0) {
        await supabase
          .from('contract_intakes')
          .update({ funnel_item_id: null })
          .eq('funnel_item_id', item.funnel_item_id);
      }

      const { error } = await supabase
        .from('funnel_items')
        .delete()
        .eq('id', item.funnel_item_id);
      if (error) throw error;

      let undoInFlight = false;
      notify.success(t('ecosystem.leadDeleted', { defaultValue: 'Lead eliminada' }), {
        duration: 8000,
        action: snapshot ? {
          label: t('common.undo', { defaultValue: 'Anular' }),
          onClick: async () => {
            if (undoInFlight) return;
            undoInFlight = true;
            try {
              const { error: insErr } = await supabase.from('funnel_items').insert(snapshot as any);
              if (insErr) throw insErr;
              // Re-attach any intakes we detached
              const intakeIds = (detachedIntakes || []).map((r) => r.id);
              if (intakeIds.length > 0) {
                await supabase
                  .from('contract_intakes')
                  .update({ funnel_item_id: item.funnel_item_id })
                  .in('id', intakeIds);
              }
              notify.success(t('ecosystem.leadRestored', { defaultValue: 'Lead restaurada' }));
            } catch {
              notify.error(t('common.undoFailed', { defaultValue: 'Não foi possível anular' }));
            } finally {
              queryClient.invalidateQueries({ queryKey: ['ecosystem-items-v2'] });
            }
          },
        } : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ['ecosystem-items-v2'] });
    } catch (err: any) {
      const msg = err?.message || '';
      const friendly = msg.includes('foreign key') || msg.includes('violates')
        ? t('ecosystem.deleteBlockedByReferences', { defaultValue: 'Não é possível eliminar: esta lead está associada a outros registos (contrato, sala ou histórico).' })
        : t('ecosystem.deleteLeadError', { defaultValue: 'Erro ao eliminar lead' });
      notify.error(friendly, { description: msg || undefined });
    }
  };

  // Reset page when items change significantly
  useEffect(() => {
    const safe = Math.min(page, Math.max(0, totalPages - 1));
    if (safe !== page) setPage(safe);
  }, [totalPages, page]);

  const from = items.length > 0 ? page * pageSize + 1 : 0;
  const to = Math.min((page + 1) * pageSize, items.length);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title={t('ecosystem.noItems', { defaultValue: 'No items found' })}
        description={t('ecosystem.noItemsDesc', { defaultValue: 'Try adjusting your filters or search criteria' })}
      />
    );
  }

  const PaginationControls = () => (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{t('common.rowsPerPage', { defaultValue: 'Rows per page' })}</span>
        <Select value={String(pageSize)} onValueChange={(v) => safeSetPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-sm text-muted-foreground mr-2">
          {t('common.showingResults', { from, to, total: items.length, defaultValue: `Showing ${from}-${to} of ${items.length}` })}
        </span>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(0)} aria-label={t('common.first', { defaultValue: 'First' })}>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label={t('common.previousPage', { defaultValue: 'Previous page' })}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground px-2">
          {page + 1} / {totalPages}
        </span>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} aria-label={t('common.nextPage', { defaultValue: 'Next page' })}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)} aria-label={t('common.lastPage', { defaultValue: 'Last page' })}>
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Mobile: stacked cards ── */}
      <div className="flex flex-col gap-3 md:hidden">
        {paginatedItems.map(item => (
          <Card
            key={item.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onOpenItem(item)}
          >
            <CardContent className="p-4 space-y-3">
              {/* Row 1: Name + type badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-sm truncate">{item.name || t('common.unknown', { defaultValue: 'Unknown' })}</span>
                  {item.overdue_actions_count && item.overdue_actions_count > 0 && (
                    <Badge variant="destructive" className="text-xs shrink-0">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {item.overdue_actions_count}
                    </Badge>
                  )}
                </div>
                <Badge variant={item.item_type === 'workspace' ? 'default' : 'secondary'} className="shrink-0 text-xs">
                  {item.item_type === 'workspace' 
                    ? t('ecosystem.workspace', { defaultValue: 'Workspace' }) 
                    : t('ecosystem.lead', { defaultValue: 'Lead' })}
                </Badge>
              </div>

              {/* Row 2: Stage + Health + Category */}
              <div className="flex items-center gap-2 flex-wrap">
                {item.stage && <StageBadge stage={item.stage as any} />}
                {item.health_score && <HealthBadge score={item.health_score as any} />}
                <CategoryBadge category={item.startup_category} />
                {item.program_name && (
                  <span className="text-xs text-muted-foreground">{item.program_name}</span>
                )}
              </div>

              {/* Row 3: Owner + Last Activity */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{item.owner_name || '-'}</span>
                <span>
                  {item.last_activity_at 
                    ? timeAgo(new Date(item.last_activity_at))
                    : '-'}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length > pageSize && <PaginationControls />}
      </div>

      {/* ── Desktop: standard table ── */}
      <div className="border border-border/70 rounded-xl overflow-hidden hidden md:block bg-card">
        <Table>
          <TableHeader sticky>
            <TableRow className="hover:bg-transparent border-border/70 bg-muted/30">
              <TableHead aria-sort={ariaSortFor('name')} className="w-[250px] h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium cursor-pointer select-none" onClick={() => toggleSort('name')}>
                <span className="inline-flex items-center gap-1">{t('ecosystem.name', { defaultValue: 'Name' })} <SortIcon k="name" /></span>
              </TableHead>
              <TableHead className="w-[80px] h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('ecosystem.type', { defaultValue: 'Type' })}</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('workspace.program', { defaultValue: 'Program' })}</TableHead>
              <TableHead aria-sort={ariaSortFor('stage')} className="h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium cursor-pointer select-none" onClick={() => toggleSort('stage')}>
                <span className="inline-flex items-center gap-1">{t('workspace.stage', { defaultValue: 'Stage' })} <SortIcon k="stage" /></span>
              </TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('workspace.category', { defaultValue: 'Cat.' })}</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('ecosystem.tier', { defaultValue: 'Tier' })}</TableHead>
              <TableHead aria-sort={ariaSortFor('health')} className="h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium cursor-pointer select-none" onClick={() => toggleSort('health')}>
                <span className="inline-flex items-center gap-1">{t('workspace.healthScore', { defaultValue: 'Health' })} <SortIcon k="health" /></span>
              </TableHead>
              <TableHead aria-sort={ariaSortFor('consultant')} className="h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium cursor-pointer select-none" onClick={() => toggleSort('consultant')}>
                <span className="inline-flex items-center gap-1">{t('ecosystem.owner', { defaultValue: 'Owner' })} <SortIcon k="consultant" /></span>
              </TableHead>
              <TableHead aria-sort={ariaSortFor('updated')} className="h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium cursor-pointer select-none" onClick={() => toggleSort('updated')}>
                <span className="inline-flex items-center gap-1">{t('ecosystem.lastActivity', { defaultValue: 'Last Activity' })} <SortIcon k="updated" /></span>
              </TableHead>
              <TableHead className="w-[50px] h-9"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedItems.map(item => (
              <TableRow 
                key={item.id} 
                className="cursor-pointer hover:bg-muted/40 border-border/60 transition-colors"
                onClick={() => onOpenItem(item)}
              >

                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpenItem(item); }}
                      className="text-left text-primary hover:underline focus:outline-none focus-visible:underline"
                    >
                      {item.name || t('common.unknown', { defaultValue: 'Unknown' })}
                    </button>
                    {item.has_startup_portugal_status && (
                      <Badge
                        variant="outline"
                        className="text-xs border-[hsl(var(--success))]/30 text-[hsl(var(--success))] "
                        title={t('ecosystem.startupPortugalBadge', { defaultValue: 'Estatuto Startup Portugal' })}
                      >
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        {t('ecosystem.startupPortugalShort', { defaultValue: 'SP' })}
                      </Badge>
                    )}
                    {item.overdue_actions_count && item.overdue_actions_count > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {item.overdue_actions_count}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={item.item_type === 'workspace' ? 'default' : 'secondary'}>
                    {item.item_type === 'workspace' 
                      ? t('ecosystem.workspace', { defaultValue: 'Workspace' }) 
                      : t('ecosystem.lead', { defaultValue: 'Lead' })}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {item.program_name || '-'}
                </TableCell>
                <TableCell>
                  {item.stage ? (
                    <StageBadge stage={item.stage as any} />
                  ) : '-'}
                </TableCell>
                <TableCell>
                  <CategoryBadge category={item.startup_category} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {item.item_type === 'workspace' && item.workspace_id ? (
                    <InlineTierSelect
                      workspaceId={item.workspace_id}
                      currentTier={tierMap[item.workspace_id] ?? null}
                    />
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {item.health_score ? (
                    <HealthBadge score={item.health_score as any} />
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {item.item_type === 'workspace' && item.workspace_id ? (
                    <InlineConsultantSelect
                      workspaceId={item.workspace_id}
                      currentOwnerId={item.owner_id}
                      currentOwnerName={item.owner_name || null}
                    />
                  ) : (
                    <span className="text-muted-foreground text-sm">{item.owner_name || '-'}</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {item.last_activity_at 
                    ? timeAgo(new Date(item.last_activity_at))
                    : '-'}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('common.moreActions', { defaultValue: 'More actions' })}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenItem(item); }}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {t('ecosystem.openDetail', { defaultValue: 'Open Details' })}
                      </DropdownMenuItem>
                      {item.item_type === 'workspace' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={(e) => { 
                            e.stopPropagation(); 
                            navigate(`/workspace/${item.workspace_id}?tab=agenda`);
                          }}>
                            <Calendar className="h-4 w-4 mr-2" />
                            {t('ecosystem.scheduleSession', { defaultValue: 'Schedule Session' })}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { 
                            e.stopPropagation(); 
                            navigate(`/workspace/${item.workspace_id}?tab=team`);
                          }}>
                            <Users className="h-4 w-4 mr-2" />
                            {t('ecosystem.manageTeam', { defaultValue: 'Manage Team' })}
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      {item.item_type === 'workspace' ? (
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirm({
                              title: t('ecosystem.confirmArchiveTitle'),
                              description: t('ecosystem.confirmArchiveDesc', { name: item.name }),
                              variant: 'warning',
                              confirmLabel: t('common.archive'),
                              onConfirm: () => handleArchiveWorkspace(item),
                            });
                          }}
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          {t('ecosystem.archiveWorkspace', { defaultValue: 'Arquivar Workspace' })}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(item); }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('ecosystem.deleteLead', { defaultValue: 'Eliminar Lead' })}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {items.length > pageSize && <PaginationControls />}
      </div>

      {/* Confirmation dialog for deleting leads */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ecosystem.confirmDeleteTitle', { defaultValue: 'Eliminar Lead?' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ecosystem.confirmDeleteDesc', { 
                name: confirmDelete?.name,
                defaultValue: `Tens a certeza que queres eliminar "${confirmDelete?.name}"? Esta ação não pode ser revertida.` 
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', { defaultValue: 'Cancelar' })}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) handleDeleteLead(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              {t('common.delete', { defaultValue: 'Eliminar' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ConfirmDialog {...dialogProps} />
    </>
  );
}
