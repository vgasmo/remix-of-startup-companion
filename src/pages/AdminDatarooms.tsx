import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notify } from "@/lib/notify";
import { 
  FolderLock, Users, Link2, Trash2, UserPlus, Shield, 
  CheckCircle, XCircle, Mail, Building, Eye, Copy, ExternalLink
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { AccessDenied } from '@/components/ui/AccessDenied';

const CURRENT_NDA_VERSION = 'PT-NDA-2026-01';

export default function AdminDatarooms() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  
  const [addMentorOpen, setAddMentorOpen] = useState(false);
  const [mentorEmail, setMentorEmail] = useState('');
  const [selectedMentor, setSelectedMentor] = useState<string | null>(null);
  
  // Fetch all datarooms with workspace info
  const { data: datarooms, isLoading: loadingDatarooms } = useQuery({
    queryKey: ['admin-datarooms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('datarooms')
        .select(`
          *,
          workspace:workspaces(
            id,
            startup:startups(name),
            program:programs(name)
          ),
          share_links:dataroom_share_links(id, revoked_at, expires_at)
        `)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });
  
  // Fetch external mentors
  const { data: mentors, isLoading: loadingMentors } = useQuery({
    queryKey: ['admin-mentors'],
    queryFn: async () => {
      // Get users with mentor_externo role
      const { data: mentorRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'mentor_externo');
      
      if (rolesError) throw rolesError;
      if (!mentorRoles?.length) return [];
      
      const userIds = mentorRoles.map(r => r.user_id);
      
      // Get profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles_safe')
        .select('id, email, full_name, avatar_url')
        .in('id', userIds);
      
      if (profilesError) throw profilesError;
      
      // Get NDA acceptances
      const { data: ndaAcceptances, error: ndaError } = await supabase
        .from('mentor_nda_acceptances')
        .select('user_id, accepted_at, nda_version')
        .in('user_id', userIds)
        .eq('nda_version', CURRENT_NDA_VERSION);
      
      // Combine data
      return (profiles || []).map(p => ({
        ...p,
        nda_accepted: ndaAcceptances?.find(n => n.user_id === p.id),
      }));
    },
  });
  
  // Add mentor mutation
  const addMentor = useMutation({
    mutationFn: async (email: string) => {
      // Find user by email
      const { data: profile, error: profileError } = await supabase
        .from('profiles_safe')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      
      if (profileError) throw profileError;
      if (!profile) throw new Error('Utilizador não encontrado com este email');
      
      // Add mentor_externo role
      const { error: roleError } = await supabase
        .from('user_roles')
        .upsert({ user_id: profile.id, role: 'mentor_externo' }, { onConflict: 'user_id,role' });
      
      if (roleError) throw roleError;
      return profile;
    },
    onSuccess: () => {
      notify.success(t('admin.mentorAdded'));
      setAddMentorOpen(false);
      setMentorEmail('');
      queryClient.invalidateQueries({ queryKey: ['admin-mentors'] });
    },
    onError: (error: any) => {
      notify.error(error.message || t('admin.failedToAddMentor'));
    },
  });
  
  // Remove mentor mutation
  const removeMentor = useMutation({
    mutationFn: async (userId: string) => {
      // Remove role
      const { error: roleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', 'mentor_externo');
      
      if (roleError) throw roleError;
      
      // Remove from workspace_users where role is mentor
      const { error: wsError } = await supabase
        .from('workspace_users')
        .delete()
        .eq('user_id', userId)
        .eq('role', 'mentor_externo');
      
      // Ignore workspace_users error (may not exist)
    },
    onSuccess: () => {
      notify.success(t('admin.mentorRemoved'));
      queryClient.invalidateQueries({ queryKey: ['admin-mentors'] });
    },
    onError: (error: any) => {
      notify.error(error.message || t('admin.failedToRemoveMentor'));
    },
  });
  
  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/dataroom/shared/${token}`);
    notify.success(t('common.linkCopied'));
  };
  
  if (!isAdmin) {
    return (
      <AppLayout title="Datarooms">
        <AccessDenied />
      </AppLayout>
    );
  }
  
  return (
    <AppLayout
      title={t('admin.datarooms')}
      subtitle={t('admin.dataroomsDesc')}
    >
      <Tabs defaultValue="datarooms" className="space-y-6">
        <TabsList>
          <TabsTrigger value="datarooms" className="gap-2">
            <FolderLock className="h-4 w-4" />
            Datarooms
          </TabsTrigger>
          <TabsTrigger value="mentors" className="gap-2">
            <Users className="h-4 w-4" />
            {t('admin.externalMentors')}
          </TabsTrigger>
        </TabsList>
        
        {/* Datarooms Tab */}
        <TabsContent value="datarooms">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderLock className="h-5 w-5" />
                {t('admin.allDatarooms')}
              </CardTitle>
              <CardDescription>{t('admin.dataroomsOverview')}</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDatarooms ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !datarooms?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderLock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('admin.noDatarooms')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.startup')}</TableHead>
                      <TableHead>{t('common.program')}</TableHead>
                      <TableHead>{t('admin.activeLinks')}</TableHead>
                      <TableHead>{t('common.updated')}</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datarooms.map((dr: any) => {
                      const activeLinks = dr.share_links?.filter((l: any) => 
                        !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date())
                      ) || [];
                      
                      return (
                        <TableRow key={dr.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Building className="h-4 w-4 text-muted-foreground" />
                              {dr.workspace?.startup?.name || 'N/A'}
                            </div>
                          </TableCell>
                          <TableCell>{dr.workspace?.program?.name || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={activeLinks.length > 0 ? 'default' : 'secondary'}>
                              {activeLinks.length} {t('dataroom.activeLinks')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDistanceToNow(new Date(dr.updated_at), { locale: pt, addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" asChild>
                              <a href={`/workspace/${dr.workspace_id}?tab=dataroom`}>
                                <Eye className="h-3 w-3 mr-1" />
                                {t('common.view')}
                              </a>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Mentors Tab */}
        <TabsContent value="mentors">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {t('admin.externalMentors')}
                </CardTitle>
                <CardDescription>{t('admin.mentorsDesc')}</CardDescription>
              </div>
              <Button onClick={() => setAddMentorOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                {t('admin.addMentor')}
              </Button>
            </CardHeader>
            <CardContent>
              {loadingMentors ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !mentors?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('admin.noMentors')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.name')}</TableHead>
                      <TableHead>{t('common.email')}</TableHead>
                      <TableHead>{t('admin.ndaStatus')}</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mentors.map((mentor: any) => (
                      <TableRow key={mentor.id}>
                        <TableCell className="font-medium">
                          {mentor.full_name || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            {mentor.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          {mentor.nda_accepted ? (
                            <Badge variant="default" className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {t('admin.ndaAccepted')}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20">
                              <XCircle className="h-3 w-3 mr-1" />
                              {t('admin.ndaPending')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(t('admin.confirmRemoveMentor'))) {
                                removeMentor.mutate(mentor.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Add Mentor Dialog */}
      <Dialog open={addMentorOpen} onOpenChange={setAddMentorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.addMentor')}</DialogTitle>
            <DialogDescription>{t('admin.addMentorDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('common.email')}</Label>
              <Input 
                type="email" 
                placeholder="mentor@example.com"
                value={mentorEmail}
                onChange={(e) => setMentorEmail(e.target.value)}
              />
            </div>
            <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
              <Shield className="h-4 w-4 inline mr-2" />
              {t('admin.mentorNdaNote')}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMentorOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => addMentor.mutate(mentorEmail)} disabled={!mentorEmail || addMentor.isPending}>
              {addMentor.isPending ? t('common.adding') : t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
