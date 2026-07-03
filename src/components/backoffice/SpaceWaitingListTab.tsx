import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, Clock, CheckCircle, XCircle, Building2, Users, 
  ArrowRight, AlertCircle, ListOrdered
} from 'lucide-react';
import { 
  useSpaceWaitingList,
  useCreateWaitingListRequest,
  useUpdateWaitingListRequest,
  useFulfillWaitingListRequest,
  useOfficeSpaces,
  useRoomsWithAllocations,
  type SpaceWaitingListItem
} from '@/hooks/useBackoffice';
import { useWorkspaces, ALL_WORKSPACE_STATUSES } from '@/hooks/useWorkspaces';
import { useFunnelItems } from '@/hooks/useFunnel';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

const REQUEST_TYPE_CONFIG: Record<string, { labelKey: string; color: string }> = {
  office: { labelKey: 'waitingList.privateOffice', color: 'bg-info' },
  desk: { labelKey: 'waitingList.dedicatedDesk', color: 'bg-success' },
  hotdesk: { labelKey: 'waitingList.hotDesk', color: 'bg-warning' },
  virtual: { labelKey: 'waitingList.virtualIncubation', color: 'bg-primary' },
  meeting_room: { labelKey: 'waitingList.meetingRoom', color: 'bg-warning' },
};

const STATUS_CONFIG: Record<string, { labelKey: string; icon: typeof Clock; color: string }> = {
  waiting: { labelKey: 'waitingList.statusWaiting', icon: Clock, color: 'text-warning' },
  offered: { labelKey: 'waitingList.statusOffered', icon: ArrowRight, color: 'text-info' },
  accepted: { labelKey: 'waitingList.statusAccepted', icon: CheckCircle, color: 'text-success' },
  declined: { labelKey: 'waitingList.statusDeclined', icon: XCircle, color: 'text-destructive' },
  fulfilled: { labelKey: 'waitingList.statusFulfilled', icon: CheckCircle, color: 'text-success' },
  cancelled: { labelKey: 'waitingList.statusCancelled', icon: XCircle, color: 'text-muted-foreground' },
};

export function SpaceWaitingListTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('waiting');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [fulfillDialogOpen, setFulfillDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<SpaceWaitingListItem | null>(null);
  const [priority, setPriority] = useState([50]);

  const { data: waitingList, isLoading } = useSpaceWaitingList({ status: statusFilter === 'all' ? undefined : statusFilter });
  const { data: spaces } = useOfficeSpaces();
  const { data: rooms } = useRoomsWithAllocations();
  const { data: workspaces } = useWorkspaces({}, false, ALL_WORKSPACE_STATUSES);
  const { data: funnelItems } = useFunnelItems();

  const createRequest = useCreateWaitingListRequest();
  const updateRequest = useUpdateWaitingListRequest();
  const fulfillRequest = useFulfillWaitingListRequest();

  const availableRooms = rooms?.filter(r => !r.current_allocation && r.status === 'available') || [];

  const handleAddRequest = async (formData: FormData) => {
    if (!user) return;

    const workspaceId = formData.get('workspace_id') as string;
    const funnelItemId = formData.get('funnel_item_id') as string;

    await createRequest.mutateAsync({
      workspace_id: workspaceId || null,
      funnel_item_id: funnelItemId || null,
      request_type: formData.get('request_type') as string,
      preferred_space_id: formData.get('preferred_space_id') as string || null,
      preferred_capacity: parseInt(formData.get('preferred_capacity') as string) || null,
      priority: priority[0],
      notes: formData.get('notes') as string || null,
      requested_by: user.id,
    });
    setAddDialogOpen(false);
    setPriority([50]);
  };

  const handleFulfill = async (formData: FormData) => {
    if (!selectedRequest || !user) return;

    await fulfillRequest.mutateAsync({
      requestId: selectedRequest.id,
      roomId: formData.get('room_id') as string,
      startDate: formData.get('start_date') as string,
      userId: user.id,
    });
    setFulfillDialogOpen(false);
    setSelectedRequest(null);
  };

  const getEntityName = (item: SpaceWaitingListItem) => {
    return item.workspace?.startup?.name || 
      item.funnel_item?.organization_name || 
      item.funnel_item?.contact_name || 
      'Unknown';
  };

  const waitingCount = waitingList?.filter(r => r.status === 'waiting').length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ListOrdered className="h-5 w-5" />
            {t('admin.backoffice.waitingList', 'Space Waiting List')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('admin.backoffice.waitingListDesc', 'Manage requests for office space from leads and startups')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.backoffice.allStatuses')}</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>{t(config.labelKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t('admin.backoffice.addToWaitlist', 'Add to Waitlist')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t('admin.backoffice.addWaitlistRequest', 'Add Waiting List Request')}</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddRequest(new FormData(e.currentTarget));
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>{t('admin.backoffice.requestFor', 'Request For')}</Label>
                  <Tabs defaultValue="startup" className="w-full">
                    <TabsList className="w-full">
                      <TabsTrigger value="startup" className="flex-1">{t('waitingList.startup', 'Startup')}</TabsTrigger>
                      <TabsTrigger value="lead" className="flex-1">{t('waitingList.leadProspect', 'Lead/Prospect')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="startup" className="mt-2">
                      <Select name="workspace_id">
                        <SelectTrigger>
                          <SelectValue placeholder={t('waitingList.selectStartup', { defaultValue: 'Selecionar startup...' })} />
                        </SelectTrigger>
                        <SelectContent>
                          {workspaces?.map(w => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.startup?.name || 'Unnamed'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TabsContent>
                    <TabsContent value="lead" className="mt-2">
                      <Select name="funnel_item_id">
                        <SelectTrigger>
                          <SelectValue placeholder={t('waitingList.selectLead', { defaultValue: 'Selecionar lead...' })} />
                        </SelectTrigger>
                        <SelectContent>
                          <ScrollArea className="h-[200px]">
                            {funnelItems?.map(item => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.organization_name || item.contact_name || 'Unnamed'}
                              </SelectItem>
                            ))}
                          </ScrollArea>
                        </SelectContent>
                      </Select>
                    </TabsContent>
                  </Tabs>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('admin.backoffice.requestType', 'Request Type')}</Label>
                    <Select name="request_type" defaultValue="office">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(REQUEST_TYPE_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>{t(config.labelKey)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('admin.backoffice.preferredCapacity', 'Preferred Capacity')}</Label>
                    <Input type="number" name="preferred_capacity" placeholder="Number of people" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.preferredBuilding', 'Preferred Building')}</Label>
                  <Select name="preferred_space_id">
                    <SelectTrigger>
                      <SelectValue placeholder="Any building..." />
                    </SelectTrigger>
                    <SelectContent>
                      {spaces?.map(space => (
                        <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.priority', 'Priority')}: {priority[0]}</Label>
                  <Slider
                    value={priority}
                    onValueChange={setPriority}
                    min={1}
                    max={100}
                    step={1}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t('priority.low', 'Low')}</span>
                    <span>{t('priority.high', 'High')}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.notes', 'Notes')}</Label>
                  <Textarea name="notes" placeholder="Any special requirements..." />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={createRequest.isPending} loading={createRequest.isPending}>
                    {t('admin.backoffice.addToList', 'Add to List')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={cn(waitingCount > 0 && 'border-warning/50')}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-warning" />
              <div>
                <div className="text-2xl font-bold">{waitingCount}</div>
                <p className="text-sm text-muted-foreground">{t('waitingList.statusWaiting', 'Waiting')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-success" />
              <div>
                <div className="text-2xl font-bold">{availableRooms.length}</div>
                <p className="text-sm text-muted-foreground">{t('waitingList.availableRooms', 'Available Rooms')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <div className="text-2xl font-bold">
                  {waitingList?.filter(r => r.status === 'fulfilled').length || 0}
                </div>
                <p className="text-sm text-muted-foreground">{t('waitingList.statusFulfilled', 'Fulfilled')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              <div>
                <div className="text-2xl font-bold">
                  {waitingList?.filter(r => r.priority >= 80 && r.status === 'waiting').length || 0}
                </div>
                <p className="text-sm text-muted-foreground">{t('waitingList.highPriority', 'High Priority')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Waiting List Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {statusFilter === 'all' ? t('waitingList.allRequests', 'All Requests') : t(STATUS_CONFIG[statusFilter]?.labelKey) + ' ' + t('waitingList.requests', 'Requests')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
          ) : waitingList && waitingList.length > 0 ? (
            <Table>
              <TableHeader sticky>
                <TableRow>
                  <TableHead>{t('waitingList.organization', 'Organization')}</TableHead>
                  <TableHead>{t('waitingList.type', 'Type')}</TableHead>
                  <TableHead>{t('waitingList.preference', 'Preference')}</TableHead>
                  <TableHead>{t('waitingList.priority', 'Priority')}</TableHead>
                  <TableHead>{t('waitingList.requested', 'Requested')}</TableHead>
                  <TableHead>{t('waitingList.status', 'Status')}</TableHead>
                  <TableHead className="text-right">{t('common.actions', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waitingList.map(item => {
                  const statusConfig = STATUS_CONFIG[item.status];
                  const StatusIcon = statusConfig?.icon || Clock;
                  const typeConfig = REQUEST_TYPE_CONFIG[item.request_type];

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{getEntityName(item)}</div>
                        {item.preferred_capacity && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {item.preferred_capacity} {t('waitingList.people', 'people')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn('text-white', typeConfig?.color)}
                        >
                          {typeConfig ? t(typeConfig.labelKey) : item.request_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.preferred_space?.name || t('waitingList.any', 'Any')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div 
                            className={cn(
                              'h-2 w-16 rounded-full bg-muted overflow-hidden'
                            )}
                          >
                            <div 
                              className={cn(
                                'h-full rounded-full',
                                item.priority >= 80 ? 'bg-destructive' :
                                item.priority >= 50 ? 'bg-warning' : 'bg-success'
                              )}
                              style={{ width: `${item.priority}%` }}
                            />
                          </div>
                          <span className="text-sm">{item.priority}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDistanceToNow(new Date(item.requested_at), { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={cn('flex items-center gap-1', statusConfig?.color)}>
                          <StatusIcon className="h-4 w-4" />
                          <span className="text-sm">{statusConfig ? t(statusConfig.labelKey) : item.status}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.status === 'waiting' && (
                          <div className="flex items-center gap-2 justify-end">
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedRequest(item);
                                setFulfillDialogOpen(true);
                              }}
                              disabled={availableRooms.length === 0}
                            >
                              Fulfill
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateRequest.mutate({ id: item.id, status: 'cancelled' })}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                        {item.status === 'fulfilled' && item.offered_room && (
                          <span className="text-sm text-muted-foreground">
                            → {(item.offered_room as any)?.name}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <ListOrdered className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium">{t('admin.backoffice.noWaitingRequests', 'No Requests')}</h3>
              <p className="text-sm text-muted-foreground">
                {statusFilter === 'waiting' 
                  ? t('admin.backoffice.noWaitingDesc', 'No one is currently waiting for space')
                  : t('admin.backoffice.noRequestsInStatus', 'No requests with this status')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fulfill Dialog */}
      <Dialog open={fulfillDialogOpen} onOpenChange={setFulfillDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.backoffice.fulfillRequest', 'Fulfill Request')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleFulfill(new FormData(e.currentTarget));
            }}
            className="space-y-4"
          >
            <div className="p-3 bg-muted rounded-lg space-y-1">
              <div>
                <span className="text-sm text-muted-foreground">{t('waitingList.organization', 'Organization')}:</span>
                <span className="font-medium ml-2">{selectedRequest && getEntityName(selectedRequest)}</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">{t('waitingList.request', 'Request')}:</span>
                <span className="ml-2">
                  {selectedRequest && t(REQUEST_TYPE_CONFIG[selectedRequest.request_type]?.labelKey || '')}
                  {selectedRequest?.preferred_capacity && ` ${t('waitingList.forPeople', { count: selectedRequest.preferred_capacity, defaultValue: 'for {{count}} people' })}`}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('admin.backoffice.assignRoom', 'Assign Room')}</Label>
              <Select name="room_id" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select available room..." />
                </SelectTrigger>
                <SelectContent>
                  {availableRooms.map(room => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name} ({room.space?.name}) - {room.capacity || '?'} people
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('admin.backoffice.startDate', 'Start Date')}</Label>
              <Input
                type="date"
                name="start_date"
                defaultValue={new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setFulfillDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={updateRequest.isPending} loading={updateRequest.isPending}>
                {t('admin.backoffice.confirmFulfill', 'Confirm & Assign')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}