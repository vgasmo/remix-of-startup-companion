import { useState } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Building2, FileText, Clock, AlertTriangle, CalendarClock, 
  TrendingUp, Users, ArrowRight, Cake, AlertCircle, CheckCircle2,
  Timer, MapPin, Receipt, DoorOpen, CreditCard, Map
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { format, differenceInMonths, differenceInDays, addYears } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import { BillingSnapshotCard } from './BillingSnapshotCard';
import { BuildingOccupancyPanel } from './BuildingOccupancyPanel';
import { ContractLifecycleEventsCard } from './ContractLifecycleEventsCard';
import { InteractiveFloorMapViewer } from './InteractiveFloorMapViewer';
import { SpaceDetailDrawer } from './SpaceDetailDrawer';
import { useBuildings, useRoomsWithAllocations } from '@/hooks/useBackoffice';
import type { Room, FloorMap } from '@/hooks/useBackoffice';

interface ContractWithDetails {
  id: string;
  workspace_id: string;
  start_date: string;
  end_date: string | null;
  status: string;
  monthly_fee: number;
  contract_number: string | null;
  incubation_type: { name: string; contract_type: string | null } | null;
  building: { name: string; city: string | null } | null;
  workspace: { id: string; startup: { name: string } | null } | null;
}

interface AnniversaryAlert {
  id: string;
  startupName: string;
  startDate: string;
  yearsIncubated: number;
  monthsIncubated: number;
  daysUntilAnniversary: number;
  alertType: 'anniversary' | 'year3' | 'expiring' | 'renewal';
  severity: 'info' | 'warning' | 'critical';
}

export function BackofficeDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mapViewerOpen, setMapViewerOpen] = useState(false);
  const [selectedFloorMap, setSelectedFloorMap] = useState<FloorMap | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: buildings } = useBuildings();
  const { data: allRooms } = useRoomsWithAllocations();

  // Fetch floor maps for quick access
  const { data: floorMaps } = useQuery({
    queryKey: ['floor-maps-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('floor_maps')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as FloorMap[];
    },
  });

  // Fetch comprehensive dashboard data
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['backoffice-command-center'],
    queryFn: async () => {
      const today = new Date();
      
      // Fetch active contracts with all details
      const { data: contracts } = await supabase
        .from('startup_contracts')
        .select(`
          id, workspace_id, start_date, end_date, status, monthly_fee, contract_number,
          incubation_type:incubation_types(name, contract_type),
          building:buildings(name, city),
          workspace:workspaces(id, startup:startups(name))
        `)
        .eq('status', 'active') as { data: ContractWithDetails[] | null };
      
      // Fetch ALL contracts for "requiring attention"
      const { data: attentionContracts } = await supabase
        .from('startup_contracts')
        .select(`
          id, workspace_id, start_date, end_date, status, monthly_fee, contract_number,
          incubation_type:incubation_types(name, contract_type),
          building:buildings(name, city),
          workspace:workspaces(id, startup:startups(name))
        `)
        .in('status', ['draft', 'pending_signature', 'suspended']) as { data: ContractWithDetails[] | null };

      // Fetch room allocations for occupancy stats
      const { data: rooms } = await supabase
        .from('rooms')
        .select('id, status');
      
      // Invoice queries removed — invoicing is not part of this product

      // Fetch waiting list
      const { data: waitingList } = await supabase
        .from('space_waiting_list')
        .select('id, status, priority')
        .eq('status', 'waiting');

      // Calculate anniversaries and alerts
      const alerts: AnniversaryAlert[] = [];
      const contractsByAge: Record<string, number> = {
        'under1year': 0, '1to2years': 0, '2to3years': 0, 'over3years': 0,
      };

      // Contracts expiring in 30 days
      let expiringContractsCount = 0;

      contracts?.forEach(contract => {
        const startDate = new Date(contract.start_date);
        const startupName = contract.workspace?.startup?.name || 'Unknown';
        const monthsIncubated = differenceInMonths(today, startDate);
        const yearsIncubated = Math.floor(monthsIncubated / 12);
        
        if (monthsIncubated < 12) contractsByAge['under1year']++;
        else if (monthsIncubated < 24) contractsByAge['1to2years']++;
        else if (monthsIncubated < 36) contractsByAge['2to3years']++;
        else contractsByAge['over3years']++;
        
        const nextAnniversary = addYears(startDate, yearsIncubated + 1);
        const daysUntilAnniversary = differenceInDays(nextAnniversary, today);
        
        if (yearsIncubated === 2 && monthsIncubated >= 33) {
          alerts.push({ id: contract.id, startupName, startDate: contract.start_date, yearsIncubated: 3, monthsIncubated, daysUntilAnniversary: differenceInDays(addYears(startDate, 3), today), alertType: 'year3', severity: 'critical' });
        } else if (yearsIncubated >= 3) {
          alerts.push({ id: contract.id, startupName, startDate: contract.start_date, yearsIncubated, monthsIncubated, daysUntilAnniversary, alertType: 'year3', severity: 'critical' });
        } else if (daysUntilAnniversary <= 30 && daysUntilAnniversary > 0) {
          alerts.push({ id: contract.id, startupName, startDate: contract.start_date, yearsIncubated: yearsIncubated + 1, monthsIncubated, daysUntilAnniversary, alertType: 'anniversary', severity: yearsIncubated >= 2 ? 'warning' : 'info' });
        }
        
        if (contract.end_date) {
          const daysUntilExpiry = differenceInDays(new Date(contract.end_date), today);
          if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) expiringContractsCount++;
          if (daysUntilExpiry <= 60 && daysUntilExpiry > 0) {
            alerts.push({ id: contract.id, startupName, startDate: contract.start_date, yearsIncubated, monthsIncubated, daysUntilAnniversary: daysUntilExpiry, alertType: 'expiring', severity: daysUntilExpiry <= 30 ? 'critical' : 'warning' });
          }
        }
      });

      alerts.sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] !== severityOrder[b.severity]
          ? severityOrder[a.severity] - severityOrder[b.severity]
          : a.daysUntilAnniversary - b.daysUntilAnniversary;
      });

      const totalMonthlyRevenue = contracts?.reduce((sum, c) => sum + (c.monthly_fee || 0), 0) || 0;
      const occupiedRooms = rooms?.filter(r => r.status === 'occupied').length || 0;
      const availableRooms = rooms?.filter(r => r.status === 'available').length || 0;
      const totalRooms = rooms?.length || 0;
      const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;


      return {
        totalActiveContracts: contracts?.length || 0,
        totalMonthlyRevenue,
        contractsByAge,
        alerts: alerts.slice(0, 10),
        criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
        occupancyRate,
        occupiedRooms,
        availableRooms,
        totalRooms,
        waitingListCount: waitingList?.length || 0,
        highPriorityWaiting: waitingList?.filter(w => w.priority >= 80).length || 0,
        expiringContractsCount,
        attentionContracts: attentionContracts || [],
      };
    },
  });

  const handleOpenMap = (fm: FloorMap) => {
    setSelectedFloorMap(fm);
    setMapViewerOpen(true);
  };

  const handleRoomClick = (room: Room) => {
    setSelectedRoom(room);
    setMapViewerOpen(false);
    setDrawerOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="rounded-2xl">
              <CardContent className="pt-5">
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[350px] rounded-2xl" />
          <Skeleton className="h-[350px] rounded-2xl" />
        </div>
      </div>
    );
  }

  const data = dashboardData!;

  return (
    <div className="space-y-6">
      {/* ═══════════════════ HERO METRICS ═══════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Occupancy Rate */}
        <Card className={cn('rounded-2xl', data.occupancyRate < 70 && 'border-warning/50')}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold tracking-tight">{data.occupancyRate}%</div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('admin.backoffice.dashboardPanel.occupancy')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.occupiedRooms}/{data.totalRooms} {t('admin.backoffice.opsHub.rooms', { defaultValue: 'rooms' })}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>




        {/* Expiring Contracts (30 days) */}
        <Card className={cn('rounded-2xl', data.expiringContractsCount > 0 && 'border-destructive/50')}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold tracking-tight">{data.expiringContractsCount}</div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('admin.backoffice.opsHub.expiringContracts', { defaultValue: 'Expiring Contracts' })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('admin.backoffice.opsHub.next30Days', { defaultValue: 'next 30 days' })}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                <CalendarClock className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Available Rooms */}
        <Card className="rounded-2xl">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold tracking-tight">{data.availableRooms}</div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('admin.backoffice.opsHub.availableRooms', { defaultValue: 'Available Rooms' })}
                </p>
                {data.waitingListCount > 0 && (
                  <p className="text-xs text-warning">
                    {data.waitingListCount} {t('admin.backoffice.opsHub.inWaitlist', { defaultValue: 'in waitlist' })}
                  </p>
                )}
              </div>
              <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center">
                <DoorOpen className="h-6 w-6 text-accent-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════ THE PHYSICAL WORLD ═══════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Building Occupancy Panel */}
        <WidgetErrorBoundary name={t('admin.backoffice.buildingOccupancy', 'Building Occupancy')}>
          <BuildingOccupancyPanel />
        </WidgetErrorBoundary>

        {/* Alerts & Quick Floor Map Access */}
        <div className="space-y-4">
          {/* Floor Map Quick Access */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Map className="h-5 w-5" />
                {t('admin.backoffice.opsHub.floorMaps', { defaultValue: 'Floor Maps' })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {floorMaps && floorMaps.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {floorMaps.slice(0, 4).map(fm => {
                    const building = buildings?.find(b => {
                      // Match via space_id -> building
                      return true; // Show all maps
                    });
                    return (
                      <Button
                        key={fm.id}
                        variant="outline"
                        className="h-auto py-3 flex flex-col items-start gap-1 rounded-xl"
                        onClick={() => handleOpenMap(fm)}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          {fm.name}
                        </span>
                        {fm.floor && (
                          <span className="text-xs text-muted-foreground">
                            {t('admin.backoffice.floorLabel', 'Floor')} {fm.floor}
                          </span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('admin.backoffice.opsHub.noFloorMaps', { defaultValue: 'No floor maps uploaded yet' })}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Alerts (compact) */}
          <Card className={cn('rounded-2xl', data.criticalAlerts > 0 && 'border-destructive/50')}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className={cn('h-5 w-5', data.criticalAlerts > 0 ? 'text-destructive' : 'text-muted-foreground')} />
                {t('admin.backoffice.dashboardPanel.alerts')}
                {data.criticalAlerts > 0 && (
                  <Badge variant="destructive" className="ml-auto">{data.criticalAlerts}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.alerts.length === 0 ? (
                <div className="flex items-center gap-2 text-muted-foreground py-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-sm">{t('admin.backoffice.dashboardPanel.noAlerts')}</span>
                </div>
              ) : (
                <ScrollArea className="h-[180px]">
                  <div className="space-y-2">
                    {data.alerts.slice(0, 5).map((alert, idx) => (
                      <div 
                        key={`${alert.id}-${idx}`}
                        className={cn(
                          'p-2.5 rounded-lg border flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors',
                          alert.severity === 'critical' && 'bg-destructive/50 border-destructive/30 dark:bg-destructive/10',
                          alert.severity === 'warning' && 'bg-warning/50 border-warning/30 dark:bg-warning/10',
                          alert.severity === 'info' && 'bg-info/50 border-info/30 dark:bg-info/10',
                        )}
                        {...clickableProps(() => navigate(`/workspaces/${alert.id}`))}
                      >
                        <div className={cn(
                          alert.severity === 'critical' && 'text-destructive',
                          alert.severity === 'warning' && 'text-warning',
                          alert.severity === 'info' && 'text-info',
                        )}>
                          {alert.alertType === 'year3' ? <AlertCircle className="h-4 w-4" /> :
                           alert.alertType === 'expiring' ? <CalendarClock className="h-4 w-4" /> :
                           <Cake className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium truncate block">{alert.startupName}</span>
                          <span className="text-xs text-muted-foreground">
                            {alert.alertType === 'year3' && t('admin.backoffice.dashboardPanel.over3Years')}
                            {alert.alertType === 'anniversary' && `${t('admin.backoffice.dashboardPanel.yearAnniversary', { year: alert.yearsIncubated })} — ${alert.daysUntilAnniversary}d`}
                            {alert.alertType === 'expiring' && `${t('admin.backoffice.dashboardPanel.contractExpiring')} — ${alert.daysUntilAnniversary}d`}
                          </span>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══════════════════ CONTRACTS HEALTH ═══════════════════ */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {t('admin.backoffice.opsHub.contractsHealth', { defaultValue: 'Contracts Health' })}
          </h2>
          <Separator className="flex-1" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Contract Lifecycle Events */}
          <WidgetErrorBoundary name="Contract Lifecycle Events">
            <ContractLifecycleEventsCard />
          </WidgetErrorBoundary>

          {/* Contracts Requiring Attention */}
          <WidgetErrorBoundary name={t('admin.backoffice.opsHub.contractsAttention', 'Contracts Requiring Attention')}>
            <Card className="rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-5 w-5" />
                  {t('admin.backoffice.opsHub.contractsAttention', { defaultValue: 'Contracts Requiring Attention' })}
                  <Badge variant="secondary" className="ml-auto">{data.attentionContracts.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.attentionContracts.length === 0 ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-sm">{t('admin.backoffice.opsHub.allContractsGood', { defaultValue: 'All contracts in good standing' })}</span>
                  </div>
                ) : (
                  <ScrollArea className="h-[280px]">
                    <div className="space-y-2">
                      {data.attentionContracts.map((contract: ContractWithDetails) => {
                        const statusColors: Record<string, string> = {
                          draft: 'bg-muted text-muted-foreground',
                          pending_signature: 'bg-warning/10 text-warning',
                          suspended: 'bg-warning/10 text-warning',
                        };
                        return (
                          <div
                            key={contract.id}
                            className="p-3 rounded-xl border hover:bg-muted/30 transition-colors cursor-pointer"
                            {...clickableProps(() => navigate(`/workspaces/${contract.workspace_id}`))}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium truncate">
                                {contract.workspace?.startup?.name || '—'}
                              </span>
                              <Badge className={cn('text-[10px]', statusColors[contract.status] || '')}>
                                {contract.status.replace('_', ' ')}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {contract.contract_number && (
                                <span className="font-mono">#{contract.contract_number}</span>
                              )}
                              {contract.incubation_type && (
                                <span>{contract.incubation_type.name}</span>
                              )}
                              <span className="ml-auto">€{contract.monthly_fee?.toLocaleString()}/mo</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </WidgetErrorBoundary>
        </div>
      </div>

      {/* ═══════════════════ TENURE BREAKDOWN ═══════════════════ */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Timer className="h-5 w-5" />
            {t('admin.backoffice.dashboardPanel.tenureBreakdown')}
          </CardTitle>
          <CardDescription>{t('admin.backoffice.dashboardPanel.tenureDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: 'under1year', label: t('admin.backoffice.dashboardPanel.under1Year'), color: 'bg-success' },
              { key: '1to2years', label: t('admin.backoffice.dashboardPanel.1to2Years'), color: 'bg-info' },
              { key: '2to3years', label: t('admin.backoffice.dashboardPanel.2to3Years'), color: 'bg-warning' },
              { key: 'over3years', label: t('admin.backoffice.dashboardPanel.over3Years'), color: 'bg-destructive' },
            ].map(item => {
              const count = data.contractsByAge[item.key] || 0;
              const percentage = data.totalActiveContracts > 0
                ? Math.round((count / data.totalActiveContracts) * 100)
                : 0;
              return (
                <div key={item.key} className="text-center p-3 rounded-xl border">
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs text-muted-foreground mb-2">{item.label}</div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', item.color)} style={{ width: `${percentage}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">{percentage}%</div>
                </div>
              );
            })}
          </div>
          {data.contractsByAge['over3years'] > 0 && (
            <div className="mt-4 p-3 bg-destructive/10 dark:bg-destructive/20 rounded-lg border border-destructive/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                <div className="text-sm">
                  <span className="font-medium text-destructive">
                    {data.contractsByAge['over3years']} {t('admin.backoffice.dashboardPanel.startupsOver3Years')}
                  </span>
                  <p className="text-muted-foreground mt-0.5">
                    {t('admin.backoffice.dashboardPanel.reviewRecommended')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Interactive Floor Map Viewer (Dialog) */}
      {selectedFloorMap && (
        <InteractiveFloorMapViewer
          open={mapViewerOpen}
          onOpenChange={setMapViewerOpen}
          floorMap={selectedFloorMap}
          rooms={allRooms || []}
          onRoomClick={handleRoomClick}
        />
      )}

      {/* Space Detail Drawer */}
      <SpaceDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        room={selectedRoom}
      />
    </div>
  );
}
