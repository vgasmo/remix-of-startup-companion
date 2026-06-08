/**
 * MentorImpact — dedicated impact dashboard page for mentors.
 * Consolidates: hours/sessions, startups helped, open loops, feedback.
 * Reuses existing MentorImpactDashboard + MentorOpenLoops.
 */
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { MentorImpactDashboard } from '@/components/mentors/MentorImpactDashboard';
import { MentorOpenLoops } from '@/components/mentor/MentorOpenLoops';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { BackToHomeLink } from '@/components/ui/BackToHomeLink';
import { DownloadHtmlReportButton } from '@/components/shared/DownloadHtmlReportButton';
import { supabase } from '@/lib/supabaseClient';

function MentorFeedbackCard({ mentorId }: { mentorId: string }) {
  const { t } = useTranslation();
  // Recent public feedback for sessions in workspaces this mentor belongs to.
  const { data, isLoading } = useQuery({
    queryKey: ['mentor-recent-feedback', mentorId],
    queryFn: async () => {
      // workspaces where the mentor is an active member
      const { data: ws } = await supabase
        .from('workspace_users')
        .select('workspace_id')
        .eq('user_id', mentorId)
        .eq('role', 'mentor_externo')
        .eq('active', true);
      const wsIds = (ws ?? []).map((w: any) => w.workspace_id);
      if (wsIds.length === 0) return [];

      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, title, scheduled_at, workspace_id')
        .in('workspace_id', wsIds)
        .order('scheduled_at', { ascending: false })
        .limit(50);
      const sessionIds = (sessions ?? []).map((s: any) => s.id);
      if (sessionIds.length === 0) return [];

      const { data: fb } = await supabase
        .from('session_feedback')
        .select('id, rating, feedback, created_at, session_id, is_public')
        .in('session_id', sessionIds)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(5);
      const sessionMap = new Map((sessions ?? []).map((s: any) => [s.id, s]));
      return (fb ?? []).map((f: any) => ({ ...f, session: sessionMap.get(f.session_id) }));
    },
    enabled: !!mentorId,
  });

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('mentorImpact.feedbackTitle', 'Feedback recente')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('mentorImpact.noFeedback', 'Ainda sem feedback público das sessões.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('mentorImpact.feedbackTitle', 'Feedback recente')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {data.map((f: any) => (
            <li key={f.id} className="border-l-2 border-primary/40 pl-3">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium">{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {f.session?.title ?? t('common.session', 'Sessão')}
                </span>
              </div>
              {f.feedback ? (
                <p className="text-sm text-foreground/80">{f.feedback}</p>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  {t('mentorImpact.noComment', 'Sem comentário escrito')}
                </p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function MentorImpact() {
  const { t } = useTranslation();
  const { user, roles, isAuthReady } = useAuth();
  const isMentor = roles.includes('mentor_externo');
  const isStaff = roles.includes('admin') || roles.includes('consultor');

  const { data: workspaces, isLoading: wsLoading } = useWorkspaces();

  if (isAuthReady && !isMentor && !isStaff) {
    return <Navigate to="/my-workspaces" replace />;
  }

  return (
    <AppLayout title={t('mentorImpact.pageTitle', 'O Seu Impacto')}>
      <div className="space-y-6 max-w-5xl">
        <BackToHomeLink />

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">
                {t('mentorImpact.pageTitle', 'O Seu Impacto')}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              {t(
                'mentorImpact.pageDesc',
                'Visão consolidada das suas sessões, startups ativas, follow-ups por fechar e feedback recebido.'
              )}
            </p>
          </div>
          {isMentor && (
            <DownloadHtmlReportButton
              functionName="generate-mentor-impact-report"
              label={t('mentorImpact.downloadReport', 'Descarregar relatório de impacto')}
              variant="outline"
            />
          )}
        </div>

        <MentorImpactDashboard />

        {wsLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <MentorOpenLoops workspaces={(workspaces ?? []) as any} />
        )}

        {user?.id && <MentorFeedbackCard mentorId={user.id} />}
      </div>
    </AppLayout>
  );
}
