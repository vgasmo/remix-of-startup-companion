import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import { format } from 'date-fns';
import { formatRelativeTime } from '@/lib/dateUtils';
import {
  FileText,
  CheckCircle2,
  TrendingUp,
  Target,
  Calendar,
  AlertCircle,
  Clock,
  ClipboardList
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/ui/EmptyState';


interface ActivityItem {
  id: string;
  type: 'session' | 'action' | 'kpi' | 'milestone' | 'meeting';
  title: string;
  description?: string;
  timestamp: string;
  startup?: { name: string; logo_url?: string | null };
  metadata?: Record<string, any>;
}

export function useActivityFeed(limit = 20) {
  return useQuery({
    queryKey: ['activity-feed', limit],
    queryFn: async (): Promise<ActivityItem[]> => {
      const activities: ActivityItem[] = [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7); // Last 7 days

      // Fetch recent sessions
      const { data: sessions } = await supabase
        .from('sessions')
        .select(`
          id, title, scheduled_at, notes,
          workspace:workspaces(startup:startups(name, logo_url))
        `)
        .gte('scheduled_at', cutoff.toISOString())
        .order('scheduled_at', { ascending: false })
        .limit(10);

      sessions?.forEach(s => {
        activities.push({
          id: `session-${s.id}`,
          type: 'session',
          title: s.title,
          description: s.notes?.slice(0, 100) || undefined,
          timestamp: s.scheduled_at,
          startup: (s.workspace as any)?.startup,
        });
      });

      // Fetch recently completed actions
      const { data: actions } = await supabase
        .from('action_items')
        .select(`
          id, title, completed_at, status,
          workspace:workspaces(startup:startups(name, logo_url))
        `)
        .eq('status', 'completed')
        .not('completed_at', 'is', null)
        .gte('completed_at', cutoff.toISOString())
        .order('completed_at', { ascending: false })
        .limit(10);

      actions?.forEach(a => {
        activities.push({
          id: `action-${a.id}`,
          type: 'action',
          title: a.title,
          description: 'Action completed',
          timestamp: a.completed_at!,
          startup: (a.workspace as any)?.startup,
        });
      });

      // Fetch recent KPI entries
      const { data: kpis } = await supabase
        .from('kpi_values')
        .select(`
          id, value, period_month, created_at,
          kpi_definition:kpi_definitions(name, unit),
          workspace:workspaces(startup:startups(name, logo_url))
        `)
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      kpis?.forEach(k => {
        const def = k.kpi_definition as any;
        activities.push({
          id: `kpi-${k.id}`,
          type: 'kpi',
          title: def?.name || 'KPI Update',
          description: `${k.value}${def?.unit || ''}`,
          timestamp: k.created_at,
          startup: (k.workspace as any)?.startup,
        });
      });

      // Sort by timestamp
      activities.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return activities.slice(0, limit);
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

const typeIcons = {
  session: FileText,
  action: CheckCircle2,
  kpi: TrendingUp,
  milestone: Target,
  meeting: Calendar,
};

const typeColors = {
  session: 'bg-blue-500/10 text-blue-600',
  action: 'bg-green-500/10 text-green-600',
  kpi: 'bg-purple-500/10 text-purple-600',
  milestone: 'bg-amber-500/10 text-amber-600',
  meeting: 'bg-pink-500/10 text-pink-600',
};

export function ActivityFeed() {
  const { t } = useTranslation();
  const { data: activities, isLoading } = useActivityFeed();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
            {t('dashboard.recentActivity', 'Recent Activity')}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {t('dashboard.last7Days', 'Last 7 days')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities?.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={t('dashboard.noRecentActivityTitle', { defaultValue: 'Sem atividade recente' })}
              description={t('dashboard.noRecentActivityDesc', { defaultValue: 'A sua atividade na plataforma aparecerá aqui — sessões, KPIs, ações concluídas.' })}
              variant="inline"
            />

          ) : (
            <div className="space-y-4">
              {activities?.map((activity) => {
                const Icon = typeIcons[activity.type];
                return (
                  <div key={activity.id} className="flex gap-3 group">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${typeColors[activity.type]}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{activity.title}</p>
                          {activity.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {activity.description}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatRelativeTime(activity.timestamp)}
                        </span>
                      </div>
                      {activity.startup && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Avatar className="h-4 w-4">
                            <AvatarImage src={activity.startup.logo_url || undefined} alt={activity.startup.name} />
                            <AvatarFallback className="text-[8px]">
                              {activity.startup.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground">
                            {activity.startup.name}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
