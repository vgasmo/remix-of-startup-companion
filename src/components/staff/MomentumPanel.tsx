import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Activity, ArrowRight } from 'lucide-react';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import { useWorkspaceMomentum } from '@/hooks/useWorkspaceMomentum';
import { MomentumBadge } from '@/components/shared/MomentumBadge';
import type { WorkspaceWithDetails } from '@/hooks/useWorkspaces';

interface MomentumPanelProps {
  workspaces: WorkspaceWithDetails[];
  /** Cap the list. Default 8. */
  limit?: number;
  /** Title override. */
  title?: string;
}

const SIGNAL_TONE: Record<'good' | 'warn' | 'bad', string> = {
  good: 'bg-success/10 text-success border-success/30',
  warn: 'bg-warning/10 text-warning border-warning/30',
  bad: 'bg-destructive/10 text-destructive border-destructive/30',
};

function MomentumPanelInner({ workspaces, limit = 8, title }: MomentumPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const all = useWorkspaceMomentum(workspaces);

  // Lowest momentum first; only show items that have something to show.
  const visible = useMemo(() => all.slice(0, limit), [all, limit]);

  if (visible.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          {title ?? t('momentum.panelTitle', { defaultValue: 'Momentum das startups' })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {visible.map(m => {
            const ws = workspaces.find(w => w.id === m.workspaceId);
            if (!ws) return null;
            const name = ws.startup?.name ?? '—';
            const logo = ws.startup?.logo_url ?? undefined;
            return (
              <li
                key={m.workspaceId}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 p-3 hover:bg-accent/40 transition-colors"
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={logo} alt={name} />
                  <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{name}</span>
                    <MomentumBadge band={m.band} score={m.momentumScore} size="sm" />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {m.signals.slice(0, 2).map(sig => (
                      <Badge
                        key={sig.key}
                        variant="outline"
                        className={`${SIGNAL_TONE[sig.status]} text-[10px] h-5 px-1.5 font-normal`}
                      >
                        {sig.label}: {sig.detail}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1 text-xs"
                  onClick={() => navigate(m.recommendedAction.href)}
                >
                  {m.recommendedAction.label}
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </li>
            );
          })}
        </ul>
        {all.length > visible.length && (
          <div className="mt-3 text-right">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => navigate('/ecosystem')}
            >
              {t('momentum.viewAll', { defaultValue: 'Ver todas' })} ({all.length})
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MomentumPanel(props: MomentumPanelProps) {
  return (
    <WidgetErrorBoundary widgetName="MomentumPanel">
      <MomentumPanelInner {...props} />
    </WidgetErrorBoundary>
  );
}
