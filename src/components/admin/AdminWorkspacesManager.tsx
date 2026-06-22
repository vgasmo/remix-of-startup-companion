import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Trash2, UserPlus, Ban, CheckCircle, ChevronDown, User, ExternalLink } from 'lucide-react';
import { notify } from "@/lib/notify";
import { StageBadge } from '@/components/ui/StageBadge';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { StartupStage, HealthScore } from '@/types/database';

const STAGES: StartupStage[] = ['ideation', 'validation', 'mvp', 'growth', 'scale'];

export function AdminWorkspacesManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmDialog();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [workspaceToBlock, setWorkspaceToBlock] = useState<{ id: string; name: string } | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [selectedStartup, setSelectedStartup] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedStage, setSelectedStage] = useState<StartupStage>('ideation');
  const [selectedFounder, setSelectedFounder] = useState('');
  const [founderSearch, setFounderSearch] = useState('');
  const [consultorSearch, setConsultorSearch] = useState('');
  const [openConsultorPopover, setOpenConsultorPopover] = useState<string | null>(null);

  // Fetch workspaces with consultant info
  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['admin-workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select(`
          *,
          startup:startups(id, name, logo_url),
          program:programs(id, name)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch workspace users to get consultants
  const { data: workspaceUsers } = useQuery({
    queryKey: ['admin-workspace-users'],
    queryFn: async () => {
      // Get workspace users
      const { data: wsUsers, error } = await supabase
        .from('workspace_users')
        .select('workspace_id, user_id, role, active')
        .in('role', ['consultor', 'founder'])
        .eq('active', true);
      if (error) throw error;

      // Get profiles for these users
      const userIds = [...new Set(wsUsers?.map(wu => wu.user_id) || [])];
      const { data: userProfiles } = await supabase
        .from('profiles_safe')
        .select('id, email, full_name, avatar_url')
        .in('id', userIds);

      // Combine data
      return wsUsers?.map(wu => ({
        ...wu,
        profile: userProfiles?.find(p => p.id === wu.user_id) || null,
      }));
    },
  });

  const { data: startups } = useQuery({
    queryKey: ['admin-startups-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('startups').select('id, name').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: programs } = useQuery({
    queryKey: ['programs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('programs').select('id, name').eq('is_active', true).order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ['admin-profiles-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles_safe').select('id, email, full_name, avatar_url').order('email');
      if (error) throw error;
      return data;
    },
  });

  // Get consultors only (users with consultor role)
  const { data: consultors } = useQuery({
    queryKey: ['admin-consultors-list'],
    queryFn: async () => {
      // Get consultor user IDs
      const { data: roleData, error } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'consultor');
      if (error) throw error;

      const userIds = roleData?.map(r => r.user_id) || [];
      if (userIds.length === 0) return [];

      // Get profiles for these users (sorted alphabetically by name)
      const { data: consultorProfiles } = await supabase
        .from('profiles_safe')
        .select('id, email, full_name, avatar_url')
        .in('id', userIds)
        .order('full_name', { ascending: true, nullsFirst: false });

      return consultorProfiles || [];
    },
  });

  // Helper to get consultant for a workspace
  const getWorkspaceConsultor = (workspaceId: string) => {
    const wsUser = workspaceUsers?.find(wu => wu.workspace_id === workspaceId && wu.role === 'consultor');
    return wsUser?.profile as { id: string; email: string; full_name: string | null; avatar_url: string | null } | null | undefined;
  };

  const filteredProfiles = profiles?.filter(p => 
    !founderSearch || 
    p.email.toLowerCase().includes(founderSearch.toLowerCase()) ||
    p.full_name?.toLowerCase().includes(founderSearch.toLowerCase())
  );

  const filteredConsultors = consultors?.filter(c =>
    !consultorSearch ||
    c.email.toLowerCase().includes(consultorSearch.toLowerCase()) ||
    c.full_name?.toLowerCase().includes(consultorSearch.toLowerCase())
  );

  const createMutation = useMutation({
    mutationFn: async (data: { startup_id: string; program_id: string; stage: StartupStage; founder_id?: string }) => {
      const { data: workspace, error: wsError } = await supabase
        .from('workspaces')
        .insert({ startup_id: data.startup_id, program_id: data.program_id, stage: data.stage })
        .select('id')
        .single();
      if (wsError) throw wsError;

      if (data.founder_id && workspace) {
        const { error: userError } = await supabase
          .from('workspace_users')
          .insert({ workspace_id: workspace.id, user_id: data.founder_id, role: 'founder', active: true });
        if (userError) throw userError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-workspaces'] });
      notify.success(t('admin.workspaceCreated', 'Workspace criado'));
      resetForm();
    },
    onError: (error) => notify.error(`${t('common.error', 'Erro')}: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workspaces').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-workspaces'] });
      notify.success(t('admin.workspacesManager.deleted'));
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  const blockMutation = useMutation({
    mutationFn: async ({ workspaceId, reason }: { workspaceId: string; reason?: string }) => {
      const { error } = await supabase.rpc('block_workspace', {
        _workspace_id: workspaceId,
        _reason: reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-workspaces'] });
      notify.success(t('admin.workspacesManager.blocked'));
      setBlockDialogOpen(false);
      setWorkspaceToBlock(null);
      setBlockReason('');
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  const unblockMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const { error } = await supabase.rpc('unblock_workspace', {
        _workspace_id: workspaceId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-workspaces'] });
      notify.success(t('admin.workspacesManager.unblocked'));
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  // Change stage mutation
  const changeStageMutation = useMutation({
    mutationFn: async ({ workspaceId, stage }: { workspaceId: string; stage: StartupStage }) => {
      const { error } = await supabase
        .from('workspaces')
        .update({ stage })
        .eq('id', workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-workspaces'] });
      notify.success(t('admin.workspacesManager.stageChanged', 'Stage updated'));
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  // Assign consultor mutation
  const assignConsultorMutation = useMutation({
    mutationFn: async ({ workspaceId, consultorId }: { workspaceId: string; consultorId: string }) => {
      // First, remove any existing consultor
      await supabase
        .from('workspace_users')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('role', 'consultor');

      // Then add new one
      const { error } = await supabase
        .from('workspace_users')
        .insert({ workspace_id: workspaceId, user_id: consultorId, role: 'consultor', active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-workspace-users'] });
      notify.success(t('admin.workspacesManager.consultorAssigned', 'Consultant assigned'));
      setConsultorSearch('');
      setOpenConsultorPopover(null);
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  // Remove consultor mutation
  const removeConsultorMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const { error } = await supabase
        .from('workspace_users')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('role', 'consultor');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-workspace-users'] });
      notify.success(t('admin.workspacesManager.consultorRemoved', 'Consultant removed'));
      setOpenConsultorPopover(null);
    },
    onError: (error) => notify.error(`${t('common.error')}: ${error.message}`),
  });

  const resetForm = () => {
    setSelectedStartup('');
    setSelectedProgram('');
    setSelectedStage('ideation');
    setSelectedFounder('');
    setFounderSearch('');
    setIsDialogOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStartup || !selectedProgram) {
      notify.error(t('admin.selectStartupProgram', 'Selecione uma startup e um programa'));
      return;
    }
    createMutation.mutate({
      startup_id: selectedStartup,
      program_id: selectedProgram,
      stage: selectedStage,
      founder_id: selectedFounder || undefined,
    });
  };

  const selectedFounderProfile = profiles?.find(p => p.id === selectedFounder);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('admin.workspacesManager.title', 'Workspaces')}</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />{t('admin.workspacesManager.create', 'Criar Workspace')}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('admin.workspacesManager.create', 'Criar Workspace')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>{t('common.startup', 'Startup')} *</Label>
                <Select value={selectedStartup} onValueChange={setSelectedStartup}>
                  <SelectTrigger><SelectValue placeholder={t('admin.workspacesManager.selectStartup', 'Selecionar startup')} /></SelectTrigger>
                  <SelectContent>
                    {startups?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('common.program', 'Programa')} *</Label>
                <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                  <SelectTrigger><SelectValue placeholder={t('admin.workspacesManager.selectProgram', 'Selecionar programa')} /></SelectTrigger>
                  <SelectContent>
                    {programs?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('common.stage', 'Fase')}</Label>
                <Select value={selectedStage} onValueChange={(v) => setSelectedStage(v as StartupStage)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Founder Assignment */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  {t('admin.workspacesManager.assignFounder', 'Associar Founder (opcional)')}
                </Label>
                {selectedFounder ? (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-muted">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={selectedFounderProfile?.avatar_url || undefined} />
                      <AvatarFallback>{selectedFounderProfile?.email?.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedFounderProfile?.full_name || selectedFounderProfile?.email}</p>
                      {selectedFounderProfile?.full_name && (
                        <p className="text-xs text-muted-foreground truncate">{selectedFounderProfile?.email}</p>
                      )}
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedFounder('')}>
                      {t('common.remove', 'Remover')}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input 
                      placeholder={t('admin.workspacesManager.searchByEmailOrName', 'Pesquisar por email ou nome...')} 
                      value={founderSearch}
                      onChange={(e) => setFounderSearch(e.target.value)}
                    />
                    {founderSearch && (
                      <div className="max-h-32 overflow-y-auto border rounded-md">
                        {filteredProfiles?.slice(0, 5).map(profile => (
                          <button
                            key={profile.id}
                            type="button"
                            className="w-full flex items-center gap-2 p-2 hover:bg-muted text-left"
                            onClick={() => { setSelectedFounder(profile.id); setFounderSearch(''); }}
                          >
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={profile.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">{profile.email.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm truncate">{profile.full_name || profile.email}</p>
                              {profile.full_name && <p className="text-xs text-muted-foreground truncate">{profile.email}</p>}
                            </div>
                          </button>
                        ))}
                        {filteredProfiles?.length === 0 && (
                          <p className="p-2 text-sm text-muted-foreground">{t('common.noResults', 'Nenhum resultado encontrado')}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? t('common.creating', 'A criar...') : t('admin.workspacesManager.create', 'Criar Workspace')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.workspacesManager.startup')}</TableHead>
                  <TableHead>{t('admin.workspacesManager.program')}</TableHead>
                  <TableHead>{t('admin.workspacesManager.stage')}</TableHead>
                  <TableHead>{t('admin.workspacesManager.health')}</TableHead>
                  <TableHead>{t('admin.workspacesManager.consultant', 'Consultant')}</TableHead>
                  <TableHead>{t('admin.workspacesManager.status')}</TableHead>
                  <TableHead className="w-40">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspaces?.map((ws) => {
                  const isBlocked = !!(ws as any).blocked_at;
                  const startupName = (ws.startup as { name: string } | null)?.name || '-';
                  const consultor = getWorkspaceConsultor(ws.id);
                  
                  return (
                    <TableRow key={ws.id} className={isBlocked ? 'opacity-60' : ''}>
                      <TableCell className="font-medium">
                        <Link to={`/workspace/${ws.id}`} className="flex items-center gap-2 hover:underline">
                          <Avatar className="h-6 w-6 rounded">
                            <AvatarImage src={(ws.startup as { logo_url: string | null } | null)?.logo_url || undefined} />
                            <AvatarFallback className="rounded text-xs">
                              {startupName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {startupName}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </Link>
                      </TableCell>
                      <TableCell>{(ws.program as { name: string } | null)?.name || '-'}</TableCell>
                      
                      {/* Inline Stage Selector */}
                      <TableCell>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-1 hover:opacity-80">
                              <StageBadge stage={ws.stage} />
                              <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-40 p-1" align="start">
                            <div className="space-y-1">
                              {STAGES.map((stage) => (
                                <button
                                  key={stage}
                                  onClick={() => changeStageMutation.mutate({ workspaceId: ws.id, stage })}
                                  className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted capitalize ${
                                    ws.stage === stage ? 'bg-muted font-medium' : ''
                                  }`}
                                  disabled={changeStageMutation.isPending}
                                >
                                  {stage}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      
                      <TableCell><HealthBadge score={(ws.health_score_override || ws.health_score) as HealthScore | null} /></TableCell>
                      
                      {/* Consultor Column with Inline Assignment */}
                      <TableCell>
                        <Popover open={openConsultorPopover === ws.id} onOpenChange={(open) => setOpenConsultorPopover(open ? ws.id : null)}>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-2 hover:bg-muted px-2 py-1 rounded-md transition-colors">
                              {consultor ? (
                                <>
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={consultor.avatar_url || undefined} />
                                    <AvatarFallback className="text-xs">
                                      {(consultor.full_name || consultor.email).slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm truncate max-w-24">
                                    {consultor.full_name || consultor.email.split('@')[0]}
                                  </span>
                                  <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                </>
                              ) : (
                                <>
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm text-muted-foreground">{t('admin.workspacesManager.assignConsultant', 'Assign')}</span>
                                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                </>
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-2" align="start">
                            <div className="space-y-2">
                              <Input
                                placeholder={t('admin.workspacesManager.searchConsultant', 'Search consultant...')}
                                value={consultorSearch}
                                onChange={(e) => setConsultorSearch(e.target.value)}
                                className="h-8"
                              />
                              <div className="max-h-40 overflow-y-auto space-y-1">
                                {filteredConsultors?.map((c) => (
                                  <button
                                    key={c.id}
                                    onClick={() => assignConsultorMutation.mutate({ workspaceId: ws.id, consultorId: c.id })}
                                    className={`w-full flex items-center gap-2 p-2 rounded hover:bg-muted text-left ${
                                      consultor?.id === c.id ? 'bg-muted' : ''
                                    }`}
                                    disabled={assignConsultorMutation.isPending}
                                  >
                                    <Avatar className="h-6 w-6">
                                      <AvatarImage src={c.avatar_url || undefined} />
                                      <AvatarFallback className="text-xs">{c.email.slice(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm truncate">{c.full_name || c.email}</p>
                                      {c.full_name && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
                                    </div>
                                    {consultor?.id === c.id && (
                                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                                    )}
                                  </button>
                                ))}
                                {filteredConsultors?.length === 0 && (
                                  <p className="text-sm text-muted-foreground p-2">{t('common.noResults', 'No results')}</p>
                                )}
                              </div>
                              {consultor && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full text-destructive hover:text-destructive"
                                  onClick={() => removeConsultorMutation.mutate(ws.id)}
                                  disabled={removeConsultorMutation.isPending}
                                >
                                  {t('admin.workspacesManager.removeConsultant', 'Remove Consultant')}
                                </Button>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      
                      <TableCell>
                        {isBlocked ? (
                          <Badge variant="destructive" className="gap-1">
                            <Ban className="h-3 w-3" />
                            {t('admin.workspacesManager.blockedStatus')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[hsl(var(--success))] border-[hsl(var(--success))]/30 gap-1">
                            <CheckCircle className="h-3 w-3" />
                            {t('admin.workspacesManager.activeStatus')}
                          </Badge>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex gap-1">
                          {isBlocked ? (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => unblockMutation.mutate(ws.id)}
                              disabled={unblockMutation.isPending}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              {t('admin.workspacesManager.unblock')}
                            </Button>
                          ) : (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setWorkspaceToBlock({ id: ws.id, name: startupName });
                                setBlockDialogOpen(true);
                              }}
                            >
                              <Ban className="h-4 w-4 mr-1" />
                              {t('admin.workspacesManager.block')}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => confirm({
                              title: t('admin.workspacesManager.deleteTitle'),
                              description: t('admin.workspacesManager.deleteConfirm', { name: startupName }),
                              variant: 'destructive',
                              confirmLabel: t('common.delete'),
                              onConfirm: () => deleteMutation.mutate(ws.id),
                            })}
                            aria-label={t('common.delete')}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {workspaces?.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">{t('admin.workspacesManager.noWorkspaces')}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Block Workspace Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.workspacesManager.blockTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.workspacesManager.blockDescription', { name: workspaceToBlock?.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('admin.workspacesManager.blockReason')}</Label>
              <Textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder={t('admin.workspacesManager.blockReasonPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => workspaceToBlock && blockMutation.mutate({ workspaceId: workspaceToBlock.id, reason: blockReason })}
              disabled={blockMutation.isPending}
            >
              <Ban className="h-4 w-4 mr-2" />
              {blockMutation.isPending ? t('common.loading') : t('admin.workspacesManager.confirmBlock')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog {...dialogProps} />
    </Card>
  );
}
