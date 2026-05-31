/**
 * MentorProfile — public detail page for a mentor.
 * Shows mentor bio, expertise, NDA status, and connected workspaces.
 */
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Mail, Linkedin, ShieldCheck, Shield, Building2, ArrowLeft, Sparkles } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';

export default function MentorProfile() {
  const { t } = useTranslation();
  const { mentorId } = useParams<{ mentorId: string }>();
  const { isStaff } = useAuth();

  if (!mentorId) return <Navigate to="/mentors" replace />;

  const { data, isLoading } = useQuery({
    queryKey: ['mentor-profile-page', mentorId],
    queryFn: async () => {
      const [profileRes, ndaRes, wsRes] = await Promise.all([
        supabase
          .from('profiles_safe')
          .select('id, full_name, email, avatar_url, bio, expertise, linkedin_url')
          .eq('id', mentorId)
          .maybeSingle(),
        supabase.from('mentor_nda_acceptances').select('accepted_at').eq('user_id', mentorId).maybeSingle(),
        supabase
          .from('workspace_users')
          .select('active, workspace:workspaces(id, startup:startups(name))')
          .eq('user_id', mentorId)
          .eq('role', 'mentor_externo')
          .eq('active', true),
      ]);
      return {
        profile: profileRes.data as any,
        ndaAccepted: !!ndaRes.data,
        workspaces: (wsRes.data || []) as any[],
      };
    },
  });

  const profile = data?.profile;
  const fullName = profile?.full_name || profile?.email || t('mentorsPage.unnamedMentor', { defaultValue: 'Mentor' });

  return (
    <AppLayout title={fullName}>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/mentors">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back', { defaultValue: 'Voltar' })}
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !profile ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t('mentorProfile.notFound', { defaultValue: 'Mentor não encontrado.' })}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback>{fullName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-semibold">{fullName}</h1>
                  <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {profile.email && (
                      <a href={`mailto:${profile.email}`} className="inline-flex items-center gap-1 hover:text-primary">
                        <Mail className="h-3.5 w-3.5" /> {profile.email}
                      </a>
                    )}
                    {profile.linkedin_url && (
                      <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                        <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                      </a>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data?.ndaAccepted ? (
                      <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
                        <ShieldCheck className="h-3 w-3" />
                        {t('admin.mentors.ndaAccepted', { defaultValue: 'NDA aceite' })}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-amber-600 border-amber-600">
                        <Shield className="h-3 w-3" />
                        {t('admin.mentors.ndaPending', { defaultValue: 'NDA pendente' })}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {profile.bio && (
                <>
                  <Separator className="my-4" />
                  <p className="text-sm whitespace-pre-wrap">{profile.bio}</p>
                </>
              )}
              {Array.isArray(profile.expertise) && profile.expertise.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      {t('mentorProfile.expertise', { defaultValue: 'Áreas de expertise' })}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.expertise.map((tag: string) => (
                        <Badge key={tag} variant="secondary">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {isStaff && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {t('mentorProfile.workspaces', { defaultValue: 'Startups acompanhadas' })}
                  <Badge variant="outline">{data?.workspaces.length || 0}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(data?.workspaces || []).length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    {t('mentorProfile.noWorkspaces', { defaultValue: 'Sem startups atribuídas.' })}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {(data?.workspaces || []).map((wu: any, idx: number) => {
                      const wsId = wu.workspace?.id;
                      const wsName = wu.workspace?.startup?.name || t('common.unknown', { defaultValue: 'Unknown' });
                      return (
                        <li key={wsId || idx} className="p-4">
                          {wsId ? (
                            <Link to={`/workspace/${wsId}`} className="font-medium text-primary hover:underline">
                              {wsName}
                            </Link>
                          ) : (
                            <span className="font-medium">{wsName}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </AppLayout>
  );
}
