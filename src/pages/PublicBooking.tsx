import { useState, useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, CheckCircle, AlertCircle, Building2, ArrowLeft, Upload, FileText, X, Globe } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface TimeSlot {
  date: string;
  time: string;
  available: boolean;
}

interface RoutingOption {
  program_id: string | null;
  program_name: string;
  scope: string;
}

interface BookingToken {
  id: string;
  program_id: string | null;
  consultant_id: string | null;
  program_name: string | null;
  consultant_name: string | null;
  expires_at: string | null;
}

export default function PublicBooking() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [lang, setLang] = useState(i18n.language === 'en' ? 'en' : 'pt');
  const [step, setStep] = useState<'loading' | 'program_select' | 'slots' | 'form' | 'success' | 'error'>('loading');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [selectedProgramName, setSelectedProgramName] = useState<string | null>(null);
  const [pitchFile, setPitchFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    organization: '',
    sector: '',
    stage: '',
    referral_source: '',
    has_team: '',
    message: '',
    has_tech: '',
    is_iies: '',
    vertical: '',
    help_expectation: '',
    personal_intro: '',
  });

  const toggleLang = () => {
    const next = lang === 'pt' ? 'en' : 'pt';
    setLang(next);
    i18n.changeLanguage(next);
  };

  // Validate token and get routing options
  const { data: tokenResult, isLoading: tokenLoading, error: tokenError } = useQuery({
    queryKey: ['booking-token', token],
    queryFn: async (): Promise<{ tokenData: BookingToken; routingOptions: RoutingOption[] } | null> => {
      if (!token) return null;
      
      const { data, error } = await supabase.functions.invoke('public-get-availability', {
        body: { token, action: 'validate' },
      });
      
      if (error) throw error;
      if (!data?.valid) throw new Error('Invalid or expired booking link');
      
      return {
        tokenData: data.tokenData as BookingToken,
        routingOptions: (data.routingOptions || []) as RoutingOption[],
      };
    },
    retry: false,
  });

  const tokenData = tokenResult?.tokenData ?? null;
  const routingOptions = tokenResult?.routingOptions ?? [];

  // Fetch available slots - now depends on selectedProgramId
  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ['public-slots', token, selectedProgramId],
    queryFn: async () => {
      if (!token) return { slots: [], consultantName: null, programName: null };
      
      const { data, error } = await supabase.functions.invoke('public-get-availability', {
        body: { token, action: 'get_slots', program_id: selectedProgramId },
      });
      
      if (error) throw error;
      return {
        slots: (data?.slots || []) as TimeSlot[],
        consultantName: data?.consultantName as string | null,
        programName: data?.programName as string | null,
      };
    },
    enabled: !!tokenData && (routingOptions.length <= 1 || selectedProgramId !== null),
  });

  const slots = slotsData?.slots;
  const activeProgramName = selectedProgramName || slotsData?.programName || tokenData?.program_name;

  // Book mutation
  const bookMutation = useMutation({
    mutationFn: async (pitchDeckPath?: string | null) => {
      if (!token || !selectedSlot) throw new Error('Missing data');
      
      const { data, error } = await supabase.functions.invoke('public-book-first-contact', {
        body: {
          token,
          slot: selectedSlot,
          contact: { ...formData, pitch_deck_path: pitchDeckPath || undefined },
          program_id: selectedProgramId,
        },
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Booking failed');
      
      return data;
    },
    onSuccess: () => {
      setStep('success');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  useEffect(() => {
    if (tokenError) {
      setStep('error');
    } else if (tokenData && !slotsLoading) {
      // If multiple routing options and none selected yet, show program selector
      if (routingOptions.length > 1 && selectedProgramId === null) {
        setStep('program_select');
      } else {
        setStep('slots');
      }
    }
  }, [tokenData, tokenError, slotsLoading, routingOptions, selectedProgramId]);

  // Group slots by date, filtering out days with no available slots
  const slotsByDate = slots?.reduce((acc, slot) => {
    if (!slot.available) return acc;
    if (!acc[slot.date]) acc[slot.date] = [];
    acc[slot.date].push(slot);
    return acc;
  }, {} as Record<string, TimeSlot[]>) || {};

  const uploadPitchDeck = async (): Promise<string | null> => {
    if (!pitchFile) return null;
    const ext = pitchFile.name.split('.').pop() || 'pdf';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('booking-uploads').upload(path, pitchFile);
    if (error) {
      logger.warn('booking_upload_failed', { error: error?.message });
      return null;
    }
    return path;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message || !formData.organization || !formData.has_tech || !formData.is_iies || !formData.vertical || !formData.stage || !formData.help_expectation || !formData.personal_intro || !formData.referral_source) {
      toast.error(t('publicBooking.fillRequired'));
      return;
    }

    setUploading(true);
    try {
      const pitchPath = await uploadPitchDeck();
      if (pitchPath) {
        setFormData(prev => ({ ...prev, pitch_deck_path: pitchPath } as any));
      }
      bookMutation.mutate(pitchPath);
    } finally {
      setUploading(false);
    }
  };

  const handleProgramSelect = (programId: string, programName: string) => {
    setSelectedProgramId(programId);
    setSelectedProgramName(programName);
    setSelectedSlot(null);
  };

  if (step === 'loading' || tokenLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-8 w-3/4 mx-auto" />
            <Skeleton className="h-4 w-1/2 mx-auto" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">{t('publicBooking.invalidLink')}</h1>
            <p className="text-muted-foreground">
              {t('publicBooking.invalidLinkDesc')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">{t('publicBooking.bookingConfirmed')}</h1>
            <p className="text-muted-foreground">
              {t('publicBooking.bookingConfirmedDesc')}
            </p>
            {selectedSlot && (
              <div className="bg-muted rounded-lg p-4 mt-4">
                <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(selectedSlot.date), 'EEEE, MMMM d, yyyy')}
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-foreground mt-1">
                  <Clock className="h-4 w-4" />
                  {selectedSlot.time}
                </div>
              </div>
            )}
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => window.location.href = 'https://startupleiria.com'}
            >
              {t('publicBooking.backToSite', 'Voltar ao site')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back link */}
        <div className="flex items-center justify-between">
          <a
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('common.back', { defaultValue: 'Voltar' })}
          </a>
          <Button variant="ghost" size="sm" onClick={toggleLang} className="gap-1.5 text-muted-foreground">
            <Globe className="h-4 w-4" />
            {lang === 'pt' ? 'EN' : 'PT'}
          </Button>
        </div>
        {/* Header */}
        <div className="text-center">
          <Building2 className="h-10 w-10 mx-auto text-primary mb-2" />
          <h1 className="text-2xl font-bold text-foreground">{t('publicBooking.bookFirstMeeting')}</h1>
          {activeProgramName && step !== 'program_select' && (
            <p className="text-muted-foreground mt-1">
              {activeProgramName}
              {routingOptions.length > 1 && (
                <Button 
                  variant="link" 
                  size="sm" 
                  className="p-0 h-auto ml-2 text-xs"
                  onClick={() => {
                    setSelectedProgramId(null);
                    setSelectedProgramName(null);
                    setSelectedSlot(null);
                    setStep('program_select');
                  }}
                >
                  {t('publicBooking.changeProgram', { defaultValue: 'alterar' })}
                </Button>
              )}
            </p>
          )}
        </div>

        {/* Program Selection Step */}
        {step === 'program_select' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">
                {t('publicBooking.selectProgram', { defaultValue: 'Selecione o Programa' })}
              </CardTitle>
              <CardDescription>
                {t('publicBooking.selectProgramDesc', { defaultValue: 'Escolha o programa ao qual deseja candidatar-se' })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {routingOptions.map((option) => (
                  <Button
                    key={option.program_id || 'global'}
                    variant="outline"
                    className="w-full justify-start h-auto py-4 px-4"
                    onClick={() => handleProgramSelect(option.program_id || 'global', option.program_name)}
                  >
                    <Building2 className="h-5 w-5 mr-3 text-primary shrink-0" />
                    <div className="text-left">
                      <div className="font-medium">{option.program_name}</div>
                      {option.scope === 'global' && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {t('publicBooking.generalIntake', { defaultValue: 'Candidatura geral' })}
                        </div>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'slots' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">{t('publicBooking.selectTime')}</CardTitle>
              <CardDescription>{t('publicBooking.selectTimeDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {slotsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-6 w-40" />
                  <div className="flex gap-2">
                    <Skeleton className="h-9 w-16" />
                    <Skeleton className="h-9 w-16" />
                  </div>
                  <Skeleton className="h-6 w-40" />
                  <div className="flex gap-2">
                    <Skeleton className="h-9 w-16" />
                    <Skeleton className="h-9 w-16" />
                  </div>
                </div>
              ) : Object.keys(slotsByDate).length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  {t('publicBooking.noSlotsAvailable')}
                </p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(slotsByDate).slice(0, 5).map(([date, daySlots]) => (
                    <div key={date}>
                      <h3 className="font-medium mb-2 text-foreground">
                        {format(new Date(date), 'EEEE, MMMM d')}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {daySlots.map((slot) => (
                          <Button
                            key={`${slot.date}-${slot.time}`}
                            variant={selectedSlot?.date === slot.date && selectedSlot?.time === slot.time ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedSlot(slot)}
                          >
                            {slot.time}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {selectedSlot && (
                <Button 
                  className="w-full mt-6" 
                  onClick={() => setStep('form')}
                >
                  {t('common.continue', { defaultValue: 'Continue' })}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {step === 'form' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">{t('publicBooking.yourDetails')}</CardTitle>
              <CardDescription>
                {selectedSlot && (
                  <span className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(selectedSlot.date), 'MMMM d')} at {selectedSlot.time}
                    <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => setStep('slots')}>
                      {t('publicBooking.change')}
                    </Button>
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('publicBooking.fullName')} *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={t('login.fullNamePlaceholder', { defaultValue: 'Your name' })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('common.email', { defaultValue: 'Email' })} *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('common.phone', { defaultValue: 'Phone' })}</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+351 900 000 000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="organization">{t('publicBooking.organization')}</Label>
                    <Input
                      id="organization"
                      value={formData.organization}
                      onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                      placeholder={t('publicBooking.organizationPlaceholder')}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('publicBooking.sector', { defaultValue: 'Setor / Indústria' })} *</Label>
                    <Select value={formData.sector} onValueChange={(v) => setFormData({ ...formData, sector: v })}>
                      <SelectTrigger><SelectValue placeholder={t('publicBooking.sectorPlaceholder', { defaultValue: 'Selecione o setor' })} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="healthtech">HealthTech</SelectItem>
                        <SelectItem value="edtech">EdTech</SelectItem>
                        <SelectItem value="fintech">Fintech</SelectItem>
                        <SelectItem value="saas">SaaS / Software</SelectItem>
                        <SelectItem value="ecommerce">E-commerce / Marketplace</SelectItem>
                         <SelectItem value="cleantech">{t('sectors.cleantech', 'CleanTech / Sustainability')}</SelectItem>
                        <SelectItem value="foodtech">FoodTech / AgriTech</SelectItem>
                        <SelectItem value="manufacturing">{t('sectors.manufacturing', 'Industry / Manufacturing')}</SelectItem>
                        <SelectItem value="social_impact">{t('sectors.socialImpact', 'Social Impact')}</SelectItem>
                        <SelectItem value="other">{t('common.other', { defaultValue: 'Outro' })}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('publicBooking.stage', { defaultValue: 'Fase da Startup' })} *</Label>
                    <Select value={formData.stage} onValueChange={(v) => setFormData({ ...formData, stage: v })}>
                      <SelectTrigger><SelectValue placeholder={t('publicBooking.stagePlaceholder', { defaultValue: 'Selecione a fase' })} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="idea">{t('publicBooking.stageIdea', { defaultValue: 'Ideia / Conceito' })}</SelectItem>
                        <SelectItem value="mvp">{t('publicBooking.stageMvp', { defaultValue: 'MVP / Protótipo' })}</SelectItem>
                        <SelectItem value="early_revenue">{t('publicBooking.stageEarlyRevenue', { defaultValue: 'Early Revenue' })}</SelectItem>
                        <SelectItem value="growth">{t('publicBooking.stageGrowth', { defaultValue: 'Growth / Escala' })}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('publicBooking.referralSource', { defaultValue: 'Como nos conheceu?' })}</Label>
                    <Select value={formData.referral_source} onValueChange={(v) => setFormData({ ...formData, referral_source: v })}>
                      <SelectTrigger><SelectValue placeholder={t('publicBooking.referralPlaceholder', { defaultValue: 'Selecione' })} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="referral">{t('publicBooking.refReferral', { defaultValue: 'Recomendação' })}</SelectItem>
                        <SelectItem value="event">{t('publicBooking.refEvent', { defaultValue: 'Evento' })}</SelectItem>
                        <SelectItem value="social_media">{t('publicBooking.refSocial', { defaultValue: 'Redes Sociais' })}</SelectItem>
                        <SelectItem value="website">{t('publicBooking.refWebsite', { defaultValue: 'Website' })}</SelectItem>
                        <SelectItem value="press">{t('publicBooking.refPress', { defaultValue: 'Imprensa / Media' })}</SelectItem>
                        <SelectItem value="other">{t('common.other', { defaultValue: 'Outro' })}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('publicBooking.hasTeam', { defaultValue: 'Tem equipa formada?' })}</Label>
                    <Select value={formData.has_team} onValueChange={(v) => setFormData({ ...formData, has_team: v })}>
                      <SelectTrigger><SelectValue placeholder={t('publicBooking.hasTeamPlaceholder', { defaultValue: 'Selecione' })} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">{t('common.yes', { defaultValue: 'Sim' })}</SelectItem>
                        <SelectItem value="no">{t('common.no', { defaultValue: 'Não' })}</SelectItem>
                        <SelectItem value="forming">{t('publicBooking.teamForming', { defaultValue: 'Em formação' })}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">{t('publicBooking.whatToDiscuss')}</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder={t('publicBooking.discussPlaceholder')}
                    rows={3}
                  />
                </div>
                {/* Pitch Deck Upload */}
                <div className="space-y-2">
                  <Label>{t('publicBooking.pitchDeck', { defaultValue: 'Apresentação / Pitch Deck' })}</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.pptx,.ppt,.xlsx,.xls,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 10 * 1024 * 1024) {
                          toast.error(t('publicBooking.fileTooLarge', { defaultValue: 'Ficheiro demasiado grande (máx. 10MB)' }));
                          return;
                        }
                        setPitchFile(file);
                      }
                    }}
                  />
                  {pitchFile ? (
                    <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate flex-1">{pitchFile.name}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setPitchFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-muted-foreground"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {t('publicBooking.uploadPitch', { defaultValue: 'Carregar apresentação (PDF, PPTX, até 10MB)' })}
                    </Button>
                  )}
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={bookMutation.isPending || uploading}
                >
                  {(bookMutation.isPending || uploading) ? t('publicBooking.booking') : t('publicBooking.confirmBooking')}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
