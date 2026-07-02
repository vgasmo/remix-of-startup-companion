import { useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, User, Lock, Mail, Save, Loader2, Phone, Upload, Linkedin, X, Briefcase, Bell, Zap, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { notify } from "@/lib/notify";
import { profileUpdateSchema, validateFormData } from '@/lib/validations';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { WorkflowIntegrations } from '@/components/settings/WorkflowIntegrations';
import { MentorNdaStatus } from '@/components/mentors/MentorNdaStatus';
import { useChecklistRecovery } from '@/hooks/useChecklistRecovery';
import { logger } from '@/lib/logger';

export default function Settings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [settingsParams, setSettingsParams] = useSearchParams();
  const settingsTab = settingsParams.get('tab') || 'profile';
  const { user, profile, roles } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Profile state
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [phone, setPhone] = useState((profile as any)?.phone || '');
  const [linkedinUrl, setLinkedinUrl] = useState((profile as any)?.linkedin_url || '');
  const [bio, setBio] = useState((profile as any)?.bio || '');
  const [expertiseInput, setExpertiseInput] = useState('');
  const [expertise, setExpertise] = useState<string[]>((profile as any)?.expertise || []);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  
  // Email state
  const [newEmail, setNewEmail] = useState('');
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  
  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const isMentor = roles.includes('mentor_externo');
  const isFounder = roles.includes('founder');
  const { canRestore, restoreChecklist } = useChecklistRecovery(user?.id);

  const handleRestoreChecklist = () => {
    restoreChecklist();
    notify.success(t('checklistRecovery.restored', 'Checklist reposta com sucesso'));
  };
  const initials = profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      notify.error(t('settingsPage.uploadImageFile'));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      notify.error(t('settingsPage.imageTooLarge'));
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(filePath);

      // Add cache buster to force refresh
      const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;
      setAvatarUrl(urlWithCacheBuster);
      notify.success(t('settingsPage.avatarUploaded'));
    } catch (error: any) {
      logger.error('Error uploading avatar', {}, error);
      notify.error(t('settingsPage.avatarUploadFailed'));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAddExpertise = () => {
    const trimmed = expertiseInput.trim();
    if (trimmed && !expertise.includes(trimmed)) {
      setExpertise([...expertise, trimmed]);
      setExpertiseInput('');
    }
  };

  const handleRemoveExpertise = (item: string) => {
    setExpertise(expertise.filter(e => e !== item));
  };

  const handleExpertiseKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddExpertise();
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validate form data
    const formData = {
      full_name: fullName,
      avatar_url: avatarUrl,
      phone: phone,
      linkedin_url: linkedinUrl,
      bio: bio,
      expertise: expertise,
    };

    const result = validateFormData(profileUpdateSchema, formData, (msg) => notify.error(msg));
    
    if (!result.success) {
      return;
    }

    setIsUpdatingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update(result.data)
        .eq('id', user.id);

      if (error) throw error;
      notify.success(t('settingsPage.profileUpdated'));
    } catch (error: any) {
      logger.error('Error updating profile', {}, error);
      notify.error(t('settingsPage.profileUpdateFailed'));
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      notify.error(t('settingsPage.pleaseEnterEmail'));
      return;
    }

    setIsUpdatingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail.trim(),
      });

      if (error) throw error;
      notify.success(t('settingsPage.emailConfirmationSent'));
      setNewEmail('');
    } catch (error: any) {
      logger.error('Error updating email', {}, error);
      notify.error(t('settingsPage.emailUpdateFailed'));
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword.length < 6) {
      notify.error(t('login.passwordMinLength'));
      return;
    }
    
    if (newPassword !== confirmPassword) {
      notify.error(t('settingsPage.passwordsDoNotMatch'));
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
      notify.success(t('settingsPage.passwordUpdated'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      logger.error('Error updating password', {}, error);
      notify.error(t('settingsPage.passwordUpdateFailed'));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <AppLayout title={t('settingsPage.title')}>
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-2"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('common.back')}
        </Button>
      </div>

      <div className="max-w-2xl">
        <Tabs value={settingsTab} onValueChange={(v) => setSettingsParams({ tab: v }, { replace: false })} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('settingsPage.profile')}</span>
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('settingsPage.email')}</span>
            </TabsTrigger>
            <TabsTrigger value="password" className="gap-2">
              <Lock className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('settingsPage.password')}</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('settingsPage.notifications')}</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2">
              <Zap className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('integrations.title')}</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>{t('settingsPage.profileInfo')}</CardTitle>
                <CardDescription>
                  {t('settingsPage.profileInfoDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  {/* Avatar Section */}
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <Avatar className="h-20 w-20">
                        <AvatarImage src={avatarUrl || undefined} alt={profile?.full_name || 'User avatar'} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      {isUploadingAvatar && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 flex-1">
                      <Label>{t('settingsPage.profilePhoto', 'Foto de Perfil')}</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingAvatar}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {t('settingsPage.uploadPhoto', 'Carregar Foto')}
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarUpload}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('settingsPage.photoHint', 'JPG, PNG ou GIF. Máx 5MB.')}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Name */}
                  <div className="space-y-2">
                    <Label htmlFor="full_name">{t('settingsPage.fullName', 'Nome Completo')}</Label>
                    <Input
                      id="full_name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('settingsPage.fullNamePlaceholder', 'O seu nome completo')}
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('settingsPage.phone', 'Telefone')}</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+351 912 345 678"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {/* LinkedIn */}
                  <div className="space-y-2">
                    <Label htmlFor="linkedin">{t('settingsPage.linkedinProfile', 'Perfil LinkedIn')}</Label>
                    <div className="relative">
                      <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="linkedin"
                        value={linkedinUrl}
                        onChange={(e) => setLinkedinUrl(e.target.value)}
                        placeholder="https://linkedin.com/in/yourprofile"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {/* Bio & Expertise - all roles */}
                  <Separator />
                  <div className="space-y-2">
                    <Label htmlFor="bio">{t('settingsPage.bioLabel', 'Bio / Experiência')}</Label>
                    <Textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder={t('settingsPage.bioPlaceholder', 'Descreva a sua experiência e percurso...')}
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('settingsPage.bioHint', 'Visível para outros membros do ecossistema')}
                    </p>
                  </div>

                  {/* Expertise tags */}
                  <div className="space-y-2">
                    <Label htmlFor="expertise">{t('settingsPage.expertiseLabel', 'Áreas de Especialidade')}</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="expertise"
                          value={expertiseInput}
                          onChange={(e) => setExpertiseInput(e.target.value)}
                          onKeyDown={handleExpertiseKeyDown}
                          placeholder={t('settingsPage.expertisePlaceholder', 'ex: Marketing, Fundraising, Produto...')}
                          className="pl-9"
                        />
                      </div>
                      <Button type="button" variant="outline" onClick={handleAddExpertise}>
                        {t('common.add', 'Adicionar')}
                      </Button>
                    </div>
                    {expertise.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {expertise.map((item) => (
                          <Badge key={item} variant="secondary" className="gap-1">
                            {item}
                            <button
                              type="button"
                              onClick={() => handleRemoveExpertise(item)}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t('settingsPage.expertiseHint', 'Adicione tags para as suas áreas de especialidade')}
                    </p>
                  </div>

                  {/* NDA Status - mentors only */}
                  {isMentor && <MentorNdaStatus />}

                  <Separator />

                  {/* Email (read-only) */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      value={profile?.email || user?.email || ''}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('settingsPage.emailChangeHint', 'Para alterar o email, use o separador Email')}
                    </p>
                  </div>

                  <Button type="submit" disabled={isUpdatingProfile} loading={isUpdatingProfile}>
                    {isUpdatingProfile ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('common.saving', 'A guardar...')}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        {t('common.saveChanges', 'Guardar Alterações')}
                      </>
                    )}
                  </Button>

                  {/* Checklist Recovery - Item L */}
                  {isFounder && canRestore && (
                    <div className="pt-4 border-t">
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="sm" 
                        onClick={handleRestoreChecklist}
                        className="text-muted-foreground hover:text-foreground gap-2"
                      >
                        <RotateCcw className="h-4 w-4" />
                        {t('checklistRecovery.restoreChecklist')}
                      </Button>
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email Tab */}
          <TabsContent value="email">
            <Card>
              <CardHeader>
                <CardTitle>{t('settingsPage.changeEmail', 'Alterar Email')}</CardTitle>
                <CardDescription>
                  {t('settingsPage.changeEmailDesc', 'Atualize o email associado à sua conta')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateEmail} className="space-y-6">
                  <div className="space-y-2">
                    <Label>{t('settingsPage.currentEmail', 'Email Atual')}</Label>
                    <Input
                      value={profile?.email || user?.email || ''}
                      disabled
                      className="bg-muted"
                    />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="new_email">{t('settingsPage.newEmail', 'Novo Email')}</Label>
                    <Input
                      id="new_email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="your.new@email.com"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('settingsPage.emailConfirmHint', 'Será enviado um email de confirmação para verificar o novo endereço')}
                    </p>
                  </div>

                  <Button type="submit" disabled={isUpdatingEmail} loading={isUpdatingEmail}>
                    {isUpdatingEmail ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('common.sending', 'A enviar...')}
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        {t('settingsPage.updateEmail', 'Atualizar Email')}
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Password Tab */}
          <TabsContent value="password">
            <Card>
              <CardHeader>
                <CardTitle>{t('settingsPage.changePassword', 'Alterar Palavra-passe')}</CardTitle>
                <CardDescription>
                  {t('settingsPage.changePasswordDesc', 'Atualize a sua palavra-passe para manter a conta segura')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdatePassword} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="new_password">{t('settingsPage.newPassword', 'Nova Palavra-passe')}</Label>
                    <Input
                      id="new_password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t('settingsPage.enterNewPassword', 'Introduza nova palavra-passe')}
                      required
                      minLength={6}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('settingsPage.minChars', 'Mínimo 6 caracteres')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm_password">{t('settingsPage.confirmPassword', 'Confirmar Nova Palavra-passe')}</Label>
                    <Input
                      id="confirm_password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('settingsPage.confirmNewPassword', 'Confirme nova palavra-passe')}
                      required
                      minLength={6}
                    />
                  </div>

                  <Button type="submit" disabled={isUpdatingPassword} loading={isUpdatingPassword}>
                    {isUpdatingPassword ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('common.updating', 'A atualizar...')}
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4 mr-2" />
                        {t('settingsPage.updatePassword', 'Atualizar Palavra-passe')}
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications">
            <NotificationSettings />
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations">
            <WorkflowIntegrations />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
