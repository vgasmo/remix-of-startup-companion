/**
 * Space Operations Console — Unified view of Building → Room → Allocation → Workspace → Contract
 */
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Building2, Search, AlertTriangle, CheckCircle2, XCircle, Link2Off,
  FileText, User, MapPin, DoorOpen, ArrowRight, Eye, Filter, Package,
  Clock, AlertCircle, Copy, Info
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { notify } from "@/lib/notify";

interface UnifiedRecord {
  room_id: string;
  room_name: string;
  room_number: string | null;
  room_status: string;
  room_type: string;
  floor: string | null;
  building_name: string | null;
  building_id: string | null;
  space_name: string | null;
  // Allocation
  allocation_id: string | null;
  allocation_type: string | null;
  allocation_start: string | null;
  allocation_end: string | null;
  // Workspace
  workspace_id: string | null;
  workspace_status: string | null;
  startup_name: string | null;
  startup_contact_email: string | null;
  // Contract
  contract_id: string | null;
  contract_status: string | null;
  contract_start: string | null;
  contract_end: string | null;
  contract_monthly_fee: number | null;
  incubation_type_name: string | null;
  // Warnings
  warnings: string[];
}

function useSpaceOperationsData() {
  return useQuery({
    queryKey: ['space-operations-console'],
    queryFn: async (): Promise<UnifiedRecord[]> => {
      const today = new Date().toISOString().split('T')[0];

      // Fetch rooms with space/building info
      const { data: rooms } = await supabase
        .from('rooms')
        .select('id, name, room_number, floor, room_type, status, space_id, space:office_spaces(id, name)')
        .order('name');

      // Fetch current allocations
      const { data: allocations } = await supabase
        .from('room_allocations')
        .select(`
          id, room_id, workspace_id, funnel_item_id, allocation_type, start_date, end_date,
          workspace:workspaces(id, status, startup_id, startups(name, main_contact_email)),
          funnel_item:funnel_items(id, organization_name, contact_name)
        `)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`);

      // Fetch active contracts mapped to workspaces
      const { data: contracts } = await supabase
        .from('startup_contracts')
        .select(`
          id, workspace_id, status, start_date, end_date, monthly_fee,
          incubation_type:incubation_types(name),
          building:buildings(id, name)
        `)
        .in('status', ['active', 'pending_signature', 'draft']);

      // Fetch buildings
      const { data: buildings } = await supabase
        .from('buildings')
        .select('id, name');

      // Build maps
      const allocMap = new Map<string, any>();
      (allocations || []).forEach(a => allocMap.set(a.room_id, a));

      const contractMap = new Map<string, any>();
      (contracts || []).forEach(c => {
        if (c.workspace_id) contractMap.set(c.workspace_id, c);
      });

      // For buildings, we'll infer from contract building_id or space
      const buildingMap = new Map<string, string>();
      (buildings || []).forEach(b => buildingMap.set(b.id, b.name));

      return (rooms || []).map(room => {
        const alloc = allocMap.get(room.id);
        const ws = alloc?.workspace;
        const startup = ws?.startups;
        const contract = ws?.id ? contractMap.get(ws.id) : null;
        const funnelItem = alloc?.funnel_item;

        const warnings: string[] = [];

        // Check for issues
        if (room.status === 'occupied' && !alloc) {
          warnings.push('occupied_no_allocation');
        }
        if (alloc && !alloc.workspace_id && !alloc.funnel_item_id) {
          warnings.push('allocation_no_link');
        }
        if (ws && ws.status === 'active' && !contract) {
          warnings.push('active_no_contract');
        }
        if (ws && contract && contract.status === 'draft') {
          warnings.push('contract_draft');
        }
        if (ws && contract && contract.status === 'pending_signature') {
          warnings.push('contract_pending_signature');
        }
        if (ws && ws.status === 'imported_unclaimed') {
          warnings.push('imported_unclaimed');
        }
        if (ws && ws.status === 'claimed' && !contract) {
          warnings.push('claimed_no_contract');
        }
        if (alloc && alloc.end_date) {
          const daysLeft = Math.ceil((new Date(alloc.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 30 && daysLeft > 0) warnings.push('allocation_expiring');
        }

        const buildingFromContract = contract?.building?.name;
        const buildingId = contract?.building?.id || null;

        return {
          room_id: room.id,
          room_name: room.name,
          room_number: room.room_number,
          room_status: room.status,
          room_type: room.room_type,
          floor: room.floor,
          building_name: buildingFromContract || null,
          building_id: buildingId,
          space_name: (room as any).space?.name || null,
          allocation_id: alloc?.id || null,
          allocation_type: alloc?.allocation_type || null,
          allocation_start: alloc?.start_date || null,
          allocation_end: alloc?.end_date || null,
          workspace_id: ws?.id || null,
          workspace_status: ws?.status || null,
          startup_name: startup?.name || funnelItem?.organization_name || null,
          startup_contact_email: startup?.main_contact_email || null,
          contract_id: contract?.id || null,
          contract_status: contract?.status || null,
          contract_start: contract?.start_date || null,
          contract_end: contract?.end_date || null,
          contract_monthly_fee: contract?.monthly_fee || null,
          incubation_type_name: contract?.incubation_type?.name || null,
          warnings,
        };
      });
    },
    staleTime: 30_000,
  });
}

function StatusBadge({ status, type }: { status: string | null; type: 'room' | 'workspace' | 'contract' }) {
  const { t } = useTranslation();
  if (!status) return <Badge variant="outline" className="text-[10px]">—</Badge>;

  const colors: Record<string, string> = {
    // Room
    available: 'bg-success/10 text-success',
    occupied: 'bg-info/10 text-info',
    maintenance: 'bg-warning/10 text-warning',
    reserved: 'bg-primary/10 text-primary',
    // Workspace
    active: 'bg-success/10 text-success',
    claimed: 'bg-info/10 text-info',
    pending: 'bg-warning/10 text-warning',
    imported_unclaimed: 'bg-muted text-muted-foreground',
    blocked: 'bg-destructive/10 text-destructive',
    // Contract
    draft: 'bg-muted text-muted-foreground',
    pending_signature: 'bg-warning/10 text-warning',
    suspended: 'bg-warning/10 text-warning',
  };

  const labels: Record<string, string> = {
    available: t('spaces.available', 'Disponível'),
    occupied: t('spaces.occupied', 'Ocupada'),
    maintenance: t('spaces.maintenance', 'Manutenção'),
    reserved: t('spaces.reserved', 'Reservada'),
    active: t('spaces.statusActive', 'Ativo'),
    claimed: t('spaces.statusClaimed', 'Associado'),
    pending: t('spaces.statusPending', 'Pendente'),
    imported_unclaimed: t('spaces.statusImported', 'Importado'),
    blocked: t('spaces.statusBlocked', 'Bloqueado'),
    draft: t('spaces.statusDraft', 'Rascunho'),
    pending_signature: t('spaces.statusPendingSignature', 'Aguarda Assinatura'),
    suspended: t('spaces.statusSuspended', 'Suspenso'),
  };

  return (
    <Badge className={cn('text-[10px] font-medium border-0', colors[status] || 'bg-muted text-muted-foreground')}>
      {labels[status] || status}
    </Badge>
  );
}

function WarningBadges({ warnings }: { warnings: string[] }) {
  const { t } = useTranslation();
  if (warnings.length === 0) return null;

  const warningLabels: Record<string, { label: string; severity: 'warning' | 'error' | 'info' }> = {
    occupied_no_allocation: { label: t('spaces.warn.noAllocation', 'Sem alocação'), severity: 'error' },
    allocation_no_link: { label: t('spaces.warn.noLink', 'Sem ligação'), severity: 'error' },
    active_no_contract: { label: t('spaces.warn.noContract', 'Sem contrato'), severity: 'warning' },
    contract_draft: { label: t('spaces.warn.contractDraft', 'Contrato rascunho'), severity: 'info' },
    contract_pending_signature: { label: t('spaces.warn.pendingSig', 'Aguarda assinatura'), severity: 'warning' },
    imported_unclaimed: { label: t('spaces.warn.notClaimed', 'Não associado'), severity: 'info' },
    claimed_no_contract: { label: t('spaces.warn.claimedNoContract', 'Associado s/ contrato'), severity: 'warning' },
    allocation_expiring: { label: t('spaces.warn.allocExpiring', 'Alocação a expirar'), severity: 'warning' },
  };

  return (
    <div className="flex flex-wrap gap-1">
      {warnings.map(w => {
        const info = warningLabels[w];
        if (!info) return null;
        const color = info.severity === 'error'
          ? 'bg-destructive/10 text-destructive'
          : info.severity === 'warning'
          ? 'bg-warning/10 text-warning'
          : 'bg-muted text-muted-foreground';
        return (
          <Badge key={w} className={cn('text-[9px] border-0 gap-0.5', color)}>
            <AlertCircle className="h-2.5 w-2.5" />
            {info.label}
          </Badge>
        );
      })}
    </div>
  );
}

export function SpaceOperationsConsole() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: records, isLoading } = useSpaceOperationsData();
  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [warningFilter, setWarningFilter] = useState('all');
  const [selectedRecord, setSelectedRecord] = useState<UnifiedRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Count stale rooms (occupied but no allocation)
  const staleRoomIds = useMemo(() => {
    if (!records) return [];
    return records
      .filter(r => r.room_status === 'occupied' && !r.allocation_id)
      .map(r => r.room_id);
  }, [records]);

  const cleanupMutation = useMutation({
    mutationFn: async (roomIds: string[]) => {
      const { error } = await supabase
        .from('rooms')
        .update({ status: 'available' })
        .in('id', roomIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['space-operations-console'] });
      notify.success(t('spaces.roomsCleared', { count: staleRoomIds.length, defaultValue: '{{count}} sala(s) libertada(s) com sucesso' }));
    },
    onError: () => {
      notify.error(t('spaces.clearError', 'Erro ao limpar salas'));
    },
  });

  const buildings = useMemo(() => {
    if (!records) return [];
    const set = new Set<string>();
    records.forEach(r => { if (r.building_name) set.add(r.building_name); });
    return Array.from(set).sort();
  }, [records]);

  const filtered = useMemo(() => {
    if (!records) return [];
    return records.filter(r => {
      const matchesSearch = !search ||
        r.room_name.toLowerCase().includes(search.toLowerCase()) ||
        r.startup_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.space_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.room_number?.toLowerCase().includes(search.toLowerCase());
      const matchesBuilding = buildingFilter === 'all' || r.building_name === buildingFilter;
      const matchesStatus = statusFilter === 'all' || r.room_status === statusFilter;
      const matchesWarning = warningFilter === 'all' ||
        (warningFilter === 'warnings' && r.warnings.length > 0) ||
        (warningFilter === 'clean' && r.warnings.length === 0);
      return matchesSearch && matchesBuilding && matchesStatus && matchesWarning;
    });
  }, [records, search, buildingFilter, statusFilter, warningFilter]);

  // Summary stats
  const stats = useMemo(() => {
    if (!records) return { total: 0, occupied: 0, available: 0, withWarnings: 0, noContract: 0 };
    return {
      total: records.length,
      occupied: records.filter(r => r.room_status === 'occupied').length,
      available: records.filter(r => r.room_status === 'available').length,
      withWarnings: records.filter(r => r.warnings.length > 0).length,
      noContract: records.filter(r => r.warnings.includes('active_no_contract') || r.warnings.includes('claimed_no_contract')).length,
    };
  }, [records]);

  const handleOpenDetail = (record: UnifiedRecord) => {
    setSelectedRecord(record);
    setDrawerOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="rounded-xl">
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">{t('ops.console.totalRooms', { defaultValue: 'Total Salas' })}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-info/30">
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-info">{stats.occupied}</div>
            <p className="text-xs text-muted-foreground">{t('ops.console.occupied', { defaultValue: 'Ocupadas' })}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-success/30">
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-success">{stats.available}</div>
            <p className="text-xs text-muted-foreground">{t('ops.console.available', { defaultValue: 'Disponíveis' })}</p>
          </CardContent>
        </Card>
        <Card className={cn('rounded-xl', stats.withWarnings > 0 && 'border-warning/30')}>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-warning">{stats.withWarnings}</div>
            <p className="text-xs text-muted-foreground">{t('ops.console.withWarnings', { defaultValue: 'Com Avisos' })}</p>
          </CardContent>
        </Card>
        <Card className={cn('rounded-xl', stats.noContract > 0 && 'border-destructive/30')}>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-destructive">{stats.noContract}</div>
            <p className="text-xs text-muted-foreground">{t('ops.console.missingContract', { defaultValue: 'Sem Contrato' })}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('ops.console.searchPlaceholder', { defaultValue: 'Pesquisar sala, startup...' })}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={buildingFilter} onValueChange={setBuildingFilter}>
          <SelectTrigger className="w-[180px]"><Building2 className="h-4 w-4 mr-1.5 text-muted-foreground" /><SelectValue placeholder="Edifício" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all', { defaultValue: 'Todos' })}</SelectItem>
            {buildings.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><DoorOpen className="h-4 w-4 mr-1.5 text-muted-foreground" /><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('spaces.allStatuses', 'Todos os estados')}</SelectItem>
            <SelectItem value="available">{t('spaces.available', 'Disponível')}</SelectItem>
            <SelectItem value="occupied">{t('spaces.occupied', 'Ocupada')}</SelectItem>
            <SelectItem value="maintenance">{t('spaces.maintenance', 'Manutenção')}</SelectItem>
            <SelectItem value="reserved">{t('spaces.reserved', 'Reservada')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={warningFilter} onValueChange={setWarningFilter}>
          <SelectTrigger className="w-[160px]"><AlertTriangle className="h-4 w-4 mr-1.5 text-muted-foreground" /><SelectValue placeholder={t('spaces.warnings', 'Avisos')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all', 'Todos')}</SelectItem>
            <SelectItem value="warnings">{t('spaces.withWarnings', 'Com Avisos')}</SelectItem>
            <SelectItem value="clean">{t('spaces.noWarnings', 'Sem Avisos')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count + cleanup */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {filtered.length} de {records?.length || 0} {t('ops.console.roomsShown', { defaultValue: 'salas apresentadas' })}
        </p>
        {staleRoomIds.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-warning border-warning/30 hover:bg-warning/10 dark:hover:bg-warning/20"
            disabled={cleanupMutation.isPending}
            onClick={() => cleanupMutation.mutate(staleRoomIds)}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('spaces.clearStaleRooms', { count: staleRoomIds.length, defaultValue: 'Libertar {{count}} sala(s) órfã(s)' })}
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="rounded-xl overflow-hidden">
        <ScrollArea className="max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-semibold">{t('spaces.room', 'Sala')}</TableHead>
                <TableHead className="text-xs font-semibold">{t('spaces.status', 'Estado')}</TableHead>
                <TableHead className="text-xs font-semibold">{t('spaces.occupant', 'Startup / Ocupante')}</TableHead>
                <TableHead className="text-xs font-semibold">{t('common.workspace', 'Workspace')}</TableHead>
                <TableHead className="text-xs font-semibold">{t('common.contract', 'Contrato')}</TableHead>
                <TableHead className="text-xs font-semibold">{t('spaces.warnings', 'Avisos')}</TableHead>
                <TableHead className="text-xs font-semibold w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <DoorOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">{t('ops.console.noResults', { defaultValue: 'Nenhuma sala encontrada com esses filtros.' })}</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(rec => (
                  <TableRow
                    key={rec.room_id}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-muted/50',
                      rec.warnings.length > 0 && 'bg-warning/30 dark:bg-warning/10'
                    )}
                    onClick={() => handleOpenDetail(rec)}
                  >
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="font-medium text-sm">{rec.room_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {rec.space_name}{rec.floor && ` · Piso ${rec.floor}`}
                          {rec.room_number && ` · #${rec.room_number}`}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={rec.room_status} type="room" /></TableCell>
                    <TableCell>
                      {rec.startup_name ? (
                        <span className="text-sm font-medium">{rec.startup_name}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge status={rec.workspace_status} type="workspace" /></TableCell>
                    <TableCell><StatusBadge status={rec.contract_status} type="contract" /></TableCell>
                    <TableCell><WarningBadges warnings={rec.warnings} /></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('common.view')}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedRecord && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <DoorOpen className="h-5 w-5 text-primary" />
                  {selectedRecord.room_name}
                </SheetTitle>
                <SheetDescription>
                  {selectedRecord.space_name}{selectedRecord.floor && ` · Piso ${selectedRecord.floor}`}
                  {selectedRecord.building_name && ` · ${selectedRecord.building_name}`}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                {/* Warnings */}
                {selectedRecord.warnings.length > 0 && (
                  <Card className="border-warning/30 bg-warning/50 dark:bg-warning/20 rounded-xl">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-warning" />
                        <span className="text-sm font-semibold text-warning">
                          {t('ops.console.dataWarnings', { defaultValue: 'Avisos de Dados' })}
                        </span>
                      </div>
                      <WarningBadges warnings={selectedRecord.warnings} />
                    </CardContent>
                  </Card>
                )}

                {/* Room Info */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    <DoorOpen className="h-3.5 w-3.5 inline mr-1" />Sala
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">{t('spaces.type', 'Tipo')}:</span> <span className="font-medium">{selectedRecord.room_type}</span></div>
                    <div><span className="text-muted-foreground">{t('spaces.statusLabel', 'Estado')}:</span> <StatusBadge status={selectedRecord.room_status} type="room" /></div>
                    {selectedRecord.room_number && <div><span className="text-muted-foreground">{t('spaces.roomNumber', 'Nº')}:</span> {selectedRecord.room_number}</div>}
                    {selectedRecord.floor && <div><span className="text-muted-foreground">{t('spaces.floor', 'Piso')}:</span> {selectedRecord.floor}</div>}
                  </div>
                </div>

                <Separator />

                {/* Allocation */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    <MapPin className="h-3.5 w-3.5 inline mr-1" />Alocação
                  </h3>
                  {selectedRecord.allocation_id ? (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">{t('spaces.type', 'Tipo')}:</span> <span className="font-medium">{selectedRecord.allocation_type}</span></div>
                      <div><span className="text-muted-foreground">{t('common.startDate', 'Início')}:</span> {selectedRecord.allocation_start && format(new Date(selectedRecord.allocation_start), 'dd/MM/yyyy')}</div>
                      {selectedRecord.allocation_end && (
                        <div><span className="text-muted-foreground">{t('common.endDate', 'Fim')}:</span> {format(new Date(selectedRecord.allocation_end), 'dd/MM/yyyy')}</div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic flex items-center gap-1.5">
                      <Link2Off className="h-3.5 w-3.5" />
                      Sem alocação ativa
                    </p>
                  )}
                </div>

                <Separator />

                {/* Workspace / Startup */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    <Building2 className="h-3.5 w-3.5 inline mr-1" />Workspace / Startup
                  </h3>
                  {selectedRecord.workspace_id ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{selectedRecord.startup_name || 'Sem nome'}</span>
                        <StatusBadge status={selectedRecord.workspace_status} type="workspace" />
                      </div>
                      {selectedRecord.startup_contact_email && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <User className="h-3.5 w-3.5" />
                          {selectedRecord.startup_contact_email}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 ml-1"
                            onClick={(e)= aria-label="Copy"> {
                              e.stopPropagation();
                              navigator.clipboard.writeText(selectedRecord.startup_contact_email!);
                              notify.success(t('common.emailCopied', 'Email copiado'));
                            }}
                           aria-label={t('common.copy')}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 mt-1"
                        onClick={() => navigate(`/workspace/${selectedRecord.workspace_id}`)}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        Abrir Workspace
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic flex items-center gap-1.5">
                      <Link2Off className="h-3.5 w-3.5" />
                      Sem workspace associado
                    </p>
                  )}
                </div>

                <Separator />

                {/* Contract */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    <FileText className="h-3.5 w-3.5 inline mr-1" />Contrato
                  </h3>
                  {selectedRecord.contract_id ? (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">{t('spaces.statusLabel', 'Estado')}:</span> <StatusBadge status={selectedRecord.contract_status} type="contract" /></div>
                      <div><span className="text-muted-foreground">{t('spaces.monthlyFee', 'Mensalidade')}:</span> <span className="font-medium">€{selectedRecord.contract_monthly_fee?.toLocaleString() || '—'}</span></div>
                      {selectedRecord.contract_start && (
                        <div><span className="text-muted-foreground">{t('common.startDate', 'Início')}:</span> {format(new Date(selectedRecord.contract_start), 'dd/MM/yyyy')}</div>
                      )}
                      {selectedRecord.contract_end && (
                        <div><span className="text-muted-foreground">{t('common.endDate', 'Fim')}:</span> {format(new Date(selectedRecord.contract_end), 'dd/MM/yyyy')}</div>
                      )}
                      {selectedRecord.incubation_type_name && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">{t('spaces.package', 'Pacote')}:</span>
                          <Badge variant="secondary" className="ml-1.5 text-[10px]">
                            <Package className="h-2.5 w-2.5 mr-0.5" />
                            {selectedRecord.incubation_type_name}
                          </Badge>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic flex items-center gap-1.5">
                      <XCircle className="h-3.5 w-3.5" />
                      Sem contrato associado
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
