import { useMemo } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Star, Calendar, Award, Sparkles, User } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { cn } from '@/lib/utils';

interface Mentor {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  bio: string | null;
  expertise: string[] | null;
  linkedin_url: string | null;
}

interface MentorWithScore extends Mentor {
  matchScore: number;
  overlapTags: string[];
  hasAvailability: boolean;
  sessionCount: number;
}

interface MentorRecommendationWidgetProps {
  requestedTags: string[];
  workspaceId?: string;
  onSelectMentor?: (mentorId: string) => void;
  selectedMentorId?: string | null;
  className?: string;
}

export function MentorRecommendationWidget({
  requestedTags,
  workspaceId,
  onSelectMentor,
  selectedMentorId,
  className,
}: MentorRecommendationWidgetProps) {
  const { t } = useTranslation();

  // Fetch mentors with mentor_externo role
  const { data: mentors, isLoading: loadingMentors } = useQuery({
    queryKey: ['mentors-for-matching'],
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
        .select('id, full_name, email, avatar_url, bio, expertise, linkedin_url')
        .in('id', mentorIds);
      
      if (profilesError) throw profilesError;
      return (profiles || []) as Mentor[];
    },
  });

  // Fetch availability data
  const { data: availabilityData } = useQuery({
    queryKey: ['mentor-availability-check'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mentor_availability')
        .select('mentor_id')
        .eq('is_active', true);
      
      if (error) throw error;
      return new Set((data || []).map(d => d.mentor_id));
    },
    enabled: !!mentors?.length,
  });

  // Calculate ranked mentors based on matching
  const rankedMentors = useMemo((): MentorWithScore[] => {
    const sessionCounts: Record<string, number> = {}; // Simplified - no session tracking
    if (!mentors?.length || !requestedTags.length) return [];

    const normalizeTag = (tag: string) => tag.toLowerCase().trim();
    const requestedNormalized = requestedTags.map(normalizeTag);

    return mentors
      .map(mentor => {
        const mentorExpertise = (mentor.expertise || []).map(normalizeTag);
        
        // Calculate overlap
        const overlapTags = requestedNormalized.filter(tag => 
          mentorExpertise.some(exp => 
            exp.includes(tag) || tag.includes(exp)
          )
        );
        
        const overlapScore = overlapTags.length / requestedNormalized.length;
        const hasAvailability = availabilityData?.has(mentor.id) || false;
        const sessionCount = sessionCounts?.[mentor.id] || 0;
        
        // Weighted score: overlap (60%) + availability (20%) + experience (20%)
        const availabilityBonus = hasAvailability ? 0.2 : 0;
        const experienceBonus = Math.min(sessionCount / 10, 1) * 0.2; // Cap at 10 sessions
        
        const matchScore = overlapScore * 0.6 + availabilityBonus + experienceBonus;
        
        return {
          ...mentor,
          matchScore,
          overlapTags,
          hasAvailability,
          sessionCount,
        };
      })
      .filter(m => m.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5); // Top 5 recommendations
  }, [mentors, requestedTags, availabilityData]);

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  const getScoreBadge = (score: number) => {
    if (score >= 0.8) return { label: t('mentors.excellentMatch', 'Excellent Match'), variant: 'default' as const, className: 'bg-[hsl(var(--success))]' };
    if (score >= 0.5) return { label: t('mentors.goodMatch', 'Good Match'), variant: 'default' as const, className: 'bg-[hsl(var(--info))]' };
    return { label: t('mentors.partialMatch', 'Partial Match'), variant: 'secondary' as const, className: '' };
  };

  if (loadingMentors) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            {t('mentors.recommendations', 'Recommended Mentors')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ContentSkeleton type="list" count={3} />
        </CardContent>
      </Card>
    );
  }

  if (!requestedTags.length) {
    return (
      <Card className={cn("border-dashed", className)}>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('mentors.selectExpertiseFirst', 'Select expertise areas to see recommendations')}</p>
        </CardContent>
      </Card>
    );
  }

  if (!rankedMentors.length) {
    return (
      <Card className={cn("border-dashed", className)}>
        <CardContent className="py-8 text-center text-muted-foreground">
          <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('mentors.noMatchingMentors', 'No mentors match the selected expertise')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('mentors.recommendations', 'Recommended Mentors')}
        </CardTitle>
        <CardDescription>
          {t('mentors.recommendationsDesc', 'Based on expertise match and availability')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rankedMentors.map((mentor, idx) => {
          const scoreBadge = getScoreBadge(mentor.matchScore);
          const isSelected = selectedMentorId === mentor.id;
          
          return (
            <div
              key={mentor.id}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50",
                isSelected && "border-primary bg-primary/5"
              )}
              {...clickableProps(() => onSelectMentor?.(mentor.id))}
            >
              <div className="relative">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={mentor.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">
                    {getInitials(mentor.full_name, mentor.email)}
                  </AvatarFallback>
                </Avatar>
                {idx === 0 && (
                  <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[hsl(var(--warning))] flex items-center justify-center">
                    <Star className="h-2.5 w-2.5 text-white fill-white" />
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm truncate">
                    {mentor.full_name || mentor.email}
                  </span>
                  <Badge 
                    variant={scoreBadge.variant} 
                    className={cn("text-[10px] px-1.5 py-0", scoreBadge.className)}
                  >
                    {scoreBadge.label}
                  </Badge>
                </div>
                
                {mentor.overlapTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {mentor.overlapTags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {mentor.hasAvailability && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {t('mentors.available', 'Available')}
                    </span>
                  )}
                  {mentor.sessionCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Award className="h-3 w-3" />
                      {mentor.sessionCount} {t('mentors.sessions', 'sessions')}
                    </span>
                  )}
                </div>
              </div>
              
              {isSelected && (
                <div className="flex-shrink-0">
                  <Badge variant="default" className="text-xs">
                    {t('common.selected', 'Selected')}
                  </Badge>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
