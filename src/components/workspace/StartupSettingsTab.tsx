import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import {
  useStartupChangeRequests,
  useSubmitStartupChangeRequests,
  type NewChangeRequestInput,
  type StartupChangeRequestFieldKey,
} from '@/hooks/useStartupChangeRequests';
import { StartupChangeRequestsList } from './StartupChangeRequestsList';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Building2, Upload, Loader2, Globe, Calendar, Phone, MapPin, Mail, BadgeCheck, FileText, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { notify } from "@/lib/notify";
import { IntegrationSettings } from './IntegrationSettings';
import { FounderRequestsPanel } from './FounderRequestsPanel';

interface StartupSettingsTabProps {
  workspaceId: string;
  startupId: string;
  startup: {
    name: string;
    description: string | null;
    website: string | null;
    logo_url: string | null;
    founded_date: string | null;
    phone: string | null;
    address: string | null;
    nif: string | null;
    main_contact_name: string | null;
    main_contact_email: string | null;
    main_contact_phone: string | null;
    has_startup_portugal_status: boolean | null;
    startup_portugal_document_path: string | null;
  };
  canEdit: boolean;
}

export function StartupSettingsTab({ workspaceId, startupId, startup, canEdit }: StartupSettingsTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [formData, setFormData] = useState({
    name: startup.name,
    description: startup.description || '',
    website: startup.website || '',
    founded_date: startup.founded_date || '',
    phone: startup.phone || '',
    address: startup.address || '',
    nif: startup.nif || '',
    main_contact_name: startup.main_contact_name || '',
    main_contact_email: startup.main_contact_email || '',
    main_contact_phone: startup.main_contact_phone || '',
    has_startup_portugal_status: !!startup.has_startup_portugal_status,
    startup_portugal_document_path: startup.startup_portugal_document_path || '',
  });

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      notify.error(t('admin.startupsManager.invalidFileType'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify.error(t('admin.startupsManager.fileTooLarge'));
      return;
    }

    setIsUploadingDoc(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${startupId}/startup-portugal-doc.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('startup-documents')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('startup-documents')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, startup_portugal_document_path: publicUrl }));
      
      // Also update the database immediately
      await supabase.from('startups').update({ startup_portugal_document_path: publicUrl }).eq('id', startupId);
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      
      notify.success(t('admin.startupsManager.documentUploaded'));
    } catch (error: any) {
      notify.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setIsUploadingDoc(false);
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Validate document requirement
      if (data.has_startup_portugal_status && !data.startup_portugal_document_path) {
        throw new Error(t('admin.startupsManager.documentRequired'));
      }

      const { error } = await supabase
        .from('startups')
        .update({
          name: data.name,
          description: data.description || null,
          website: data.website || null,
          founded_date: data.founded_date || null,
          phone: data.phone || null,
          address: data.address || null,
          nif: data.nif || null,
          main_contact_name: data.main_contact_name || null,
          main_contact_email: data.main_contact_email || null,
          main_contact_phone: data.main_contact_phone || null,
          has_startup_portugal_status: !!data.has_startup_portugal_status,
          startup_portugal_document_path: data.startup_portugal_document_path || null,
        })
        .eq('id', startupId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      notify.success(t('startupSettings.profileUpdated', 'Startup profile updated'));
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      notify.error(t('startupSettings.uploadImageOnly', 'Please upload an image file'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify.error(t('startupSettings.imageSizeLimit', 'Image must be less than 2MB'));
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${startupId}/logo.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('startup-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('startup-logos')
        .getPublicUrl(filePath);

      // Update startup record
      const { error: updateError } = await supabase
        .from('startups')
        .update({ logo_url: publicUrl })
        .eq('id', startupId);

      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      notify.success(t('startupSettings.logoUploaded', 'Logo uploaded successfully'));
    } catch (error: any) {
      notify.error(`${t('startupSettings.uploadFailed', 'Upload failed')}: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      notify.error(t('startupSettings.nameRequired', 'Name is required'));
      return;
    }
    updateMutation.mutate(formData);
  };

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t('startupSettings.title', 'Startup Profile')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={startup.logo_url || undefined} />
              <AvatarFallback className="text-lg bg-primary/10">
                {startup.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-xl font-bold">{startup.name}</h3>
              {startup.website && (
                <a href={startup.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  {startup.website}
                </a>
              )}
            </div>
          </div>
          {startup.description && (
            <p className="text-muted-foreground">{startup.description}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
  <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {t('startupSettings.title', 'Startup Profile')}
        </CardTitle>
        <CardDescription>{t('startupSettings.editDescription', 'Edit your startup\'s public information')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Logo upload */}
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20">
              <AvatarImage src={startup.logo_url || undefined} />
              <AvatarFallback className="text-xl bg-primary/10">
                {startup.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {isUploading ? t('common.loading') : t('startupSettings.uploadLogo', 'Upload Logo')}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">{t('startupSettings.logoHint', 'PNG, JPG up to 2MB')}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t('startupSettings.startupName', 'Startup Name')} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">{t('startupSettings.website', 'Website')}</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="website"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://..."
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nif">{t('nif.label', 'NIF (Tax ID)')}</Label>
              <Input
                id="nif"
                value={formData.nif}
                onChange={(e) => setFormData({ ...formData, nif: e.target.value })}
                placeholder="PT123456789"
              />
            </div>
            <div className="flex items-end">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="has_startup_portugal_status"
                  checked={formData.has_startup_portugal_status}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, has_startup_portugal_status: !!checked })
                  }
                />
                <Label htmlFor="has_startup_portugal_status" className="cursor-pointer flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-muted-foreground" />
                  {t('admin.startupsManager.startupPortugalStatus')}
                </Label>
              </div>
            </div>
          </div>

          {/* Startup Portugal Document Upload */}
          {formData.has_startup_portugal_status && (
            <div className="p-4 rounded-lg border bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/30 space-y-3">
              <Label className="text-sm flex items-center gap-2 font-medium">
                <FileText className="h-4 w-4" />
                {t('admin.startupsManager.certificationDocument')} *
              </Label>
              
              {formData.startup_portugal_document_path ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className="text-[hsl(var(--success))] border-[hsl(var(--success))]/30">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {t('admin.startupsManager.documentAttached')}
                  </Badge>
                  <a 
                    href={formData.startup_portugal_document_path} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {t('admin.startupsManager.viewDocument')}
                  </a>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setFormData({ ...formData, startup_portugal_document_path: '' })}
                  >
                    {t('common.remove')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleDocumentUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => docInputRef.current?.click()}
                    disabled={isUploadingDoc}
                  >
                    {isUploadingDoc ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {isUploadingDoc ? t('common.loading') : t('admin.startupsManager.uploadDocument')}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {t('admin.startupsManager.acceptedFormats')}
                  </p>

                  <Alert variant="destructive" className="py-2 mt-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      {t('admin.startupsManager.documentRequiredWarning')}
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">{t('startupSettings.mainContact', 'Main contact')}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="main_contact_name">{t('startupSettings.contactName', 'Contact name')}</Label>
                <Input
                  id="main_contact_name"
                  value={formData.main_contact_name}
                  onChange={(e) => setFormData({ ...formData, main_contact_name: e.target.value })}
                  placeholder="João Silva"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="main_contact_email">{t('startupSettings.contactEmail', 'Contact email')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="main_contact_email"
                    type="email"
                    value={formData.main_contact_email}
                    onChange={(e) => setFormData({ ...formData, main_contact_email: e.target.value })}
                    placeholder="joao@startup.pt"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="main_contact_phone">{t('startupSettings.contactPhone', 'Contact phone')}</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="main_contact_phone"
                    value={formData.main_contact_phone}
                    onChange={(e) => setFormData({ ...formData, main_contact_phone: e.target.value })}
                    placeholder="+351 912 345 678"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">{t('startupSettings.phone', 'Phone')}</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+351 912 345 678"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="founded_date">{t('startupSettings.foundedDate', 'Founded Date')}</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="founded_date"
                  type="date"
                  value={formData.founded_date}
                  onChange={(e) => setFormData({ ...formData, founded_date: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">{t('startupSettings.address', 'Address')}</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Rua do Exemplo, 123, 2400-000 Leiria"
                rows={2}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('common.description', 'Description')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              placeholder={t('startupSettings.descriptionPlaceholder', 'Describe your startup, mission, and what you\'re building...')}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateMutation.isPending} loading={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {t('common.save', 'Save Changes')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <Separator className="my-6" />

    {/* Integration Settings for meeting/email capture */}
    <IntegrationSettings 
      workspaceId={workspaceId} 
      emailAlias={`workspace-${workspaceId.slice(0, 8)}@capture.startupleiria.com`}
      canEdit={canEdit}
    />

    <Separator className="my-6" />

    {/* Founder → Staff requests */}
    <FounderRequestsPanel workspaceId={workspaceId} />
  </>
  );
}
