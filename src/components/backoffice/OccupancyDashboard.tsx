import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Building2, TrendingUp, TrendingDown, AlertTriangle, Calendar,
  DollarSign, Users, Percent, Clock, ExternalLink
} from 'lucide-react';
import {
  useRoomsWithAllocations,
  useBuildings,
  useOfficeSpaces,
  useContracts,
  useSpaceWaitingList,
} from '@/hooks/useBackoffice';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays, addDays } from 'date-fns';

export function OccupancyDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: rooms } = useRoomsWithAllocations();
  const { data: buildings } = useBuildings();
  const { data: spaces } = useOfficeSpaces();
  const { data: contracts } = useContracts({ status: 'active' });
  const { data: waitingList } = useSpaceWaitingList({ status: 'pending' });

  // ── Occupancy by building ──
  const buildingStats = useMemo(() => {
    if (!buildings || !rooms || !spaces) return [];
    return buildings.filter(b => b.is_active !== false).map(building => {
      const buildingSpaceIds = spaces.filter((s: any) => s.building_id === building.id).map(s => s.id);
      const buildingRooms = rooms.filter(r => buildingSpaceIds.includes(r.space_id));
      const occupied = buildingRooms.filter(r => r.current_allocation).length;
      const total = buildingRooms.length;
      const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;
      return { id: building.id, name: building.name, code: building.code, occupied, total, rate };
    }).filter(b => b.total > 0);
  }, [buildings, rooms, spaces]);

  // ── Global stats ──
  const globalStats = useMemo(() => {
    if (!rooms) return { total: 0, occupied: 0, available: 0, maintenance: 0, rate: 0 };
    const total = rooms.length;
    const occupied = rooms.filter(r => r.current_allocation).length;
    const available = rooms.filter(r => !r.current_allocation && r.status === 'available').length;
    const maintenance = rooms.filter(r => r.status === 'maintenance').length;
    const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    return { total, occupied, available, maintenance, rate };
  }, [rooms]);

  // ── Revenue estimate (from active contracts) ──
  const revenueStats = useMemo(() => {
    if (!contracts) return { monthlyGross: 0, monthlyNet: 0, discountImpact: 0, activeCount: 0 };
    const activeContracts = contracts.filter(c => c.status === 'active');
    let monthlyGross = 0;
    let monthlyNet = 0;
    for (const c of activeContracts) {
      const fee = c.monthly_fee || 0;
      const discount = c.discount_percentage || 0;
      monthlyGross += fee;
      monthlyNet += fee * (1 - discount / 100);
    }
    return {
      monthlyGross: Math.round(monthlyGross),
      monthlyNet: Math.round(monthlyNet),
      discountImpact: Math.round(monthlyGross - monthlyNet),
      activeCount: activeContracts.length,
    };
  }, [contracts]);

  // ── Expiring contracts (30/60/90 days) ──
  const expiringContracts = useMemo(() => {
    if (!contracts) return [];
    const today = new Date();
    return contracts
      .filter(c => c.status === 'active' && c.end_date)
      .map(c => {
        const endDate = new Date(c.end_date!);
        const daysLeft = differenceInDays(endDate, today);
        return { ...c, daysLeft };
      })
      .filter(c => c.daysLeft >= 0 && c.daysLeft <= 90)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [contracts]);

  const formatCurrency = (v: number) => `€${v.toLocaleString('pt-PT')}`;

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-xl">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('admin.backoffice.occupancyDashboard.occupancyRate', { defaultValue: 'Taxa de Ocupação' })}</p>
                <p className="text-2xl font-bold">{globalStats.rate}%</p>
              </div>
              <div className={`p-2 rounded-lg ${globalStats.rate >= 80 ? 'bg-green-100 text-green-600' : globalStats.rate >= 50 ? 'bg-yellow-100 text-yellow-600' : 'bg-red-100 text-red-600'}`}>
                {globalStats.rate >= 80 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              </div>
            </div>
            <Progress value={globalStats.rate} className="mt-2 h-1.5" />
            <p className="text-[10px] text-muted-foreground mt-1">
              {globalStats.occupied}/{globalStats.total} {t('admin.backoffice.occupancyDashboard.spacesOccupied', { defaultValue: 'espaços ocupados' })}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('admin.backoffice.occupancyDashboard.monthlyRevenue', { defaultValue: 'Receita Mensal' })}</p>
                <p className="text-2xl font-bold">{formatCurrency(revenueStats.monthlyNet)}</p>
              </div>
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {revenueStats.activeCount} {t('admin.backoffice.occupancyDashboard.activeContracts', { defaultValue: 'contratos ativos' })}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('admin.backoffice.occupancyDashboard.discountImpact', { defaultValue: 'Impacto Descontos' })}</p>
                <p className="text-2xl font-bold text-destructive">-{formatCurrency(revenueStats.discountImpact)}</p>
              </div>
              <Percent className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {t('admin.backoffice.occupancyDashboard.grossRevenue', { defaultValue: 'Bruto' })}: {formatCurrency(revenueStats.monthlyGross)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('admin.backoffice.occupancyDashboard.waitingListCount', { defaultValue: 'Lista de Espera' })}</p>
                <p className="text-2xl font-bold">{waitingList?.length || 0}</p>
              </div>
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {t('admin.backoffice.occupancyDashboard.pendingRequests', { defaultValue: 'pedidos pendentes' })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Occupancy by Building ── */}
      <Card className="rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {t('admin.backoffice.occupancyDashboard.occupancyByBuilding', { defaultValue: 'Ocupação por Edifício' })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {buildingStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('admin.backoffice.noBuildings', { defaultValue: 'Nenhum edifício configurado' })}
            </p>
          ) : (
            <div className="space-y-4">
              {buildingStats.map(b => (
                <div key={b.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{b.name}</span>
                      <Badge variant="outline" className="text-[10px]">{b.code}</Badge>
                    </div>
                    <span className="text-muted-foreground">
                      {b.occupied}/{b.total} ({b.rate}%)
                    </span>
                  </div>
                  <Progress value={b.rate} className="h-2" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Expiring Contracts ── */}
      {expiringContracts.length > 0 && (
        <Card className="rounded-xl border-yellow-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              {t('admin.backoffice.occupancyDashboard.expiringContracts', { defaultValue: 'Contratos a Expirar (90 dias)' })}
            </CardTitle>
            <CardDescription>
              {expiringContracts.length} {t('admin.backoffice.occupancyDashboard.contractsExpiring', { defaultValue: 'contratos a expirar nos próximos 90 dias' })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {expiringContracts.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="space-y-1">
                    {c.workspace_id ? (
                      <button
                        type="button"
                        onClick={() => navigate(`/workspace/${c.workspace_id}`)}
                        className="text-sm font-medium text-left text-primary hover:underline focus:outline-none focus-visible:underline"
                      >
                        {c.workspace?.startup?.name || '—'}
                      </button>
                    ) : (
                      <span className="text-sm font-medium">{c.workspace?.startup?.name || '—'}</span>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {t('admin.backoffice.occupancyDashboard.expiresOn', { defaultValue: 'Expira em' })} {format(new Date(c.end_date!), 'dd MMM yyyy')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.daysLeft <= 30 ? 'destructive' : c.daysLeft <= 60 ? 'secondary' : 'outline'}>
                      {c.daysLeft} {t('admin.backoffice.occupancyDashboard.daysLeft', { defaultValue: 'dias' })}
                    </Badge>
                    {c.workspace_id && (
                      <Button variant="ghost" size="sm" className="h-7" onClick={() => navigate(`/workspace/${c.workspace_id}`)}>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
