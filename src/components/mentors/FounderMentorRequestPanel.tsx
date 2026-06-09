import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Send, Sparkles, Clock, CheckCircle2, XCircle, Users } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notify } from "@/lib/notify";
import { format } from 'date-fns';

const EXPERTISE_OPTIONS = [
  'Marketing',
  'Fundraising', 
  'Product',
  'Sales',
  'Technology',
  'Legal',
  'Finance',
  'Operations',
  'HR & Talent',
  'Growth',
  'Strategy',
  'UX/Design',
];

interface MentorRequest {
  id: string;
  workspace_id: string;
  expertise_tags: string[];
  description: string | null;
  status: string;
  created_at: string;
  workspace?: { startup: { name: string } | null } | null;
}

export function FounderMentorRequestPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [selectedExpertise, setSelectedExpertise] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState('');

  // Fetch founder's workspaces
  const { data: workspaces } = useQuery({
    queryKey: ['founder-workspaces', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('workspace_users')
        .select(`
          workspace_id,
          workspace:workspaces!inner(
            id,
            startup:startups(name)
          )
        `)
        .eq('user_id', user.id)
        .eq('role', 'founder')
        .eq('active', true);
      
      if (error) throw error;
      return data?.map(w => ({
        id: w.workspace_id,
        name: (w.workspace as any)?.startup?.name || 'Unknown Startup',
      })) || [];
    },
    enabled: !!user,
  });

  // Fetch existing requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ['mentor-requests', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('mentor_requests')
        .select(`
          id,
          workspace_id,
          expertise_tags,
          description,
          status,
          created_at
        `)
        .eq('requested_by', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as MentorRequest[];
    },
    enabled: !!user,
  });

  // Submit request mutation
  const submitRequest = useMutation({
    mutationFn: async () => {
      const workspaceToUse = workspaces?.length === 1 ? workspaces[0].id : selectedWorkspace;
      
      if (!user || !workspaceToUse || selectedExpertise.length === 0) {
        throw new Error('Missing required fields');
      }
      
      const { error } = await supabase
        .from('mentor_requests')
        .insert({
          workspace_id: workspaceToUse,
          requested_by: user.id,
          expertise_tags: selectedExpertise,
          description: description.trim() || null,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentor-requests'] });
      notify.success(t('mentorsPage.requestSubmitted'));
      setSelectedExpertise([]);
      setDescription('');
      setSelectedWorkspace('');
    },
    onError: () => {
      notify.error(t('mentorsPage.requestFailed'));
    },
  });

  // Cancel request mutation
  const cancelRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('mentor_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentor-requests'] });
      notify.success(t('mentorsPage.requestCancelled'));
    },
  });

  const toggleExpertise = (exp: string) => {
    setSelectedExpertise(prev => 
      prev.includes(exp) 
        ? prev.filter(e => e !== exp)
        : [...prev, exp]
    );
  };

  const pendingRequests = requests?.filter(r => r.status === 'pending') || [];
  const pastRequests = requests?.filter(r => r.status !== 'pending') || [];

  const getWorkspaceName = (workspaceId: string) => {
    return workspaces?.find(w => w.id === workspaceId)?.name || 'Unknown';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('mentorsPage.requestMentor')}
          </CardTitle>
          <CardDescription>
            {t('mentorsPage.requestMentorDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {workspaces && workspaces.length > 1 && (
            <div>
              <label className="text-sm font-medium mb-2 block">
                {t('mentorsPage.selectStartup')}
              </label>
              <Select value={selectedWorkspace} onValueChange={setSelectedWorkspace}>
                <SelectTrigger aria-label={t('mentorsPage.selectStartup')}>
                  <SelectValue placeholder={t('mentorsPage.selectStartupPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map(ws => (
                    <SelectItem key={ws.id} value={ws.id}>
                      {ws.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-2 block">
              {t('mentorsPage.selectExpertise')}
            </label>
            <div className="flex flex-wrap gap-2">
              {EXPERTISE_OPTIONS.map(exp => (
                <Badge
                  key={exp}
                  variant={selectedExpertise.includes(exp) ? 'default' : 'outline'}
                  className="cursor-pointer transition-colors hover:bg-primary/10"
                  onClick={() => toggleExpertise(exp)}
                >
                  {exp}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              {t('mentorsPage.describeNeed')}
            </label>
            <Textarea
              placeholder={t('mentorsPage.describeNeedPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              aria-label={t('mentorsPage.describeNeed')}
            />
          </div>

          <Button
            onClick={() => submitRequest.mutate()}
            disabled={
              submitRequest.isPending || 
              selectedExpertise.length === 0 || 
              (workspaces && workspaces.length > 1 && !selectedWorkspace) ||
              (workspaces && workspaces.length === 0)
            }
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            {t('mentorsPage.submitRequest')}
          </Button>
        </CardContent>
      </Card>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              {t('mentorsPage.pendingRequests')}
            </CardTitle>
            <CardDescription>
              {t('mentorsPage.expectedResponse', { defaultValue: 'A nossa equipa atribui mentores em 2-3 dias úteis.' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.map(req => (
              <div 
                key={req.id} 
                className="flex items-start justify-between p-4 rounded-lg border bg-card"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30 ">
                      <Clock className="h-3 w-3 mr-1" />
                      {t('mentorsPage.awaitingMatch', { defaultValue: 'Em triagem' })}
                    </Badge>
                    <Badge variant="secondary">{getWorkspaceName(req.workspace_id)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(req.created_at), 'PP')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {req.expertise_tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  {req.description && (
                    <p className="text-sm text-muted-foreground">{req.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => cancelRequest.mutate(req.id)}
                  disabled={cancelRequest.isPending}
                  title={t('mentorsPage.cancelRequest', 'Cancel request')}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Past Requests */}
      {pastRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5" />
              {t('mentorsPage.pastRequests')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pastRequests.slice(0, 5).map(req => (
              <div 
                key={req.id} 
                className="flex items-start justify-between p-4 rounded-lg border bg-muted/30"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge 
                      variant={req.status === 'fulfilled' ? 'default' : 'secondary'}
                      className={req.status === 'fulfilled' ? 'bg-[hsl(var(--success))]' : ''}
                    >
                      {req.status === 'fulfilled' ? t('mentorsPage.fulfilled') : t('mentorsPage.cancelled')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(req.created_at), 'PP')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {req.expertise_tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && requests?.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{t('mentorsPage.noRequestsYet')}</p>
        </div>
      )}
    </div>
  );
}
