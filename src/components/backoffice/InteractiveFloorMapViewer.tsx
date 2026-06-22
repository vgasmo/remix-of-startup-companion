import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Edit2, Eye, X, Building2, Users, Check, Trash2, Square, Pentagon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Room, type FloorMap, type RoomShapeRect, type RoomShapePolygon, useUpdateRoom } from '@/hooks/useBackoffice';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { format } from 'date-fns';
import { renderPdfToImage, isPdfFile } from '@/lib/pdfRenderer';
import { logger } from '@/lib/logger';


interface InteractiveFloorMapViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floorMap: FloorMap | null;
  rooms: Room[];
  onRoomClick?: (room: Room) => void;
}

export function InteractiveFloorMapViewer({
  open,
  onOpenChange,
  floorMap,
  rooms,
  onRoomClick,
}: InteractiveFloorMapViewerProps) {
  const { t } = useTranslation();
  const [signedUrl, setSignedUrl] = useState<string>('');
  const [displayImageUrl, setDisplayImageUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selectedRoomForPin, setSelectedRoomForPin] = useState<string>('');
  const [placingPin, setPlacingPin] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);
  const updateRoom = useUpdateRoom();

  // Get rooms on this floor map (with pins or shapes)
  const roomsOnMap = rooms.filter(r => 
    r.floor_map_id === floorMap?.id && 
    ((r.shape_type === 'pin' && r.pin_x != null && r.pin_y != null) ||
     (r.shape_type !== 'pin' && r.shape_json))
  );

  // Separate rooms by type for rendering order (shapes first, then pins on top)
  const roomsWithShapes = roomsOnMap.filter(r => r.shape_type !== 'pin' && r.shape_json);
  const roomsWithPins = roomsOnMap.filter(r => r.shape_type === 'pin' || (!r.shape_json && r.pin_x != null));
  
  // Get rooms that could be placed on this map (same floor/building, no placement yet or on this map)
  const availableRoomsForPinning = rooms.filter(r => 
    !r.floor_map_id || r.floor_map_id === floorMap?.id
  );

  useEffect(() => {
    if (!floorMap?.file_path) {
      setLoading(false);
      return;
    }

    const loadUrl = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.storage.from('floor-maps').createSignedUrl(floorMap.file_path, 3600);
        if (!error && data?.signedUrl) {
          setSignedUrl(data.signedUrl);
          
          // If it's a PDF, render first page to image
          if (isPdfFile(floorMap.file_path)) {
            try {
              const result = await renderPdfToImage(data.signedUrl);
              setDisplayImageUrl(result.dataUrl);
            } catch (pdfError) {
              logger.error('Failed to render PDF', {}, pdfError);
              notify.error(t('admin.backoffice.pdfRenderError', 'Erro ao renderizar PDF'));
              setDisplayImageUrl('');
            }
          } else {
            setDisplayImageUrl(data.signedUrl);
          }
        }
      } catch (err) {
        logger.error('Failed to load floor map', {}, err);
      }
      setLoading(false);
    };
    loadUrl();
  }, [floorMap?.file_path, t]);

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editMode || !placingPin || !selectedRoomForPin || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Save pin position
    updateRoom.mutate(
      { id: selectedRoomForPin, pin_x: x, pin_y: y, floor_map_id: floorMap?.id },
      {
        onSuccess: () => {
          notify.success(t('admin.backoffice.pinPlaced', 'Pin placed successfully'));
          setPlacingPin(false);
          setSelectedRoomForPin('');
        },
      }
    );
  };

  const handleRemovePin = (roomId: string) => {
    updateRoom.mutate(
      { id: roomId, pin_x: null, pin_y: null, floor_map_id: null },
      {
        onSuccess: () => {
          notify.success(t('admin.backoffice.pinRemoved', 'Pin removed'));
        },
      }
    );
  };

  const isPdf = floorMap?.file_path ? isPdfFile(floorMap.file_path) : false;
  const canRenderInteractive = !isPdf || displayImageUrl;
  if (!floorMap) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] !flex !flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {floorMap.name}
              {floorMap.floor && <Badge variant="secondary">Floor {floorMap.floor}</Badge>}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={editMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setEditMode(!editMode);
                  setPlacingPin(false);
                  setSelectedRoomForPin('');
                }}
              >
                {editMode ? <Eye className="h-4 w-4 mr-2" /> : <Edit2 className="h-4 w-4 mr-2" />}
                {editMode ? t('admin.backoffice.viewMode', 'View Mode') : t('admin.backoffice.editMode', 'Edit Mode')}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex gap-4 min-h-0">
          {/* Main map area */}
          <div className="flex-1 flex flex-col min-w-0">
            {loading ? (
              <div className="flex-1 bg-muted rounded-lg flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground text-sm">
                  {isPdf ? t('admin.backoffice.renderingPdf', 'A processar PDF...') : t('common.loading')}
                </span>
              </div>
            ) : !canRenderInteractive ? (
              <div className="flex-1 bg-muted rounded-lg flex flex-col items-center justify-center gap-4">
                <MapPin className="h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground text-center max-w-xs">
                  {t('admin.backoffice.pdfLoadError', 'Não foi possível carregar a planta. Tente novamente ou faça upload de uma imagem PNG/JPG.')}
                </p>
                <Button variant="outline" onClick={() => window.open(signedUrl, '_blank')}>
                  {t('admin.backoffice.openPdf', 'Abrir PDF')}
                </Button>
              </div>
            ) : (
              // Interactive canvas surface (click-to-place pin). Not a button —
              // keyboard pin-placement is provided via the edit form below.
              <div
                ref={imageRef}
                className={cn(
                  'relative flex-1 bg-muted rounded-lg overflow-hidden',
                  editMode && placingPin && 'cursor-crosshair'
                )}
                onClick={handleMapClick}
                role="application"
                aria-label="Floor plan canvas"
              >

                <img
                  src={displayImageUrl}
                  alt={floorMap.name}
                  className="w-full h-full object-contain"
                  draggable={false}
                />
                {isPdf && (
                  <div className="absolute top-2 left-2">
                    <Badge variant="secondary" className="text-xs">
                      {t('admin.backoffice.pdfRendered', 'PDF')}
                    </Badge>
                  </div>
                )}

                {/* SVG Overlay for shapes */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  {roomsWithShapes.map(room => {
                    const allocation = room.current_allocation;
                    const isOccupied = !!allocation;
                    const fillClass = isOccupied ? 'fill-primary/30' : 'fill-accent/30';
                    const strokeClass = isOccupied ? 'stroke-primary' : 'stroke-accent-foreground';
                    
                    if (room.shape_type === 'rect' && room.shape_json) {
                      const shape = room.shape_json as RoomShapeRect;
                      return (
                        <g key={room.id} className="pointer-events-auto cursor-pointer">
                          <rect
                            x={`${shape.x}%`}
                            y={`${shape.y}%`}
                            width={`${shape.w}%`}
                            height={`${shape.h}%`}
                            className={cn(
                              fillClass,
                              strokeClass,
                              'stroke-2 transition-all hover:opacity-80'
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!editMode && onRoomClick) {
                                onRoomClick(room);
                              }
                            }}
                          />
                          <text
                            x={`${shape.x + shape.w / 2}%`}
                            y={`${shape.y + shape.h / 2}%`}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className={cn(
                              'text-xs font-medium pointer-events-none',
                              isOccupied ? 'fill-primary' : 'fill-foreground'
                            )}
                          >
                            {room.name}
                          </text>
                        </g>
                      );
                    }
                    
                    if (room.shape_type === 'polygon' && room.shape_json) {
                      const shape = room.shape_json as RoomShapePolygon;
                      const points = shape.points.map(p => `${p.x}%,${p.y}%`).join(' ');
                      // Calculate centroid for label
                      const cx = shape.points.reduce((sum, p) => sum + p.x, 0) / shape.points.length;
                      const cy = shape.points.reduce((sum, p) => sum + p.y, 0) / shape.points.length;
                      
                      return (
                        <g key={room.id} className="pointer-events-auto cursor-pointer">
                          <polygon
                            points={points}
                            className={cn(
                              fillClass,
                              strokeClass,
                              'stroke-2 transition-all hover:opacity-80'
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!editMode && onRoomClick) {
                                onRoomClick(room);
                              }
                            }}
                          />
                          <text
                            x={`${cx}%`}
                            y={`${cy}%`}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className={cn(
                              'text-xs font-medium pointer-events-none',
                              isOccupied ? 'fill-primary' : 'fill-foreground'
                            )}
                          >
                            {room.name}
                          </text>
                        </g>
                      );
                    }
                    
                    return null;
                  })}
                </svg>

                {/* Render pins (fallback for rooms without shapes) */}
                <TooltipProvider>
                  {roomsWithPins.map(room => {
                    const allocation = room.current_allocation;
                    const occupantName = allocation?.workspace?.startup?.name ||
                      allocation?.funnel_item?.organization_name ||
                      allocation?.funnel_item?.contact_name;
                    const isOccupied = !!allocation;

                    return (
                      <Tooltip key={room.id}>
                        <TooltipTrigger asChild>
                          <button
                            className={cn(
                              'absolute transform -translate-x-1/2 -translate-y-full',
                              'transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary',
                              editMode && 'cursor-move'
                            )}
                            style={{ left: `${room.pin_x}%`, top: `${room.pin_y}%` }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!editMode && onRoomClick) {
                                onRoomClick(room);
                              }
                            }}
                          >
                            <div className={cn(
                              'flex flex-col items-center',
                            )}>
                              <MapPin
                                className={cn(
                                  'h-5 w-5 drop-shadow-md',
                                  isOccupied ? 'text-primary fill-primary/20' : 'text-accent-foreground fill-accent/20'
                                )}
                              />
                              <span className={cn(
                                'text-[10px] font-medium px-1 py-px rounded bg-background/90 shadow-sm -mt-0.5',
                                isOccupied ? 'text-primary' : 'text-accent-foreground'
                              )}>
                                {room.name}
                              </span>
                            </div>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-1">
                            <div className="font-medium">{room.name}</div>
                            {room.room_number && <div className="text-xs text-muted-foreground">#{room.room_number}</div>}
                            <div className="flex items-center gap-1 text-xs">
                              <Users className="h-3 w-3" />
                              {room.capacity || '?'} people
                            </div>
                            {occupantName ? (
                              <div className="text-xs bg-primary/10 text-primary px-2 py-1 rounded mt-1">
                                {occupantName}
                                {allocation?.start_date && (
                                  <span className="block text-muted-foreground">
                                    Since {format(new Date(allocation.start_date), 'MMM yyyy')}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-accent-foreground font-medium mt-1">
                                {t('admin.backoffice.vacant', 'Vacant')}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </TooltipProvider>

                {/* Placing pin indicator */}
                {editMode && placingPin && (
                  <div className="absolute inset-0 bg-primary/5 pointer-events-none flex items-center justify-center">
                    <div className="bg-background/95 rounded-lg px-4 py-2 shadow-lg">
                      <span className="text-sm">{t('admin.backoffice.clickToPlacePin', 'Click on the map to place the pin')}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar for edit mode */}
          {editMode && canRenderInteractive && (
            <div className="w-72 flex flex-col border-l pl-4 min-h-0">
              <h3 className="font-medium mb-3">{t('admin.backoffice.placeRoomPins', 'Place Room Pins')}</h3>
              
              <div className="space-y-3 mb-4">
                <Select
                  value={selectedRoomForPin}
                  onValueChange={(val) => {
                    setSelectedRoomForPin(val);
                    setPlacingPin(false);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.backoffice.selectRoom', 'Select a room...')} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoomsForPinning.map(room => (
                      <SelectItem key={room.id} value={room.id}>
                        <span className="flex items-center gap-2">
                          {room.name}
                          {room.pin_x != null && <Check className="h-3 w-3 text-accent-foreground" />}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedRoomForPin && (
                  <Button
                    className="w-full"
                    onClick={() => setPlacingPin(true)}
                    disabled={placingPin}
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    {placingPin ? t('admin.backoffice.clickOnMap', 'Click on map...') : t('admin.backoffice.placePin', 'Place Pin')}
                  </Button>
                )}

                {placingPin && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setPlacingPin(false);
                      setSelectedRoomForPin('');
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    {t('common.cancel')}
                  </Button>
                )}
              </div>

              {/* List of placed pins */}
              <div className="flex-1 min-h-0">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  {t('admin.backoffice.placedPins', 'Placed Pins')} ({roomsWithPins.length})
                </h4>
                <ScrollArea className="h-full">
                  <div className="space-y-2 pr-2">
                    {roomsWithPins.map(room => {
                      const allocation = room.current_allocation;
                      const occupantName = allocation?.workspace?.startup?.name ||
                        allocation?.funnel_item?.organization_name ||
                        allocation?.funnel_item?.contact_name;

                      return (
                        <div
                          key={room.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">{room.name}</div>
                            {occupantName && (
                              <div className="text-xs text-primary truncate">{occupantName}</div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleRemovePin(room.id)}
                           aria-label={t('common.delete')}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}

                    {roomsWithPins.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        {t('admin.backoffice.noPinsYet', 'No pins placed yet')}
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 pt-2 border-t text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary fill-primary/20" />
            <span>{t('admin.backoffice.occupied', 'Occupied')}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-accent-foreground fill-accent/20" />
            <span>{t('admin.backoffice.vacant', 'Vacant')}</span>
          </div>
          <div className="ml-auto text-muted-foreground text-xs">
            {roomsOnMap.length} {t('admin.backoffice.roomsPlaced', 'rooms placed')}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
