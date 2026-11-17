import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Users, DoorOpen, Wrench, TrendingUp } from 'lucide-react';
import { useBuildings, useRoomsWithAllocations, useOfficeSpaces } from '@/hooks/useBackoffice';
import { SpaceOccupancyChart } from './SpaceOccupancyChart';
import { cn } from '@/lib/utils';

interface OccupancyStats {
  total: number;
  occupied: number;
  available: number;
  maintenance: number;
  occupancyRate: number;
}

function calculateStats(rooms: { status: string; current_allocation?: unknown | null }[]): OccupancyStats {
  const total = rooms.length;
  const occupied = rooms.filter(r => r.current_allocation).length;
  const maintenance = rooms.filter(r => r.status === 'maintenance').length;
  const available = rooms.filter(r => !r.current_allocation && r.status === 'available').length;
  const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
  
  return { total, occupied, available, maintenance, occupancyRate };
}

export function BuildingOccupancyPanel() {
  const { t } = useTranslation();
  const { data: buildings, isLoading: loadingBuildings } = useBuildings();
  const { data: spaces } = useOfficeSpaces();
  const { data: rooms, isLoading: loadingRooms } = useRoomsWithAllocations();

  if (loadingBuildings || loadingRooms) {
    return (
      <Card className="">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t('admin.backoffice.buildingOccupancy', 'Building Occupancy')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group rooms by building (via space)
  const roomsByBuilding = new Map<string, typeof rooms>();
  
  rooms?.forEach(room => {
    const space = spaces?.find(s => s.id === room.space_id);
    const buildingId = (space as any)?.building_id || 'unknown';
    if (!roomsByBuilding.has(buildingId)) {
      roomsByBuilding.set(buildingId, []);
    }
    roomsByBuilding.get(buildingId)!.push(room);
  });

  const overallStats = calculateStats(rooms || []);

  return (
    <Card className="">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {t('admin.backoffice.buildingOccupancy', 'Building Occupancy')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall donut + stats */}
        <div className="flex items-center gap-6">
          <SpaceOccupancyChart
            occupied={overallStats.occupied}
            available={overallStats.available}
            maintenance={overallStats.maintenance}
            size="lg"
            showLegend={false}
          />
          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
                <div>
                  <div className="text-lg font-bold text-primary">{overallStats.occupied}</div>
                  <div className="text-[10px] text-muted-foreground">{t('admin.backoffice.occupied', 'Occupied')}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-accent">
                <DoorOpen className="h-4 w-4 text-accent-foreground" />
                <div>
                  <div className="text-lg font-bold text-accent-foreground">{overallStats.available}</div>
                  <div className="text-[10px] text-muted-foreground">{t('admin.backoffice.available', 'Available')}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-lg font-bold">{overallStats.total}</div>
                  <div className="text-[10px] text-muted-foreground">{t('admin.backoffice.totalRooms', 'Total')}</div>
                </div>
              </div>
              {overallStats.maintenance > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary">
                  <Wrench className="h-4 w-4 text-secondary-foreground" />
                  <div>
                    <div className="text-lg font-bold text-secondary-foreground">{overallStats.maintenance}</div>
                    <div className="text-[10px] text-muted-foreground">{t('admin.backoffice.maintenance', 'Maint.')}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Per-building mini charts */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            {t('admin.backoffice.byBuilding', 'By Building')}
          </h4>
          <div className="grid grid-cols-2 gap-4">
            {buildings?.map(building => {
              const buildingRooms = roomsByBuilding.get(building.id) || [];
              const stats = calculateStats(buildingRooms);
              
              if (stats.total === 0) return null;

              return (
                <div key={building.id} className="flex flex-col items-center gap-1 p-3 border rounded-xl hover:bg-muted/30 transition-colors">
                  <SpaceOccupancyChart
                    occupied={stats.occupied}
                    available={stats.available}
                    maintenance={stats.maintenance}
                    size="sm"
                    showLegend={false}
                    label={building.name}
                  />
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                    <span>{stats.occupied}/{stats.total}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">{building.code}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
