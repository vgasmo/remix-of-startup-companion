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
import { Switch } from '@/components/ui/switch';
import { Plus, MapPin, Users, Building2, Monitor, Armchair } from 'lucide-react';
import { 
  useOfficeSpaces, 
  useCreateOfficeSpace, 
  useUpdateOfficeSpace,
  useSpaceAllocations,
  useCreateSpaceAllocation,
  type OfficeSpace 
} from '@/hooks/useBackoffice';
import { useWorkspaces, ALL_WORKSPACE_STATUSES } from '@/hooks/useWorkspaces';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

// Labels resolved via i18n in render
const TYPE_ICONS: Record<string, typeof Armchair> = {
  desk: Monitor,
  private_office: Building2,
  meeting_room: Users,
  hot_desk: Armchair,
};

const TYPE_LABEL_KEYS: Record<string, string> = {
  desk: 'admin.backoffice.spaceTypes.desk',
  private_office: 'admin.backoffice.spaceTypes.privateOffice',
  meeting_room: 'admin.backoffice.spaceTypes.meetingRoom',
  hot_desk: 'admin.backoffice.spaceTypes.hotDesk',
};

export function BackofficeSpacesTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [spaceDialogOpen, setSpaceDialogOpen] = useState(false);
  const [allocationDialogOpen, setAllocationDialogOpen] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<OfficeSpace | null>(null);
  const [selectedSpaceForAllocation, setSelectedSpaceForAllocation] = useState<OfficeSpace | null>(null);

  const { data: spaces, isLoading } = useOfficeSpaces();
  const { data: allocations } = useSpaceAllocations();
  const { data: workspaces } = useWorkspaces({}, false, ALL_WORKSPACE_STATUSES);
  const createSpace = useCreateOfficeSpace();
  const updateSpace = useUpdateOfficeSpace();
  const createAllocation = useCreateSpaceAllocation();

  // Get current allocation for a space
  const getCurrentAllocation = (spaceId: string) => {
    const today = new Date().toISOString().split('T')[0];
    return allocations?.find(a => 
      a.office_space_id === spaceId && 
      a.start_date <= today && 
      (!a.end_date || a.end_date >= today)
    );
  };

  const handleSaveSpace = async (formData: FormData) => {
    const payload = {
      name: formData.get('name') as string,
      type: formData.get('type') as 'desk' | 'private_office' | 'meeting_room' | 'hot_desk',
      floor: formData.get('floor') as string || null,
      capacity: parseInt(formData.get('capacity') as string) || 1,
      monthly_cost: parseFloat(formData.get('monthly_cost') as string) || 0,
      is_available: formData.get('is_available') === 'on',
      notes: formData.get('notes') as string || null,
    };

    if (selectedSpace) {
      await updateSpace.mutateAsync({ id: selectedSpace.id, ...payload });
    } else {
      await createSpace.mutateAsync(payload);
    }
    setSpaceDialogOpen(false);
    setSelectedSpace(null);
  };

  const handleAllocate = async (formData: FormData) => {
    if (!selectedSpaceForAllocation) return;

    await createAllocation.mutateAsync({
      office_space_id: selectedSpaceForAllocation.id,
      workspace_id: formData.get('workspace_id') as string,
      start_date: formData.get('start_date') as string,
      end_date: formData.get('end_date') as string || null,
      monthly_cost_override: parseFloat(formData.get('monthly_cost_override') as string) || null,
      allocated_by: user?.id,
      notes: formData.get('notes') as string || null,
    });
    setAllocationDialogOpen(false);
    setSelectedSpaceForAllocation(null);
  };

  const typeKeys = Object.keys(TYPE_ICONS);

  // Group by type
  const groupedSpaces = spaces?.reduce((acc, space) => {
    if (!acc[space.type]) acc[space.type] = [];
    acc[space.type].push(space);
    return acc;
  }, {} as Record<string, OfficeSpace[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('admin.backoffice.officeSpaces')}</h2>
          <p className="text-sm text-muted-foreground">{t('admin.backoffice.manageSpaces')}</p>
        </div>

        <Dialog open={spaceDialogOpen} onOpenChange={setSpaceDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setSelectedSpace(null)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('admin.backoffice.addSpace')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedSpace ? t('admin.backoffice.editSpace') : t('admin.backoffice.addSpace')}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveSpace(new FormData(e.currentTarget));
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>{t('admin.backoffice.spaceName')}</Label>
                <Input
                  name="name"
                  placeholder="Desk A1, Office 101..."
                  defaultValue={selectedSpace?.name || ''}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('admin.backoffice.type')}</Label>
                  <Select name="type" defaultValue={selectedSpace?.type || 'desk'}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {typeKeys.map((key) => (
                        <SelectItem key={key} value={key}>{t(TYPE_LABEL_KEYS[key], { defaultValue: key })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.floor')}</Label>
                  <Input
                    name="floor"
                    placeholder="1, Ground, Mezzanine..."
                    defaultValue={selectedSpace?.floor || ''}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.capacity')}</Label>
                  <Input
                    type="number"
                    name="capacity"
                    defaultValue={selectedSpace?.capacity || 1}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.monthlyCost')}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    name="monthly_cost"
                    defaultValue={selectedSpace?.monthly_cost || 0}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  name="is_available"
                  defaultChecked={selectedSpace?.is_available ?? true}
                />
                <Label>{t('admin.backoffice.available')}</Label>
              </div>

              <div className="space-y-2">
                <Label>{t('admin.backoffice.notes')}</Label>
                <Textarea
                  name="notes"
                  defaultValue={selectedSpace?.notes || ''}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setSpaceDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={createSpace.isPending || updateSpace.isPending}>
                  {t('common.save')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
      ) : (
        typeKeys.map((typeKey) => {
          const spacesOfType = groupedSpaces?.[typeKey] || [];
          if (spacesOfType.length === 0) return null;

          const TypeIcon = TYPE_ICONS[typeKey];

          return (
            <div key={typeKey} className="space-y-3">
              <h3 className="font-medium flex items-center gap-2">
                <TypeIcon className="h-4 w-4 text-muted-foreground" />
                {t(TYPE_LABEL_KEYS[typeKey], { defaultValue: typeKey })}
                <Badge variant="secondary">{spacesOfType.length}</Badge>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {spacesOfType.map(space => {
                  const allocation = getCurrentAllocation(space.id);
                  const isOccupied = !!allocation;
                  const startupName = (allocation?.workspace as any)?.startup?.name;

                  return (
                    <Card 
                      key={space.id} 
                      className={cn(
                        'transition-all hover:shadow-md',
                        isOccupied && 'border-primary/30 bg-primary/5',
                        !space.is_available && 'opacity-60'
                      )}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{space.name}</CardTitle>
                            {space.floor && (
                              <CardDescription className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {t('admin.backoffice.floorLabel', { defaultValue: 'Piso' })} {space.floor}
                            </CardDescription>
                            )}
                          </div>
                          <Badge variant={isOccupied ? 'default' : 'outline'}>
                            {isOccupied ? t('admin.backoffice.occupied') : t('admin.backoffice.vacant')}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {space.capacity} {t('admin.backoffice.people')}
                          </span>
                          <span className="font-medium">€{space.monthly_cost}/mo</span>
                        </div>

                        {isOccupied && startupName && (
                          <div className="text-sm bg-primary/10 rounded p-2">
                            <span className="text-muted-foreground">{t('admin.backoffice.occupiedBy')}:</span>
                            <span className="font-medium ml-1">{startupName}</span>
                            {allocation?.start_date && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ({t('admin.backoffice.since')} {format(new Date(allocation.start_date), 'MMM yyyy')})
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              setSelectedSpace(space);
                              setSpaceDialogOpen(true);
                            }}
                          >
                            {t('common.edit')}
                          </Button>
                          {!isOccupied && space.is_available && (
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => {
                                setSelectedSpaceForAllocation(space);
                                setAllocationDialogOpen(true);
                              }}
                            >
                              {t('admin.backoffice.allocate')}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* Allocation Dialog */}
      <Dialog open={allocationDialogOpen} onOpenChange={setAllocationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.backoffice.allocateSpace')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAllocate(new FormData(e.currentTarget));
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>{t('admin.backoffice.space')}</Label>
              <Input value={selectedSpaceForAllocation?.name || ''} disabled />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.backoffice.startup')}</Label>
              <Select name="workspace_id" required>
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.backoffice.selectStartup')} />
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
                <Input
                  type="date"
                  name="end_date"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('admin.backoffice.monthlyCostOverride')}</Label>
              <Input
                type="number"
                step="0.01"
                name="monthly_cost_override"
                placeholder={`Default: €${selectedSpaceForAllocation?.monthly_cost || 0}`}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.backoffice.notes')}</Label>
              <Textarea name="notes" />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAllocationDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createAllocation.isPending}>
                {t('admin.backoffice.confirmAllocation')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
