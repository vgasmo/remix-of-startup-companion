import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Rocket, Building2, Globe, Calendar, FileText, Phone, Mail, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { usePrograms } from '@/hooks/useWorkspaces';
import { notify } from "@/lib/notify";
import { StartupStage } from '@/types/database';
import { logger } from '@/lib/logger';

const startupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().trim().min(20, 'Description must be at least 20 characters').max(500),
  website: z.string().url().optional().or(z.literal('')),
  stage: z.enum(['ideation', 'validation', 'mvp', 'growth', 'scale']),
  programId: z.string().uuid('Please select a program'),
  nif: z.string().max(20).optional(),
  mainContactName: z.string().max(100).optional(),
  mainContactEmail: z.string().email().optional().or(z.literal('')),
  mainContactPhone: z.string().max(30).optional(),
});

interface CreateStartupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateStartupDialog({ open, onOpenChange }: CreateStartupDialogProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: programs, isLoading: loadingPrograms } = usePrograms();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [stage, setStage] = useState<StartupStage>('ideation');
  const [programId, setProgramId] = useState('');
  const [nif, setNif] = useState('');
  const [mainContactName, setMainContactName] = useState('');
  const [mainContactEmail, setMainContactEmail] = useState('');
  const [mainContactPhone, setMainContactPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    const result = startupSchema.safeParse({ 
      name, description, website, stage, programId,
      nif, mainContactName, mainContactEmail, mainContactPhone
    });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    if (!user) {
      setError(t('createStartup.mustBeLoggedIn'));
      return;
    }

    setIsSubmitting(true);

    try {
      // Create everything server-side (startup + pending workspace + membership)
      const { data, error: createError } = await supabase
        .rpc('create_startup_application', {
          p_name: result.data.name,
          p_stage: result.data.stage,
          p_program_id: result.data.programId,
          p_description: result.data.description || null,
          p_website: result.data.website || null,
          p_nif: result.data.nif || null,
          p_main_contact_name: result.data.mainContactName || null,
          p_main_contact_email: result.data.mainContactEmail || null,
          p_main_contact_phone: result.data.mainContactPhone || null,
          p_has_startup_portugal_status: false,
        })
        .single();

      if (createError) throw createError;

      notify.success(t('createStartup.successMessage'));
      onOpenChange(false);

      const workspaceId = (data as any)?.workspace_id as string | undefined;
      if (workspaceId) {
        navigate(`/workspace/${workspaceId}`);
      }
      // Reset form
      setName('');
      setDescription('');
      setWebsite('');
      setStage('ideation');
      setProgramId('');
      setNif('');
      setMainContactName('');
      setMainContactEmail('');
      setMainContactPhone('');
      
    } catch (err: any) {
      logger.error('Error creating startup', {}, err);
      // User-friendly error messages instead of raw database errors
      if (err?.code === '23505') {
        setError(t('createStartup.duplicateName', 'A startup with this name already exists.'));
      } else if (err?.message?.includes('permission') || err?.message?.includes('RLS')) {
        setError(t('createStartup.permissionError', 'You do not have permission to create a startup. Please contact support.'));
      } else if (err?.code === 'PGRST') {
        setError(t('createStartup.serverError', 'Server error. Please try again in a few moments.'));
      } else {
        setError(t('createStartup.failedToCreate'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <DialogDescription>
            {t('createStartup.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="startup-name">
              <Building2 className="h-3.5 w-3.5 inline mr-1.5" />
              {t('createStartup.startupName')} *
            </Label>
            <Input
              id="startup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('createStartup.startupNamePlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="startup-description">
              <FileText className="h-3.5 w-3.5 inline mr-1.5" />
              {t('createStartup.descriptionLabel')} *
            </Label>
            <Textarea
              id="startup-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('createStartup.descriptionPlaceholder')}
              rows={3}
              required
              minLength={20}
            />
            <p className="text-xs text-muted-foreground">
              {t('createStartup.descriptionHint', 'Minimum 20 characters. Describe what your startup does.')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="startup-website">
              <Globe className="h-3.5 w-3.5 inline mr-1.5" />
              {t('createStartup.websiteLabel')}
            </Label>
            <Input
              id="startup-website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder={t('createStartup.websitePlaceholder')}
            />
          </div>

          {/* NIF */}
          <div className="space-y-2">
            <Label htmlFor="startup-nif">NIF (Tax ID)</Label>
            <Input
              id="startup-nif"
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              placeholder="PT123456789"
              maxLength={20}
            />
          </div>

          {/* Main Contact */}
          <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
            <p className="text-sm font-medium flex items-center gap-2">
              <Phone className="h-4 w-4" />
              {t('createStartup.mainContact', 'Main Contact')}
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="main-contact-name" className="text-xs">{t('createStartup.contactName', 'Name')}</Label>
                <Input
                  id="main-contact-name"
                  value={mainContactName}
                  onChange={(e) => setMainContactName(e.target.value)}
                  placeholder={t('createStartup.contactNamePlaceholder', 'John Smith')}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="main-contact-email" className="text-xs">
                  <Mail className="h-3 w-3 inline mr-1" />
                  {t('auth.email', 'Email')}
                </Label>
                <Input
                  id="main-contact-email"
                  type="email"
                  value={mainContactEmail}
                  onChange={(e) => setMainContactEmail(e.target.value)}
                  placeholder={t('createStartup.contactEmailPlaceholder', 'john@startup.com')}
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="main-contact-phone" className="text-xs">{t('createStartup.contactPhone', 'Phone')}</Label>
                <Input
                  id="main-contact-phone"
                  value={mainContactPhone}
                  onChange={(e) => setMainContactPhone(e.target.value)}
                  placeholder="+351 912 345 678"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startup-program">{t('createStartup.programLabel')} *</Label>
              <Select value={programId} onValueChange={setProgramId} required>
                <SelectTrigger>
                  <SelectValue placeholder={t('createStartup.selectProgram')} />
                </SelectTrigger>
                <SelectContent>
                  {loadingPrograms ? (
                    <SelectItem value="__loading__" disabled>{t('common.loading')}</SelectItem>
                  ) : (
                    programs?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startup-stage">{t('createStartup.currentStage')} *</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as StartupStage)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ideation">{t('stages.ideation')}</SelectItem>
                  <SelectItem value="validation">{t('stages.validation')}</SelectItem>
                  <SelectItem value="mvp">{t('stages.mvp')}</SelectItem>
                  <SelectItem value="growth">{t('stages.growth')}</SelectItem>
                  <SelectItem value="scale">{t('stages.scale')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('common.creating') : t('createStartup.submitApplication')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}