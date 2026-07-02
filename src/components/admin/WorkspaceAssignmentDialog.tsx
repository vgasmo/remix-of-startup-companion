import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Building2, Plus, Sparkles, Search } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { usePrograms } from '@/hooks/useAdminData';
import { notify } from "@/lib/notify";

interface WorkspaceAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    email: string;
    full_name: string | null;
  };
}

export function WorkspaceAssignmentDialog({ open, onOpenChange, user }: WorkspaceAssignmentDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: programs } = usePrograms();
  
  const [tab, setTab] = useState<string>('suggest');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [newStartupName, setNewStartupName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newProgramId, setNewProgramId] = useState('');
  const [newStage, setNewStage] = useState('ideation');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Extract email domain for suggestions
  const emailDomain = user.email.split('@')[1]?.toLowerCase() || '';
  
  // Suggest name from email domain
  const suggestedName = useMemo(() => {
    if (!emailDomain || ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'live.com', 'icloud.com', 'sapo.pt', 'mail.com'].includes(emailDomain)) {
      return '';
    }
    return emailDomain.split('.')[0].charAt(0).toUpperCase() + emailDomain.split('.')[0].slice(1);
  }, [emailDomain]);

  // Query startups that match the email domain
  const { data: suggestedStartups, isLoading: loadingSuggestions } = useQuery({
    queryKey: ['startup-suggestions', emailDomain],
    queryFn: async () => {
      if (!emailDomain || ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'live.com', 'icloud.com', 'sapo.pt', 'mail.com'].includes(emailDomain)) {
        return [];
      }
      
      // Search by main_contact_email domain or website domain
      const { data, error } = await supabase
        .from('startups')
        .select('id, name, main_contact_email, website')
        .or(`main_contact_email.ilike.%@${emailDomain},website.ilike.%${emailDomain}%`)
        .limit(10);
      
      if (error) throw error;

      // Get workspace info for these startups
      if (!data?.length) return [];
      
      const startupIds = data.map(s => s.id);
      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id, startup_id, status, stage, program:programs(id, name)')
        .in('startup_id', startupIds);

      return data.map(s => ({
        ...s,
        workspaces: (workspaces || []).filter(w => w.startup_id === s.id),
      }));
    },
    enabled: open,
  });

  // Query all available workspaces for manual search
  const { data: allWorkspaces } = useQuery({
    queryKey: ['all-workspaces-for-assignment', searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('workspaces')
        .select('id, status, startup:startups(id, name, main_contact_email)')
        .in('status', ['imported_unclaimed', 'active', 'claimed', 'pending'])
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (searchQuery.trim()) {
        // We filter client-side since startup name is in a joined table
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open && tab === 'search',
  });

  const filteredWorkspaces = useMemo(() => {
    if (!allWorkspaces) return [];
    if (!searchQuery.trim()) return allWorkspaces;
    const q = searchQuery.toLowerCase();
    return allWorkspaces.filter(w => {
      const name = (w.startup as any)?.name?.toLowerCase() || '';
      const email = (w.startup as any)?.main_contact_email?.toLowerCase() || '';
      return name.includes(q) || email.includes(q);
    });
  }, [allWorkspaces, searchQuery]);

  const handleAssign = async (workspaceId: string) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('staff_assign_or_create_workspace', {
        p_user_id: user.id,
        p_mode: 'assign',
        p_workspace_id: workspaceId,
      });
      if (error) throw error;
      
      notify.success(t('admin.workspaceAssigned', { defaultValue: 'Workspace atribuído e conta aprovada!' }));
      invalidateAndClose();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreate = async () => {
    const nameToUse = newStartupName.trim() || suggestedName;
    if (!nameToUse) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('staff_assign_or_create_workspace', {
        p_user_id: user.id,
        p_mode: 'create',
        p_startup_name: nameToUse,
        p_program_id: newProgramId || null,
        p_stage: newStage,
        p_description: newDescription.trim() || null,
      });
      if (error) throw error;
      
      notify.success(t('admin.workspaceCreated', { defaultValue: 'Workspace criado e conta aprovada!' }));
      invalidateAndClose();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const invalidateAndClose = () => {
    queryClient.invalidateQueries({ queryKey: ['pending-user-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
    queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    queryClient.invalidateQueries({ queryKey: ['pending-claim-requests'] });
    queryClient.invalidateQueries({ queryKey: ['admin-workspace-users'] });
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setTab('suggest');
    setSelectedWorkspaceId('');
    setSearchQuery('');
    setNewStartupName('');
    setNewDescription('');
    setNewProgramId('');
    setNewStage('ideation');
  };

  const hasSuggestions = (suggestedStartups?.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {t('admin.assignWorkspace', { defaultValue: 'Atribuir Workspace' })}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {t('admin.assignWorkspaceDesc', { 
              defaultValue: 'Atribuir ou criar workspace para {{name}} ({{email}})',
              name: user.full_name || 'Utilizador',
              email: user.email,
            })}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="suggest" className="text-xs gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              {t('admin.suggested', { defaultValue: 'Sugerido' })}
              {hasSuggestions && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{suggestedStartups!.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="search" className="text-xs gap-1">
              <Search className="h-3.5 w-3.5" />
              {t('admin.searchExisting', { defaultValue: 'Pesquisar' })}
            </TabsTrigger>
            <TabsTrigger value="create" className="text-xs gap-1">
              <Plus className="h-3.5 w-3.5" />
              {t('admin.createNew', { defaultValue: 'Criar Novo' })}
            </TabsTrigger>
          </TabsList>

          {/* Suggested matches */}
          <TabsContent value="suggest" className="mt-4 space-y-3">
            {loadingSuggestions ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : hasSuggestions ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {t('admin.suggestedByDomain', { 
                    defaultValue: 'Startups com correspondência ao domínio {{domain}}:',
                    domain: emailDomain,
                  })}
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {suggestedStartups!.map(startup => (
                    <Card key={startup.id} className="hover:border-primary/50 transition-colors">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{startup.name}</p>
                          <p className="text-xs text-muted-foreground">{startup.main_contact_email}</p>
                          {startup.workspaces.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {startup.workspaces.map((w: any) => (
                                <Badge key={w.id} variant="outline" className="text-[10px]">
                                  {w.status} {w.program?.name ? `• ${w.program.name}` : ''}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          disabled={isSubmitting || startup.workspaces.length === 0} loading={isSubmitting}
                          onClick={() => {
                            const ws = startup.workspaces[0];
                            if (ws) handleAssign(ws.id);
                          }}
                        >
                          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('admin.assign', { defaultValue: 'Associar' })}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>{t('admin.noSuggestionsFound', { defaultValue: 'Nenhuma startup encontrada para o domínio do email.' })}</p>
                <p className="text-xs mt-1">{t('admin.trySearOrCreate', { defaultValue: 'Tente pesquisar manualmente ou criar um novo workspace.' })}</p>
              </div>
            )}
          </TabsContent>

          {/* Manual search */}
          <TabsContent value="search" className="mt-4 space-y-3">
            <div>
              <Input
                placeholder={t('admin.searchStartupPlaceholder', { defaultValue: 'Pesquisar por nome da startup...' })}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredWorkspaces.map(w => (
                <Card key={w.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{(w.startup as any)?.name || 'Sem nome'}</p>
                      <div className="flex gap-1 mt-0.5">
                        <Badge variant="outline" className="text-[10px]">{w.status}</Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={isSubmitting} loading={isSubmitting}
                      onClick={() => handleAssign(w.id)}
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('admin.assign', { defaultValue: 'Associar' })}
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {filteredWorkspaces.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">
                  {t('admin.noWorkspacesFound', { defaultValue: 'Nenhum workspace encontrado.' })}
                </p>
              )}
            </div>
          </TabsContent>

          {/* Create new */}
          <TabsContent value="create" className="mt-4 space-y-4">
            <div className="space-y-3">
              <div>
                <Label className="text-xs">{t('admin.startupName', { defaultValue: 'Nome da Startup' })}</Label>
                <Input
                  value={newStartupName || suggestedName}
                  onChange={(e) => setNewStartupName(e.target.value)}
                  placeholder={suggestedName || t('admin.startupNamePlaceholder', { defaultValue: 'Nome da empresa...' })}
                />
                {suggestedName && !newStartupName && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    {t('admin.suggestedFromEmail', { defaultValue: 'Sugerido a partir do email' })}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">{t('admin.description', { defaultValue: 'Descrição (opcional)' })}</Label>
                <Textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  placeholder={t('admin.descriptionPlaceholder', { defaultValue: 'Breve descrição da startup...' })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t('admin.program', { defaultValue: 'Programa' })}</Label>
                  <Select value={newProgramId} onValueChange={setNewProgramId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('admin.selectProgram', { defaultValue: 'Selecionar...' })} />
                    </SelectTrigger>
                    <SelectContent>
                      {programs?.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t('admin.stage', { defaultValue: 'Etapa' })}</Label>
                  <Select value={newStage} onValueChange={setNewStage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['ideation', 'validation', 'mvp', 'growth', 'scale'].map(s => (
                        <SelectItem key={s} value={s}>{t(`stages.${s}`, s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel', { defaultValue: 'Cancelar' })}
              </Button>
              <Button onClick={handleCreate} disabled={isSubmitting || !(newStartupName.trim() || suggestedName)} loading={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {t('admin.createAndAssign', { defaultValue: 'Criar e Atribuir' })}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
