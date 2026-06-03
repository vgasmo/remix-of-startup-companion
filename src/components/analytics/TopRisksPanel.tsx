import { useMemo } from 'react';
import { clickableProps } from '@/lib/clickable';

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, TrendingDown, Calendar, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface RiskMetric {
  label: string;
  count: number;
  icon: React.ReactNode;
  severity: 'critical' | 'warning' | 'info';
  workspaceIds?: string[];
}

interface WorkspaceData {
  id: string;
  startup?: { name: string };
  health_label?: string | null;
  last_session_date?: string | null;
  missing_kpis_count?: number;
}

interface TopRisksPanelProps {
  workspaces: WorkspaceData[];
  onDrillDown?: (workspaceIds: string[]) => void;
}

export function TopRisksPanel({ workspaces, onDrillDown }: TopRisksPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const riskMetrics = useMemo((): RiskMetric[] => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Critical health workspaces
    const criticalHealthIds = workspaces
      .filter(w => {
        const label = w.health_label?.toLowerCase();
        return label === 'critical';
      })
      .map(w => w.id);

    // No sessions in 30 days
    const noSessionsIds = workspaces
      .filter(w => {
        if (!w.last_session_date) return true;
        return new Date(w.last_session_date) < thirtyDaysAgo;
      })
      .map(w => w.id);

    // Missing KPIs (runway specifically if tracked, or any missing)
    const missingKpisIds = workspaces
      .filter(w => (w.missing_kpis_count || 0) > 0)
      .map(w => w.id);

    return [
      {
        label: t('topRisks.criticalHealth', 'Critical Health'),
        count: criticalHealthIds.length,
        icon: <AlertTriangle className="h-4 w-4" />,
        severity: 'critical',
        workspaceIds: criticalHealthIds,
      },
      {
        label: t('topRisks.noSessions30d', 'No Sessions (30d)'),
        count: noSessionsIds.length,
        icon: <Calendar className="h-4 w-4" />,
        severity: 'warning',
        workspaceIds: noSessionsIds,
      },
      {
        label: t('topRisks.missingKpis', 'Missing KPIs'),
        count: missingKpisIds.length,
        icon: <TrendingDown className="h-4 w-4" />,
        severity: 'info',
        workspaceIds: missingKpisIds,
      },
    ];
  }, [workspaces, t]);

  const handleCopyTable = () => {
    const headers = ['Metric', 'Count'];
    const rows = riskMetrics.map(m => [m.label, m.count.toString()]);
    const tableText = [headers, ...rows].map(row => row.join('\t')).join('\n');
    
    navigator.clipboard.writeText(tableText);
    setCopied(true);
    toast({
      title: t('common.copied', 'Copied'),
      description: t('topRisks.tableCopied', 'Risk summary copied to clipboard'),
    });
    
    setTimeout(() => setCopied(false), 2000);
  };

  const getSeverityColor = (severity: RiskMetric['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-destructive text-destructive-foreground';
      case 'warning':
        return 'bg-warning text-warning-foreground';
      case 'info':
        return 'bg-muted text-muted-foreground';
    }
  };

  const totalRisks = riskMetrics.reduce((sum, m) => sum + m.count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {t('topRisks.title', 'Top Risks')}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyTable}
            className="h-8"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {totalRisks === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('topRisks.noRisks', 'No critical risks detected')} 🎉
          </p>
        ) : (
          riskMetrics.map((metric, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
              {...clickableProps(() => {
                if (metric.workspaceIds?.length && onDrillDown) {
                  onDrillDown(metric.workspaceIds);
                }
              })}
            >

              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${getSeverityColor(metric.severity)}`}>
                  {metric.icon}
                </div>
                <span className="text-sm font-medium">{metric.label}</span>
              </div>
              
              <Badge 
                variant={metric.count > 0 ? 'destructive' : 'secondary'}
                className="text-sm"
              >
                {metric.count}
              </Badge>
            </div>
          ))
        )}
        
        {/* Summary */}
        <div className="pt-3 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t('topRisks.totalWorkspacesAtRisk', 'Total workspaces at risk')}
            </span>
            <Badge variant={totalRisks > 0 ? 'destructive' : 'default'}>
              {new Set(riskMetrics.flatMap(m => m.workspaceIds || [])).size}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
