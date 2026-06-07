import { useState, useEffect, useMemo, useRef } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Building2, MapPin, Users, DoorOpen, Search, Map as MapIcon, List, 
  Wrench, Clock, Image, Upload, Plus, Eye, Edit2, UserCheck, Loader2,
  ListOrdered, BarChart3
} from 'lucide-react';
import { BuildingSelectorCards } from './BuildingSelectorCards';
import { SpaceOccupancyChart } from './SpaceOccupancyChart';
import { SpaceDetailDrawer } from './SpaceDetailDrawer';
import { BackofficeBuildingsTab } from './BackofficeBuildingsTab';
import { BackofficeSpacesTab } from './BackofficeSpacesTab';
import { SpaceWaitingListTab } from './SpaceWaitingListTab';
import { OccupancyDashboard } from './OccupancyDashboard';
import { RoomShapeEditor } from './RoomShapeEditor';
import {
  useRoomsWithAllocations,
  useBuildings,
  useOfficeSpaces,
  useFloorMaps,
  useCreateFloorMap,
  useDeleteFloorMap,
  useCreateOfficeSpace,
  useUpdateRoom,
  type Room,
  type FloorMap,
  type RoomShapeRect,
  type RoomShapePolygon,
} from '@/hooks/useBackoffice';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { notify } from "@/lib/notify";
import { renderPdfToImage, isPdfFile } from '@/lib/pdfRenderer';
import { logger } from '@/lib/logger';

// Status colors
const STATUS_COLORS: Record<string, string> = {
  available: 'bg-success',
  occupied: 'bg-info',
  maintenance: 'bg-warning',
  reserved: 'bg-primary',
};

export function InfrastructureTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [subView, setSubView] = useState<'dashboard' | 'map' | 'list' | 'buildings' | 'waitlist'>('dashboard');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
  const [selectedFloorMapId, setSelectedFloorMapId] = useState<string>('');
  const [roomSearch, setRoomSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Drawer state
  const [drawerRoom, setDrawerRoom] = useState<Room | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  // Map viewer state
  const [displayImageUrl, setDisplayImageUrl] = useState<string>('');
  const [mapLoading, setMapLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [shapeEditorRoom, setShapeEditorRoom] = useState<Room | null>(null);
  const [signedUrl, setSignedUrl] = useState('');
  const imageRef = useRef<HTMLDivElement>(null);

  // Pin placement state (edit mode)
  const [pendingPinCoords, setPendingPinCoords] = useState<{ x: number; y: number } | null>(null);
  const [pinSearchQuery, setPinSearchQuery] = useState('');

  // Upload dialog state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [mapBuildingId, setMapBuildingId] = useState('');
  const [mapName, setMapName] = useState('');
  const [mapFloor, setMapFloor] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data: buildings, isLoading: loadingBuildings } = useBuildings();
  const { data: spaces } = useOfficeSpaces();
  const { data: rooms, isLoading: loadingRooms } = useRoomsWithAllocations();
  const { data: floorMaps } = useFloorMaps();
  const createFloorMap = useCreateFloorMap();
  const deleteFloorMap = useDeleteFloorMap();
  const createOfficeSpace = useCreateOfficeSpace();
  const updateRoom = useUpdateRoom();

  // ── Building cards data ──
  const buildingCardsData = useMemo(() => {
    if (!buildings || !rooms || !spaces) return [];
    return buildings.filter(b => b.is_active !== false).map(building => {
      const buildingSpaceIds = spaces.filter((s: any) => s.building_id === building.id).map(s => s.id);
      const buildingRooms = rooms.filter(r => buildingSpaceIds.includes(r.space_id));
      const occupied = buildingRooms.filter(r => r.current_allocation).length;
      const available = buildingRooms.filter(r => !r.current_allocation && r.status === 'available').length;
      const maintenance = buildingRooms.filter(r => r.status === 'maintenance').length;
      return {
        id: building.id,
        name: building.name,
        code: building.code,
        city: building.city,
        total: buildingRooms.length,
        occupied,
        available,
        maintenance,
        occupancyRate: buildingRooms.length > 0 ? Math.round((occupied / buildingRooms.length) * 100) : 0,
      };
    }).filter(b => b.total > 0 || true); // show all buildings including empty ones
  }, [buildings, rooms, spaces]);

  // ── Floor maps for selected building ──
  const buildingFloorMaps = useMemo(() => {
    if (!floorMaps || !spaces) return [];
    if (selectedBuildingId === 'all') return floorMaps;
    const buildingSpaceIds = spaces.filter((s: any) => s.building_id === selectedBuildingId).map(s => s.id);
    return floorMaps.filter(fm => buildingSpaceIds.includes(fm.space_id));
  }, [floorMaps, spaces, selectedBuildingId]);

  // Auto-select first floor map when building changes
  useEffect(() => {
    if (buildingFloorMaps.length > 0) {
      setSelectedFloorMapId(buildingFloorMaps[0].id);
    } else {
      setSelectedFloorMapId('');
    }
  }, [buildingFloorMaps]);

  const activeFloorMap = buildingFloorMaps.find(fm => fm.id === selectedFloorMapId);

  // ── Load floor map image ──
  useEffect(() => {
    if (!activeFloorMap?.file_path) {
      setDisplayImageUrl('');
      setMapLoading(false);
      return;
    }

    const loadUrl = async () => {
      setMapLoading(true);
      try {
        const { data, error } = await supabase.storage.from('floor-maps').createSignedUrl(activeFloorMap.file_path, 3600);
        if (!error && data?.signedUrl) {
          setSignedUrl(data.signedUrl);
          if (isPdfFile(activeFloorMap.file_path)) {
            try {
              const result = await renderPdfToImage(data.signedUrl);
              setDisplayImageUrl(result.dataUrl);
            } catch {
              setDisplayImageUrl('');
            }
          } else {
            setDisplayImageUrl(data.signedUrl);
          }
        }
      } catch (err) {
        logger.error('Failed to load floor map', {}, err);
      }
      setMapLoading(false);
    };
    loadUrl();
  }, [activeFloorMap?.file_path]);

  // ── Rooms on current map ──
  const roomsOnMap = useMemo(() => {
    if (!rooms || !activeFloorMap) return [];
    return rooms.filter(r =>
      r.floor_map_id === activeFloorMap.id &&
      ((r.shape_type === 'pin' && r.pin_x != null && r.pin_y != null) ||
       (r.shape_type !== 'pin' && r.shape_json))
    );
  }, [rooms, activeFloorMap]);

  const roomsWithShapes = roomsOnMap.filter(r => r.shape_type !== 'pin' && r.shape_json);
  const roomsWithPins = roomsOnMap.filter(r => r.shape_type === 'pin' || (!r.shape_json && r.pin_x != null));

  // Unmapped rooms for this floor map (have floor_map_id but no coordinates)
  const unmappedRooms = useMemo(() => {
    if (!rooms || !activeFloorMap) return [];
    return rooms.filter(r =>
      r.floor_map_id === activeFloorMap.id &&
      (r.pin_x == null || r.pin_y == null) &&
      !r.shape_json
    );
  }, [rooms, activeFloorMap]);

  const filteredUnmappedRooms = useMemo(() => {
    if (!pinSearchQuery) return unmappedRooms;
    const q = pinSearchQuery.toLowerCase();
    return unmappedRooms.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.room_number || '').toLowerCase().includes(q)
    );
  }, [unmappedRooms, pinSearchQuery]);

  // ── Filtered rooms for list view ──
  const buildingRooms = useMemo(() => {
    if (!rooms || !spaces) return [];
    if (selectedBuildingId === 'all') return rooms;
    const buildingSpaceIds = spaces.filter((s: any) => s.building_id === selectedBuildingId).map(s => s.id);
    return rooms.filter(r => buildingSpaceIds.includes(r.space_id));
  }, [rooms, spaces, selectedBuildingId]);

  const filteredRooms = useMemo(() => {
    return buildingRooms.filter(room => {
      if (statusFilter === 'occupied' && !room.current_allocation) return false;
      if (statusFilter === 'available' && (room.current_allocation || room.status !== 'available')) return false;
      if (statusFilter === 'maintenance' && room.status !== 'maintenance') return false;
      if (roomSearch) {
        const q = roomSearch.toLowerCase();
        const occupant = room.current_allocation?.workspace?.startup?.name ||
          room.current_allocation?.funnel_item?.organization_name || '';
        return room.name.toLowerCase().includes(q) ||
          (room.room_number || '').toLowerCase().includes(q) ||
          occupant.toLowerCase().includes(q);
      }
      return true;
    });
  }, [buildingRooms, roomSearch, statusFilter]);

  const roomsByFloor = useMemo(() => {
    const acc: Record<string, Room[]> = {};
    for (const room of filteredRooms) {
      const floor = room.floor || t('common.unknown', { defaultValue: 'N/D' });
      if (!acc[floor]) acc[floor] = [];
      acc[floor].push(room);
    }
    return acc;
  }, [filteredRooms, t]);

  // ── Stats ──
  const occupiedCount = buildingRooms.filter(r => r.current_allocation).length;
  const availableCount = buildingRooms.filter(r => !r.current_allocation && r.status === 'available').length;
  const maintenanceCount = buildingRooms.filter(r => r.status === 'maintenance').length;

  // ── Building name lookup ──
  const getBuildingName = (room: Room) => {
    const space = spaces?.find(s => s.id === room.space_id);
    const buildingId = (space as any)?.building_id;
    return buildings?.find(b => b.id === buildingId)?.name || '';
  };

  const selectedBuildingName = buildings?.find(b => b.id === selectedBuildingId)?.name || t('admin.backoffice.allBuildings', { defaultValue: 'Todos os Edifícios' });

  // ── Handle room click on map ──
  const handleRoomClick = (room: Room) => {
    if (editMode) {
      setShapeEditorRoom(room);
    } else {
      setDrawerRoom(room);
      setDrawerOpen(true);
    }
  };

  // Handle click on map background in edit mode to place a pin
  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editMode || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingPinCoords({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
    setPinSearchQuery('');
  };

  // Place pin for a room at the pending coordinates
  const handlePlacePin = async (room: Room) => {
    if (!pendingPinCoords) return;
    try {
      await updateRoom.mutateAsync({
        id: room.id,
        pin_x: pendingPinCoords.x,
        pin_y: pendingPinCoords.y,
        shape_type: 'pin',
      });
      notify.success(t('admin.backoffice.pinPlaced', { defaultValue: 'Pin colocado com sucesso' }));
    } catch {
      // error handled by mutation
    }
    setPendingPinCoords(null);
  };

  // ── Upload floor map ──
  const handleUploadFloorMap = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file || !user || !mapBuildingId) return;

    setUploading(true);
    try {
      let spaceId = spaces?.find((s: any) => s.building_id === mapBuildingId)?.id as string | undefined;
      if (!spaceId) {
        const buildingName = buildings?.find(b => b.id === mapBuildingId)?.name || 'Building';
        const created = await createOfficeSpace.mutateAsync({ name: buildingName, type: 'private_office', building_id: mapBuildingId });
        spaceId = (created as any)?.id;
      }
      if (!spaceId) throw new Error('Unable to resolve office space');

      const fileExt = file.name.split('.').pop();
      const filePath = `${spaceId}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('floor-maps').upload(filePath, file);
      if (uploadError) throw uploadError;

      await createFloorMap.mutateAsync({
        space_id: spaceId,
        name: (mapName || file.name).trim(),
        floor: (mapFloor || '').trim() || null,
        file_path: filePath,
        uploaded_by: user.id,
      });

      setMapBuildingId('');
      setMapName('');
      setMapFloor('');
      setUploadDialogOpen(false);
    } catch (error) {
      logger.error('Upload floor map failed', {}, error);
      notify.error(t('admin.backoffice.uploadMapFailed', { defaultValue: 'Erro ao carregar mapa' }));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation: Mapa | Lista | Edifícios | Lista de Espera */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <Tabs value={subView} onValueChange={(v) => setSubView(v as any)}>
          <TabsList>
            <TabsTrigger value="dashboard" className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              {t('admin.backoffice.occupancyDashboard.title', { defaultValue: 'Painel' })}
            </TabsTrigger>
            <TabsTrigger value="map" className="gap-1.5">
              <MapIcon className="h-4 w-4" />
              {t('admin.backoffice.mapView', { defaultValue: 'Mapa' })}
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5">
              <List className="h-4 w-4" />
              {t('admin.backoffice.listView', { defaultValue: 'Lista' })}
            </TabsTrigger>
            <TabsTrigger value="buildings" className="gap-1.5">
              <Building2 className="h-4 w-4" />
              {t('admin.backoffice.buildings', { defaultValue: 'Edifícios' })}
            </TabsTrigger>
            <TabsTrigger value="waitlist" className="gap-1.5">
              <ListOrdered className="h-4 w-4" />
              {t('admin.backoffice.waitingList', { defaultValue: 'Lista de Espera' })}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ══════════════ DASHBOARD VIEW ══════════════ */}
      {subView === 'dashboard' && <OccupancyDashboard />}

      {/* Building Selector (shown in map/list views) */}
      {(subView === 'map' || subView === 'list') && buildingCardsData.length > 0 && (
        <BuildingSelectorCards
          buildings={buildingCardsData}
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      )}

      {/* Stats bar */}
      {(subView === 'map' || subView === 'list') && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="rounded-xl border-l-4 border-l-primary/60">
            <CardContent className="pt-4 flex items-center gap-3">
              <DoorOpen className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">{buildingRooms.length}</div>
                <p className="text-xs text-muted-foreground">{t('admin.backoffice.totalRooms', { defaultValue: 'Total' })}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-l-4 border-l-green-500">
            <CardContent className="pt-4 flex items-center gap-3">
              <DoorOpen className="h-5 w-5 text-success" />
              <div>
                <div className="text-2xl font-bold text-success">{availableCount}</div>
                <p className="text-xs text-muted-foreground">{t('admin.backoffice.available', { defaultValue: 'Disponíveis' })}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-l-4 border-l-primary">
            <CardContent className="pt-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold text-primary">{occupiedCount}</div>
                <p className="text-xs text-muted-foreground">{t('admin.backoffice.occupied', { defaultValue: 'Ocupados' })}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-l-4 border-l-yellow-500">
            <CardContent className="pt-4 flex items-center gap-3">
              <Wrench className="h-5 w-5 text-warning" />
              <div>
                <div className="text-2xl font-bold text-warning">{maintenanceCount}</div>
                <p className="text-xs text-muted-foreground">{t('admin.backoffice.maintenance', { defaultValue: 'Manutenção' })}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════ MAP VIEW ══════════════ */}
      {subView === 'map' && (
        <div className="space-y-4">
          {/* Floor map selector */}
          {buildingFloorMaps.length > 0 ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-muted-foreground">
                {t('admin.backoffice.floorPlan', { defaultValue: 'Planta' })}:
              </span>
              <div className="flex gap-2 flex-wrap">
                {buildingFloorMaps.map(fm => (
                  <Button
                    key={fm.id}
                    variant={selectedFloorMapId === fm.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedFloorMapId(fm.id)}
                  >
                    {fm.name}
                    {fm.floor && <Badge variant="secondary" className="ml-1 text-[10px]">{t('admin.backoffice.floorLabel', { defaultValue: 'Piso' })} {fm.floor}</Badge>}
                  </Button>
                ))}
              </div>
              <Button
                variant={editMode ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setEditMode(!editMode)}
                className="ml-auto"
              >
                {editMode ? <Eye className="h-4 w-4 mr-1" /> : <Edit2 className="h-4 w-4 mr-1" />}
                {editMode
                  ? t('admin.backoffice.viewMode', { defaultValue: 'Ver' })
                  : t('admin.backoffice.editMode', { defaultValue: 'Editar Mapa' })}
              </Button>
            </div>
          ) : (
            <Card className="rounded-xl">
              <CardContent className="py-12 text-center space-y-3">
                <Image className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                <p className="text-muted-foreground">
                  {t('admin.backoffice.noFloorMaps', { defaultValue: 'Nenhuma planta carregada para este edifício.' })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('admin.backoffice.uploadMapHint', { defaultValue: 'Carregue uma planta PDF ou imagem para visualizar o mapa interativo.' })}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Interactive Map Inline */}
          {activeFloorMap && (
            <Card className="rounded-xl overflow-hidden">
              <CardContent className="p-0">
                {mapLoading ? (
                  <div className="aspect-[16/10] flex flex-col items-center justify-center gap-2 bg-muted">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {t('admin.backoffice.loadingMap', { defaultValue: 'A carregar mapa...' })}
                    </span>
                  </div>
                ) : !displayImageUrl ? (
                  <div className="aspect-[16/10] flex flex-col items-center justify-center gap-4 bg-muted">
                    <MapIcon className="h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {t('admin.backoffice.pdfLoadError', { defaultValue: 'Não foi possível carregar a planta.' })}
                    </p>
                  </div>
                ) : (
                  <>
                  <div
                    ref={imageRef}
                    className={cn('relative aspect-[16/10] bg-muted', editMode && 'cursor-crosshair')}
                    {...clickableProps(editMode ? handleMapClick : undefined)}
                  >
                    <img
                      src={displayImageUrl}
                      alt={activeFloorMap.name}
                      className="w-full h-full object-contain"
                      draggable={false}
                    />

                    {/* SVG Overlay for shapes */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                      {roomsWithShapes.map(room => {
                        const isOccupied = !!room.current_allocation;
                        const fillClass = isOccupied ? 'fill-primary/30' : room.status === 'maintenance' ? 'fill-yellow-500/30' : 'fill-green-500/30';
                        const strokeClass = isOccupied ? 'stroke-primary' : room.status === 'maintenance' ? 'stroke-yellow-500' : 'stroke-green-500';

                        if (room.shape_type === 'rect' && room.shape_json) {
                          const shape = room.shape_json as RoomShapeRect;
                          return (
                            <g key={room.id} className="pointer-events-auto cursor-pointer" role="button" aria-label={`${room.name}, ${isOccupied ? (room.current_allocation?.workspace?.startup?.name || t('admin.backoffice.occupied')) : t('admin.backoffice.available')}`} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') handleRoomClick(room); }}>
                              <rect
                                x={`${shape.x}%`} y={`${shape.y}%`}
                                width={`${shape.w}%`} height={`${shape.h}%`}
                                className={cn(fillClass, strokeClass, 'stroke-2 transition-all hover:opacity-80')}
                                onClick={(e) => { e.stopPropagation(); handleRoomClick(room); }}
                              />
                              <text
                                x={`${shape.x + shape.w / 2}%`} y={`${shape.y + shape.h / 2}%`}
                                textAnchor="middle" dominantBaseline="middle"
                                className="text-xs font-medium pointer-events-none fill-foreground"
                              >
                                {room.name}
                              </text>
                            </g>
                          );
                        }

                        if (room.shape_type === 'polygon' && room.shape_json) {
                          const shape = room.shape_json as RoomShapePolygon;
                          const points = shape.points.map(p => `${p.x}%,${p.y}%`).join(' ');
                          const cx = shape.points.reduce((sum, p) => sum + p.x, 0) / shape.points.length;
                          const cy = shape.points.reduce((sum, p) => sum + p.y, 0) / shape.points.length;
                          return (
                            <g key={room.id} className="pointer-events-auto cursor-pointer" role="button" aria-label={`${room.name}`} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') handleRoomClick(room); }}>
                              <polygon
                                points={points}
                                className={cn(fillClass, strokeClass, 'stroke-2 transition-all hover:opacity-80')}
                                onClick={(e) => { e.stopPropagation(); handleRoomClick(room); }}
                              />
                              <text x={`${cx}%`} y={`${cy}%`} textAnchor="middle" dominantBaseline="middle" className="text-xs font-medium pointer-events-none fill-foreground">
                                {room.name}
                              </text>
                            </g>
                          );
                        }
                        return null;
                      })}
                    </svg>

                    {/* Pin markers */}
                    <TooltipProvider>
                      {roomsWithPins.map(room => {
                        const allocation = room.current_allocation;
                        const occupantName = allocation?.workspace?.startup?.name ||
                          allocation?.funnel_item?.organization_name;
                        const isOccupied = !!allocation;
                        return (
                          <Tooltip key={room.id}>
                            <TooltipTrigger asChild>
                              <button
                                className={cn(
                                  'absolute transform -translate-x-1/2 -translate-y-full',
                                  'transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary rounded-sm'
                                )}
                                style={{ left: `${room.pin_x}%`, top: `${room.pin_y}%` }}
                                onClick={(e) => { e.stopPropagation(); handleRoomClick(room); }}
                                aria-label={`${room.name}${isOccupied ? `, ${t('admin.backoffice.occupied')} ${occupantName || ''}` : `, ${t('admin.backoffice.available')}`}`}
                              >
                                <div className="flex flex-col items-center">
                                  <MapPin className={cn('h-7 w-7 drop-shadow-lg', isOccupied ? 'text-primary fill-primary/20' : room.status === 'maintenance' ? 'text-warning fill-yellow-500/20' : 'text-success fill-green-500/20')} />
                                  <span className={cn('text-[10px] font-medium px-1 py-0.5 rounded bg-background/90 shadow-sm -mt-1', isOccupied ? 'text-primary' : 'text-foreground')}>
                                    {room.name}
                                  </span>
                                </div>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <div className="space-y-1">
                                <div className="font-medium">{room.name}</div>
                                {room.room_number && <div className="text-xs text-muted-foreground">#{room.room_number}</div>}
                                <div className="text-xs flex items-center gap-1"><Users className="h-3 w-3" /> {room.capacity || '?'} {t('admin.backoffice.people', { defaultValue: 'pessoas' })}</div>
                                {occupantName ? (
                                  <div className="text-xs bg-primary/10 text-primary px-2 py-1 rounded mt-1">
                                    {occupantName}
                                    {allocation?.start_date && (
                                      <span className="block text-muted-foreground">
                                        {t('admin.backoffice.since', { defaultValue: 'Desde' })} {format(new Date(allocation.start_date), 'MMM yyyy')}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <Badge variant="outline" className="text-xs">{t(`admin.backoffice.roomStatus.${room.status}`, { defaultValue: room.status })}</Badge>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </TooltipProvider>

                    {/* Pending pin marker (edit mode - awaiting room selection) */}
                    {pendingPinCoords && (
                      <div
                        className="absolute transform -translate-x-1/2 -translate-y-full z-20 pointer-events-none"
                        style={{ left: `${pendingPinCoords.x}%`, top: `${pendingPinCoords.y}%` }}
                      >
                        <MapPin className="h-8 w-8 text-destructive fill-destructive/30 animate-bounce drop-shadow-lg" />
                      </div>
                    )}

                    {/* Legend */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-4 bg-background/90 rounded-lg px-3 py-1.5 shadow-sm text-xs">
                      <div className="flex items-center gap-1"><div className="h-2.5 w-2.5 rounded-full bg-primary" />{t('admin.backoffice.occupied', { defaultValue: 'Ocupado' })}</div>
                      <div className="flex items-center gap-1"><div className="h-2.5 w-2.5 rounded-full bg-success" />{t('admin.backoffice.available', { defaultValue: 'Disponível' })}</div>
                      <div className="flex items-center gap-1"><div className="h-2.5 w-2.5 rounded-full bg-warning" />{t('admin.backoffice.maintenance', { defaultValue: 'Manutenção' })}</div>
                      <span className="text-muted-foreground ml-2">{roomsOnMap.length} {t('admin.backoffice.roomsPlaced', { defaultValue: 'salas mapeadas' })}</span>
                    </div>

                    {/* Edit mode instructions */}
                    {editMode && !pendingPinCoords && (
                      <div className="absolute top-2 left-2 bg-background/95 border rounded-lg px-3 py-2 shadow-md text-xs text-muted-foreground z-10">
                        <span className="font-medium text-foreground">{t('admin.backoffice.editModeHint', { defaultValue: 'Clique no mapa para colocar um pin' })}</span>
                        <span className="ml-1">({unmappedRooms.length} {t('admin.backoffice.roomsPending', { defaultValue: 'salas por mapear' })})</span>
                      </div>
                    )}
                  </div>

                  {/* Room picker popover (appears below map when pin is pending) */}
                  {pendingPinCoords && (
                    <div className="p-3 border-t bg-muted/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {t('admin.backoffice.selectRoomForPin', { defaultValue: 'Selecione a sala para este pin:' })}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => setPendingPinCoords(null)}>
                          {t('common.cancel', { defaultValue: 'Cancelar' })}
                        </Button>
                      </div>
                      <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={pinSearchQuery}
                          onChange={(e) => setPinSearchQuery(e.target.value)}
                          placeholder={t('admin.backoffice.searchRoomCode', { defaultValue: 'Pesquisar por código (ex: S 1.11, SR2)...' })}
                          className="pl-9 h-9"
                          autoFocus
                        />
                      </div>
                      <ScrollArea className="max-h-[200px]">
                        <div className="space-y-1">
                          {filteredUnmappedRooms.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              {unmappedRooms.length === 0
                                ? t('admin.backoffice.allRoomsMapped', { defaultValue: 'Todas as salas já estão mapeadas!' })
                                : t('admin.backoffice.noMatchingRooms', { defaultValue: 'Nenhuma sala encontrada' })}
                            </p>
                          ) : (
                            filteredUnmappedRooms.map(room => (
                              <button
                                key={room.id}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary/10 flex items-center justify-between transition-colors"
                                onClick={() => handlePlacePin(room)}
                              >
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium">{room.name}</span>
                                  {room.room_number && <span className="text-xs text-muted-foreground">#{room.room_number}</span>}
                                </div>
                                <Plus className="h-4 w-4 text-muted-foreground" />
                              </button>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                  </>
                )}

                {/* Search bar below map */}
                <div className="p-3 border-t">
                  <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={roomSearch}
                      onChange={(e) => setRoomSearch(e.target.value)}
                      placeholder={t('admin.backoffice.searchRoomOrStartup', { defaultValue: 'Pesquisar sala ou startup...' })}
                      className="pl-9 h-9"
                    />
                  </div>
                  {roomSearch && (
                    <ScrollArea className="mt-2 max-h-[200px]">
                      <div className="space-y-1">
                        {filteredRooms.slice(0, 20).map(room => {
                          const alloc = room.current_allocation;
                          const occ = alloc?.workspace?.startup?.name || alloc?.funnel_item?.organization_name;
                          return (
                            <button
                              key={room.id}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted flex items-center justify-between"
                              onClick={() => handleRoomClick(room)}
                            >
                              <div className="flex items-center gap-2">
                                <div className={cn('h-2 w-2 rounded-full', alloc ? 'bg-primary' : room.status === 'maintenance' ? 'bg-warning' : 'bg-success')} />
                                <span className="text-sm font-medium">{room.name}</span>
                                {room.room_number && <span className="text-xs text-muted-foreground">#{room.room_number}</span>}
                              </div>
                              {occ && <span className="text-xs text-primary">{occ}</span>}
                            </button>
                          );
                        })}
                        {filteredRooms.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">{t('admin.backoffice.noMatchingRooms', { defaultValue: 'Nenhuma sala encontrada' })}</p>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ══════════════ LIST VIEW ══════════════ */}
      {subView === 'list' && (
        <div className="space-y-4">
          {/* Search & filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                placeholder={t('admin.backoffice.searchRooms', { defaultValue: 'Pesquisar salas...' })}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex items-center gap-1">
              {['all', 'available', 'occupied', 'maintenance'].map(status => (
                <Button
                  key={status}
                  variant={statusFilter === status ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setStatusFilter(status)}
                >
                  {status === 'all' ? t('common.all', { defaultValue: 'Todos' }) :
                   status === 'available' ? t('admin.backoffice.available', { defaultValue: 'Disponíveis' }) :
                   status === 'occupied' ? t('admin.backoffice.occupied', { defaultValue: 'Ocupados' }) :
                   t('admin.backoffice.maintenance', { defaultValue: 'Manutenção' })}
                </Button>
              ))}
            </div>
          </div>

          {/* Rooms grouped by floor */}
          {loadingRooms ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : Object.keys(roomsByFloor).length === 0 ? (
            <Card className="rounded-xl">
              <CardContent className="py-12 text-center">
                <DoorOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {roomSearch || statusFilter !== 'all'
                    ? t('admin.backoffice.noMatchingRooms', { defaultValue: 'Nenhuma sala encontrada' })
                    : t('admin.backoffice.noRooms', { defaultValue: 'Nenhuma sala registada' })}
                </p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(roomsByFloor).map(([floor, floorRooms]) => (
              <div key={floor} className="space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {t('admin.backoffice.floorLabel', { defaultValue: 'Piso' })} {floor}
                  <Badge variant="secondary">{floorRooms.length}</Badge>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {floorRooms.map(room => {
                    const allocation = room.current_allocation;
                    const occupantName = allocation?.workspace?.startup?.name ||
                      allocation?.funnel_item?.organization_name;
                    const statusColor = STATUS_COLORS[room.status] || STATUS_COLORS.available;

                    return (
                      <Card
                        key={room.id}
                        className={cn(
                          'transition-all hover:shadow-lg hover:-translate-y-0.5 rounded-xl cursor-pointer group',
                          allocation && 'border-primary/30',
                          room.status === 'maintenance' && 'border-warning/50'
                        )}
                        onClick={() => handleRoomClick(room)}
                        role="button"
                        tabIndex={0}
                        aria-label={`${room.name}${occupantName ? `, ${occupantName}` : ''}`}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRoomClick(room); }}
                      >
                        <div className={cn('h-1 w-full rounded-t-xl', statusColor)} />
                        <CardHeader className="pb-2 pt-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-sm">{room.name}</CardTitle>
                              {room.room_number && <CardDescription className="text-[10px]">#{room.room_number}</CardDescription>}
                            </div>
                            <Badge variant={allocation ? 'default' : room.status === 'maintenance' ? 'secondary' : 'outline'} className="text-[10px] px-1.5">
                              {allocation ? t('admin.backoffice.occupied', { defaultValue: 'Ocupado' }) : t(`admin.backoffice.roomStatus.${room.status}`, { defaultValue: room.status })}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2 pb-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {room.capacity || '?'} {t('admin.backoffice.people', { defaultValue: 'pessoas' })}
                            </span>
                          </div>
                          {allocation && occupantName && (
                            <div className="text-xs bg-primary/10 rounded-lg p-2 flex items-center gap-2">
                              <UserCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                              <div className="min-w-0">
                                <span className="font-medium block truncate">{occupantName}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {t('admin.backoffice.since', { defaultValue: 'Desde' })} {format(new Date(allocation.start_date), 'MMM yyyy')}
                                </span>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ══════════════ BUILDINGS VIEW ══════════════ */}
      {subView === 'buildings' && <BackofficeBuildingsTab />}

      {/* ══════════════ WAITING LIST VIEW ══════════════ */}
      {subView === 'waitlist' && <SpaceWaitingListTab />}

      {/* Space Detail Drawer */}
      <SpaceDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        room={drawerRoom}
        buildingName={drawerRoom ? getBuildingName(drawerRoom) : undefined}
      />

      {/* Shape Editor */}
      {shapeEditorRoom && activeFloorMap && signedUrl && (
        <RoomShapeEditor
          open={!!shapeEditorRoom}
          onOpenChange={(open) => { if (!open) setShapeEditorRoom(null); }}
          room={shapeEditorRoom}
          floorMapId={activeFloorMap.id}
          signedUrl={displayImageUrl || signedUrl}
        />
      )}
    </div>
  );
}
