import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';
import { 
  TrendingUp, 
  Target, 
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { StageBadge } from '@/components/ui/StageBadge';
import { supabase } from '@/lib/supabaseClient';
import { HealthScore, StartupStage } from '@/types/database';

interface SharedData {
  workspace: {
    id: string;
    stage: string;
    health_score: string | null;
    startup: { name: string; description: string | null; logo_url: string | null };
    program: { name: string };
  };
  kpis: Array<{
    name: string;
    value: number;
    target_value: number | null;
    unit: string | null;
    period_month: string;
  }>;
  milestones: Array<{
    title: string;
    status: string;
    target_date: string | null;
  }>;
  updates: Array<{
    month: string;
    content_json: any;
  }>;
  scope: string;
  expires_at: string;
}

export default function SharedWorkspace() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const dateLocale = useDateLocale();

  const { data, isLoading, error } = useQuery({
    queryKey: ['shared-workspace', token],
    queryFn: async (): Promise<SharedData> => {
      const { data, error } = await supabase.functions.invoke('get-shared-workspace', {
        body: { token },
      });
      
      if (error) throw new Error(error.message);
      if (!data) throw new Error('No data returned');
      
      return data as SharedData;
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-32" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-xl font-semibold mb-2">{t('shared.accessDenied', 'Acesso Negado')}</h1>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : 'This link is invalid or has expired.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { workspace, kpis, milestones, updates, scope, expires_at } = data;

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12 rounded-xl">
                <AvatarImage src={workspace.startup.logo_url || undefined} />
                <AvatarFallback className="rounded-xl bg-primary/10 text-primary font-semibold">
                  {workspace.startup.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-xl font-bold">{workspace.startup.name}</h1>
                <p className="text-sm text-muted-foreground">{workspace.program.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StageBadge stage={workspace.stage as StartupStage} />
              <HealthBadge score={workspace.health_score as HealthScore | null} />
            </div>
          </div>
          
          {/* Shared link notice */}
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            <span>{t('shared.readOnly', 'Vista apenas de leitura')} • {t('shared.expires', 'Expira')} {format(new Date(expires_at), 'd MMM yyyy', { locale: dateLocale })}</span>
            <Badge variant="outline" className="text-xs">{scope.replace('_', ' ')}</Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Description */}
        {workspace.startup.description && (
          <Card>
            <CardContent className="py-4">
              <p className="text-muted-foreground">{workspace.startup.description}</p>
            </CardContent>
          </Card>
        )}

        {/* KPIs */}
        {(scope === 'kpis_only' || scope === 'full_readonly') && kpis.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                {t('shared.keyMetrics', 'Métricas Chave')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {kpis.map((kpi, index) => (
                  <div key={index} className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground mb-1">{kpi.name}</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{kpi.value}</span>
                      {kpi.unit && <span className="text-sm text-muted-foreground">{kpi.unit}</span>}
                    </div>
                    {kpi.target_value && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Target: {kpi.target_value}{kpi.unit || ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Milestones */}
        {scope === 'full_readonly' && milestones.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                {t('shared.milestones', 'Marcos')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {milestones.map((milestone, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      {milestone.status === 'completed' ? (
                        <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
                      ) : milestone.status === 'delayed' ? (
                        <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                      )}
                      <span className="font-medium">{milestone.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">{milestone.status.replace('_', ' ')}</Badge>
                      {milestone.target_date && (
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(milestone.target_date), 'd MMM', { locale: dateLocale })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Latest Update */}
        {(scope === 'report_only' || scope === 'full_readonly') && updates.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                {t('shared.latestUpdate', 'Última Atualização')} - {format(new Date(updates[0].month), 'MMMM yyyy')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {updates[0].content_json?.highlights && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-[hsl(var(--success))] mb-2">{t('shared.highlights', 'Destaques')}</h4>
                    <ul className="space-y-1">
                      {updates[0].content_json.highlights.map((h: string, i: number) => (
                        <li key={i} className="text-sm">{h}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {updates[0].content_json?.priorities && (
                  <div>
                    <h4 className="text-sm font-medium text-[hsl(var(--info))] mb-2">{t('shared.nextPriorities', 'Próximas Prioridades')}</h4>
                    <ul className="space-y-1">
                      {updates[0].content_json.priorities.map((p: string, i: number) => (
                        <li key={i} className="text-sm">{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer */}
      <div className="border-t bg-muted/30 py-4">
        <div className="max-w-4xl mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>{t('shared.sharedVia', 'Partilhado via Startup Leiria')}</p>
        </div>
      </div>
    </div>
  );
}
