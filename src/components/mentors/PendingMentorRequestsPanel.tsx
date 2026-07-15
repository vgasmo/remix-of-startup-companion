import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Clock, UserPlus, CheckCircle2, Building2, MessageSquare, Users } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { notify } from "@/lib/notify";

interface MentorRequest {
  id: string;
  workspace_id: string;
  requested_by: string;
  expertise_tags: string[];
  description: string | null;
  status: string;
  created_at: string;
  workspace: { 
    id: string;
    startup: { name: string } | null;
  } | null;
  requester: {
    full_name: string | null;
    email: string;
  } | null;
}

interface AvailableMentor {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  expertise: string[] | null;
}

export function PendingMentorRequestsPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [assignDialogRequest, setAssignDialogRequest] = useState<MentorRequest | null>(null);
  const [selectedMentorId, setSelectedMentorId] = useState('');

  // Fetch pending requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ['pending-mentor-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mentor_requests')
        .select(`
          id,
          workspace_id,
          requested_by,
          expertise_tags,
          description,
          status,
          created_at
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      if (!data?.length) return [];

      // Fetch workspace info
      const workspaceIds = [...new Set(data.map(r => r.workspace_id))];
      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id, startup:startups(name)')
        .in('id', workspaceIds);
      
      const workspaceMap = new Map(workspaces?.map(w => [w.id, w]));

      // Fetch requester info
      const requesterIds = [...new Set(data.map(r => r.requested_by))];
      const { data: profiles } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email')
        .in('id', requesterIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]));

      return data.map(r => ({
        ...r,
        workspace: workspaceMap.get(r.workspace_id) || null,
        requester: profileMap.get(r.requested_by) || null,
      })) as MentorRequest[];
    },
  });

  // Fetch available mentors
  const { data: mentors } = useQuery({
    queryKey: ['available-mentors-for-assignment'],
    queryFn: async () => {
      const { data: mentorRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'mentor_externo');
      
      if (rolesError) throw rolesError;
      if (!mentorRoles?.length) return [];

      const mentorIds = mentorRoles.map(r => r.user_id);
      
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url, expertise')
        .in('id', mentorIds);
      
      if (profilesError) throw profilesError;
      return profiles as AvailableMentor[];
    },
  });

  // Assign mentor mutation — uses atomic RPC so workspace membership + request
  // fulfilment either both succeed or both roll back.
  const assignMentor = useMutation({
    mutationFn: async ({ requestId, mentorId }: {
      requestId: string;
      mentorId: string;
      workspaceId: string;
    }) => {
      const { data, error } = await supabase.rpc('assign_mentor_request', {
        _request_id: requestId,
        _mentor_id: mentorId,
      });
      if (error) throw error;
      return { data, requestId };
    },
    onSuccess: ({ requestId }) => {
      queryClient.invalidateQueries({ queryKey: ['pending-mentor-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-external-mentors'] });
      notify.success(t('mentorsPage.mentorAssigned'));
      setAssignDialogRequest(null);
      setSelectedMentorId('');
      // Fire acceptance email to founder (best-effort).
      supabase.functions
        .invoke('send-notification-email', {
          body: { type: 'mentor_request_accepted', mentor_request_id: requestId },
        })
        .catch(() => { /* silent */ });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('legacy_request_needs_manual_workspace')) {
        notify.error(t('mentorsPage.assignLegacyNeedsWorkspace', { defaultValue: 'Pedido antigo sem workspace. Contactar suporte.' }));
      } else if (msg.includes('mentor_request_not_pending')) {
        notify.error(t('mentorsPage.assignAlreadyResolved', { defaultValue: 'Este pedido já foi resolvido.' }));
      } else {
        notify.error(t('mentorsPage.assignmentFailed'));
      }
    },
  });


  const getMatchingMentors = (request: MentorRequest) => {
    if (!mentors) return [];
    return mentors.filter(m => 
      m.expertise?.some(exp => 
        request.expertise_tags.some(tag => 
          exp.toLowerCase().includes(tag.toLowerCase()) ||
          tag.toLowerCase().includes(exp.toLowerCase())
        )
      )
    );
  };

  const getInitials = (name: string | null, email: string) => {
    return name
      ?.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || email.charAt(0).toUpperCase();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('mentorsPage.pendingMentorRequests')}
            {requests && requests.length > 0 && (
              <Badge variant="secondary">{requests.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {t('mentorsPage.pendingMentorRequestsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests && requests.length > 0 ? (
            <div className="space-y-4">
              {requests.map(req => {
                const matchingMentors = getMatchingMentors(req);
                return (
                  <div 
                    key={req.id} 
                    className="p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="gap-1">
                            <Building2 className="h-3 w-3" />
                            {(req.workspace?.startup as any)?.name || 'Unknown'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(req.created_at), 'PP')}
                          </span>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-2">
                          {t('mentorsPage.requestedBy')}: {req.requester?.full_name || req.requester?.email}
                        </p>
                        
                        <div className="flex flex-wrap gap-1 mb-2">
                          {req.expertise_tags.map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        
                        {req.description && (
                          <div className="flex items-start gap-2 mt-3 p-2 bg-muted/50 rounded-md">
                            <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground" />
                            <p className="text-sm">{req.description}</p>
                          </div>
                        )}

                        {matchingMentors.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs text-muted-foreground mb-1">
                              {t('mentorsPage.matchingMentors')}:
                            </p>
                            <div className="flex -space-x-2">
                              {matchingMentors.slice(0, 5).map(m => (
                                <Avatar key={m.id} className="h-8 w-8 border-2 border-background">
                                  <AvatarImage src={m.avatar_url || undefined} />
                                  <AvatarFallback className="text-xs">
                                    {getInitials(m.full_name, m.email)}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                              {matchingMentors.length > 5 && (
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs border-2 border-background">
                                  +{matchingMentors.length - 5}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <Button
                        onClick={() => setAssignDialogRequest(req)}
                        size="sm"
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        {t('mentorsPage.assign')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('mentorsPage.noPendingRequests')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Mentor Dialog */}
      <Dialog open={!!assignDialogRequest} onOpenChange={() => setAssignDialogRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('mentorsPage.assignMentorTitle')}</DialogTitle>
            <DialogDescription>
              {t('mentorsPage.assignMentorDesc', {
                startup: (assignDialogRequest?.workspace?.startup as any)?.name || 'Unknown'
              })}
            </DialogDescription>
          </DialogHeader>
          
          {assignDialogRequest && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">{t('mentorsPage.requestedExpertise')}:</p>
                <div className="flex flex-wrap gap-1">
                  {assignDialogRequest.expertise_tags.map(tag => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  {t('mentorsPage.selectMentor')}
                </label>
                <Select value={selectedMentorId} onValueChange={setSelectedMentorId}>
                  <SelectTrigger aria-label={t('mentorsPage.selectMentor')}>
                    <SelectValue placeholder={t('mentorsPage.selectMentorPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {mentors?.map(mentor => (
                      <SelectItem key={mentor.id} value={mentor.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={mentor.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {getInitials(mentor.full_name, mentor.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{mentor.full_name || mentor.email}</span>
                          {mentor.expertise && mentor.expertise.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              ({mentor.expertise.slice(0, 2).join(', ')})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogRequest(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (assignDialogRequest && selectedMentorId) {
                  assignMentor.mutate({
                    requestId: assignDialogRequest.id,
                    mentorId: selectedMentorId,
                    workspaceId: assignDialogRequest.workspace_id,
                  });
                }
              }}
              disabled={!selectedMentorId || assignMentor.isPending} loading={assignMentor.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {t('mentorsPage.confirmAssign')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
