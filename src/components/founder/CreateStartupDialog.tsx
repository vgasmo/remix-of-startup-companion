import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Rocket, Building2, Globe, FileText, Phone, Mail, RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { usePrograms } from '@/hooks/useWorkspaces';
import { notify } from '@/lib/notify';
import { StartupStage } from '@/types/database';
import { logger } from '@/lib/logger';

const startupSchema = z.object({
  name: z.string().trim().min(2, { message: 'createStartup.errors.nameMin' }).max(100),
  description: z
    .string()
    .trim()
    .min(20, { message: 'createStartup.errors.descriptionMin' })
    .max(500),
  website: z
    .string()
    .trim()
    .url({ message: 'createStartup.errors.invalidWebsite' })
    .optional()
    .or(z.literal('')),
  stage: z.enum(['ideation', 'validation', 'mvp', 'growth', 'scale']),
  programId: z.string().uuid({ message: 'createStartup.errors.programRequired' }),
  nif: z.string().max(20).optional().or(z.literal('')),
  mainContactName: z.string().max(100).optional().or(z.literal('')),
  mainContactEmail: z
    .string()
    .email({ message: 'createStartup.errors.invalidEmail' })
    .optional()
    .or(z.literal('')),
  mainContactPhone: z.string().max(30).optional().or(z.literal('')),
});

type StartupFormValues = z.infer<typeof startupSchema>;

const defaultValues: StartupFormValues = {
  name: '',
  description: '',
  website: '',
  stage: 'ideation',
  programId: '',
  nif: '',
  mainContactName: '',
  mainContactEmail: '',
  mainContactPhone: '',
};

interface CreateStartupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateStartupDialog({ open, onOpenChange }: CreateStartupDialogProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: programs, isLoading: loadingPrograms } = usePrograms();

  const draftKey = useMemo(
    () => (user?.id ? `createStartupDialog:draft:${user.id}` : null),
    [user?.id]
  );

  // Hydrate from sessionStorage draft
  const initialValues = useMemo<StartupFormValues>(() => {
    if (typeof window === 'undefined' || !draftKey) return defaultValues;
    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (!raw) return defaultValues;
      const parsed = JSON.parse(raw);
      return { ...defaultValues, ...parsed };
    } catch {
      return defaultValues;
    }
  }, [draftKey]);

  const form = useForm<StartupFormValues>({
    resolver: zodResolver(startupSchema),
    defaultValues: initialValues,
    mode: 'onBlur',
  });

  // Reset values when dialog opens (hydrate draft if present)
  useEffect(() => {
    if (open) form.reset(initialValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced autosave of draft
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!draftKey || !open) return;
    const sub = form.watch((values) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        try {
          window.sessionStorage.setItem(draftKey, JSON.stringify(values));
        } catch {
          // ignore quota errors
        }
      }, 400);
    });
    return () => {
      sub.unsubscribe();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [form, draftKey, open]);

  const clearDraft = () => {
    if (draftKey) window.sessionStorage.removeItem(draftKey);
    form.reset(defaultValues);
  };

  const hasDraft = useMemo(() => {
    if (!draftKey || typeof window === 'undefined') return false;
    return !!window.sessionStorage.getItem(draftKey);
  }, [draftKey, open]); // re-check on open

  // Translate zod error messages (keys) back to user-facing strings
  const tErr = (msg?: string) => {
    if (!msg) return undefined;
    if (msg.startsWith('createStartup.errors.')) return t(msg);
    return msg;
  };

  const onSubmit = async (values: StartupFormValues) => {
    if (!user) {
      form.setError('root', { message: t('createStartup.mustBeLoggedIn') });
      return;
    }
    try {
      const { data, error: createError } = await supabase
        .rpc('create_startup_application', {
          p_name: values.name,
          p_stage: values.stage,
          p_program_id: values.programId,
          p_description: values.description || null,
          p_website: values.website || null,
          p_nif: values.nif || null,
          p_main_contact_name: values.mainContactName || null,
          p_main_contact_email: values.mainContactEmail || null,
          p_main_contact_phone: values.mainContactPhone || null,
          p_has_startup_portugal_status: false,
        })
        .single();

      if (createError) throw createError;

      notify.success(t('createStartup.successMessage'));
      if (draftKey) window.sessionStorage.removeItem(draftKey);
      onOpenChange(false);

      const workspaceId = (data as any)?.workspace_id as string | undefined;
      if (workspaceId) navigate(`/workspace/${workspaceId}`);
      form.reset(defaultValues);
    } catch (err: any) {
      logger.error('Error creating startup', {}, err);
      let message = t('createStartup.failedToCreate');
      if (err?.code === '23505') message = t('createStartup.duplicateName');
      else if (err?.message?.includes('permission') || err?.message?.includes('RLS'))
        message = t('createStartup.permissionError');
      else if (err?.code === 'PGRST') message = t('createStartup.serverError');
      form.setError('root', { message });
    }
  };

  const rootError = form.formState.errors.root?.message;
  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-primary/10">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>{t('createStartup.title')}</DialogTitle>
          </div>
          <DialogDescription>{t('createStartup.description')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {rootError && (
              <Alert variant="destructive">
                <AlertDescription>{rootError}</AlertDescription>
              </Alert>
            )}

            {hasDraft && (
              <Alert>
                <AlertDescription className="flex items-center justify-between gap-2">
                  <span className="text-xs">{t('createStartup.draftRestored')}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearDraft}
                    className="gap-1 h-7 text-xs"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t('createStartup.discardDraft')}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>
                    <Building2 className="h-3.5 w-3.5 inline mr-1.5" />
                    {t('createStartup.startupName')} *
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t('createStartup.startupNamePlaceholder')}
                    />
                  </FormControl>
                  <FormMessage>{tErr(fieldState.error?.message)}</FormMessage>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>
                    <FileText className="h-3.5 w-3.5 inline mr-1.5" />
                    {t('createStartup.descriptionLabel')} *
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={t('createStartup.descriptionPlaceholder')}
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {t('createStartup.descriptionHint')}
                  </FormDescription>
                  <FormMessage>{tErr(fieldState.error?.message)}</FormMessage>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="website"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>
                    <Globe className="h-3.5 w-3.5 inline mr-1.5" />
                    {t('createStartup.websiteLabel')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      {...field}
                      placeholder={t('createStartup.websitePlaceholder')}
                    />
                  </FormControl>
                  <FormMessage>{tErr(fieldState.error?.message)}</FormMessage>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nif"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('createStartup.nifLabel')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="PT123456789" maxLength={20} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
              <p className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4" />
                {t('createStartup.mainContact')}
              </p>
              <div className="space-y-3">
                <FormField
                  control={form.control}
                  name="mainContactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
                        {t('createStartup.contactName')}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t('createStartup.contactNamePlaceholder')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mainContactEmail"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
                        <Mail className="h-3 w-3 inline mr-1" />
                        {t('auth.email')}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          {...field}
                          placeholder={t('createStartup.contactEmailPlaceholder')}
                        />
                      </FormControl>
                      <FormMessage>{tErr(fieldState.error?.message)}</FormMessage>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mainContactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
                        {t('createStartup.contactPhone')}
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="+351 912 345 678" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="programId"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('createStartup.programLabel')} *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('createStartup.selectProgram')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {loadingPrograms ? (
                          <SelectItem value="__loading__" disabled>
                            {t('common.loading')}
                          </SelectItem>
                        ) : (
                          programs?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage>{tErr(fieldState.error?.message)}</FormMessage>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('createStartup.currentStage')} *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as StartupStage)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ideation">{t('stages.ideation')}</SelectItem>
                        <SelectItem value="validation">{t('stages.validation')}</SelectItem>
                        <SelectItem value="mvp">{t('stages.mvp')}</SelectItem>
                        <SelectItem value="growth">{t('stages.growth')}</SelectItem>
                        <SelectItem value="scale">{t('stages.scale')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t('common.creating') : t('createStartup.submitApplication')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
