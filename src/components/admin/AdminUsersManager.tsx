import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { WorkspaceAssignmentDialog } from './WorkspaceAssignmentDialog';
import { Plus, Trash2, UserCheck, Building2, Ban, UserX, RotateCcw, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from "@/lib/notify";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  useProfiles, 
  useUserRoles, 
  useAddUserRole, 
  useRemoveUserRole,
  useWorkspaceUsers,
  useAddWorkspaceUser,
  useUpdateWorkspaceUser,
  useRemoveWorkspaceUser,
  useAllWorkspaces,
} from '@/hooks/useAdminData';

const ROLES = ['admin', 'consultor', 'mentor_externo', 'founder', 'team_member'] as const;
type Role = typeof ROLES[number];

export function AdminUsersManager() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const { data: profiles, isLoading: loadingProfiles } = useProfiles();
  const { data: userRoles, isLoading: loadingRoles } = useUserRoles();
  const { data: workspaceUsers, isLoading: loadingWsUsers } = useWorkspaceUsers();
  const { data: workspaces } = useAllWorkspaces();

  const addUserRole = useAddUserRole();
  const removeUserRole = useRemoveUserRole();
  const addWorkspaceUser = useAddWorkspaceUser();
  const updateWorkspaceUser = useUpdateWorkspaceUser();
  const removeWorkspaceUser = useRemoveWorkspaceUser();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role | 'none'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'suspended'>('all');
  const [addRoleDialog, setAddRoleDialog] = useState<{ userId: string; userName: string } | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role>('consultor');
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<{ id: string; role: string } | null>(null);

  const [assignWsDialog, setAssignWsDialog] = useState<{ userId: string; userName: string; email: string; isFounder: boolean } | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('');
  const [wsRole, setWsRole] = useState<Role>('founder');
  const [deleteWsUserTarget, setDeleteWsUserTarget] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<{ userId: string; userName: string; currentStatus: string } | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<{ userId: string; userName: string } | null>(null);
  const queryClient = useQueryClient();

  const isLoading = loadingProfiles || loadingRoles || loadingWsUsers;

  const filteredProfiles = useMemo(() => {
    const profileList = profiles?.data || [];
    if (!profileList.length) return [];
    const term = searchTerm.trim().toLowerCase();
    return profileList.filter(p => {
      if (term && !(p.full_name?.toLowerCase().includes(term) || p.email.toLowerCase().includes(term))) {
        return false;
      }
      if (roleFilter !== 'all') {
        const rs = userRoles?.filter(r => r.user_id === p.id) || [];
        if (roleFilter === 'none') {
          if (rs.length > 0) return false;
        } else if (!rs.some(r => r.role === roleFilter)) {
          return false;
        }
      }
      if (statusFilter !== 'all') {
        const status = (p as any).account_status || 'approved';
        if (status !== statusFilter) return false;
      }
      return true;
    });
  }, [profiles, searchTerm, roleFilter, statusFilter, userRoles]);

  // P4: paginate the user list — the admin org has hundreds of profiles and
  // rendering them all at once tanks React reconciliation on this route.
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredProfiles.length / PAGE_SIZE));
  // Reset to first page whenever the filtered set changes (e.g. new search term).
  useMemo(() => { setPage(1); }, [searchTerm, filteredProfiles.length]);
  const pagedProfiles = useMemo(
    () => filteredProfiles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredProfiles, page]
  );

  const getUserRoles = (userId: string) => userRoles?.filter(r => r.user_id === userId) || [];
  const getUserWorkspaces = (userId: string) => workspaceUsers?.filter(wu => wu.user_id === userId) || [];

  const getWorkspaceName = (wsId: string) => {
    const ws = workspaces?.find(w => w.id === wsId);
    return ws?.startup?.name || t('admin.userManagement.noName');
  };

  const getRoleLabel = (role: string) => t(`roles.${role}`) || role;

  const handleAddRole = async () => {
    if (!addRoleDialog) return;
    await addUserRole.mutateAsync({ user_id: addRoleDialog.userId, role: selectedRole });
    setAddRoleDialog(null);
  };

  const handleRemoveRole = async () => {
    if (!deleteRoleTarget) return;
    await removeUserRole.mutateAsync(deleteRoleTarget.id);
    setDeleteRoleTarget(null);
  };

  const handleAssignWorkspace = async () => {
    if (!assignWsDialog || !selectedWorkspace) return;
    await addWorkspaceUser.mutateAsync({ 
      workspace_id: selectedWorkspace, 
      user_id: assignWsDialog.userId, 
      role: wsRole,
    });
    setAssignWsDialog(null);
    setSelectedWorkspace('');
  };

  const handleToggleWsActive = async (id: string, currentActive: boolean) => {
    await updateWorkspaceUser.mutateAsync({ id, active: !currentActive });
  };

  const handleRemoveWsUser = async () => {
    if (!deleteWsUserTarget) return;
    await removeWorkspaceUser.mutateAsync(deleteWsUserTarget);
    setDeleteWsUserTarget(null);
  };

  const handleSuspendUser = async () => {
    if (!suspendTarget) return;
    const newStatus = suspendTarget.currentStatus === 'suspended' ? 'approved' : 'suspended';

    // P0 guard: prevent self-suspension and suspending another admin.
    if (newStatus === 'suspended') {
      if (suspendTarget.userId === currentUser?.id) {
        notify.error(t('admin.userManagement.cannotSuspendSelf', { defaultValue: 'Não podes suspender a tua própria conta' }));
        setSuspendTarget(null);
        return;
      }
      const { data: targetRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', suspendTarget.userId)
        .eq('role', 'admin')
        .limit(1);
      if (targetRoles && targetRoles.length > 0) {
        notify.error(t('admin.userManagement.cannotSuspendAdmin', { defaultValue: 'Não é permitido suspender outra conta admin' }));
        setSuspendTarget(null);
        return;
      }
    }

    // P0 fix: verify the row actually changed (RLS may silently drop the update).
    const { data: rows, error } = await supabase
      .from('profiles')
      .update({ account_status: newStatus })
      .eq('id', suspendTarget.userId)
      .select('id');
    if (error || !rows || rows.length === 0) {
      notify.error(t('admin.userManagement.suspendError', { defaultValue: 'Erro ao alterar estado da conta' }));
    } else {
      notify.success(newStatus === 'suspended' 
        ? t('admin.userManagement.suspended', { defaultValue: 'Conta suspensa' })
        : t('admin.userManagement.reactivated', { defaultValue: 'Conta reativada' })
      );
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
    }
    setSuspendTarget(null);
  };

  const handleApproveUser = async (userId: string) => {
    // P0 fix: use the SECURITY DEFINER RPC so the update is not silently
    // dropped by RLS.
    const { data, error } = await supabase.rpc('approve_user_account', {
      p_user_id: userId,
    });
    if (error || data === false) {
      notify.error(t('admin.approveError', 'Erro ao aprovar conta'));
    } else {
      notify.success(t('admin.approveSuccess', 'Conta aprovada com sucesso'));
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('admin.userManagement.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('admin.userManagement.description')}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder={t('admin.userManagement.searchPlaceholder')}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder={t('admin.userManagement.filterByRole', { defaultValue: 'Filtrar por tipo' })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.userManagement.allRoles', { defaultValue: 'Todos os tipos' })}</SelectItem>
            {ROLES.map(r => (
              <SelectItem key={r} value={r}>{getRoleLabel(r)}</SelectItem>
            ))}
            <SelectItem value="none">{t('admin.userManagement.noRoleAssigned', { defaultValue: 'Sem função' })}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('admin.userManagement.filterByStatus', { defaultValue: 'Filtrar por estado' })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.userManagement.allStatuses', { defaultValue: 'Todos os estados' })}</SelectItem>
            <SelectItem value="pending">{t('admin.userManagement.statusPending', { defaultValue: 'Pendente' })}</SelectItem>
            <SelectItem value="approved">{t('admin.userManagement.statusApproved', { defaultValue: 'Ativo' })}</SelectItem>
            <SelectItem value="suspended">{t('admin.userManagement.statusSuspended', { defaultValue: 'Suspenso' })}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">

        {filteredProfiles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {t('admin.userManagement.noUsers')}
            </CardContent>
          </Card>
        ) : (
          pagedProfiles.map(profile => {
            const roles = getUserRoles(profile.id);
            const wsAssignments = getUserWorkspaces(profile.id);
            const isAdmin = roles.some(r => r.role === 'admin');
            const isSuspended = profile.account_status === 'suspended';
            const isPending = profile.account_status === 'pending';

            return (
              <Card key={profile.id} className={isSuspended ? 'opacity-60' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={profile.avatar_url || undefined} />
                      <AvatarFallback>{profile.full_name?.charAt(0) || profile.email.charAt(0)}</AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link to={`/profile/${profile.id}`} className="font-medium text-primary hover:underline focus:outline-none focus-visible:underline">
                          {profile.full_name || t('admin.userManagement.noName')}
                        </Link>
                        {isAdmin && <Badge variant="destructive">{t('roles.admin')}</Badge>}
                        {isSuspended && <Badge variant="outline" className="border-destructive text-destructive">{t('admin.userManagement.statusSuspended', { defaultValue: 'Suspensa' })}</Badge>}
                        {isPending && <Badge variant="outline" className="border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]">{t('admin.userManagement.statusPending', { defaultValue: 'Pendente' })}</Badge>}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">{profile.email}</p>
                        <div className="flex items-center gap-1">
                          {isPending && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[hsl(var(--success))] hover:text-[hsl(var(--success))]"
                              onClick={() => handleApproveUser(profile.id)}
                            >
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />
                              {t('admin.approve', 'Aprovar')}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className={isSuspended ? 'text-primary hover:text-primary' : 'text-destructive hover:text-destructive'}
                            onClick={() => setSuspendTarget({ 
                              userId: profile.id, 
                              userName: profile.full_name || profile.email,
                              currentStatus: profile.account_status || 'approved'
                            })}
                          >
                            {isSuspended ? (
                              <><RotateCcw className="h-3.5 w-3.5 mr-1" />{t('admin.userManagement.reactivate', { defaultValue: 'Reativar' })}</>
                            ) : (
                              <><Ban className="h-3.5 w-3.5 mr-1" />{t('admin.userManagement.suspend', { defaultValue: 'Suspender' })}</>
                            )}
                          </Button>
                          {profile.id !== currentUser?.id && !isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteUserTarget({ userId: profile.id, userName: profile.full_name || profile.email })}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />{t('admin.userManagement.deleteUser', { defaultValue: 'Apagar' })}
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Global Roles */}
                      <div className="mt-3">
                        <div className="flex items-center gap-2 mb-2">
                          <UserCheck className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">{t('admin.userManagement.globalRoles')}</span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-xs"
                            onClick={() => setAddRoleDialog({ userId: profile.id, userName: profile.full_name || profile.email })}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            {t('admin.userManagement.addRole')}
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {roles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">{t('admin.userManagement.noRoles')}</span>
                          ) : (
                            roles.map(r => (
                              <Badge 
                                key={r.id} 
                                variant="secondary" 
                                className="cursor-pointer hover:bg-destructive/20"
                                onClick={() => setDeleteRoleTarget({ id: r.id, role: r.role })}
                              >
                                {getRoleLabel(r.role)}
                                <Trash2 className="h-3 w-3 ml-1" />
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Workspace Assignments */}
                      <div className="mt-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">{t('admin.userManagement.workspaceAssignments')}</span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-xs"
                            onClick={() => setAssignWsDialog({ userId: profile.id, userName: profile.full_name || profile.email, email: profile.email, isFounder: roles.some(r => r.role === 'founder') })}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            {t('admin.userManagement.assign')}
                          </Button>
                        </div>
                        <div className="space-y-1">
                          {wsAssignments.length === 0 ? (
                            <span className="text-xs text-muted-foreground">{t('admin.userManagement.notAssigned')}</span>
                          ) : (
                            wsAssignments.map(wu => (
                              <div key={wu.id} className="flex items-center gap-2 text-xs bg-muted/50 rounded p-2">
                                <span className="flex-1">{getWorkspaceName(wu.workspace_id)}</span>
                                <Badge variant="outline" className="text-xs">
                                  {getRoleLabel(wu.role)}
                                </Badge>
                                <div className="flex items-center gap-1">
                                  <Switch 
                                    checked={wu.active} 
                                    onCheckedChange={() => handleToggleWsActive(wu.id, wu.active)}
                                  />
                                  <span className="text-muted-foreground">{wu.active ? t('admin.userManagement.active') : t('admin.userManagement.inactive')}</span>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6"
                                  onClick={() => setDeleteWsUserTarget(wu.id)}
                                 aria-label={t('common.delete')}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {filteredProfiles.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-xs text-muted-foreground">
            {t('admin.userManagement.pageStatus', {
              defaultValue: '{{from}}–{{to}} de {{total}}',
              from: (page - 1) * PAGE_SIZE + 1,
              to: Math.min(page * PAGE_SIZE, filteredProfiles.length),
              total: filteredProfiles.length,
            })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              {t('common.previous', { defaultValue: 'Anterior' })}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('common.pageOf', { defaultValue: '{{page}} / {{total}}', page, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              {t('common.next', { defaultValue: 'Seguinte' })}
            </Button>
          </div>
        </div>
      )}



      {/* Add Role Dialog */}
      <Dialog open={!!addRoleDialog} onOpenChange={(open) => !open && setAddRoleDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.userManagement.addRoleTitle', { name: addRoleDialog?.userName })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('admin.userManagement.role')}</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(role => (
                    <SelectItem key={role} value={role}>{getRoleLabel(role)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRoleDialog(null)}>{t('common.cancel')}</Button>
            <Button onClick={handleAddRole}>{t('admin.userManagement.addRole')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Workspace Dialog — enhanced for founders, simple for others */}
      {assignWsDialog && assignWsDialog.isFounder ? (
        <WorkspaceAssignmentDialog
          open={!!assignWsDialog}
          onOpenChange={(open) => { if (!open) setAssignWsDialog(null); }}
          user={{
            id: assignWsDialog.userId,
            email: assignWsDialog.email,
            full_name: assignWsDialog.userName,
          }}
        />
      ) : (
        <Dialog open={!!assignWsDialog && !assignWsDialog?.isFounder} onOpenChange={(open) => !open && setAssignWsDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.userManagement.assignTitle', { name: assignWsDialog?.userName })}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t('admin.userManagement.workspace')}</Label>
                <Select value={selectedWorkspace} onValueChange={setSelectedWorkspace}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.userManagement.selectWorkspace')} />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces
                      ?.filter(ws => {
                        const userAssignments = getUserWorkspaces(assignWsDialog?.userId || '');
                        return !userAssignments.some(ua => ua.workspace_id === ws.id);
                      })
                      .map(ws => (
                        <SelectItem key={ws.id} value={ws.id}>
                          {ws.startup?.name || t('admin.userManagement.noName')} ({ws.program?.name || t('admin.userManagement.noProgram')})
                        </SelectItem>
                      ))}
                    {workspaces?.filter(ws => {
                      const userAssignments = getUserWorkspaces(assignWsDialog?.userId || '');
                      return !userAssignments.some(ua => ua.workspace_id === ws.id);
                    }).length === 0 && (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        {t('admin.userManagement.alreadyAssignedAll')}
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('admin.userManagement.role')}</Label>
                <Select value={wsRole} onValueChange={(v) => setWsRole(v as Role)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.filter(r => r !== 'admin').map(role => (
                      <SelectItem key={role} value={role}>{getRoleLabel(role)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignWsDialog(null)}>{t('common.cancel')}</Button>
              <Button onClick={handleAssignWorkspace} disabled={!selectedWorkspace}>{t('admin.userManagement.assign')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Role Confirmation */}
      <AlertDialog open={!!deleteRoleTarget} onOpenChange={(open) => !open && setDeleteRoleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.userManagement.removeRole')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.userManagement.removeRoleConfirm', { role: deleteRoleTarget?.role })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveRole} className="bg-destructive text-destructive-foreground">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Workspace User Confirmation */}
      <AlertDialog open={!!deleteWsUserTarget} onOpenChange={(open) => !open && setDeleteWsUserTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.userManagement.removeAssignment')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.userManagement.removeAssignmentConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveWsUser} className="bg-destructive text-destructive-foreground">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Suspend/Reactivate User Confirmation */}
      <AlertDialog open={!!suspendTarget} onOpenChange={(open) => !open && setSuspendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendTarget?.currentStatus === 'suspended' 
                ? t('admin.userManagement.reactivateTitle', { defaultValue: 'Reativar Conta' })
                : t('admin.userManagement.suspendTitle', { defaultValue: 'Suspender Conta' })
              }
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendTarget?.currentStatus === 'suspended'
                ? t('admin.userManagement.reactivateConfirm', { name: suspendTarget?.userName, defaultValue: `Tem a certeza que quer reativar a conta de ${suspendTarget?.userName}? O utilizador voltará a ter acesso à plataforma.` })
                : t('admin.userManagement.suspendConfirm', { name: suspendTarget?.userName, defaultValue: `Tem a certeza que quer suspender a conta de ${suspendTarget?.userName}? O utilizador perderá acesso à plataforma.` })
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleSuspendUser} 
              className={suspendTarget?.currentStatus === 'suspended' ? '' : 'bg-destructive text-destructive-foreground'}
            >
              {suspendTarget?.currentStatus === 'suspended' 
                ? t('admin.userManagement.reactivate', { defaultValue: 'Reativar' })
                : t('admin.userManagement.suspend', { defaultValue: 'Suspender' })
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={!!deleteUserTarget} onOpenChange={(open) => !open && setDeleteUserTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.userManagement.deleteUserTitle', { defaultValue: 'Apagar Utilizador' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.userManagement.deleteUserConfirm', { 
                name: deleteUserTarget?.userName, 
                defaultValue: `Tem a certeza que quer apagar permanentemente o utilizador ${deleteUserTarget?.userName}? Esta ação não pode ser revertida. Todos os dados associados (funções, workspaces) serão removidos.` 
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground"
              onClick={async () => {
                if (!deleteUserTarget) return;
                const { error } = await supabase.rpc('staff_delete_user', { target_user_id: deleteUserTarget.userId });
                if (error) {
                  notify.error(t('admin.userManagement.deleteError', { defaultValue: 'Erro ao apagar utilizador' }));
                } else {
                  notify.success(t('admin.userManagement.deleteSuccess', { defaultValue: 'Utilizador apagado com sucesso' }));
                  queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
                }
                setDeleteUserTarget(null);
              }}
            >
              {t('admin.userManagement.deleteUser', { defaultValue: 'Apagar' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
