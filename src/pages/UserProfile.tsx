/**
 * UserProfile — staff-facing detail page for a platform user.
 * Shows profile info, roles, and workspace memberships.
 */
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Mail, Phone, Linkedin, ShieldCheck, Building2, ArrowLeft } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';

export default function UserProfile() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const { isStaff } = useAuth();

  // Hooks first. Redirects come after — early-returning before useQuery would
  // change hook order on the next render.
  const { data, isLoading } = useQuery({
    queryKey: ['user-profile-page', userId ?? 'missing'],
    enabled: !!userId && isStaff,
    queryFn: async () => {
      const [profileRes, rolesRes, wsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId!).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId!),
        supabase
          .from('workspace_users')
          .select('role, active, workspace:workspaces(id, startup:startups(name))')
          .eq('user_id', userId!),
      ]);
      return {
        profile: profileRes.data,
        roles: (rolesRes.data || []).map((r: any) => r.role as string),
        workspaces: (wsRes.data || []) as any[],
      };
    },
  });

  if (!isStaff) return <Navigate to="/my-workspaces" replace />;
  if (!userId) return <Navigate to="/admin?tab=users" replace />;


  const profile = data?.profile;
  const fullName = profile?.full_name || profile?.email || t('common.unknown', { defaultValue: 'Unknown' });

  return (
    <AppLayout title={fullName}>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin?tab=users">
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
            {t('userProfile.notFound', { defaultValue: 'Utilizador não encontrado.' })}
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
                    {profile.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" /> {profile.phone}
                      </span>
                    )}
                    {profile.linkedin_url && (
                      <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                        <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                      </a>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profile.account_status && (
                      <Badge variant="outline">{profile.account_status}</Badge>
                    )}
                    {(data?.roles || []).map((r) => (
                      <Badge key={r} variant="secondary">{t(`roles.${r}`, { defaultValue: r })}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              {profile.bio && (
                <>
                  <Separator className="my-4" />
                  <p className="text-sm whitespace-pre-wrap">{profile.bio}</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {t('userProfile.workspaces', { defaultValue: 'Workspaces' })}
                <Badge variant="outline">{data?.workspaces.length || 0}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(data?.workspaces || []).length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  {t('userProfile.noWorkspaces', { defaultValue: 'Sem workspaces associados.' })}
                </p>
              ) : (
                <ul className="divide-y">
                  {(data?.workspaces || []).map((wu: any, idx: number) => {
                    const wsId = wu.workspace?.id;
                    const wsName = wu.workspace?.startup?.name || t('common.unknown', { defaultValue: 'Unknown' });
                    return (
                      <li key={wsId || idx} className="flex items-center justify-between gap-3 p-4">
                        <div className="flex-1 min-w-0">
                          {wsId ? (
                            <Link to={`/workspace/${wsId}`} className="font-medium text-primary hover:underline">
                              {wsName}
                            </Link>
                          ) : (
                            <span className="font-medium">{wsName}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={wu.active ? 'default' : 'outline'}>
                            {wu.active
                              ? t('common.active', { defaultValue: 'Ativo' })
                              : t('common.inactive', { defaultValue: 'Inativo' })}
                          </Badge>
                          <Badge variant="secondary">{t(`roles.${wu.role}`, { defaultValue: wu.role })}</Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}
