import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, RotateCcw, User, Loader2, Copy, ExternalLink, Link, Plus, Trash2, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useIntakeRouting, useUpsertIntakeRoute, useConsultants, type IntakeRoute } from '@/hooks/useIntakeRouting';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface BookingLink {
  id: string;
  token_hash: string;
  owner_consultant_id: string | null;
  owner_email: string | null;
  program_id: string | null;
  active: boolean;
  expires_at: string | null;
  created_at: string;
  intake_route_id: string | null;
}

interface IntakeRoutingManagerProps {
  showBookingLinks?: boolean;
}

interface RoutingEditorProps {
  route: IntakeRoute | undefined;
  consultants: Array<{ id: string; full_name: string | null; email: string | null }>;
  scope: 'global' | 'program';
  programId?: string | null;
  programName?: string;
  onSaved: () => void;
}

function RoutingEditor({ route, consultants, scope, programId, programName, onSaved }: RoutingEditorProps) {
  const { t } = useTranslation();
  const upsertRoute = useUpsertIntakeRoute();
  
  const [mode, setMode] = useState<'single' | 'round_robin'>('single');
  const [selectedConsultants, setSelectedConsultants] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  
  useEffect(() => {
    if (route) {
      setMode(route.mode as 'single' | 'round_robin');
      setSelectedConsultants(route.consultant_ids || []);
      setActive(route.active ?? true);
      setHasChanges(false);
    } else {
      setMode('single');
      setSelectedConsultants([]);
      setActive(true);
      setHasChanges(false);
    }
  }, [route]);
  
  const handleConsultantToggle = (consultantId: string) => {
    setSelectedConsultants(prev => {
      if (mode === 'single') return [consultantId];
      if (prev.includes(consultantId)) return prev.filter(id => id !== consultantId);
      return [...prev, consultantId];
    });
    setHasChanges(true);
  };
  
  const handleModeChange = (newMode: 'single' | 'round_robin') => {
    setMode(newMode);
    if (newMode === 'single' && selectedConsultants.length > 1) {
      setSelectedConsultants([selectedConsultants[0]]);
    }
    setHasChanges(true);
  };

  const handleActiveChange = (next: boolean) => {
    setActive(next);
    setHasChanges(true);
  };
  
  const handleSave = async () => {
    if (active && selectedConsultants.length === 0) {
      toast.error(t('admin.pleaseSelectAtLeastOne'));
      return;
    }
    
    await upsertRoute.mutateAsync({
      id: route?.id,
      scope,
      program_id: programId || null,
      mode,
      consultant_ids: selectedConsultants,
      active,
    });
    
    setHasChanges(false);
    onSaved();
  };
  
  return (
    <div className="space-y-5">
      {/* Mode Selection */}
      <div className="space-y-3">
        <Label>{t('admin.intakeRouting.routingMode', 'Modo de Encaminhamento')}</Label>
        <RadioGroup value={mode} onValueChange={(v) => handleModeChange(v as 'single' | 'round_robin')}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="single" id={`single-${scope}-${programId || 'global'}`} />
            <Label htmlFor={`single-${scope}-${programId || 'global'}`} className="flex items-center gap-2 cursor-pointer">
              <User className="h-4 w-4" />
              {t('admin.intakeRouting.singleConsultant', 'Consultor Único')}
              <span className="text-xs text-muted-foreground">
                — {t('admin.intakeRouting.singleDesc', 'Todas as marcações vão para um calendário')}
              </span>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="round_robin" id={`rr-${scope}-${programId || 'global'}`} />
            <Label htmlFor={`rr-${scope}-${programId || 'global'}`} className="flex items-center gap-2 cursor-pointer">
              <RotateCcw className="h-4 w-4" />
              {t('admin.intakeRouting.roundRobin', 'Round Robin')}
              <span className="text-xs text-muted-foreground">
                — {t('admin.intakeRouting.roundRobinDesc', 'Distribuir leads entre consultores selecionados')}
              </span>
            </Label>
          </div>
        </RadioGroup>
      </div>
      
      {/* Consultant Selection */}
      <div className="space-y-3">
        <Label>
          {mode === 'single'
            ? t('admin.intakeRouting.selectConsultant', 'Selecionar Consultor')
            : t('admin.intakeRouting.selectConsultants', 'Selecionar Consultores para Rotação')}
        </Label>
        <div className="grid gap-2">
          {consultants?.map((consultant) => (
            <div
              key={consultant.id}
              className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                selectedConsultants.includes(consultant.id)
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              }`}
              onClick={() => handleConsultantToggle(consultant.id)}
            >
              <Checkbox
                checked={selectedConsultants.includes(consultant.id)}
                onCheckedChange={() => handleConsultantToggle(consultant.id)}
              />
              <div className="flex-1">
                <div className="font-medium">{consultant.full_name || 'Unnamed'}</div>
                <div className="text-sm text-muted-foreground">{consultant.email}</div>
              </div>
              {selectedConsultants.includes(consultant.id) && mode === 'round_robin' && (
                <Badge variant="secondary">
                  #{selectedConsultants.indexOf(consultant.id) + 1}
                </Badge>
              )}
            </div>
          ))}
          {(!consultants || consultants.length === 0) && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              {t('admin.intakeRouting.noConsultants', 'Nenhum consultor encontrado.')}
            </div>
          )}
        </div>
      </div>
      
      {/* Current Status */}
      {route && (
        <div className="p-3 bg-muted/50 rounded-lg text-sm">
          <div className="font-medium mb-1">{t('admin.intakeRouting.currentConfig', 'Configuração Atual')}</div>
          <div className="text-muted-foreground">
            {t('admin.intakeRouting.mode', 'Modo')}: <span className="font-medium">{route.mode === 'single' ? t('admin.intakeRouting.singleConsultant') : t('admin.intakeRouting.roundRobin')}</span>
            {route.mode === 'round_robin' && (
              <span> — {t('admin.intakeRouting.nextAssignment', 'Próxima atribuição')}: #{(route.round_robin_index % (route.consultant_ids?.length || 1)) + 1}</span>
            )}
          </div>
        </div>
      )}
      
      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={upsertRoute.isPending || !hasChanges || selectedConsultants.length === 0}
      >
        {upsertRoute.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {t('common.saveChanges', 'Guardar Alterações')}
      </Button>
    </div>
  );
}

export function IntakeRoutingManager({ showBookingLinks = true }: IntakeRoutingManagerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: routes, isLoading: loadingRoutes } = useIntakeRouting();
  const { data: consultants, isLoading: loadingConsultants } = useConsultants();
  
  // Fetch active programs
  const { data: programs } = useQuery({
    queryKey: ['programs-for-routing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('programs')
        .select('id, name, is_active')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });
  
  const globalRoute = routes?.find(r => r.scope === 'global');
  const programRoutes = routes?.filter(r => r.scope === 'program') || [];
  
  const getProgramRoute = (programId: string) => programRoutes.find(r => r.program_id === programId);
  
  // Fetch booking links
  const { data: bookingLinks, isLoading: loadingLinks } = useQuery({
    queryKey: ['booking-links'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_booking_links')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as BookingLink[];
    },
  });
  
  // Create booking link mutation
  const createLinkMutation = useMutation({
    mutationFn: async () => {
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const tokenHash = token;
      
      const { data, error } = await supabase
        .from('public_booking_links')
        .insert({
          token_hash: tokenHash,
          intake_route_id: globalRoute?.id || null,
          active: true,
        })
        .select()
        .single();
      
      if (error) throw error;
      return { ...data, plainToken: token };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['booking-links'] });
      const link = `${window.location.origin}/book/${data.plainToken}`;
      navigator.clipboard.writeText(link);
      toast.success(t('admin.linkCreatedAndCopiedTo'));
    },
    onError: (error) => {
      toast.error(t('admin.failedToCreateLink', { message: error.message }));
    },
  });
  
  // Delete booking link mutation
  const deleteLinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('public_booking_links')
        .update({ active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-links'] });
      toast.success(t('admin.linkDeactivated'));
    },
  });
  
  const handleCopyLink = (tokenHash: string) => {
    const link = `${window.location.origin}/book/${tokenHash}`;
    navigator.clipboard.writeText(link);
    toast.success(t('admin.linkCopiedToClipboard'));
  };
  
  if (loadingRoutes || loadingConsultants) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }
  
  const tabItems = [
    { value: 'global', label: t('admin.intakeRouting.global', 'Geral') },
    ...(programs || []).map(p => ({ value: p.id, label: p.name })),
  ];
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('admin.intakeRouting.title', 'Encaminhamento de Intake')}
          </CardTitle>
          <CardDescription>
            {t('admin.intakeRouting.perProgramDesc', 'Configure qual calendário de consultor é usado para primeiros contactos. Defina uma regra global ou personalize por programa.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="global" className="w-full">
            <TabsList className="mb-4 flex-wrap h-auto gap-1">
              {tabItems.map(tab => {
                const isGlobal = tab.value === 'global';
                const route = isGlobal ? globalRoute : getProgramRoute(tab.value);
                const hasConfig = !!route;
                return (
                  <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
                    {isGlobal ? <Users className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                    {tab.label}
                    {hasConfig && (
                      <span className="ml-1 h-2 w-2 rounded-full bg-primary inline-block" />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            
            {/* Global tab */}
            <TabsContent value="global">
              <div className="p-1">
                <p className="text-sm text-muted-foreground mb-4">
                  {t('admin.intakeRouting.globalDesc', 'Configuração padrão aplicada quando não existe regra específica para o programa selecionado pela lead.')}
                </p>
                <RoutingEditor
                  route={globalRoute}
                  consultants={consultants || []}
                  scope="global"
                  onSaved={() => {}}
                />
              </div>
            </TabsContent>
            
            {/* Per-program tabs */}
            {(programs || []).map(program => {
              const programRoute = getProgramRoute(program.id);
              return (
                <TabsContent key={program.id} value={program.id}>
                  <div className="p-1">
                    <p className="text-sm text-muted-foreground mb-4">
                      {programRoute
                        ? t('admin.intakeRouting.programConfigured', {
                            program: program.name,
                            defaultValue: `Regra específica para "${program.name}". Esta configuração tem prioridade sobre a regra global.`,
                          })
                        : t('admin.intakeRouting.programNotConfigured', {
                            program: program.name,
                            defaultValue: `Sem regra específica para "${program.name}". A regra global será usada. Configure abaixo para personalizar.`,
                          })
                      }
                    </p>
                    <RoutingEditor
                      route={programRoute}
                      consultants={consultants || []}
                      scope="program"
                      programId={program.id}
                      programName={program.name}
                      onSaved={() => {}}
                    />
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>
      
      {showBookingLinks && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Link className="h-5 w-5" />
                  {t('admin.intakeRouting.bookingLinks', 'Booking Links')}
                </CardTitle>
                <CardDescription>
                  {t('admin.intakeRouting.bookingLinksDesc', 'Generate shareable links for external booking')}
                </CardDescription>
              </div>
              <Button onClick={() => createLinkMutation.mutate()} disabled={createLinkMutation.isPending}>
                {createLinkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {t('admin.intakeRouting.generateLink', 'Generate Link')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingLinks ? (
              <div className="py-4 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : bookingLinks && bookingLinks.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.intakeRouting.link', 'Link')}</TableHead>
                    <TableHead>{t('admin.intakeRouting.createdAt', 'Created')}</TableHead>
                    <TableHead>{t('common.actions', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookingLinks.map(link => (
                    <TableRow key={link.id}>
                      <TableCell className="font-mono text-sm">
                        /book/{link.token_hash.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(link.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyLink(link.token_hash)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a href={`/book/${link.token_hash}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteLinkMutation.mutate(link.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                {t('admin.intakeRouting.noLinks', 'No booking links yet. Generate one to get started.')}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
