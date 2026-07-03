/**
 * WorkspaceRoomChip — shows the physical room currently occupied by the
 * workspace, with a "Ver no mapa" deep-link into the Espaços surface.
 * Renders nothing when the workspace has no active room allocation.
 */
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MapPin, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkspaceRoom, buildRoomDeepLink } from '@/hooks/useEntityRoom';

interface WorkspaceRoomChipProps {
  workspaceId: string;
}

export function WorkspaceRoomChip({ workspaceId }: WorkspaceRoomChipProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const room = useWorkspaceRoom(workspaceId);
  if (!room) return null;

  return (
    <Card className="rounded-xl border-primary/20 bg-primary/5">
      <CardContent className="p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <MapPin className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{room.name}</span>
            {room.number && (
              <Badge variant="outline" className="text-[10px]">#{room.number}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {[room.buildingName, room.floor && `${t('admin.backoffice.floorLabel', { defaultValue: 'Piso' })} ${room.floor}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 shrink-0"
          onClick={() => navigate(buildRoomDeepLink(room.id))}
        >
          {t('admin.backoffice.viewOnMap', { defaultValue: 'Ver no mapa' })}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}
