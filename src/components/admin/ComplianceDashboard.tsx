import { useMemo, useState } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import {
  AlertCircle,
  TrendingDown,
  Calendar,
  ClipboardList,
  Download,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { useWorkspaces, ALL_WORKSPACE_STATUSES } from '@/hooks/useWorkspaces';
import { useAllPendingCheckins } from '@/hooks/useCheckins';
import { notify } from "@/lib/notify";

export function ComplianceDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: workspaces, isLoading } = useWorkspaces({}, false, ALL_WORKSPACE_STATUSES);
  const { data: pendingCheckins } = useAllPendingCheckins();
  const [expandedSection, setExpandedSection] = useState<string | null>('critical');

  // Compliance metrics
  const metrics = useMemo(() => {
    if (!workspaces) return null;

    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);

    // Overdue check-ins
    const overdueCheckins = pendingCheckins?.filter(c => c.compliance_status === 'overdue') || [];

    // Missing KPIs this month
    const missingKpis = workspaces.filter(w => !w.hasCurrentMonthKpi);

    // No sessions in 30 days
    const noRecentSessions = workspaces.filter(w => {
      if (!w.lastSession?.scheduled_at) return true;
      return new Date(w.lastSession.scheduled_at) < thirtyDaysAgo;
    });

    // Critical health
    const criticalHealth = workspaces.filter(w => 
      (w.health_score_override || w.health_score) === 'critical'
    );

    // At risk health
    const atRiskHealth = workspaces.filter(w => 
      (w.health_score_override || w.health_score) === 'at_risk'
    );

    return {
      overdueCheckins: overdueCheckins.length,
      overdueCheckinsList: overdueCheckins,
      missingKpis: missingKpis.length,
      missingKpisList: missingKpis,
      noRecentSessions: noRecentSessions.length,
      noRecentSessionsList: noRecentSessions,
      criticalHealth: criticalHealth.length,
      criticalHealthList: criticalHealth,
      atRiskHealth: atRiskHealth.length,
      atRiskHealthList: atRiskHealth,
    };
  }, [workspaces, pendingCheckins]);

  const exportCSV = () => {
    if (!workspaces) return;

    const escapeCSV = (val: string) => {
      if (val.startsWith('=') || val.startsWith('+') || val.startsWith('-') || val.startsWith('@')) {
        val = "'" + val;
      }
      return `"${val.replace(/"/g, '""')}"`;
    };

    const headers = ['Startup', 'Program', 'Stage', 'Health', 'Overdue Actions', 'Last Session', 'Status'];
    const rows = workspaces.map(w => [
      escapeCSV(w.startup?.name || 'Unknown'),
      escapeCSV(w.program?.name || 'Unknown'),
      escapeCSV(w.stage || ''),
      escapeCSV((w.health_score_override || w.health_score) || 'stable'),
      String(w.overdueActionsCount || 0),
      w.lastSession?.scheduled_at ? format(new Date(w.lastSession.scheduled_at), 'yyyy-MM-dd') : 'Never',
      'Active',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify.success(t('compliance.exported'));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const sections = [
    {
      id: 'critical',
      title: t('compliance.criticalHealth'),
      count: metrics?.criticalHealth || 0,
      icon: <AlertCircle className="h-5 w-5 text-destructive" />,
      variant: 'destructive' as const,
      list: metrics?.criticalHealthList || [],
    },
    {
      id: 'overdue-checkins',
      title: t('compliance.overdueCheckins'),
      count: metrics?.overdueCheckins || 0,
      icon: <ClipboardList className="h-5 w-5 text-amber-600" />,
      variant: 'warning' as const,
      list: metrics?.overdueCheckinsList || [],
    },
    {
      id: 'missing-kpis',
      title: t('compliance.missingKpis'),
      count: metrics?.missingKpis || 0,
      icon: <TrendingDown className="h-5 w-5 text-amber-600" />,
      variant: 'warning' as const,
      list: metrics?.missingKpisList || [],
    },
    {
      id: 'no-sessions',
      title: t('compliance.noRecentSessions'),
      count: metrics?.noRecentSessions || 0,
      icon: <Calendar className="h-5 w-5 text-muted-foreground" />,
      variant: 'default' as const,
      list: metrics?.noRecentSessionsList || [],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {sections.map(section => (
          <Card 
            key={section.id}
            className={`cursor-pointer transition-colors hover:bg-muted/50 ${expandedSection === section.id ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {section.icon}
                  <div>
                    <p className="text-2xl font-bold">{section.count}</p>
                    <p className="text-sm text-muted-foreground">{section.title}</p>
                  </div>
                </div>
                <ChevronRight className={`h-5 w-5 transition-transform ${expandedSection === section.id ? 'rotate-90' : ''}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detail Panel */}
      {expandedSection && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{sections.find(s => s.id === expandedSection)?.title}</CardTitle>
              <CardDescription>{t('compliance.drillDown')}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-2" />
              {t('compliance.exportCsv')}
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {sections.find(s => s.id === expandedSection)?.list.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>{t('compliance.noIssues')}</p>
                  </div>
                ) : (
                  sections.find(s => s.id === expandedSection)?.list.map((item: any) => (
                    <div 
                      key={item.id || item.workspace_id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                      {...clickableProps(() => navigate(`/workspace/${item.id || item.workspace_id}`))}
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-medium">{item.startup?.name || item.startup_name || 'Unknown'}</p>
                          <p className="text-sm text-muted-foreground">{item.program?.name || item.program_name || ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.health_score && <HealthBadge score={item.health_score} size="sm" />}
                        {item.compliance_status && (
                          <Badge variant={item.compliance_status === 'overdue' ? 'destructive' : 'secondary'}>
                            {item.compliance_status}
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
