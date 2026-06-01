import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sparkles, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { AIExtractedData } from './ContractUploadDropzone';
import type { IncubationType } from '@/hooks/backoffice/useIncubationTypes';

const STATUS_OPTIONS = ['draft', 'pending_signature', 'active', 'suspended', 'terminated', 'expired'] as const;

const contractSchemaBase = {
  workspace_id: z.string().optional(),
  incubation_type_id: z.string().optional(),
  building_id: z.string().optional(),
  contract_number: z.string().optional(),
  status: z.enum(STATUS_OPTIONS),
  start_date: z.string().min(1, 'Required'),
  end_date: z.string().optional(),
  monthly_fee: z.coerce.number().min(0),
  discount_percentage: z.coerce.number().min(0).max(100),
  discount_reason: z.string().optional(),
  equity_percentage: z.coerce.number().min(0).max(100).optional(),
  square_meters: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
};

const contractSchema = z.object({
  ...contractSchemaBase,
  workspace_id: z.string().min(1, 'Required'),
});

const contractSchemaCRM = z.object(contractSchemaBase);

export type ContractFormValues = z.infer<typeof contractSchema>;

interface ContractReviewFormProps {
  aiData?: AIExtractedData;
  documentUrl?: string;
  isAIPopulated: boolean;
  workspaces: Array<{ id: string; startup?: { name: string } | null }>;
  incubationTypes?: IncubationType[];
  buildings?: Array<{ id: string; name: string; is_active?: boolean | null }>;
  onSubmit: (values: ContractFormValues & { document_url?: string }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  defaultWorkspaceId?: string;
  fromCRM?: boolean;
  crmOrgName?: string | null;
}

export function ContractReviewForm({
  aiData,
  documentUrl,
  isAIPopulated,
  workspaces,
  incubationTypes,
  buildings,
  onSubmit,
  onCancel,
  isSubmitting,
  defaultWorkspaceId,
  fromCRM = false,
  crmOrgName,
}: ContractReviewFormProps) {
  const { t } = useTranslation();

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(fromCRM ? contractSchemaCRM : contractSchema),
    defaultValues: {
      workspace_id: defaultWorkspaceId || '',
      status: 'draft',
      start_date: aiData?.startDate || '',
      end_date: aiData?.endDate || '',
      monthly_fee: aiData?.monthlyFee || 0,
      discount_percentage: 0,
      notes: aiData?.notes || '',
      contract_number: '',
      square_meters: undefined,
      equity_percentage: undefined,
    },
  });

  const handleFormSubmit = (values: ContractFormValues) => {
    const cleanValues = {
      ...values,
      workspace_id: values.workspace_id === '__none__' ? '' : values.workspace_id,
      document_url: documentUrl,
    };
    onSubmit(cleanValues);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">
            {t('contracts.review.title', { defaultValue: 'Review Contract Details' })}
          </CardTitle>
          {isAIPopulated && (
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              {t('contracts.review.aiPopulated', { defaultValue: 'AI Populated' })}
            </Badge>
          )}
        </div>
        <CardDescription>
          {isAIPopulated
            ? t('contracts.review.aiDesc', { defaultValue: 'AI extracted these fields from the PDF. Review and edit before saving.' })
            : t('contracts.review.manualDesc', { defaultValue: 'Fill in the contract details manually.' })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="workspace_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('admin.backoffice.startup', { defaultValue: 'Startup' })}
                      {fromCRM && (
                        <span className="text-muted-foreground font-normal ml-1">
                          ({t('common.optional', { defaultValue: 'optional' })})
                        </span>
                      )}
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={
                            fromCRM
                              ? t('contracts.crmWorkspaceOptional', { defaultValue: 'Sem workspace — será vinculado depois' })
                              : t('admin.backoffice.selectStartup', { defaultValue: 'Select startup' })
                          } />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {fromCRM && (
                          <SelectItem value="__none__">
                            <span className="text-muted-foreground italic">
                              {t('contracts.noWorkspaceYet', { defaultValue: 'Sem workspace (criar depois)' })}
                            </span>
                          </SelectItem>
                        )}
                        {workspaces.map(w => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.startup?.name || 'Unnamed'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="incubation_type_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.backoffice.incubationType', { defaultValue: 'Incubation Type' })}</FormLabel>
                    <Select onValueChange={(val) => {
                      field.onChange(val);
                      // Auto-fill monthly fee from selected type
                      const selectedType = incubationTypes?.find(it => it.id === val);
                      if (selectedType?.base_monthly_fee != null) {
                        form.setValue('monthly_fee', selectedType.base_monthly_fee);
                      }
                    }} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('admin.backoffice.selectType', { defaultValue: 'Select type' })} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {incubationTypes?.map(it => (
                          <SelectItem key={it.id} value={it.id}>
                            {it.name} (€{it.base_monthly_fee}/mo)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="building_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.backoffice.building', { defaultValue: 'Building' })}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('admin.backoffice.selectBuilding', { defaultValue: 'Select building' })} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {buildings?.filter(b => b.is_active).map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contract_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('admin.backoffice.contractNumber', { defaultValue: 'Contract Number' })}
                      <span className="text-muted-foreground font-normal ml-1">(auto)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder={t('contracts.autoGenerated', { defaultValue: 'Gerado automaticamente' })} {...field} disabled className="bg-muted/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.backoffice.status', { defaultValue: 'Status' })}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUS_OPTIONS.map(s => (
                          <SelectItem key={s} value={s}>
                            {t(`admin.backoffice.contractStatus.${s}`, { defaultValue: s })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.backoffice.startDate', { defaultValue: 'Start Date' })}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.backoffice.endDate', { defaultValue: 'End Date' })}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="monthly_fee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.backoffice.monthlyFee', { defaultValue: 'Monthly Fee (€)' })}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="discount_percentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.backoffice.discount', { defaultValue: 'Discount' })} (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="discount_reason"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>{t('admin.backoffice.discountReason', { defaultValue: 'Discount Reason' })}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="equity_percentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.backoffice.equity', { defaultValue: 'Equity' })} (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="square_meters"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.backoffice.squareMeters', { defaultValue: 'Area (m²)' })}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>{t('admin.backoffice.notes', { defaultValue: 'Notes' })}</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onCancel}>
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-2">
                <Save className="h-4 w-4" />
                {t('contracts.review.saveContract', { defaultValue: 'Save Contract to Database' })}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
