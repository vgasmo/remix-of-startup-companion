import { useTranslation } from 'react-i18next';
import { Mail, Phone, User, Users, MessageSquare, Linkedin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface ResponsibleConsultantCardProps {
  workspaceId: string;
}

function ContactPersonRow({ 
  profile, 
  roleLabel, 
  roleBadgeVariant = 'secondary' 
}: { 
  profile: { full_name?: string | null; email?: string | null; avatar_url?: string | null; linkedin_url?: string | null };
  roleLabel: string;
  roleBadgeVariant?: 'secondary' | 'outline';
}) {
  const { t } = useTranslation();
  const initials = profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-11 w-11 border border-border">
        <AvatarImage src={profile?.avatar_url || undefined} />
        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{profile?.full_name || t('common.noName', 'Sem nome')}</p>
          <Badge variant={roleBadgeVariant} className="text-[10px] px-1.5 py-0 shrink-0">
            {roleLabel}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        {profile?.linkedin_url && (
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild aria-label={t('common._iconOpenLinkedin')}>
            <a href={sanitizeUrl(profile.linkedin_url)!} target="_blank" rel="noopener noreferrer">
              <Linkedin className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
        {profile?.email && (
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild aria-label={t('common.email')}>
            <a href={`mailto:${profile.email}`}>
              <Mail className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export function ResponsibleConsultantCard({ workspaceId }: ResponsibleConsultantCardProps) {
  const { t } = useTranslation();
  const { data: members, isLoading } = useWorkspaceMembers(workspaceId);

  const consultant = members?.find(m => m.role === 'consultor');
  const mentors = members?.filter(m => m.role === 'mentor_externo') || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            {t('workspace.yourTeam', 'A Sua Equipa')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasAnyone = consultant || mentors.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          {t('workspace.yourTeam', 'A Sua Equipa')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {consultant ? (
          <ContactPersonRow
            profile={consultant.profile}
            roleLabel={t('workspace.consultant', 'Consultor')}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('workspace.noConsultantAssigned', 'Sem consultor atribuído. Contacte a equipa do programa.')}
          </p>
        )}

        {mentors.length > 0 && (
          <>
            <Separator />
            {mentors.map(mentor => (
              <ContactPersonRow
                key={mentor.user_id}
                profile={mentor.profile}
                roleLabel={t('workspace.mentor', 'Mentor')}
                roleBadgeVariant="outline"
              />
            ))}
          </>
        )}

        {/* Quick actions */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" asChild>
            <Link to={`/workspace/${workspaceId}?tab=agenda`}>
              <MessageSquare className="h-3.5 w-3.5" />
              {t('workspace.bookSession', 'Agendar Sessão')}
            </Link>
          </Button>
          {mentors.length === 0 && (
            <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" asChild>
              <Link to="/mentors">
                <User className="h-3.5 w-3.5" />
                {t('workspace.requestMentor', 'Pedir Mentor')}
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}