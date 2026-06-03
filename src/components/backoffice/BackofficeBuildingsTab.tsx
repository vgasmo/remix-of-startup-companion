import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Building2, MapPin } from 'lucide-react';
import { useBuildings, useCreateBuilding, useUpdateBuilding, type Building } from '@/hooks/useBackoffice';
import { cn } from '@/lib/utils';

export function BackofficeBuildingsTab() {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);

  const { data: buildings, isLoading } = useBuildings();
  const createBuilding = useCreateBuilding();
  const updateBuilding = useUpdateBuilding();

  const handleSave = async (formData: FormData) => {
    const payload = {
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      address: formData.get('address') as string || null,
      city: formData.get('city') as string || 'Leiria',
      description: formData.get('description') as string || null,
      total_area_sqm: parseFloat(formData.get('total_area_sqm') as string) || null,
      is_active: formData.get('is_active') === 'on',
    };

    if (selectedBuilding) {
      await updateBuilding.mutateAsync({ id: selectedBuilding.id, ...payload });
    } else {
      await createBuilding.mutateAsync(payload);
    }
    setDialogOpen(false);
    setSelectedBuilding(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('admin.backoffice.buildings')}</h2>
          <p className="text-sm text-muted-foreground">{t('admin.backoffice.buildingsDesc')}</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setSelectedBuilding(null)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('admin.backoffice.addBuilding')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {selectedBuilding ? t('admin.backoffice.editBuilding') : t('admin.backoffice.addBuilding')}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave(new FormData(e.currentTarget));
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('admin.backoffice.buildingName')}</Label>
                  <Input
                    name="name"
                    placeholder="Leiria - Sede"
                    defaultValue={selectedBuilding?.name || ''}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.buildingCode')}</Label>
                  <Input
                    name="code"
                    placeholder="LEIRIA"
                    defaultValue={selectedBuilding?.code || ''}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('admin.backoffice.city')}</Label>
                  <Input
                    name="city"
                    placeholder="Leiria"
                    defaultValue={selectedBuilding?.city || 'Leiria'}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.squareMeters')} (m²)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    name="total_area_sqm"
                    placeholder="1000"
                    defaultValue={selectedBuilding?.total_area_sqm || ''}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('admin.backoffice.address')}</Label>
                <Input
                  name="address"
                  placeholder="Rua Example, 123"
                  defaultValue={selectedBuilding?.address || ''}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('admin.backoffice.description')}</Label>
                <Textarea
                  name="description"
                  defaultValue={selectedBuilding?.description || ''}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  name="is_active"
                  defaultChecked={selectedBuilding?.is_active ?? true}
                />
                <Label>{t('admin.backoffice.active')}</Label>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={createBuilding.isPending || updateBuilding.isPending}>
                  {t('common.save')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Buildings Grid */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buildings?.map(building => (
            <Card key={building.id} className={cn(!building.is_active && 'opacity-60')}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {building.name}
                    </CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {building.city}
                    </CardDescription>
                  </div>
                  <Badge variant={building.is_active ? 'default' : 'secondary'}>
                    {building.is_active ? t('admin.backoffice.active') : t('admin.backoffice.inactive')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{building.code}</span>
                  {building.total_area_sqm && (
                    <span className="ml-2">• {building.total_area_sqm} m²</span>
                  )}
                </div>

                {building.address && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {building.address}
                  </p>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setSelectedBuilding(building);
                    setDialogOpen(true);
                  }}
                >
                  {t('common.edit')}
                </Button>
              </CardContent>
            </Card>
          ))}

          {buildings?.length === 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              {t('admin.backoffice.noBuildings')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
