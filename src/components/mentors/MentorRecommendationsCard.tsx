import { useState } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Users, ChevronRight, Sparkles, MessageSquare, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from "@/lib/notify";

interface MentorRecommendationsCardProps {
  workspaceId: string;
  stage?: string;
  className?: string;
}

interface Mentor {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  bio: string | null;
  expertise: string[] | null;
}

/**
 * Shows recommended mentors based on stage/expertise.
 * Implements "Express Interest" flow (item I from audit).
 */
export function MentorRecommendationsCard({ workspaceId, stage, className }: MentorRecommendationsCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [showInterestDialog, setShowInterestDialog] = useState(false);
  const [selectedMentors, setSelectedMentors] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  // Fetch mentors with mentor role
  const { data: mentors, isLoading } = useQuery({
    queryKey: ['recommended-mentors', stage],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url, bio, expertise')
        .not('expertise', 'is', null)
        .limit(6);
      
      if (error) throw error;
      return (data || []) as Mentor[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Express interest mutation
  const expressInterest = useMutation({
    mutationFn: async ({ mentorIds, message }: { mentorIds: string[]; message: string }) => {
      if (!user) throw new Error('Not authenticated');
      
      // Create mentor requests for each selected mentor, including assigned_mentor_id
      const requests = mentorIds.map(mentorId => ({
        workspace_id: workspaceId,
        requested_by: user.id,
        assigned_mentor_id: mentorId,
        expertise_tags: [] as string[],
        description: message || null,
        status: 'pending',
      }));

      const { error } = await supabase
        .from('mentor_requests')
        .insert(requests);
      
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success(t('mentors.interestExpressed', 'Interest expressed! Your request has been sent.'));
      queryClient.invalidateQueries({ queryKey: ['mentor-requests'] });
      setShowInterestDialog(false);
      setSelectedMentors([]);
      setMessage('');
    },
    onError: () => {
      notify.error(t('mentors.failedToExpress', 'Failed to express interest. Please try again.'));
    },
  });

  const handleExpressInterest = () => {
    if (selectedMentors.length === 0) {
      notify.error(t('mentors.selectAtLeastOne', 'Please select at least one mentor.'));
      return;
    }
    expressInterest.mutate({ mentorIds: selectedMentors, message });
  };

  const toggleMentor = (mentorId: string) => {
    setSelectedMentors(prev => 
      prev.includes(mentorId) 
        ? prev.filter(id => id !== mentorId)
        : prev.length < 3 
          ? [...prev, mentorId]
          : prev
    );
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!mentors || mentors.length === 0) {
    return null;
  }

  const displayMentors = mentors.slice(0, 3);

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            {t('mentors.recommendedMentors', 'Recommended Mentors')}
          </CardTitle>
          <CardDescription className="text-xs">
            {t('mentors.basedOnStage', 'Based on your stage and needs')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {displayMentors.map(mentor => (
            <div
              key={mentor.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={mentor.avatar_url || undefined} />
                <AvatarFallback>
                  {mentor.full_name?.slice(0, 2).toUpperCase() || '??'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{mentor.full_name || 'Mentor'}</p>
                {mentor.expertise && mentor.expertise.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {mentor.expertise.slice(0, 2).map((skill, i) => (
                      <Badge key={i} variant="secondary" className="text-xs px-1.5 py-0">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setShowInterestDialog(true)}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              {t('mentors.expressInterest', 'Express Interest')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/mentors')}
            >
              {t('common.viewAll', 'View all')}
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Express Interest Dialog */}
      <Dialog open={showInterestDialog} onOpenChange={setShowInterestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t('mentors.expressInterestTitle', 'Express Interest in Mentors')}
            </DialogTitle>
            <DialogDescription>
              {t('mentors.expressInterestDesc', 'Select up to 3 mentors you\'d like to connect with. They\'ll be notified of your interest.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              {mentors.map(mentor => (
                <div
                  key={mentor.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedMentors.includes(mentor.id) 
                      ? 'border-primary bg-primary/5' 
                      : 'hover:bg-muted/50'
                  }`}
                  {...clickableProps(() => toggleMentor(mentor.id))}
                >
                  <Checkbox
                    checked={selectedMentors.includes(mentor.id)}
                    disabled={!selectedMentors.includes(mentor.id) && selectedMentors.length >= 3}
                  />
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={mentor.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {mentor.full_name?.slice(0, 2).toUpperCase() || '??'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{mentor.full_name || 'Mentor'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {mentor.expertise?.slice(0, 3).join(', ')}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">{t('mentors.optionalMessage', 'Message (optional)')}</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('mentors.messagePlaceholder', 'Briefly describe what you\'re looking for help with...')}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInterestDialog(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button 
              onClick={handleExpressInterest}
              disabled={selectedMentors.length === 0 || expressInterest.isPending}
            >
              <Send className="h-4 w-4 mr-1.5" />
              {expressInterest.isPending 
                ? t('common.sending', 'Sending...') 
                : t('mentors.sendRequest', 'Send Request')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
