import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTimeEntrySummary } from '@/hooks/useTimeTracking';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Star, Users, TrendingUp, Calendar, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface MentorImpact {
  mentor_id: string;
  sessions_attended: number;
  startups_supported: number;
  hours_logged: number;
  open_followups: number;
  avg_rating: number | null;
  rating_count: number;
}

// Sole source of truth for mentor impact metrics — the `get_mentor_impact`
// RPC joins sessions/time_entries/feedback/action_items on the server and
// enforces mentor-or-admin visibility so cross-attribution is impossible.
function useMentorImpact(mentorId: string | undefined, from?: string, to?: string) {
  return useQuery({
    queryKey: ['mentor-impact', mentorId, from, to],
    enabled: !!mentorId,
    queryFn: async (): Promise<MentorImpact | null> => {
      if (!mentorId) return null;
      const { data, error } = await supabase.rpc('get_mentor_impact', {
        p_mentor_id: mentorId,
        p_from: from ?? null,
        p_to: to ?? null,
      });
      if (error) throw error;
      return (data as unknown as MentorImpact) ?? null;
    },
  });
}

function useMentorMonthlyTarget(mentorId: string | undefined) {
  return useQuery({
    queryKey: ['mentor-monthly-target', mentorId],
    enabled: !!mentorId,
    queryFn: async (): Promise<number> => {
      if (!mentorId) return 20;
      const { data, error } = await supabase
        .from('profiles')
        .select('mentor_monthly_target_hours')
        .eq('id', mentorId)
        .maybeSingle();
      if (error) throw error;
      const raw = (data as { mentor_monthly_target_hours?: number } | null)?.mentor_monthly_target_hours;
      return typeof raw === 'number' && raw > 0 ? raw : 20;
    },
  });
}

// Month window in ISO date strings (yyyy-mm-dd) for the current calendar month.
function currentMonthWindow(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

export function MentorImpactDashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const { from: monthFrom, to: monthTo } = currentMonthWindow();

  // Lifetime totals (all-time) and current-month numbers side by side.
  const lifetime = useMentorImpact(user?.id);
  const thisMonth = useMentorImpact(user?.id, monthFrom, monthTo);
  const { data: monthlyGoal = 20, isLoading: loadingTarget } = useMentorMonthlyTarget(user?.id);

  // We still fetch the per-workspace breakdown from time entries because the
  // RPC intentionally does not return per-startup rows (kept lean for perf).
  const { data: timeSummary, isLoading: loadingTime } = useTimeEntrySummary();

  const isLoading =
    lifetime.isLoading || thisMonth.isLoading || loadingTarget || loadingTime;

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const totalHours = lifetime.data?.hours_logged ?? 0;
  const monthHours = thisMonth.data?.hours_logged ?? 0;
  const startupsHelped = lifetime.data?.startups_supported ?? 0;
  const avgRating = lifetime.data?.avg_rating ?? null;
  const ratingCount = lifetime.data?.rating_count ?? 0;
  const openFollowups = lifetime.data?.open_followups ?? 0;

  const monthlyProgress = monthlyGoal > 0 ? (monthHours / monthlyGoal) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          {t('mentor.yourImpact', 'O Teu Impacto')}
        </h2>
      </div>

      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between divide-x divide-border">
            <div className="flex-1 text-center px-3">
              <div className="flex items-center justify-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-xl font-bold">{totalHours.toFixed(0)}h</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('common.total', 'Total')}</p>
            </div>

            <div className="flex-1 text-center px-3">
              <div className="flex items-center justify-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-xl font-bold">{monthHours.toFixed(0)}h</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('common.thisMonth', 'Este mês')}</p>
            </div>

            <div className="flex-1 text-center px-3">
              <div className="flex items-center justify-center gap-1.5">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-xl font-bold">{startupsHelped}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('common.startups', 'Startups')}</p>
            </div>

            <div className="flex-1 text-center px-3">
              <div className="flex items-center justify-center gap-1.5">
                <Star className="h-4 w-4 text-accent-foreground" />
                <span className="text-xl font-bold">
                  {avgRating != null ? avgRating.toFixed(1) : '-'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {ratingCount} {t('mentor.reviews', 'avaliações')}
              </p>
            </div>

            <div className="flex-1 text-center px-3">
              <div className="flex items-center justify-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-xl font-bold">{openFollowups}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('mentor.openFollowups', { defaultValue: 'Seguimentos abertos' })}
              </p>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t('mentor.monthlyGoal', 'Objetivo mensal')} · {monthHours.toFixed(1)}h / {monthlyGoal}h
              </span>
              <Progress value={Math.min(monthlyProgress, 100)} className="h-1.5 flex-1" />
              <span className="text-xs font-medium">{Math.round(monthlyProgress)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {timeSummary?.byWorkspace.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('mentor.hoursByStartup', 'Horas por Startup')}</CardTitle>
            <CardDescription>{t('mentor.timeBreakdown', 'Distribuição do tempo investido')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {timeSummary.byWorkspace
                .sort((a, b) => b.hours - a.hours)
                .map(ws => (
                  <div key={ws.workspace_id} className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{ws.name}</p>
                      <Progress
                        value={
                          timeSummary.totalHours > 0
                            ? (ws.hours / timeSummary.totalHours) * 100
                            : 0
                        }
                        className="h-2 mt-1"
                      />
                    </div>
                    <span className="text-sm font-medium whitespace-nowrap">{ws.hours.toFixed(1)}h</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

