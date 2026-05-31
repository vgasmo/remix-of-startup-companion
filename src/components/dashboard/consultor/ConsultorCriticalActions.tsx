import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';

interface ConsultorCriticalActionsProps {
  criticalActions: WorkspaceWithDetails[];
}

export const ConsultorCriticalActions = memo(function ConsultorCriticalActions({ criticalActions }: ConsultorCriticalActionsProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-health-at-risk" />
            {t('consultor.actions.title')}
          </CardTitle>
          <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded-full border-health-critical/30 text-health-critical bg-health-critical/10">
            {criticalActions.reduce((sum, w) => sum + w.overdueActionsCount, 0)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {criticalActions.length === 0 ? (
          <div className="text-center py-6">
            <CheckCircle2 className="h-8 w-8 text-health-healthy/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('consultor.actions.allClear')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {criticalActions.map(w => (
              <div
                key={w.id}
                className="group flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors border-l-2 border-l-health-critical"
                onClick={() => navigate(`/workspace/${w.id}?tab=milestones-actions-actions`)}
              >
                <Avatar className="h-7 w-7 rounded">
                  <AvatarImage src={w.startup?.logo_url || undefined} alt={w.startup?.name || 'Startup logo'} />
                  <AvatarFallback className="rounded bg-primary/10 text-primary text-[10px] font-semibold">
                    {w.startup?.name?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate group-hover:text-primary group-hover:underline transition-colors">{w.startup?.name}</p>
                  <p className="text-xs text-health-critical">
                    {t('consultor.actions.overdueCount', { count: w.overdueActionsCount })}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="text-xs h-7">
                  {t('consultor.actions.resolve')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
