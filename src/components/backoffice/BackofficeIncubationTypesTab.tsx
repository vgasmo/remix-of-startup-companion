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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Package, Clock, Users, Building2, Percent, Globe, Ruler } from 'lucide-react';
import { useIncubationTypes, useCreateIncubationType, useUpdateIncubationType, type IncubationType } from '@/hooks/useBackoffice';
import { cn } from '@/lib/utils';

const CONTRACT_TYPES = [
  { value: 'domiciliation', labelKey: 'admin.backoffice.contractTypes.domiciliation' },
  { value: 'virtual_incubation', labelKey: 'admin.backoffice.contractTypes.virtualIncubation' },
  { value: 'office_standard', labelKey: 'admin.backoffice.contractTypes.officeStandard' },
  { value: 'office_sqm', labelKey: 'admin.backoffice.contractTypes.officeSqm' },
  { value: 'office_social', labelKey: 'admin.backoffice.contractTypes.officeSocial' },
  { value: 'desk', labelKey: 'admin.backoffice.contractTypes.desk' },
  { value: 'hot_desk', labelKey: 'admin.backoffice.contractTypes.hotDesk' },
];

export function BackofficeIncubationTypesTab() {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<IncubationType | null>(null);

  const { data: types, isLoading } = useIncubationTypes();
  const createType = useCreateIncubationType();
  const updateType = useUpdateIncubationType();

  const handleSave = async (formData: FormData) => {
    const payload = {
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      base_monthly_fee: parseFloat(formData.get('base_monthly_fee') as string) || 0,
      duration_months: parseInt(formData.get('duration_months') as string) || null,
      includes_office_space: formData.get('includes_office_space') === 'on',
      includes_mentoring_hours: parseInt(formData.get('includes_mentoring_hours') as string) || 0,
      includes_meeting_room_hours: parseInt(formData.get('includes_meeting_room_hours') as string) || 0,
      equity_percentage: parseFloat(formData.get('equity_percentage') as string) || null,
      is_active: formData.get('is_active') === 'on',
      contract_type: formData.get('contract_type') as string || null,
      price_per_sqm: parseFloat(formData.get('price_per_sqm') as string) || null,
      requires_space: formData.get('requires_space') === 'on',
      is_virtual: formData.get('is_virtual') === 'on',
    };

    if (selectedType) {
      await updateType.mutateAsync({ id: selectedType.id, ...payload });
    } else {
      await createType.mutateAsync(payload);
    }
    setDialogOpen(false);
    setSelectedType(null);
  };

  const getContractTypeLabel = (contractType: string | null) => {
    const type = CONTRACT_TYPES.find(ct => ct.value === contractType);
    return type ? t(type.labelKey) : contractType;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('admin.backoffice.incubationTypes')}</h2>
          <p className="text-sm text-muted-foreground">{t('admin.backoffice.incubationTypesDesc')}</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setSelectedType(null)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('admin.backoffice.addType')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedType ? t('admin.backoffice.editType') : t('admin.backoffice.addType')}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave(new FormData(e.currentTarget));
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>{t('admin.backoffice.typeName')}</Label>
                <Input
                  name="name"
                  placeholder="Pre-Incubation, Incubation, Acceleration..."
                  defaultValue={selectedType?.name || ''}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>{t('admin.backoffice.description')}</Label>
                <Textarea
                  name="description"
                  defaultValue={selectedType?.description || ''}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('admin.backoffice.contractType')}</Label>
                <Select name="contract_type" defaultValue={selectedType?.contract_type || ''}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.backoffice.selectContractType')} />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPES.map(ct => (
                      <SelectItem key={ct.value} value={ct.value}>
                        {t(ct.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('admin.backoffice.baseMonthlyFee')}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    name="base_monthly_fee"
                    defaultValue={selectedType?.base_monthly_fee || 0}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.pricePerSqm')}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    name="price_per_sqm"
                    placeholder="€/m²"
                    defaultValue={selectedType?.price_per_sqm || ''}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.durationMonths')}</Label>
                  <Input
                    type="number"
                    name="duration_months"
                    placeholder="∞"
                    defaultValue={selectedType?.duration_months || ''}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.mentoringHours')}</Label>
                  <Input
                    type="number"
                    name="includes_mentoring_hours"
                    defaultValue={selectedType?.includes_mentoring_hours || 0}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.meetingRoomHours')}</Label>
                  <Input
                    type="number"
                    name="includes_meeting_room_hours"
                    defaultValue={selectedType?.includes_meeting_room_hours || 0}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backoffice.equityPercentage')}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    name="equity_percentage"
                    placeholder="0"
                    defaultValue={selectedType?.equity_percentage || ''}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    name="includes_office_space"
                    defaultChecked={selectedType?.includes_office_space ?? false}
                  />
                  <Label>{t('admin.backoffice.includesOfficeSpace')}</Label>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    name="requires_space"
                    defaultChecked={selectedType?.requires_space ?? false}
                  />
                  <Label>{t('admin.backoffice.requiresSpace')}</Label>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    name="is_virtual"
                    defaultChecked={selectedType?.is_virtual ?? false}
                  />
                  <Label>{t('admin.backoffice.isVirtual')}</Label>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    name="is_active"
                    defaultChecked={selectedType?.is_active ?? true}
                  />
                  <Label>{t('admin.backoffice.active')}</Label>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={createType.isPending || updateType.isPending} loading={createType.isPending}>
                  {t('common.save')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Types Grid */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {types?.map(type => (
            <Card key={type.id} className={cn(!type.is_active && 'opacity-60')}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      {type.name}
                    </CardTitle>
                    {type.description && (
                      <CardDescription className="mt-1 line-clamp-2">
                        {type.description}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <Badge variant={type.is_active ? 'default' : 'secondary'}>
                      {type.is_active ? t('admin.backoffice.active') : t('admin.backoffice.inactive')}
                    </Badge>
                    {type.is_virtual && (
                      <Badge variant="outline" className="text-xs">
                        <Globe className="h-3 w-3 mr-1" />
                        Virtual
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">€{type.base_monthly_fee}</span>
                  <span className="text-muted-foreground">/{t('admin.backoffice.perMonth', { defaultValue: 'mês' })}</span>
                </div>

                {type.contract_type && (
                  <Badge variant="outline" className="text-xs">
                    {getContractTypeLabel(type.contract_type)}
                  </Badge>
                )}

                <div className="grid grid-cols-2 gap-2 text-sm">
                  {type.duration_months && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {type.duration_months} {t('admin.backoffice.monthsLabel', { defaultValue: 'meses' })}
                    </div>
                  )}
                  {type.includes_office_space && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      {t('admin.backoffice.officeIncluded', { defaultValue: 'Escritório incluído' })}
                    </div>
                  )}
                  {type.includes_mentoring_hours > 0 && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {type.includes_mentoring_hours}h {t('admin.backoffice.mentoringLabel', { defaultValue: 'mentoria' })}
                    </div>
                  )}
                  {type.equity_percentage && type.equity_percentage > 0 && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Percent className="h-3 w-3" />
                      {type.equity_percentage}% {t('admin.backoffice.equityLabel', { defaultValue: 'equity' })}
                    </div>
                  )}
                  {type.price_per_sqm && type.price_per_sqm > 0 && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Ruler className="h-3 w-3" />
                      €{type.price_per_sqm}/m²
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setSelectedType(type);
                    setDialogOpen(true);
                  }}
                >
                  {t('common.edit')}
                </Button>
              </CardContent>
            </Card>
          ))}

          {types?.length === 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              {t('admin.backoffice.noTypes')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}