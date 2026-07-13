import { useDateLocale } from '@/lib/dateLocale';
import { memo, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, isToday } from 'date-fns';
import { Calendar, FileText, ExternalLink, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowDown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WorkspaceWithDetails, SortOption } from '@/hooks/useWorkspaces';

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function SortHeader({
  label,
  sortKey,
  sortBy,
  onSortByChange,
  className,
}: {
  label: string;
  sortKey: SortOption;
  sortBy?: SortOption;
  onSortByChange?: (v: SortOption) => void;
  className?: string;
}) {
  const active = sortBy === sortKey;
  const clickable = !!onSortByChange;
  return (
    <TableHead
      className={cn(
        'h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium',
        clickable && 'cursor-pointer select-none hover:text-foreground transition-colors',
        active && 'text-foreground',
        className,
      )}
      onClick={clickable ? () => onSortByChange!(sortKey) : undefined}
      aria-sort={active ? 'descending' : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {clickable && (active ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-50" />)}
      </span>
    </TableHead>
  );
}

interface WorkspaceTableProps {
  workspaces: WorkspaceWithDetails[];
  onRowClick: (id: string) => void;
  selectionEnabled?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  sortBy?: SortOption;
  onSortByChange?: (value: SortOption) => void;
}

export const WorkspaceTable = memo(function WorkspaceTable({
  workspaces,
  onRowClick,
  selectionEnabled = false,
  selectedIds = new Set(),
  onToggleSelect,
  sortBy,
  onSortByChange,
}: WorkspaceTableProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = useDateLocale();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const totalPages = Math.max(1, Math.ceil(workspaces.length / pageSize));
  const paginatedWorkspaces = useMemo(
    () => workspaces.slice(page * pageSize, (page + 1) * pageSize),
    [workspaces, page, pageSize],
  );

  // Reset page when data changes
  const safeSetPageSize = (size: number) => {
    setPageSize(size);
    setPage(0);
  };

  const formatMeetingDate = (dateStr: string | null) => {
    if (!dateStr) return <span className="text-muted-foreground">{t('workspaceTable.noneScheduled', { defaultValue: 'None scheduled' })}</span>;
    try {
      const date = new Date(dateStr);
      if (isToday(date)) {
        return <span className="text-primary font-medium">{t('workspaceTable.today', { defaultValue: 'Today' })}</span>;
      }
      return format(date, 'dd MMM yyyy', { locale: dateLocale });
    } catch {
      return <span className="text-muted-foreground">-</span>;
    }
  };

  const truncateNotes = (notes: string | null, maxLength = 60) => {
    if (!notes) return null;
    return notes.length > maxLength ? notes.slice(0, maxLength) + '...' : notes;
  };

  const from = workspaces.length > 0 ? page * pageSize + 1 : 0;
  const to = Math.min((page + 1) * pageSize, workspaces.length);

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
          {t('common.showingResults', { from, to, total: workspaces.length, defaultValue: `Showing ${from}-${to} of ${workspaces.length}` })}
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
      <div className="flex flex-col gap-3 md:hidden p-4">
        {paginatedWorkspaces.map((workspace) => {
          const effectiveHealth = workspace.health_score_override || workspace.health_score;
          return (
            <Card
              key={workspace.id}
              interactive
              className="cursor-pointer"
              onClick={() => onRowClick(workspace.id)}
            >
              <CardContent className="p-4 space-y-3">
                {/* Row 1: Avatar + Name */}
                <div className="flex items-center gap-3">
                  {selectionEnabled && (
                    <Checkbox
                      checked={selectedIds.has(workspace.id)}
                      onCheckedChange={() => onToggleSelect?.(workspace.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <Avatar className="h-9 w-9 rounded-lg shrink-0">
                    <AvatarImage
                      src={workspace.startup?.logo_url || undefined}
                      className="object-cover"
                      alt={workspace.startup?.name || 'Startup logo'}
                    />
                    <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                      {workspace.startup?.name?.slice(0, 2).toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{workspace.startup?.name || t('common.unnamed', { defaultValue: 'Unnamed' })}</p>
                    <Badge variant="outline" className="font-normal text-xs mt-0.5">
                      {workspace.program?.name || '-'}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={(e) => { e.stopPropagation(); onRowClick(workspace.id); }}
                    aria-label={t('workspaceTable.openWorkspace', { defaultValue: 'Open workspace' })}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>

                {/* Row 2: Priority + Health + Overdue */}
                <div className="flex items-center gap-2 flex-wrap">
                  <PriorityBadge priority={workspace.priority_level} size="sm" />
                  <HealthBadge score={effectiveHealth} />
                  {workspace.overdueActionsCount > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {workspace.overdueActionsCount} {t('workspaceTable.overdue', { defaultValue: 'overdue' })}
                    </Badge>
                  )}
                </div>

                {/* Row 3: Next meeting */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatMeetingDate(workspace.nextMeetingDate)}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {workspaces.length > pageSize && <PaginationControls />}
      </div>

      {/* ── Desktop: standard table ── */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 hidden md:block rounded-xl border border-border/70 bg-card">
        <Table className="min-w-[800px]">
          <TableHeader sticky>
            <TableRow className="hover:bg-transparent border-border/70 bg-muted/30">
              {selectionEnabled && (
                <TableHead className="w-[40px] h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  <span className="sr-only">{t('common.select', { defaultValue: 'Select' })}</span>
                </TableHead>
              )}
              <SortHeader
                className="w-[180px] sm:w-[200px]"
                label={t('workspaceTable.startup', { defaultValue: 'Startup' })}
                sortKey="name"
                sortBy={sortBy}
                onSortByChange={onSortByChange}
              />
              <TableHead className="hidden sm:table-cell h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('workspace.program', { defaultValue: 'Program' })}</TableHead>
              <SortHeader
                label={t('workspaceTable.priority', { defaultValue: 'Priority' })}
                sortKey="priority"
                sortBy={sortBy}
                onSortByChange={onSortByChange}
              />
              <SortHeader
                label={t('workspace.healthScore', { defaultValue: 'Health' })}
                sortKey="urgency"
                sortBy={sortBy}
                onSortByChange={onSortByChange}
              />
              <TableHead className="text-center h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('workspaceTable.overdue', { defaultValue: 'Overdue' })}</TableHead>
              <SortHeader
                className="hidden md:table-cell"
                label={t('workspaceTable.nextMeeting', { defaultValue: 'Next Meeting' })}
                sortKey="meeting"
                sortBy={sortBy}
                onSortByChange={onSortByChange}
              />
              <TableHead className="hidden lg:table-cell w-[200px] h-9 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('workspaceTable.lastSession', { defaultValue: 'Last Session' })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedWorkspaces.map((workspace) => {
              const effectiveHealth = workspace.health_score_override || workspace.health_score;
              const isSelected = selectedIds.has(workspace.id);

              return (
                <TableRow
                  key={workspace.id}
                  className={cn(
                    "cursor-pointer transition-colors border-border/60",
                    "hover:bg-muted/40",
                    isSelected && "bg-primary/[0.06] relative before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-primary"
                  )}
                  onClick={() => onRowClick(workspace.id)}
                >

                  {selectionEnabled && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect?.(workspace.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage
                          src={workspace.startup?.logo_url || undefined}
                          className="object-cover"
                          alt={workspace.startup?.name || 'Startup logo'}
                        />
                        <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                          {workspace.startup?.name?.slice(0, 2).toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-semibold truncate">{workspace.startup?.name || t('common.unnamed', { defaultValue: 'Unnamed' })}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRowClick(workspace.id);
                            }}
                            aria-label={t('workspaceTable.openWorkspace', { defaultValue: 'Open workspace' })}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline" className="font-normal">
                      {workspace.program?.name || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={workspace.priority_level} size="sm" />
                  </TableCell>
                  <TableCell>
                    <HealthBadge score={effectiveHealth} />
                  </TableCell>
                  <TableCell className="text-center">
                    {workspace.overdueActionsCount > 0 ? (
                      <Badge variant="destructive" className="min-w-[2rem]">
                        {workspace.overdueActionsCount}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatMeetingDate(workspace.nextMeetingDate)}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {workspace.lastSession ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 max-w-[180px]">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate text-sm">{workspace.lastSession.title}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[300px]">
                          <p className="font-medium">{workspace.lastSession.title}</p>
                          <p className="text-xs text-muted-foreground mb-1">
                            {format(new Date(workspace.lastSession.scheduled_at), 'dd MMM yyyy', { locale: dateLocale })}
                          </p>
                          {workspace.lastSession.notes && (
                            <p className="text-xs">{truncateNotes(workspace.lastSession.notes, 150)}</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground text-sm">{t('workspaceTable.noSessions', { defaultValue: 'No sessions' })}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {workspaces.length > pageSize && <PaginationControls />}
      </div>
    </>
  );
});
