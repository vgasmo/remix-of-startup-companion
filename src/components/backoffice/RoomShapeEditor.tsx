import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Square, Pentagon, MapPin, Undo, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Room, type RoomShapeRect, type RoomShapePolygon, type RoomShapeType, useUpdateRoom } from '@/hooks/useBackoffice';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';

interface RoomShapeEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: Room;
  floorMapId: string;
  signedUrl: string;
}

export function RoomShapeEditor({
  open,
  onOpenChange,
  room,
  floorMapId,
  signedUrl,
}: RoomShapeEditorProps) {
  const { t } = useTranslation();
  const imageRef = useRef<HTMLDivElement>(null);
  const updateRoom = useUpdateRoom();
  
  const [shapeType, setShapeType] = useState<RoomShapeType>(room.shape_type || 'pin');
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<RoomShapeRect | null>(
    room.shape_type === 'rect' ? room.shape_json as RoomShapeRect : null
  );
  const [polygonPoints, setPolygonPoints] = useState<Array<{ x: number; y: number }>>(
    room.shape_type === 'polygon' ? (room.shape_json as RoomShapePolygon)?.points || [] : []
  );
  const [pinPosition, setPinPosition] = useState<{ x: number; y: number } | null>(
    room.pin_x != null && room.pin_y != null ? { x: room.pin_x, y: room.pin_y } : null
  );

  const getMousePosition = useCallback((e: React.MouseEvent) => {
    if (!imageRef.current) return null;
    const rect = imageRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getMousePosition(e);
    if (!pos) return;

    if (shapeType === 'pin') {
      setPinPosition(pos);
    } else if (shapeType === 'rect') {
      setIsDrawing(true);
      setStartPoint(pos);
      setCurrentRect(null);
    } else if (shapeType === 'polygon') {
      setPolygonPoints([...polygonPoints, pos]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || shapeType !== 'rect' || !startPoint) return;
    
    const pos = getMousePosition(e);
    if (!pos) return;

    setCurrentRect({
      x: Math.min(startPoint.x, pos.x),
      y: Math.min(startPoint.y, pos.y),
      w: Math.abs(pos.x - startPoint.x),
      h: Math.abs(pos.y - startPoint.y),
    });
  };

  const handleMouseUp = () => {
    if (shapeType === 'rect' && isDrawing) {
      setIsDrawing(false);
      setStartPoint(null);
    }
  };

  const handleUndo = () => {
    if (shapeType === 'polygon' && polygonPoints.length > 0) {
      setPolygonPoints(polygonPoints.slice(0, -1));
    } else if (shapeType === 'rect') {
      setCurrentRect(null);
    } else if (shapeType === 'pin') {
      setPinPosition(null);
    }
  };

  const handleSave = async () => {
    try {
      let shapeJson: RoomShapeRect | RoomShapePolygon | null = null;
      let pinX: number | null = null;
      let pinY: number | null = null;

      if (shapeType === 'pin' && pinPosition) {
        pinX = pinPosition.x;
        pinY = pinPosition.y;
      } else if (shapeType === 'rect' && currentRect) {
        shapeJson = currentRect;
      } else if (shapeType === 'polygon' && polygonPoints.length >= 3) {
        shapeJson = { points: polygonPoints };
      } else {
        notify.error(t('admin.backoffice.noShapeDrawn', 'Please draw a shape first'));
        return;
      }

      await updateRoom.mutateAsync({
        id: room.id,
        floor_map_id: floorMapId,
        shape_type: shapeType,
        shape_json: shapeJson,
        pin_x: pinX,
        pin_y: pinY,
      });
      notify.success(t('admin.backoffice.shapeUpdated', 'Room shape updated'));
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to save shape', {}, error);
      notify.error(t('admin.backoffice.shapeUpdateFailed', 'Failed to update room shape'));
    }
  };

  const hasValidShape = 
    (shapeType === 'pin' && pinPosition) ||
    (shapeType === 'rect' && currentRect && currentRect.w > 1 && currentRect.h > 1) ||
    (shapeType === 'polygon' && polygonPoints.length >= 3);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] !flex !flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t('admin.backoffice.editRoomShape', 'Edit Room Shape')}
            <Badge variant="secondary">{room.name}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-4">
          {/* Shape type selector */}
          <div className="w-48 space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {t('admin.backoffice.shapeType', 'Shape Type')}
              </Label>
              <RadioGroup
                value={shapeType}
                onValueChange={(val) => {
                  setShapeType(val as RoomShapeType);
                  // Reset drawings when switching type
                  setCurrentRect(null);
                  setPolygonPoints([]);
                  setPinPosition(null);
                }}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="pin" id="pin" />
                  <Label htmlFor="pin" className="flex items-center gap-2 cursor-pointer">
                    <MapPin className="h-4 w-4" />
                    {t('admin.backoffice.pin', 'Pin')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="rect" id="rect" />
                  <Label htmlFor="rect" className="flex items-center gap-2 cursor-pointer">
                    <Square className="h-4 w-4" />
                    {t('admin.backoffice.rectangle', 'Rectangle')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="polygon" id="polygon" />
                  <Label htmlFor="polygon" className="flex items-center gap-2 cursor-pointer">
                    <Pentagon className="h-4 w-4" />
                    {t('admin.backoffice.polygon', 'Polygon')}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              {shapeType === 'pin' && (
                <p>{t('admin.backoffice.pinInstructions', 'Click on the map to place a pin marker.')}</p>
              )}
              {shapeType === 'rect' && (
                <p>{t('admin.backoffice.rectInstructions', 'Click and drag to draw a rectangle area.')}</p>
              )}
              {shapeType === 'polygon' && (
                <p>{t('admin.backoffice.polygonInstructions', 'Click to add points. Need at least 3 points.')}</p>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleUndo}
              className="w-full"
            >
              <Undo className="h-4 w-4 mr-2" />
              {t('common.undo', 'Undo')}
            </Button>
          </div>

          {/* Drawing canvas */}
          <div
            ref={imageRef}
            className={cn(
              'flex-1 relative bg-muted rounded-lg overflow-hidden',
              shapeType === 'rect' && 'cursor-crosshair',
              shapeType === 'polygon' && 'cursor-crosshair',
              shapeType === 'pin' && 'cursor-pointer'
            )}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              src={signedUrl}
              alt="Floor map"
              className="w-full h-full object-contain"
              draggable={false}
            />

            {/* SVG overlay for shapes */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {/* Current rect */}
              {currentRect && (
                <rect
                  x={`${currentRect.x}%`}
                  y={`${currentRect.y}%`}
                  width={`${currentRect.w}%`}
                  height={`${currentRect.h}%`}
                  className="fill-primary/30 stroke-primary stroke-2"
                />
              )}

              {/* Polygon points and lines */}
              {polygonPoints.length > 0 && (
                <>
                  {/* Lines connecting points */}
                  <polyline
                    points={polygonPoints.map(p => `${p.x}%,${p.y}%`).join(' ')}
                    className="fill-none stroke-primary stroke-2"
                  />
                  {/* Close polygon if 3+ points */}
                  {polygonPoints.length >= 3 && (
                    <polygon
                      points={polygonPoints.map(p => `${p.x}%,${p.y}%`).join(' ')}
                      className="fill-primary/30 stroke-primary stroke-2"
                    />
                  )}
                  {/* Point markers */}
                  {polygonPoints.map((point, idx) => (
                    <circle
                      key={idx}
                      cx={`${point.x}%`}
                      cy={`${point.y}%`}
                      r="4"
                      className="fill-primary stroke-background stroke-2"
                    />
                  ))}
                </>
              )}
            </svg>

            {/* Pin marker */}
            {pinPosition && (
              <div
                className="absolute transform -translate-x-1/2 -translate-y-full"
                style={{ left: `${pinPosition.x}%`, top: `${pinPosition.y}%` }}
              >
                <MapPin className="h-8 w-8 text-primary fill-primary/20 drop-shadow-lg" />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!hasValidShape || updateRoom.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
