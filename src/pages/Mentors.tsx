import { useState } from 'react';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Linkedin,
  MessageSquare,
  Check,
  X,
  Clock,
  Users,
  Calendar,
  BarChart3,
  CalendarDays,
  Mail,
  UserPlus,
  Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notify } from "@/lib/notify";
import { MentorAvailabilitySettings } from '@/components/mentors/MentorAvailabilitySettings';
import { MentorImpactDashboard } from '@/components/mentors/MentorImpactDashboard';
import { MentorBookingPanel } from '@/components/mentors/MentorBookingPanel';
import { FounderMentorRequestPanel } from '@/components/mentors/FounderMentorRequestPanel';
import { PendingMentorRequestsPanel } from '@/components/mentors/PendingMentorRequestsPanel';
import { AdminExternalMentorsManager } from '@/components/admin/AdminExternalMentorsManager';
import { MentorProfileDialog } from '@/components/mentors/MentorProfileDialog';

import { useMutation, useQueryClient } from '@tanstack/react-query';

const CURRENT_NDA_VERSION = 'PT-NDA-2026-01';

interface MentorProfile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  linkedin_url: string | null;
  bio: string | null;
  expertise: string[] | null;
}

interface MentorConnection {
  id: string;
  /**
   * v4.0: founder_id stores the founder auth.users.id.
   * Legacy rows (pre-v4.0) may incorrectly contain a workspace_id — read paths
   * prefer `workspace_id` and fall back to `founder_id` only when missing.
   */
  founder_id: string;
  mentor_id: string;
  status: string;
  message: string | null;
  created_at: string;
  mentor?: MentorProfile | null;
  /** For mentor view: the founder profile resolved from workspace_users, NOT from founder_id directly */
  founder?: MentorProfile | null;
}

interface AssignedMentor {
  user_id: string;
  workspace_id: string;
  profile: MentorProfile | null;
}

function useAssignedMentors(userId: string | undefined) {
  return useQuery({
    queryKey: ['assigned-mentors', userId],
    queryFn: async (): Promise<AssignedMentor[]> => {
      if (!userId) return [];

      const { data: founderWorkspaces, error: wsError } = await supabase
        .from('workspace_users')
        .select('workspace_id')
        .eq('user_id', userId)
        .eq('role', 'founder')
        .eq('active', true);

      if (wsError) throw wsError;
      if (!founderWorkspaces?.length) return [];

      const workspaceIds = founderWorkspaces.map(w => w.workspace_id);

      const { data: mentorAssignments, error: mentorError } = await supabase
        .from('workspace_users')
        .select('user_id, workspace_id')
        .in('workspace_id', workspaceIds)
        .eq('role', 'mentor_externo')
        .eq('active', true);

      if (mentorError) throw mentorError;
      if (!mentorAssignments?.length) return [];

      const mentorIds = [...new Set(mentorAssignments.map(m => m.user_id))];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url, linkedin_url, bio, expertise')
        .in('id', mentorIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map(p => [p.id, p as MentorProfile]));

      return mentorAssignments.map(m => ({
        user_id: m.user_id,
        workspace_id: m.workspace_id,
        profile: profileMap.get(m.user_id) || null,
      }));
    },
    enabled: !!userId,
  });
}

function useConnections(userId: string | undefined, role: 'founder' | 'mentor') {
  return useQuery<MentorConnection[]>({
    queryKey: ['mentor-connections', userId, role],
    queryFn: async (): Promise<MentorConnection[]> => {
      if (!userId) return [];

      // For founders: query by workspace_id (canonical column)
      // We need the founder's workspace IDs first
      let column: string;
      if (role === 'founder') {
        // Get founder's workspace IDs, then query connections by those
        const { data: wsData } = await supabase
          .from('workspace_users')
          .select('workspace_id')
          .eq('user_id', userId)
          .eq('role', 'founder')
          .eq('active', true);
        
        const wsIds = wsData?.map(w => w.workspace_id) || [];
        if (wsIds.length === 0) return [];

        const { data, error } = await supabase
          .from('mentor_connections')
          .select('*')
          .in('workspace_id', wsIds)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!data?.length) return [];

        // Look up mentor profiles
        const mentorIds = [...new Set(data.map(c => c.mentor_id))];
        const { data: profiles } = await supabase
          .from('profiles_safe')
          .select('id, full_name, email, avatar_url, linkedin_url, bio, expertise')
          .in('id', mentorIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p as MentorProfile]));

        return data.map(conn => ({
          id: conn.id,
          founder_id: conn.founder_id,
          mentor_id: conn.mentor_id,
          status: conn.status,
          message: conn.message,
          created_at: conn.created_at,
          mentor: profileMap.get(conn.mentor_id) || null,
          founder: null,
        }));
      } else {
        // Mentor view: query by mentor_id
        const { data, error } = await supabase
          .from('mentor_connections')
          .select('*')
          .eq('mentor_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!data?.length) return [];

        // workspace_id is the canonical column — resolve to founder profiles via workspace_users
        const workspaceIds = [...new Set(data.map(c => c.workspace_id || c.founder_id))];
        const { data: wsFounders } = await supabase
          .from('workspace_users')
          .select('workspace_id, user_id')
          .in('workspace_id', workspaceIds)
          .eq('role', 'founder')
          .eq('active', true);

        const founderUserIds = [...new Set(wsFounders?.map(f => f.user_id) || [])];
        const wsToFounder = new Map<string, string>();
        wsFounders?.forEach(f => {
          if (!wsToFounder.has(f.workspace_id)) wsToFounder.set(f.workspace_id, f.user_id);
        });

        const { data: profiles } = founderUserIds.length > 0
          ? await supabase.from('profiles_safe')
              .select('id, full_name, email, avatar_url, linkedin_url, bio, expertise')
              .in('id', founderUserIds)
          : { data: [] };

        const profileMap = new Map<string, MentorProfile>((profiles || []).map(p => [p.id, p as MentorProfile] as [string, MentorProfile]));

        return data.map(conn => {
          const founderId = wsToFounder.get(conn.workspace_id || conn.founder_id);
          return {
            id: conn.id,
            founder_id: conn.founder_id,
            mentor_id: conn.mentor_id,
            status: conn.status,
            message: conn.message,
            created_at: conn.created_at,
            mentor: null as MentorProfile | null,
            founder: (founderId ? profileMap.get(founderId) : null) || null,
          } as MentorConnection;
        });
      }
    },
    enabled: !!userId,
  });
}

export default function Mentors() {
  const { user, roles, isAuthReady, isAdmin, isConsultor } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'requests';

  const isFounder = roles.includes('founder');
  const isMentor = roles.includes('mentor_externo');
  const isStaff = isAdmin || isConsultor;

  const { data: ndaAcceptance, isLoading: ndaLoading } = useQuery({
    queryKey: ['mentor-nda-check', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('mentor_nda_acceptances')
        .select('id')
        .eq('user_id', user.id)
        .eq('nda_version', CURRENT_NDA_VERSION)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && isMentor && !isStaff,
  });

  const { data: assignedMentors, isLoading: loadingAssigned } = useAssignedMentors(
    isFounder ? user?.id : undefined
  );
  const { data: connections, isLoading: loadingConnections } = useConnections(
    user?.id,
    isFounder ? 'founder' : 'mentor'
  );

  const { data: founderWorkspaceContext, isLoading: loadingWorkspaceContext } = useQuery({
    queryKey: ['founder-primary-workspace-context', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data: membership, error: membershipError } = await supabase
        .from('workspace_users')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('role', 'founder')
        .eq('active', true)
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership?.workspace_id) return null;

      const { data: workspace, error: workspaceError } = await (supabase as any)
        .from('workspaces')
        .select('id, assigned_consultor_id')
        .eq('id', membership.workspace_id)
        .maybeSingle();

      if (workspaceError) throw workspaceError;

      let consultant: MentorProfile | null = null;
      if (workspace?.assigned_consultor_id) {
        // Use secure RPC that reveals consultant email to workspace members (founders)
        const { data: contactRows, error: contactError } = await (supabase as any).rpc(
          'get_assigned_consultant_contact',
          { p_workspace_id: membership.workspace_id }
        );
        if (contactError) throw contactError;
        const contact = Array.isArray(contactRows) && contactRows.length > 0 ? contactRows[0] : null;
        if (contact) {
          consultant = {
            id: contact.id,
            full_name: contact.full_name,
            email: contact.email,
            avatar_url: contact.avatar_url,
            linkedin_url: contact.linkedin_url,
            bio: null,
            expertise: null,
          } as MentorProfile;
        }
      }

      return {
        workspaceId: membership.workspace_id,
        consultant,
      };
    },
    enabled: !!user && isFounder,
  });

  const founderWorkspaceId = founderWorkspaceContext?.workspaceId ?? null;
  const assignedConsultant = founderWorkspaceContext?.consultant ?? null;

  const [mentorSearch, setMentorSearch] = useState('');
  const [selectedMentorForBooking, setSelectedMentorForBooking] = useState<string | null>(null);
  const [selectedGalleryMentor, setSelectedGalleryMentor] = useState<MentorProfile | null>(null);
  const { data: allMentors, isLoading: loadingAllMentors } = useQuery({
    queryKey: ['all-mentors-gallery'],
    queryFn: async (): Promise<MentorProfile[]> => {
      const { data: mentorRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'mentor_externo');

      if (rolesError) throw rolesError;
      if (!mentorRoles?.length) return [];

      const mentorIds = [...new Set(mentorRoles.map(r => r.user_id))];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url, linkedin_url, bio, expertise')
        .in('id', mentorIds);

      if (profilesError) throw profilesError;
      return (profiles || []) as MentorProfile[];
    },
    enabled: isFounder,
  });

  const updateConnectionStatus = useMutation({
    mutationFn: async ({ connectionId, status, founderId }: { connectionId: string; status: string; founderId: string }) => {
      const { error } = await supabase
        .from('mentor_connections')
        .update({
          status,
          responded_at: new Date().toISOString(),
        })
        .eq('id', connectionId);

      if (error) throw error;

      if (status === 'accepted' && user) {
        const { data: founderWorkspaces } = await supabase
          .from('workspace_users')
          .select('workspace_id')
          .eq('user_id', founderId)
          .eq('role', 'founder')
          .eq('active', true);

        if (founderWorkspaces && founderWorkspaces.length > 0) {
          const workspaceInserts = founderWorkspaces.map(wu => ({
            workspace_id: wu.workspace_id,
            user_id: user.id,
            role: 'mentor_externo' as const,
            active: true,
          }));

          await supabase
            .from('workspace_users')
            .upsert(workspaceInserts, {
              onConflict: 'workspace_id,user_id',
              ignoreDuplicates: true,
            });
        }
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['mentor-connections'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      notify.success(`${t('mentorsPage.connection')} ${status === 'accepted' ? t('mentorsPage.accepted') : t('mentorsPage.declined')}`);
    },
    onError: (error: any) => {
      notify.error(error.message || t('mentorsPage.failedToUpdate'));
    },
  });

  if (isMentor && !isStaff && isAuthReady && !ndaLoading && !ndaAcceptance) {
    return <Navigate to="/mentor-nda" replace />;
  }

  const getInitials = (name: string | null) => {
    return name
      ?.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';
  };

  const openMailTo = (email?: string | null, contextLabel?: string) => {
    if (!email) {
      notify.error(
        t('mentorsPage.noEmailAvailableFor', {
          defaultValue: 'Sem email disponível para {{target}}',
          target: contextLabel || t('mentorsPage.thisContact', { defaultValue: 'este contacto' }),
        })
      );
      return;
    }

    window.location.href = `mailto:${email}`;
  };

  const pendingConnections = connections?.filter(c => c.status === 'pending') || [];
  const acceptedConnections = connections?.filter(c => c.status === 'accepted') || [];

  const uniqueMentors = assignedMentors
    ? [...new Map(assignedMentors.map(m => [m.user_id, m])).values()]
    : [];

  const getPageTitle = () => {
    if (isStaff) return t('mentorsPage.findAndAssign');
    if (isFounder) return t('mentorsPage.myMentors');
    if (isMentor) return t('mentorsPage.connectionRequests');
    return t('mentorsPage.myMentors');
  };

  return (
    <AppLayout title={getPageTitle()}>
      {isStaff ? (
        <Tabs defaultValue="requests" className="space-y-6">
          <TabsList>
            <TabsTrigger value="requests" className="gap-2">
              <Clock className="h-4 w-4" />
              {t('mentorsPage.pendingMentorRequests')}
            </TabsTrigger>
            <TabsTrigger value="mentors" className="gap-2">
              <UserPlus className="h-4 w-4" />
              {t('mentorsPage.findAndAssign')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests">
            <PendingMentorRequestsPanel />
          </TabsContent>

          <TabsContent value="mentors">
            <AdminExternalMentorsManager />
          </TabsContent>
        </Tabs>
      ) : isFounder ? (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-primary" />
                {t('workspace.responsibleConsultant')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingWorkspaceContext ? (
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ) : assignedConsultant ? (
                <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <Avatar className="h-12 w-12 border-2 border-primary/10">
                    <AvatarImage src={assignedConsultant.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getInitials(assignedConsultant.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {assignedConsultant.full_name || t('mentorsPage.unnamedMentor')}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{assignedConsultant.email}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {assignedConsultant.linkedin_url && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <a href={sanitizeUrl(assignedConsultant.linkedin_url)!} target="_blank" rel="noopener noreferrer" title="LinkedIn">
                          <Linkedin className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => openMailTo(assignedConsultant.email, t('workspace.responsibleConsultant', { defaultValue: 'Consultor Responsável' }))}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {t('mentorsPage.contact')}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('workspace.noConsultantAssigned')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                {t('mentorsPage.myMentors')}
              </CardTitle>
              <CardDescription className="text-xs">{t('mentorsPage.myMentorsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAssigned ? (
                <div className="space-y-3">
                  {[1, 2].map(i => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : uniqueMentors.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium mb-1">{t('mentorsPage.noMentorsAssigned')}</p>
                  <p className="text-xs text-muted-foreground">{t('mentorsPage.noMentorsAssignedDesc')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {uniqueMentors.map(mentor => {
                    const isBookingOpen = selectedMentorForBooking === mentor.user_id;

                    return (
                      <div
                        key={mentor.user_id}
                        className="rounded-lg border border-border p-3 transition-all hover:border-primary/20 hover:bg-accent/50"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12 border-2 border-primary/10">
                            <AvatarImage src={mentor.profile?.avatar_url || undefined} />
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              {getInitials(mentor.profile?.full_name || null)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <Link
                              to={`/mentors/${mentor.profile?.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-sm truncate text-primary hover:underline focus:outline-none focus-visible:underline block"
                            >
                              {mentor.profile?.full_name || t('mentorsPage.unnamedMentor')}
                            </Link>
                            {mentor.profile?.expertise && mentor.profile.expertise.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {mentor.profile.expertise.slice(0, 3).map(exp => (
                                  <Badge key={exp} variant="secondary" className="text-[10px] px-1.5 py-0">{exp}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {mentor.profile?.linkedin_url && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <a href={sanitizeUrl(mentor.profile.linkedin_url)!} target="_blank" rel="noopener noreferrer" title="LinkedIn">
                                  <Linkedin className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openMailTo(mentor.profile?.email, mentor.profile?.full_name || t('mentorsPage.mentor', { defaultValue: 'Mentor' }))}
                              title={t('mentorsPage.contactMentor', 'Contact mentor')}
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant={isBookingOpen ? 'secondary' : 'outline'}
                              size="sm"
                              className="h-8 text-xs gap-1"
                              onClick={() => setSelectedMentorForBooking(current => current === mentor.user_id ? null : mentor.user_id)}
                            >
                              <CalendarDays className="h-3.5 w-3.5" />
                              {t('mentorsPage.book', 'Agendar')}
                            </Button>
                          </div>
                        </div>

                        {isBookingOpen && (
                          <div className="mt-4 border-t border-border pt-4">
                            <MentorBookingPanel
                              mode="founder"
                              mentorId={mentor.user_id}
                              mentorName={mentor.profile?.full_name || undefined}
                              mentorAvatar={mentor.profile?.avatar_url || undefined}
                              workspaceId={founderWorkspaceId || undefined}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('mentorsPage.mentorGallery')}
              </CardTitle>
              <CardDescription>{t('mentorsPage.mentorGalleryDesc')}</CardDescription>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t('mentorsPage.searchMentors')}
                  value={mentorSearch}
                  onChange={(e) => setMentorSearch(e.target.value)}
                  className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent>
              {loadingAllMentors ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map(i => (
                    <Card key={i} className="p-4">
                      <div className="flex items-start gap-3">
                        <Skeleton className="h-14 w-14 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-3 w-full" />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : !allMentors?.length ? (
                <div className="py-8 text-center">
                  <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">{t('mentorsPage.noMentorsAvailable')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {allMentors
                    .filter(m => {
                      if (!mentorSearch.trim()) return true;
                      const search = mentorSearch.toLowerCase();
                      return (
                        m.full_name?.toLowerCase().includes(search) ||
                        m.expertise?.some(e => e.toLowerCase().includes(search)) ||
                        m.bio?.toLowerCase().includes(search)
                      );
                    })
                    .map(mentor => {
                      const isAlreadyAssigned = uniqueMentors.some(um => um.user_id === mentor.id);
                      return (
                        <Card 
                          key={mentor.id} 
                          className="transition-shadow hover:shadow-md cursor-pointer hover:border-primary/30"
                          onClick={() => setSelectedGalleryMentor(mentor)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <Avatar className="h-14 w-14 border-2 border-primary/10">
                                <AvatarImage src={mentor.avatar_url || undefined} />
                                <AvatarFallback className="bg-primary text-base text-primary-foreground">
                                  {getInitials(mentor.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="truncate text-sm font-semibold">
                                    <Link
                                      to={`/mentors/${mentor.id}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-primary hover:underline focus:outline-none focus-visible:underline"
                                    >
                                      {mentor.full_name || t('mentorsPage.unnamedMentor')}
                                    </Link>
                                  </h4>
                                  {mentor.linkedin_url && (
                                    <a 
                                      href={sanitizeUrl(mentor.linkedin_url)!} 
                                      target="_blank" 
                                      rel="noopener noreferrer" 
                                      className="shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Linkedin className="h-4 w-4 text-muted-foreground transition-colors hover:text-primary" />
                                    </a>
                                  )}
                                </div>
                                {mentor.bio && (
                                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{mentor.bio}</p>
                                )}
                                {mentor.expertise && mentor.expertise.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {mentor.expertise.slice(0, 3).map(exp => (
                                      <Badge key={exp} variant="secondary" className="text-[10px] px-1.5 py-0">{exp}</Badge>
                                    ))}
                                    {mentor.expertise.length > 3 && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{mentor.expertise.length - 3}</Badge>
                                    )}
                                  </div>
                                )}
                                {isAlreadyAssigned && (
                                  <Badge variant="outline" className="mt-2 gap-1 border-emerald-500/50 text-[10px] text-emerald-600 dark:text-emerald-400">
                                    <Check className="h-3 w-3" />
                                    {t('mentorsPage.assigned')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
          <MentorProfileDialog
            mentor={selectedGalleryMentor}
            open={!!selectedGalleryMentor}
            onOpenChange={(open) => !open && setSelectedGalleryMentor(null)}
            isAssigned={selectedGalleryMentor ? uniqueMentors.some(um => um.user_id === selectedGalleryMentor.id) : false}
          />

          <FounderMentorRequestPanel />
        </div>
      ) : isMentor ? (
        <Tabs defaultValue={initialTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="requests" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              {t('mentorsPage.connectionRequests')}
              {pendingConnections.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
                  {pendingConnections.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="availability" className="gap-2">
              <Calendar className="h-4 w-4" />
              {t('mentorsPage.availability')}
            </TabsTrigger>
            <TabsTrigger value="bookings" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              {t('mentorsPage.bookings')}
            </TabsTrigger>
            <TabsTrigger value="impact" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              {t('mentorsPage.impact')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests">
            <Card>
              <CardHeader>
                <CardTitle>{t('mentorsPage.connectionRequests')}</CardTitle>
                <CardDescription>
                  {t('mentorsPage.foundersInterestedDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingConnections ? (
                  <div className="space-y-4">
                    {[1, 2].map(i => (
                      <div key={i} className="flex items-center gap-4">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-32 mb-2" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : pendingConnections.length === 0 && acceptedConnections.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">{t('mentorsPage.noRequestsYet')}</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {pendingConnections.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-3 text-muted-foreground">
                          {t('mentorsPage.pendingRequests')} ({pendingConnections.length})
                        </h4>
                        <div className="space-y-3">
                          {pendingConnections.map(conn => (
                            <div 
                              key={conn.id} 
                              className="flex items-start gap-4 p-4 rounded-lg border bg-card"
                            >
                              <Avatar className="h-12 w-12">
                                <AvatarImage src={conn.founder?.avatar_url || undefined} />
                                <AvatarFallback className="bg-primary text-primary-foreground">
                                  {getInitials(conn.founder?.full_name || null)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium">
                                  {conn.founder?.full_name || t('mentorsPage.unknownFounder')}
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  {conn.founder?.email}
                                </p>
                                {conn.message && (
                                  <p className="text-sm mt-2 p-2 bg-muted rounded">
                                    "{conn.message}"
                                  </p>
                                )}
                                <div className="flex gap-2 mt-3">
                                  <Button
                                    size="sm"
                                    onClick={() => updateConnectionStatus.mutate({ 
                                      connectionId: conn.id, 
                                      status: 'accepted',
                                      founderId: conn.founder_id 
                                    })}
                                    disabled={updateConnectionStatus.isPending}
                                  >
                                    <Check className="h-4 w-4 mr-1" />
                                    {t('mentorsPage.accept')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateConnectionStatus.mutate({ 
                                      connectionId: conn.id, 
                                      status: 'declined',
                                      founderId: conn.founder_id 
                                    })}
                                    disabled={updateConnectionStatus.isPending}
                                  >
                                    <X className="h-4 w-4 mr-1" />
                                    {t('mentorsPage.decline')}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {acceptedConnections.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-3 text-muted-foreground">
                          {t('mentorsPage.connectedFounders')} ({acceptedConnections.length})
                        </h4>
                        <div className="space-y-3">
                          {acceptedConnections.map(conn => (
                            <div 
                              key={conn.id} 
                              className="flex items-center gap-4 p-4 rounded-lg border bg-card"
                            >
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={conn.founder?.avatar_url || undefined} />
                                <AvatarFallback className="bg-primary text-primary-foreground">
                                  {getInitials(conn.founder?.full_name || null)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium">
                                  {conn.founder?.full_name || t('mentorsPage.unknownFounder')}
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  {conn.founder?.email}
                                </p>
                              </div>
                              {conn.founder?.linkedin_url && (
                                <a
                                  href={sanitizeUrl(conn.founder.linkedin_url)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-primary"
                                >
                                  <Linkedin className="h-5 w-5" />
                                </a>
                              )}
                              <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400">
                                <Check className="h-3 w-3 mr-1" />
                                {t('mentorsPage.connected')}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="availability">
            <MentorAvailabilitySettings />
          </TabsContent>

          <TabsContent value="bookings">
            <MentorBookingPanel mode="mentor" />
          </TabsContent>

          <TabsContent value="impact">
            <MentorImpactDashboard />
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('mentorsPage.accessRestricted')}</h3>
            <p className="text-muted-foreground">
              {t('mentorsPage.accessRestrictedDesc')}
            </p>
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
}
