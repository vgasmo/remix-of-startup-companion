import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Plus, MapPin, Users, Building2, Monitor,
  DoorOpen, Wrench, Image, Upload, Trash2, UserCheck, Eye, History, Search
} from 'lucide-react';
import { InteractiveFloorMapViewer } from './InteractiveFloorMapViewer';
import { BuildingOccupancyPanel } from './BuildingOccupancyPanel';
import { StartupSpaceSearch } from './StartupSpaceSearch';
import { RoomAllocationHistory } from './RoomAllocationHistory';
import { BuildingSelectorCards } from './BuildingSelectorCards';
import { SpaceOccupancyChart } from './SpaceOccupancyChart';
import {
  useRoomsWithAllocations,
  useCreateRoom,
  useUpdateRoom,
  useCreateRoomAllocation,
  useEndRoomAllocation,
  useFloorMaps,
  useCreateFloorMap,
  useDeleteFloorMap,
  useOfficeSpaces,
  useBuildings,
  useCreateOfficeSpace,
  type Room,
  type FloorMap
} from '@/hooks/useBackoffice';
import { useWorkspaces, ALL_WORKSPACE_STATUSES } from '@/hooks/useWorkspaces';
import { useFunnelItems } from '@/hooks/useFunnel';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';

// Room type config with i18n keys
const ROOM_TYPE_ICONS: Record<string, typeof DoorOpen> = {
  office: Building2,
  desk: Monitor,
  meeting_room: Users,
  lab: Wrench,
  event_space: Users,
};

// Status colors (labels come from i18n)
const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-500',
  occupied: 'bg-blue-500',
  maintenance: 'bg-yellow-500',
  reserved: 'bg-purple-500',
};

// FloorMapCard component to handle async URL loading
function FloorMapCard({ 
  map, 
  onDelete,
  onViewInteractive 
}: { 
  map: FloorMap & { space?: { name: string } }; 
  onDelete: () => void;
  onViewInteractive: () => void;
}) {
  const { t } = useTranslation();
  const [signedUrl, setSignedUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const isPdf = map.file_path.toLowerCase().endsWith('.pdf');

  useEffect(() => {
    const loadUrl = async () => {
      const { data, error } = await supabase.storage.from('floor-maps').createSignedUrl(map.file_path, 3600);
      if (!error && data?.signedUrl) {
        setSignedUrl(data.signedUrl);
      }
      setLoading(false);
    };
    loadUrl();
  }, [map.file_path]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{map.name}</CardTitle>
            <CardDescription>
              {map.space?.name} {map.floor && `• ${t('admin.backoffice.floor')} ${map.floor}`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary hover:text-primary/80"
              onClick={onViewInteractive}
              title={t('admin.backoffice.viewInteractive')}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
            <span className="text-muted-foreground text-sm">{t('common.loading')}</span>
          </div>
        ) : signedUrl ? (
          isPdf ? (
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block aspect-video bg-muted rounded-lg flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Image className="h-10 w-10" />
                <span className="text-sm font-medium">{t('admin.backoffice.openPdf')}</span>
              </div>
            </a>
          ) : (
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block aspect-video bg-muted rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
            >
              <img
                src={signedUrl}
                alt={map.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/placeholder.svg';
                }}
              />
            </a>
          )
        ) : (
          <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
            <span className="text-muted-foreground text-sm">{t('common.error')}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RoomMappingTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selectedSpace, setSelectedSpace] = useState<string>('all');
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [allocateDialogOpen, setAllocateDialogOpen] = useState(false);
  const [mapDialogOpen, setMapDialogOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomToAllocate, setRoomToAllocate] = useState<Room | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedFloorMap, setSelectedFloorMap] = useState<FloorMap | null>(null);

  const [mapBuildingId, setMapBuildingId] = useState<string>('');
  const [mapName, setMapName] = useState<string>('');
  const [mapFloor, setMapFloor] = useState<string>('');

  const { data: buildings } = useBuildings();
  const { data: spaces } = useOfficeSpaces();
  const { data: rooms, isLoading } = useRoomsWithAllocations(selectedSpace === 'all' ? undefined : selectedSpace);
  const { data: floorMaps } = useFloorMaps(selectedSpace === 'all' ? undefined : selectedSpace);
  const { data: workspaces } = useWorkspaces({}, false, ALL_WORKSPACE_STATUSES);
  const { data: funnelItems } = useFunnelItems();

  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom();
  const createAllocation = useCreateRoomAllocation();
  const endAllocation = useEndRoomAllocation();
  const createFloorMap = useCreateFloorMap();
  const deleteFloorMap = useDeleteFloorMap();
  const createOfficeSpace = useCreateOfficeSpace();

  const handleSaveRoom = async (formData: FormData) => {
    const payload = {
      space_id: formData.get('space_id') as string,
      name: formData.get('name') as string,
      room_number: formData.get('room_number') as string || null,
      floor: formData.get('floor') as string || null,
      room_type: formData.get('room_type') as string,
      capacity: parseInt(formData.get('capacity') as string) || null,
      status: formData.get('status') as string,
      notes: formData.get('notes') as string || null,
    };

    if (selectedRoom) {
      await updateRoom.mutateAsync({ id: selectedRoom.id, ...payload });
    } else {
      await createRoom.mutateAsync(payload);
    }
    setRoomDialogOpen(false);
    setSelectedRoom(null);
  };

  const handleAllocate = async (formData: FormData) => {
    if (!roomToAllocate || !user) return;
    
    const workspaceId = formData.get('workspace_id') as string;
    const funnelItemId = formData.get('funnel_item_id') as string;

    await createAllocation.mutateAsync({
      room_id: roomToAllocate.id,
      workspace_id: workspaceId || null,
      funnel_item_id: funnelItemId || null,
      allocation_type: formData.get('allocation_type') as string,
      start_date: formData.get('start_date') as string,
      end_date: formData.get('end_date') as string || null,
      notes: formData.get('notes') as string || null,
      created_by: user.id,
    });
    setAllocateDialogOpen(false);
    setRoomToAllocate(null);
  };

  const handleUploadFloorMap = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0];
    if (!file || !user) return;

    if (!mapBuildingId) {
      notify.error(t('admin.backoffice.selectBuildingFirst'));
      inputEl.value = '';
      return;
    }

    const getErrorMessage = (err: unknown) => {
      if (!err) return '';
      if (typeof err === 'string') return err;
      if (typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') return (err as any).message;
      if (typeof err === 'object' && 'error_description' in err && typeof (err as any).error_description === 'string') return (err as any).error_description;
      return '';
    };

    setUploading(true);
    try {
      // Floor maps are tied to office_spaces (space_id). If the admin hasn't created
      // any spaces yet, we create a lightweight “building space” record so maps can be stored.
      let spaceId = spaces?.find((s: any) => s.building_id === mapBuildingId)?.id as string | undefined;

      if (!spaceId) {
        const buildingName = buildings?.find((b) => b.id === mapBuildingId)?.name || 'Building';
        const created = await createOfficeSpace.mutateAsync({
          name: buildingName,
          type: 'private_office',
          building_id: mapBuildingId,
        });
        spaceId = (created as any)?.id;
      }

      if (!spaceId) {
        throw new Error('Unable to resolve office space for building');
      }

      const fileExt = file.name.split('.').pop();
      const filePath = `${spaceId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('floor-maps')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      await createFloorMap.mutateAsync({
        space_id: spaceId,
        name: (mapName || file.name).trim(),
        floor: (mapFloor || '').trim() || null,
        file_path: filePath,
        uploaded_by: user.id,
      });

      // Reset before closing to avoid interacting with an unmounted input
      inputEl.value = '';
      setMapBuildingId('');
      setMapName('');
      setMapFloor('');
      setMapDialogOpen(false);
    } catch (error) {
      logger.error('Upload floor map failed', {}, error);
      const details = getErrorMessage(error);
      notify.error(
        details
           ? `${t('admin.backoffice.uploadMapFailed')}: ${details}`
           : t('admin.backoffice.uploadMapFailed')
      );
    } finally {
      setUploading(false);
    }
  };

  // Group rooms by floor
  const roomsByFloor = rooms?.reduce((acc, room) => {
    const floor = room.floor || t('common.unknown');
    if (!acc[floor]) acc[floor] = [];
    acc[floor].push(room);
    return acc;
  }, {} as Record<string, Room[]>);

  const occupiedCount = rooms?.filter(r => r.current_allocation).length || 0;
  const availableCount = rooms?.filter(r => !r.current_allocation && r.status === 'available').length || 0;
  const maintenanceCount = rooms?.filter(r => r.status === 'maintenance').length || 0;

  // Build building cards data
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
    }).filter(b => b.total > 0);
  }, [buildings, rooms, spaces]);

  // Room search/filter
  const [roomSearch, setRoomSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredRoomsByFloor = useMemo(() => {
    if (!roomsByFloor) return {};
    const result: Record<string, Room[]> = {};
    for (const [floor, floorRooms] of Object.entries(roomsByFloor)) {
      const filtered = floorRooms.filter(room => {
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
      if (filtered.length > 0) result[floor] = filtered;
    }
    return result;
  }, [roomsByFloor, roomSearch, statusFilter]);

  // Find space IDs for a given building
  const getSpaceIdsForBuilding = (buildingId: string) => {
    return spaces?.filter((s: any) => s.building_id === buildingId).map(s => s.id) || [];
  };

  // Handle building selection from cards
  const handleBuildingSelect = (id: string) => {
    if (id === 'all') {
      setSelectedSpace('all');
    } else {
      const spaceIds = getSpaceIdsForBuilding(id);
      if (spaceIds.length > 0) {
        setSelectedSpace(spaceIds[0]);
      }
    }
  };

  // Determine which building is selected
  const selectedBuildingId = useMemo(() => {
    if (selectedSpace === 'all') return 'all';
    const space = spaces?.find(s => s.id === selectedSpace);
    return (space as any)?.building_id || 'all';
  }, [selectedSpace, spaces]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t('admin.backoffice.roomMapping')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('admin.backoffice.roomMappingDesc')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Dialog open={mapDialogOpen} onOpenChange={setMapDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Image className="h-4 w-4 mr-2" />
                {t('admin.backoffice.uploadMap')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('admin.backoffice.uploadFloorMap')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                   <Label>{t('admin.backoffice.building')}</Label>
                  <Select value={mapBuildingId} onValueChange={setMapBuildingId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('admin.backoffice.selectBuilding')} />
                    </SelectTrigger>
                    <SelectContent>
                      {buildings?.map((building) => (
                        <SelectItem key={building.id} value={building.id}>
                          {building.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('admin.backoffice.mapName')}</Label>
                    <Input
                      value={mapName}
                      onChange={(e) => setMapName(e.target.value)}
                      placeholder={t('admin.backoffice.mapNamePlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                     <Label>{t('admin.backoffice.floor')}</Label>
                    <Input
                      value={mapFloor}
                      onChange={(e) => setMapFloor(e.target.value)}
                      placeholder={t('admin.backoffice.floorPlaceholder')}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.backoffice.mapFile')}</Label>
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleUploadFloorMap}
                    disabled={uploading || !mapBuildingId}
                  />
                  {!mapBuildingId && (
                    <p className="text-xs text-muted-foreground">
                      {t('admin.backoffice.selectBuildingFirst')}
                    </p>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setSelectedRoom(null)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('admin.backoffice.addRoom')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {selectedRoom ? t('admin.backoffice.editRoom') : t('admin.backoffice.addRoom')}
                </DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveRoom(new FormData(e.currentTarget));
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                   <Label>{t('admin.backoffice.building')}</Label>
                   <Select name="space_id" defaultValue={selectedRoom?.space_id || selectedSpace !== 'all' ? selectedSpace : undefined} required>
                     <SelectTrigger>
                       <SelectValue placeholder={t('admin.backoffice.selectBuilding')} />
                    </SelectTrigger>
                    <SelectContent>
                      {spaces?.map(space => (
                        <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('admin.backoffice.roomName')}</Label>
                    <Input
                      name="name"
                      placeholder={t('admin.backoffice.roomNamePlaceholder')}
                      defaultValue={selectedRoom?.name || ''}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('admin.backoffice.roomNumber')}</Label>
                    <Input
                      name="room_number"
                      placeholder={t('admin.backoffice.roomNumberPlaceholder')}
                      defaultValue={selectedRoom?.room_number || ''}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t('admin.backoffice.floor')}</Label>
                    <Input
                      name="floor"
                      placeholder={t('admin.backoffice.floorPlaceholder')}
                      defaultValue={selectedRoom?.floor || ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('admin.backoffice.type')}</Label>
                    <Select name="room_type" defaultValue={selectedRoom?.room_type || 'office'}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                         <SelectItem value="office">{t('admin.backoffice.roomTypes.office')}</SelectItem>
                         <SelectItem value="desk">{t('admin.backoffice.roomTypes.desk')}</SelectItem>
                         <SelectItem value="meeting_room">{t('admin.backoffice.roomTypes.meeting_room')}</SelectItem>
                         <SelectItem value="lab">{t('admin.backoffice.roomTypes.lab')}</SelectItem>
                         <SelectItem value="event_space">{t('admin.backoffice.roomTypes.event_space')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('admin.backoffice.capacity')}</Label>
                    <Input
                      type="number"
                      name="capacity"
                      defaultValue={selectedRoom?.capacity || ''}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.status')}</Label>
                  <Select name="status" defaultValue={selectedRoom?.status || 'available'}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                       <SelectItem value="available">{t('admin.backoffice.roomStatus.available')}</SelectItem>
                       <SelectItem value="occupied">{t('admin.backoffice.roomStatus.occupied')}</SelectItem>
                       <SelectItem value="maintenance">{t('admin.backoffice.roomStatus.maintenance')}</SelectItem>
                       <SelectItem value="reserved">{t('admin.backoffice.roomStatus.reserved')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                   <Label>{t('admin.backoffice.notes')}</Label>
                  <Textarea
                    name="notes"
                    defaultValue={selectedRoom?.notes || ''}
                  />
                </div>

                {selectedRoom && (
                  <div className="border-t pt-4">
                    <RoomAllocationHistory roomId={selectedRoom.id} roomName={selectedRoom.name} />
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setRoomDialogOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit">
                    {t('common.save')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Visual Building Selector */}
      {buildingCardsData.length > 0 && (
        <BuildingSelectorCards
          buildings={buildingCardsData}
          selectedId={selectedBuildingId}
          onSelect={handleBuildingSelect}
        />
      )}

      {/* Visual Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-xl border-l-4 border-l-primary/60">
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <DoorOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold">{rooms?.length || 0}</div>
              <p className="text-xs text-muted-foreground">{t('admin.backoffice.totalRooms')}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-l-4 border-l-accent">
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center">
              <DoorOpen className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <div className="text-2xl font-bold text-accent-foreground">{availableCount}</div>
              <p className="text-xs text-muted-foreground">{t('admin.backoffice.availableRooms')}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-l-4 border-l-primary">
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">{occupiedCount}</div>
              <p className="text-xs text-muted-foreground">{t('admin.backoffice.occupiedRooms')}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-l-4 border-l-muted-foreground/30">
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Image className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-2xl font-bold">{floorMaps?.length || 0}</div>
              <p className="text-xs text-muted-foreground">{t('admin.backoffice.floorMaps')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rooms" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rooms">
            <DoorOpen className="h-4 w-4 mr-2" />
            {t('admin.backoffice.rooms')}
          </TabsTrigger>
          <TabsTrigger value="maps">
            <Image className="h-4 w-4 mr-2" />
            {t('admin.backoffice.floorMaps')}
          </TabsTrigger>
          <TabsTrigger value="overview">
            <Building2 className="h-4 w-4 mr-2" />
            {t('admin.backoffice.overview')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rooms">
          {/* Room search & filter bar */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                placeholder={t('admin.backoffice.searchRooms')}
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
                   {status === 'all' ? t('common.all') :
                    status === 'available' ? t('admin.backoffice.available') :
                    status === 'occupied' ? t('admin.backoffice.occupied') :
                    t('admin.backoffice.maintenance')}
                </Button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
          ) : (
            <div className="space-y-6">
              {Object.keys(filteredRoomsByFloor).length === 0 ? (
                <Card className="rounded-xl">
                  <CardContent className="py-12 text-center">
                    <DoorOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {roomSearch || statusFilter !== 'all'
                         ? t('admin.backoffice.noMatchingRooms')
                         : t('admin.backoffice.noRooms')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                Object.entries(filteredRoomsByFloor).map(([floor, floorRooms]) => (
                <div key={floor} className="space-y-3">
                  <h3 className="font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                     {t('admin.backoffice.floor')} {floor}
                     <Badge variant="secondary">{floorRooms.length} {t('admin.backoffice.rooms')}</Badge>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {floorRooms.map(room => {
                      const TypeIcon = ROOM_TYPE_ICONS[room.room_type] || DoorOpen;
                      const statusColor = STATUS_COLORS[room.status] || STATUS_COLORS.available;
                      const allocation = room.current_allocation;
                      const occupantName = allocation?.workspace?.startup?.name || 
                        allocation?.funnel_item?.organization_name || 
                        allocation?.funnel_item?.contact_name;

                      return (
                        <TooltipProvider key={room.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Card
                                className={cn(
                                  'transition-all hover:shadow-lg hover:-translate-y-0.5 rounded-xl group relative overflow-hidden',
                                  allocation && 'border-primary/30',
                                  room.status === 'maintenance' && 'border-secondary/50'
                                )}
                              >
                                {/* Status strip at top */}
                                <div className={cn('h-1 w-full', statusColor)} />
                                <CardHeader className="pb-2 pt-3">
                                  <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className={cn(
                                        'h-8 w-8 rounded-lg flex items-center justify-center',
                                        allocation ? 'bg-primary/10' : 'bg-muted'
                                      )}>
                                        <TypeIcon className={cn('h-4 w-4', allocation ? 'text-primary' : 'text-muted-foreground')} />
                                      </div>
                                      <div>
                                        <CardTitle className="text-sm">{room.name}</CardTitle>
                                        {room.room_number && (
                                          <CardDescription className="text-[10px]">#{room.room_number}</CardDescription>
                                        )}
                                      </div>
                                    </div>
                                    <Badge
                                      variant={allocation ? 'default' : room.status === 'maintenance' ? 'secondary' : 'outline'}
                                      className="text-[10px] px-1.5"
                                    >
                                       {allocation ? t('admin.backoffice.occupied') :
                                        t(`admin.backoffice.roomStatus.${room.status}`)}
                                    </Badge>
                                  </div>
                                </CardHeader>
                                <CardContent className="space-y-2 pb-3">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      {room.capacity || '?'} {t('admin.backoffice.people')}
                                    </span>
                                    <Badge variant="outline" className="text-[10px] px-1">
                                      {t(`admin.backoffice.roomTypes.${room.room_type}`)}
                                    </Badge>
                                  </div>

                                  {allocation && occupantName && (
                                    <div className="text-xs bg-primary/10 rounded-lg p-2 flex items-center gap-2">
                                      <UserCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                      <div className="min-w-0">
                                        <span className="font-medium block truncate">{occupantName}</span>
                                        <span className="text-[10px] text-muted-foreground">
                                          {t('admin.backoffice.since')} {format(new Date(allocation.start_date), 'MMM yyyy')}
                                        </span>
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex gap-2 pt-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1 h-7 text-xs"
                                      onClick={() => {
                                        setSelectedRoom(room);
                                        setRoomDialogOpen(true);
                                      }}
                                    >
                                      {t('common.edit')}
                                    </Button>
                                    {!allocation && room.status === 'available' ? (
                                      <Button
                                        size="sm"
                                        className="flex-1 h-7 text-xs"
                                        onClick={() => {
                                          setRoomToAllocate(room);
                                          setAllocateDialogOpen(true);
                                        }}
                                      >
                                        {t('admin.backoffice.allocate')}
                                      </Button>
                                    ) : allocation ? (
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        className="flex-1 h-7 text-xs"
                                        onClick={() => endAllocation.mutate({ id: allocation.id, roomId: room.id })}
                                      >
                                        {t('admin.backoffice.endAllocation')}
                                      </Button>
                                    ) : null}
                                  </div>
                                </CardContent>
                              </Card>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-medium">{room.name}</p>
                              {room.notes && <p className="text-xs text-muted-foreground mt-1">{room.notes}</p>}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                </div>
              )))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="maps">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {floorMaps?.map(map => (
              <FloorMapCard 
                key={map.id} 
                map={map} 
                onDelete={() => deleteFloorMap.mutate({ id: map.id, filePath: map.file_path })}
                onViewInteractive={() => {
                  setSelectedFloorMap(map);
                  setViewerOpen(true);
                }}
              />
            ))}

            {(!floorMaps || floorMaps.length === 0) && (
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Image className="h-12 w-12 text-muted-foreground mb-4" />
                   <h3 className="font-medium">{t('admin.backoffice.noFloorMaps')}</h3>
                   <p className="text-sm text-muted-foreground mb-4">
                     {t('admin.backoffice.noFloorMapsDesc')}
                  </p>
                  <Button onClick={() => setMapDialogOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    {t('admin.backoffice.uploadMap')}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Overview Tab with Occupancy Panel and Search */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BuildingOccupancyPanel />
            <StartupSpaceSearch
              onViewRoom={(room) => {
                setSelectedRoom(room);
                setRoomDialogOpen(true);
              }}
              onViewFloorMap={(floorMap, room) => {
                setSelectedFloorMap(floorMap);
                setViewerOpen(true);
              }}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Allocation Dialog */}
      <Dialog open={allocateDialogOpen} onOpenChange={setAllocateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.backoffice.allocateRoom')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAllocate(new FormData(e.currentTarget));
            }}
            className="space-y-4"
          >
            <div className="p-3 bg-muted rounded-lg">
              <span className="text-sm text-muted-foreground">{t('admin.backoffice.room')}:</span>
              <span className="font-medium ml-2">{roomToAllocate?.name}</span>
            </div>

            <div className="space-y-2">
              <Label>{t('admin.backoffice.allocateTo')}</Label>
              <Tabs defaultValue="startup" className="w-full">
                <TabsList className="w-full">
                   <TabsTrigger value="startup" className="flex-1">{t('admin.backoffice.startupWorkspace')}</TabsTrigger>
                   <TabsTrigger value="lead" className="flex-1">{t('admin.backoffice.leadFunnelItem')}</TabsTrigger>
                </TabsList>
                <TabsContent value="startup" className="mt-2">
                  <Select name="workspace_id">
                    <SelectTrigger>
                      <SelectValue placeholder={t('admin.backoffice.selectStartup')} />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces?.map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.startup?.name || t('common.unnamed')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TabsContent>
                <TabsContent value="lead" className="mt-2">
                  <Select name="funnel_item_id">
                    <SelectTrigger>
                      <SelectValue placeholder={t('admin.backoffice.selectLead')} />
                    </SelectTrigger>
                    <SelectContent>
                      <ScrollArea className="h-[200px]">
                        {funnelItems?.map(item => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.organization_name || item.contact_name || t('common.unnamed')}
                          </SelectItem>
                        ))}
                      </ScrollArea>
                    </SelectContent>
                  </Select>
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-2">
               <Label>{t('admin.backoffice.allocationTypeLabel')}</Label>
               <Select name="allocation_type" defaultValue="permanent">
                 <SelectTrigger>
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="permanent">{t('admin.backoffice.allocationTypePermanent')}</SelectItem>
                   <SelectItem value="temporary">{t('admin.backoffice.allocationTypeTemporary')}</SelectItem>
                   <SelectItem value="hotdesk">{t('admin.backoffice.allocationTypeHotdesk')}</SelectItem>
                 </SelectContent>
               </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('admin.backoffice.startDate')}</Label>
                <Input
                  type="date"
                  name="start_date"
                  defaultValue={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.backoffice.endDate')}</Label>
                <Input type="date" name="end_date" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('admin.backoffice.notes')}</Label>
              <Textarea name="notes" />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAllocateDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit">
                {t('admin.backoffice.confirmAllocation')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Interactive Floor Map Viewer */}
      <InteractiveFloorMapViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        floorMap={selectedFloorMap}
        rooms={rooms || []}
        onRoomClick={(room) => {
          setSelectedRoom(room);
          setRoomDialogOpen(true);
        }}
      />
    </div>
  );
}