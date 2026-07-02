import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Send, Sparkles, Clock, CheckCircle2, XCircle, Users, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CategoryTagPicker } from '@/components/tags/CategoryTagPicker';
import { MentorRecommendationWidget } from './MentorRecommendationWidget';
import { notify } from "@/lib/notify";
import { format } from 'date-fns';

interface MentorRequest {
  id: string;
  workspace_id: string;
  expertise_tags: string[];
  description: string | null;
  status: string;
  created_at: string;
}

export function EnhancedFounderMentorRequest() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedNeedsTags, setSelectedNeedsTags] = useState<string[]>([]);
  const [selectedTechTags, setSelectedTechTags] = useState<string[]>([]);
  const [selectedIndustryTags, setSelectedIndustryTags] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [preferredMentorId, setPreferredMentorId] = useState<string | null>(null);

  // Fetch tag categories to get IDs for Needs, Technology, Industry
  const { data: categories } = useQuery({
    queryKey: ['tag-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tag_categories')
        .select('id, name, slug')
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  // Fetch all tags to get names for selected IDs
  const { data: allTags } = useQuery({
    queryKey: ['tags-with-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('id, name, category_id');
      if (error) throw error;
      return data;
    },
  });

  // Get category IDs
  const needsCategoryId = categories?.find(c => c.slug === 'needs')?.id;
  const techCategoryId = categories?.find(c => c.slug === 'technology')?.id;
  const industryCategoryId = categories?.find(c => c.slug === 'industry')?.id;

  // Combine all selected tag names for matching
  const allSelectedTagNames = useMemo(() => {
    if (!allTags) return [];
    const allTagIds = [...selectedNeedsTags, ...selectedTechTags, ...selectedIndustryTags];
    return allTags
      .filter(t => allTagIds.includes(t.id))
      .map(t => t.name);
  }, [allTags, selectedNeedsTags, selectedTechTags, selectedIndustryTags]);

  // Fetch founder's workspaces
  const { data: workspaces } = useQuery({
    queryKey: ['founder-workspaces', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('workspace_users')
        .select(`workspace_id, workspace:workspaces!inner(id, startup:startups(name))`)
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
        .select('id, workspace_id, expertise_tags, description, status, created_at')
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
      
      if (!user || !workspaceToUse || allSelectedTagNames.length === 0) {
        throw new Error('Missing required fields');
      }
      
      const { error } = await supabase
        .from('mentor_requests')
        .insert({
          workspace_id: workspaceToUse,
          requested_by: user.id,
          expertise_tags: allSelectedTagNames,
          description: description.trim() || null,
          assigned_mentor_id: preferredMentorId,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentor-requests'] });
      notify.success(t('mentorsPage.requestSubmitted'));
      resetForm();
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

  const resetForm = () => {
    setSelectedNeedsTags([]);
    setSelectedTechTags([]);
    setSelectedIndustryTags([]);
    setDescription('');
    setSelectedWorkspace('');
    setPreferredMentorId(null);
  };

  const pendingRequests = requests?.filter(r => r.status === 'pending') || [];
  const pastRequests = requests?.filter(r => r.status !== 'pending') || [];

  const getWorkspaceName = (workspaceId: string) => {
    return workspaces?.find(w => w.id === workspaceId)?.name || 'Unknown';
  };

  const canSubmit = allSelectedTagNames.length > 0 && 
    (workspaces?.length === 1 || !!selectedWorkspace) &&
    workspaces?.length !== 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Request Form */}
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
          <CardContent className="space-y-5">
            {/* Workspace Selection */}
            {workspaces && workspaces.length > 1 && (
              <div className="space-y-2">
                <Label>{t('mentorsPage.selectStartup')}</Label>
                <Select value={selectedWorkspace} onValueChange={setSelectedWorkspace}>
                  <SelectTrigger aria-label={t('mentorsPage.selectStartup')}>
                    <SelectValue placeholder={t('mentorsPage.selectStartupPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map(ws => (
                      <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Needs Tags (Primary) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                {t('mentorsPage.whatNeedsHelp', 'What do you need help with?')} *
              </Label>
              {needsCategoryId ? (
                <CategoryTagPicker
                  selectedTagIds={selectedNeedsTags}
                  onAddTag={(id) => setSelectedNeedsTags(prev => [...prev, id])}
                  onRemoveTag={(id) => setSelectedNeedsTags(prev => prev.filter(t => t !== id))}
                  filterByCategory={needsCategoryId}
                  placeholder={t('mentorsPage.selectNeeds', 'Select needs...')}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('mentorsPage.noCategoriesSetup', 'No tag categories configured yet')}
                </p>
              )}
            </div>

            {/* Technology Tags (Optional) */}
            {techCategoryId && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {t('mentorsPage.technologyOptional', 'Technology (optional)')}
                </Label>
                <CategoryTagPicker
                  selectedTagIds={selectedTechTags}
                  onAddTag={(id) => setSelectedTechTags(prev => [...prev, id])}
                  onRemoveTag={(id) => setSelectedTechTags(prev => prev.filter(t => t !== id))}
                  filterByCategory={techCategoryId}
                  placeholder={t('mentorsPage.selectTech', 'Select technologies...')}
                  size="sm"
                />
              </div>
            )}

            {/* Industry Tags (Optional) */}
            {industryCategoryId && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {t('mentorsPage.industryOptional', 'Industry (optional)')}
                </Label>
                <CategoryTagPicker
                  selectedTagIds={selectedIndustryTags}
                  onAddTag={(id) => setSelectedIndustryTags(prev => [...prev, id])}
                  onRemoveTag={(id) => setSelectedIndustryTags(prev => prev.filter(t => t !== id))}
                  filterByCategory={industryCategoryId}
                  placeholder={t('mentorsPage.selectIndustry', 'Select industries...')}
                  size="sm"
                />
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label>{t('mentorsPage.describeNeed')}</Label>
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
              disabled={submitRequest.isPending || !canSubmit} loading={submitRequest.isPending}
              className="w-full"
            >
              <Send className="h-4 w-4 mr-2" />
              {preferredMentorId 
                ? t('mentorsPage.submitWithPreference', 'Submit with Preferred Mentor')
                : t('mentorsPage.submitRequest')}
            </Button>
          </CardContent>
        </Card>

        {/* Existing Requests */}
        {pendingRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" />
                {t('mentorsPage.pendingRequests')}
              </CardTitle>
              <CardDescription>
                {t('mentorsPage.expectedResponse', 'Our team typically matches mentors within 2-3 business days')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingRequests.map(req => (
                <div key={req.id} className="flex items-start justify-between p-4 rounded-lg border bg-card">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30 ">
                        <Clock className="h-3 w-3 mr-1" />
                        {t('mentorsPage.awaitingMatch', 'Awaiting Match')}
                      </Badge>
                      <Badge variant="secondary">{getWorkspaceName(req.workspace_id)}</Badge>
                      <span className="text-xs text-muted-foreground">{format(new Date(req.created_at), 'PP')}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {req.expertise_tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
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
                    disabled={cancelRequest.isPending} loading={cancelRequest.isPending}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recommendations Panel */}
      <div className="space-y-6">
        <MentorRecommendationWidget
          requestedTags={allSelectedTagNames}
          workspaceId={workspaces?.length === 1 ? workspaces[0].id : selectedWorkspace}
          onSelectMentor={setPreferredMentorId}
          selectedMentorId={preferredMentorId}
        />

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
                <div key={req.id} className="flex items-start justify-between p-4 rounded-lg border bg-muted/30">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge 
                        variant={req.status === 'fulfilled' ? 'default' : 'secondary'}
                        className={req.status === 'fulfilled' ? 'bg-[hsl(var(--success))]' : ''}
                      >
                        {req.status === 'fulfilled' ? t('mentorsPage.fulfilled') : t('mentorsPage.cancelled')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{format(new Date(req.created_at), 'PP')}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {req.expertise_tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
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
          <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('mentorsPage.noRequestsYet')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
