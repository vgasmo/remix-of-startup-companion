import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ArrowRight, Target, MessageSquare, BookOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { FocusModeToggle } from '@/components/ui/FocusModeToggle';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { HealthScore } from '@/types/database';

export interface RiskItem {
  workspace: WorkspaceWithDetails;
  reason: string;
  priority: 'critical' | 'high' | 'medium';
}

interface ConsultorRiskPanelProps {
  riskItems: RiskItem[];
  onPrepSheet: (workspaceId: string) => void;
}

export const ConsultorRiskPanel = memo(function ConsultorRiskPanel({ riskItems, onPrepSheet }: ConsultorRiskPanelProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold leading-tight text-foreground">
            {t('consultor.hero.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('consultor.hero.subtitle')}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {t('consultor.hero.triageHint', { defaultValue: 'Triage diária — foque-se no que precisa de atenção hoje. Para gestão aprofundada, use o portefólio.' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FocusModeToggle />
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/my-workspaces?filter=attention')}
            className="text-muted-foreground hover:text-foreground"
          >
            {t('common.viewAll')}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {riskItems.length === 0 ? (
        <Card className="border-health-healthy/30 bg-health-healthy/5 rounded-2xl">
          <CardContent className="flex items-center gap-3 py-5">
            <div className="h-10 w-10 rounded-full bg-health-healthy/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-health-healthy" />
            </div>
            <div>
              <p className="font-medium text-foreground text-sm">
                {t('consultor.hero.allClear')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('consultor.hero.noPriorities')}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {riskItems.map((item) => {
            const health = (item.workspace.health_score_override || item.workspace.health_score) as HealthScore | null;
            return (
              <Card 
                key={item.workspace.id}
                className={`group cursor-pointer transition-all hover:shadow-sm rounded-2xl border-border/60 border-l-2 ${
                  item.priority === 'critical' ? 'border-l-health-critical' :
                  item.priority === 'high' ? 'border-l-health-at-risk' :
                  'border-l-health-stable'
                }`}
                onClick={() => navigate(`/workspace/${item.workspace.id}`)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 rounded-lg">
                      <AvatarImage src={item.workspace.startup?.logo_url || undefined} alt={item.workspace.startup?.name || 'Startup logo'} />
                      <AvatarFallback className="rounded-lg bg-muted text-muted-foreground text-xs font-semibold">
                        {item.workspace.startup?.name?.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm group-hover:text-primary group-hover:underline transition-colors">{item.workspace.startup?.name}</span>
                        {health && <HealthBadge score={health} size="sm" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.reason}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs h-7 hidden sm:inline-flex"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrepSheet(item.workspace.id);
                      }}
                    >
                      <BookOpen className="h-3 w-3 mr-1" />
                      {t('consultor.prepSheet.button', { defaultValue: 'Preparar reunião' })}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs h-7 hidden sm:inline-flex"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/workspace/${item.workspace.id}?tab=milestones-actions`);
                      }}
                    >
                      <Target className="h-3 w-3 mr-1" />
                      {t('consultor.reviewMilestone', { defaultValue: 'Rever marcos' })}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/workspace/${item.workspace.id}?tab=agenda`);
                      }}
                    >
                      <MessageSquare className="h-3 w-3 mr-1" />
                      {t('consultor.nudgeFounder', { defaultValue: 'Agendar sessão' })}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
});
