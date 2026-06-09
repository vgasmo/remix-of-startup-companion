import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Flag, Trophy, Calendar, TrendingUp } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

interface FounderStoryTimelineProps {
  workspaceId: string;
}

interface StoryEvent {
  date: string;
  kind: 'milestone' | 'session' | 'stage' | 'kpi';
  title: string;
  detail?: string;
}

/**
 * FounderStoryTimeline — narrative "story over time" view for founders.
 * Aggregates milestones, completed sessions, stage transitions, and KPI submissions
 * into a single chronological storyboard.
 */
export function FounderStoryTimeline({ workspaceId }: FounderStoryTimelineProps) {
  const { t } = useTranslation();

  const { data: events, isLoading } = useQuery({
    queryKey: ['founder-story', workspaceId],
    queryFn: async (): Promise<StoryEvent[]> => {
      const [ms, ss, st, kp] = await Promise.all([
        (supabase as any)
          .from('milestones')
          .select('title, completed_at, status')
          .eq('workspace_id', workspaceId)
          .eq('status', 'completed')
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(20),
        (supabase as any)
          .from('sessions')
          .select('title, scheduled_at, status')
          .eq('workspace_id', workspaceId)
          .eq('status', 'completed')
          .order('scheduled_at', { ascending: false })
          .limit(20),
        (supabase as any)
          .from('stage_history')
          .select('to_stage, changed_at')
          .eq('workspace_id', workspaceId)
          .order('changed_at', { ascending: false })
          .limit(10),
        (supabase as any)
          .from('kpi_values')
          .select('period_month, value, kpi_definition_id, kpi_definitions(name)')
          .eq('workspace_id', workspaceId)
          .order('period_month', { ascending: false })
          .limit(10),
      ]);

      // Surface partial failures so we don't render an "empty story" because one query died.
      const checks: Array<[string, { error: unknown }]> = [
        ['milestones', ms], ['sessions', ss], ['stage_history', st], ['kpi_values', kp],
      ];
      for (const [name, res] of checks) {
        if (res?.error) {
          logger.warn('founder_story_partial_failure', { workspaceId, source: name, error: String(res.error) });
        }
      }

      const out: StoryEvent[] = [];
      (ms.data ?? []).forEach((m: any) => out.push({
        date: m.completed_at, kind: 'milestone', title: m.title,
      }));
      (ss.data ?? []).forEach((s: any) => out.push({
        date: s.scheduled_at, kind: 'session', title: s.title,
      }));
      (st.data ?? []).forEach((s: any) => out.push({
        date: s.changed_at, kind: 'stage', title: `→ ${s.to_stage}`,
      }));
      (kp.data ?? []).forEach((k: any) => out.push({
        date: k.period_month, kind: 'kpi', title: k.kpi_definitions?.name || 'KPI',
        detail: k.value != null ? String(k.value) : undefined,
      }));

      return out
        .filter(e => !!e.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 30);
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!events || events.length === 0) {
    return (
      <EmptyState
        illustration="rocket"
        title={t('story.title', 'A tua história')}
        description={t('story.empty', 'A tua história começa quando completares o primeiro marco, sessão ou KPI.')}
      />
    );
  }

  const iconFor = (kind: StoryEvent['kind']) => {
    switch (kind) {
      case 'milestone': return <Flag className="h-4 w-4" />;
      case 'session': return <Calendar className="h-4 w-4" />;
      case 'stage': return <Trophy className="h-4 w-4" />;
      case 'kpi': return <TrendingUp className="h-4 w-4" />;
    }
  };

  const labelFor = (kind: StoryEvent['kind']) => {
    return t(`story.kind.${kind}`, { defaultValue: kind });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('story.title', 'A tua história')}
        </CardTitle>
        <CardDescription>
          {t('story.desc', 'Linha do tempo da jornada — marcos, sessões e progresso.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="relative border-l border-border ml-2 space-y-4">
          {events.map((e, i) => (
            <li key={i} className="ml-6">
              <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary ring-2 ring-background">
                {iconFor(e.kind)}
              </span>
              <div className="flex flex-wrap items-baseline gap-2">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">{labelFor(e.kind)}</Badge>
                <p className="text-sm font-medium">{e.title}</p>
                {e.detail && <span className="text-xs text-muted-foreground">{e.detail}</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(e.date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
