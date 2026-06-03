import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  Building2, Users, MapPin, Calendar, ExternalLink, Clock,
  UserPlus, UserMinus, Wrench, FileText, AlertTriangle
} from 'lucide-react';
import {
  type Room,
  type RoomAllocation,
  useEndRoomAllocation,
  useCreateRoomAllocation,
  useUpdateRoom,
  useSpaceWaitingList,
  useFulfillWaitingListRequest,
} from '@/hooks/useBackoffice';
import { useWorkspaces, ALL_WORKSPACE_STATUSES } from '@/hooks/useWorkspaces';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { RoomAllocationHistory } from './RoomAllocationHistory';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { notify } from "@/lib/notify";

interface SpaceDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: Room | null;
  buildingName?: string;
}

export function SpaceDetailDrawer({ open, onOpenChange, room, buildingName }: SpaceDetailDrawerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [vacateDialogOpen, setVacateDialogOpen] = useState(false);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);

  const endAllocation = useEndRoomAllocation();
  const createAllocation = useCreateRoomAllocation();
  const updateRoom = useUpdateRoom();
  const fulfillWaitlist = useFulfillWaitingListRequest();
  const { data: workspaces } = useWorkspaces({}, false, ALL_WORKSPACE_STATUSES);
  const { data: waitingList } = useSpaceWaitingList({ status: 'pending' });

  if (!room) return null;

  const allocation = room.current_allocation;
  const isOccupied = !!allocation;
  const occupantName = allocation?.workspace?.startup?.name ||
    allocation?.funnel_item?.organization_name ||
    allocation?.funnel_item?.contact_name;

  const tenure = allocation?.start_date
    ? formatDistanceToNow(new Date(allocation.start_date))
    : null;

  const handleVacate = async () => {
    if (!allocation) return;
    await endAllocation.mutateAsync({ id: allocation.id, roomId: room.id });
    setVacateDialogOpen(false);
    notify.success(t('admin.backoffice.spaceVacated', { defaultValue: 'Espaço desocupado com sucesso' }));
  };

  const handleAssign = async (formData: FormData) => {
    if (!user) return;
    await createAllocation.mutateAsync({
      room_id: room.id,
      workspace_id: formData.get('workspace_id') as string,
      allocation_type: 'permanent',
      start_date: formData.get('start_date') as string,
      end_date: formData.get('end_date') as string || null,
      notes: formData.get('notes') as string || null,
      created_by: user.id,
    });
    setAssignDialogOpen(false);
    notify.success(t('admin.backoffice.spaceAssigned', { defaultValue: 'Espaço atribuído com sucesso' }));
  };

  const handleMaintenance = async () => {
    await updateRoom.mutateAsync({
      id: room.id,
      status: room.status === 'maintenance' ? 'available' : 'maintenance',
    });
    setMaintenanceDialogOpen(false);
    notify.success(
      room.status === 'maintenance'
        ? t('admin.backoffice.maintenanceEnded', { defaultValue: 'Manutenção terminada' })
        : t('admin.backoffice.maintenanceStarted', { defaultValue: 'Espaço em manutenção' })
    );
  };

  const statusColor = isOccupied ? 'bg-primary' : room.status === 'maintenance' ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div className={cn('h-3 w-3 rounded-full', statusColor)} />
              <SheetTitle className="text-lg">{room.name}</SheetTitle>
            </div>
            <SheetDescription className="flex items-center gap-2 text-sm">
              {room.room_number && <Badge variant="outline">#{room.room_number}</Badge>}
              {buildingName && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {buildingName}
                </span>
              )}
              {room.floor && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {t('admin.backoffice.floorLabel', { defaultValue: 'Piso' })} {room.floor}
                </span>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            {/* Space Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t('admin.backoffice.type', { defaultValue: 'Tipo' })}</span>
                <p className="text-sm font-medium">{t(`admin.backoffice.roomTypes.${room.room_type}`, { defaultValue: room.room_type })}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t('admin.backoffice.capacity', { defaultValue: 'Capacidade' })}</span>
                <p className="text-sm font-medium flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {room.capacity || '—'} {t('admin.backoffice.people', { defaultValue: 'pessoas' })}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t('admin.backoffice.status', { defaultValue: 'Estado' })}</span>
                <Badge variant={isOccupied ? 'default' : room.status === 'maintenance' ? 'secondary' : 'outline'}>
                  {isOccupied
                    ? t('admin.backoffice.occupied', { defaultValue: 'Ocupado' })
                    : t(`admin.backoffice.roomStatus.${room.status}`, { defaultValue: room.status })}
                </Badge>
              </div>
              {room.notes && (
                <div className="col-span-2 space-y-1">
                  <span className="text-xs text-muted-foreground">{t('admin.backoffice.notes', { defaultValue: 'Notas' })}</span>
                  <p className="text-sm">{room.notes}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Current Occupant */}
            {isOccupied && allocation && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  {t('admin.backoffice.currentOccupant', { defaultValue: 'Ocupante Atual' })}
                </h3>
                <div className="bg-primary/5 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{occupantName}</span>
                    {allocation.workspace_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => navigate(`/workspaces/${allocation.workspace_id}`)}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        {t('admin.backoffice.openStartup', { defaultValue: 'Abrir Startup' })}
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {t('admin.backoffice.since', { defaultValue: 'Desde' })} {format(new Date(allocation.start_date), 'dd MMM yyyy')}
                    </span>
                    {tenure && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {tenure}
                      </span>
                    )}
                  </div>
                  {allocation.end_date && (
                    <div className="text-sm text-muted-foreground">
                      {t('admin.backoffice.endDate', { defaultValue: 'Data de Fim' })}: {format(new Date(allocation.end_date), 'dd MMM yyyy')}
                    </div>
                  )}
                  {allocation.notes && (
                    <p className="text-sm text-muted-foreground">{allocation.notes}</p>
                  )}
                </div>
              </div>
            )}

            <Separator />

            {/* Quick Actions */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">{t('admin.backoffice.quickActions', { defaultValue: 'Ações Rápidas' })}</h3>
              <div className="grid grid-cols-1 gap-2">
                {!isOccupied && room.status === 'available' && (
                  <Button
                    className="justify-start"
                    onClick={() => setAssignDialogOpen(true)}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    {t('admin.backoffice.assignStartup', { defaultValue: 'Atribuir Startup' })}
                  </Button>
                )}
                {isOccupied && (
                  <Button
                    variant="destructive"
                    className="justify-start"
                    onClick={() => setVacateDialogOpen(true)}
                  >
                    <UserMinus className="h-4 w-4 mr-2" />
                    {t('admin.backoffice.vacateSpace', { defaultValue: 'Desocupar Espaço' })}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => setMaintenanceDialogOpen(true)}
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  {room.status === 'maintenance'
                    ? t('admin.backoffice.endMaintenance', { defaultValue: 'Terminar Manutenção' })
                    : t('admin.backoffice.setMaintenance', { defaultValue: 'Marcar Manutenção' })}
                </Button>
              </div>
            </div>

            <Separator />

            {/* Allocation History */}
            <RoomAllocationHistory roomId={room.id} roomName={room.name} />

            {/* Waitlist Suggestions (only when space is available) */}
            {!isOccupied && room.status === 'available' && waitingList && waitingList.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {t('admin.backoffice.waitlistSuggestions', { defaultValue: 'Sugestões da Lista de Espera' })}
                  </h3>
                  <div className="space-y-2">
                    {waitingList.slice(0, 3).map(item => {
                      const name = item.workspace?.startup?.name ||
                        item.funnel_item?.organization_name ||
                        item.funnel_item?.contact_name || '—';
                      return (
                        <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm">
                          <div>
                            <span className="font-medium">{name}</span>
                            {item.preferred_capacity && (
                              <span className="text-xs text-muted-foreground ml-2">
                                {item.preferred_capacity} {t('admin.backoffice.people', { defaultValue: 'pessoas' })}
                              </span>
                            )}
                          </div>
                          {item.workspace_id && user && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                fulfillWaitlist.mutate({
                                  requestId: item.id,
                                  roomId: room.id,
                                  startDate: new Date().toISOString().split('T')[0],
                                  userId: user.id,
                                });
                              }}
                            >
                              <UserPlus className="h-3 w-3 mr-1" />
                              {t('admin.backoffice.assignQuick', { defaultValue: 'Atribuir' })}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('admin.backoffice.assignStartup', { defaultValue: 'Atribuir Startup' })} — {room.name}
            </DialogTitle>
            <DialogDescription>
              {t('admin.backoffice.assignStartupDesc', { defaultValue: 'Selecione a startup e as datas de ocupação.' })}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAssign(new FormData(e.currentTarget));
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>{t('admin.backoffice.startup', { defaultValue: 'Startup' })}</Label>
              <Select name="workspace_id" required>
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.backoffice.selectStartup', { defaultValue: 'Selecionar startup...' })} />
                </SelectTrigger>
                <SelectContent>
                  {workspaces?.map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.startup?.name || 'Unnamed'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('admin.backoffice.startDate', { defaultValue: 'Data de Início' })}</Label>
                <Input type="date" name="start_date" defaultValue={new Date().toISOString().split('T')[0]} required />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.backoffice.endDate', { defaultValue: 'Data de Fim' })}</Label>
                <Input type="date" name="end_date" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('admin.backoffice.notes', { defaultValue: 'Notas' })}</Label>
              <Textarea name="notes" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)}>
                {t('common.cancel', { defaultValue: 'Cancelar' })}
              </Button>
              <Button type="submit" disabled={createAllocation.isPending || updateRoom.isPending}>
                {t('admin.backoffice.confirmAllocation', { defaultValue: 'Confirmar Atribuição' })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Vacate Confirmation */}
      <Dialog open={vacateDialogOpen} onOpenChange={setVacateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t('admin.backoffice.confirmVacate', { defaultValue: 'Confirmar Desocupação' })}
            </DialogTitle>
            <DialogDescription>
              {t('admin.backoffice.vacateConfirmMsg', {
                defaultValue: `Tem a certeza que pretende desocupar ${room.name}? A ocupação de ${occupantName || '—'} será terminada hoje.`,
                room: room.name,
                occupant: occupantName || '—',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVacateDialogOpen(false)}>
              {t('common.cancel', { defaultValue: 'Cancelar' })}
            </Button>
            <Button variant="destructive" onClick={handleVacate} disabled={endAllocation.isPending}>
              {t('admin.backoffice.confirmVacateAction', { defaultValue: 'Desocupar' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Maintenance Confirmation */}
      <Dialog open={maintenanceDialogOpen} onOpenChange={setMaintenanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {room.status === 'maintenance'
                ? t('admin.backoffice.endMaintenanceTitle', { defaultValue: 'Terminar Manutenção' })
                : t('admin.backoffice.startMaintenanceTitle', { defaultValue: 'Iniciar Manutenção' })}
            </DialogTitle>
            <DialogDescription>
              {room.status === 'maintenance'
                ? t('admin.backoffice.endMaintenanceDesc', { defaultValue: `${room.name} ficará disponível novamente.` })
                : t('admin.backoffice.startMaintenanceDesc', { defaultValue: `${room.name} ficará indisponível para atribuição.` })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaintenanceDialogOpen(false)}>
              {t('common.cancel', { defaultValue: 'Cancelar' })}
            </Button>
            <Button onClick={handleMaintenance} disabled={updateRoom.isPending}>
              {t('common.confirm', { defaultValue: 'Confirmar' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
