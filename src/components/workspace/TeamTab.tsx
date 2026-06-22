import { useState } from 'react';
import { useTeamMembers, useCreateTeamMember, useUpdateTeamMember, useDeleteTeamMember, TeamMember } from '@/hooks/useTeamMembers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { notify } from "@/lib/notify";
import { Users, Plus, Pencil, Trash2, Crown, Linkedin, Mail, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';

interface TeamTabProps {
  startupId: string;
  canEdit?: boolean;
}

const ROLES = ['founder', 'co-founder', 'cto', 'coo', 'cfo', 'developer', 'designer', 'marketing', 'sales', 'operations', 'advisor', 'team_member'];

export function TeamTab({ startupId, canEdit = false }: TeamTabProps) {
  const { t } = useTranslation();
  const { data: members, isLoading } = useTeamMembers(startupId);
  const createMember = useCreateTeamMember();
  const updateMember = useUpdateTeamMember();
  const deleteMember = useDeleteTeamMember();
  const { confirm, dialogProps } = useConfirmDialog();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    role: 'team_member',
    title: '',
    linkedin_url: '',
    phone: '',
    is_founder: false,
  });

  const resetForm = () => {
    setFormData({ full_name: '', email: '', role: 'team_member', title: '', linkedin_url: '', phone: '', is_founder: false });
    setEditingMember(null);
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (member: TeamMember) => {
    setEditingMember(member);
    setFormData({
      full_name: member.full_name,
      email: member.email || '',
      role: member.role,
      title: member.title || '',
      linkedin_url: member.linkedin_url || '',
      phone: member.phone || '',
      is_founder: member.is_founder,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.full_name.trim()) {
      notify.error(t('team.nameRequired'));
      return;
    }

    try {
      if (editingMember) {
        await updateMember.mutateAsync({ id: editingMember.id, ...formData });
        notify.success(t('team.memberUpdated'));
      } else {
        await createMember.mutateAsync({
          startup_id: startupId,
          user_id: null,
          ...formData,
          joined_at: new Date().toISOString().split('T')[0],
          left_at: null,
        });
        notify.success(t('team.memberAdded'));
      }
      setDialogOpen(false);
      resetForm();
    } catch (error: any) {
      notify.error(error.message || t('team.failedToSave'));
    }
  };

  const handleDelete = (id: string, memberName: string) => {
    confirm({
      title: t('team.removeMemberTitle', 'Remover membro?'),
      description: t('team.removeMemberConfirm', { name: memberName }),
      confirmLabel: t('common.delete'),
      onConfirm: async () => {
        try {
          await deleteMember.mutateAsync(id);
          notify.success(t('team.memberRemoved'));
        } catch (error: any) {
          notify.error(error.message || t('team.failedToRemove'));
        }
      },
    });
  };

  const getInitials = (name: string) => 
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('team.teamMembers')}
            </CardTitle>
            <CardDescription>
              {t('team.memberCount', { count: members?.length || 0 })}
              {' · '}
              <span className="text-xs">
                {t('team.inviteHint', 'Para dar acesso à plataforma a cofounders, use o botão "Convidar Founder" na página da startup.')}
              </span>
            </CardDescription>
          </div>
          {canEdit && (
            <Button onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              {t('team.addMember')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!members?.length ? (
            <EmptyState
              icon={Users}
              title={t('team.noMembersTitle', { defaultValue: 'Sem membros de equipa ainda' })}
              description={t('team.noMembersDesc')}
              action={canEdit ? { label: t('team.addMember'), icon: Plus, onClick: openAddDialog } : undefined}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {members.map(member => (
                <div key={member.id} className="flex items-start gap-4 p-4 rounded-lg border bg-card">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getInitials(member.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium truncate">{member.full_name}</h4>
                      {member.is_founder && (
                        <Crown className="h-4 w-4 text-[hsl(var(--warning))]" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{member.title || member.role}</p>
                    <Badge variant="secondary" className="mt-1 text-xs capitalize">
                      {member.role.replace('_', ' ')}
                    </Badge>
                    <div className="flex gap-2 mt-2">
                      {member.email && (
                        <a href={`mailto:${member.email}`} className="text-muted-foreground hover:text-primary">
                          <Mail className="h-4 w-4" />
                        </a>
                      )}
                      {member.phone && (
                        <a href={`tel:${member.phone}`} className="text-muted-foreground hover:text-primary">
                          <Phone className="h-4 w-4" />
                        </a>
                      )}
                      {member.linkedin_url && (
                        <a href={member.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                          <Linkedin className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={()=> openEditDialog(member)} aria-label={t('common.edit', { defaultValue: 'Editar' })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={()=> handleDelete(member.id, member.full_name)} className="text-destructive" aria-label={t('common.delete', { defaultValue: 'Eliminar' })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMember ? t('team.editMember') : t('team.addMember')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">{t('team.fullName')} *</Label>
                <Input
                  id="name"
                  value={formData.full_name}
                  onChange={e => setFormData(f => ({ ...f, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('team.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role">{t('team.role')}</Label>
                <Select value={formData.role} onValueChange={v => setFormData(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => (
                      <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">{t('team.jobTitle')}</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={e => setFormData(f => ({ ...f, title: e.target.value }))}
                  placeholder={t('team.jobTitlePlaceholder')}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">{t('team.phone')}</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkedin">{t('team.linkedinUrl')}</Label>
                <Input
                  id="linkedin"
                  value={formData.linkedin_url}
                  onChange={e => setFormData(f => ({ ...f, linkedin_url: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSubmit} disabled={createMember.isPending || updateMember.isPending}>
              {editingMember ? t('team.saveChanges') : t('team.addMember')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <ConfirmDialog {...dialogProps} />
    </>
  );
}
