import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart3, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PipelineData {
  newLeads: number;
  contracted: number;
  total: number;
  needsAction: number;
}

interface ConsultorPipelineSnapshotProps {
  pipelineSnapshot: PipelineData | null;
}

export const ConsultorPipelineSnapshot = memo(function ConsultorPipelineSnapshot({ pipelineSnapshot }: ConsultorPipelineSnapshotProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            {t('consultor.pipeline.title')}
          </CardTitle>
          <Button 
            variant="default" 
            size="sm" 
            className="h-7 text-xs"
            onClick={() => navigate('/crm')}
          >
            {t('consultor.pipeline.open')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {!pipelineSnapshot ? (
          <div className="text-center py-6">
            <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('consultor.pipeline.empty')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-background/80">
                <p className="text-2xl font-bold">{pipelineSnapshot.total}</p>
                <p className="text-xs text-muted-foreground">{t('consultor.pipeline.totalLeads')}</p>
              </div>
              <div className="p-3 rounded-lg bg-health-healthy/10">
                <p className="text-2xl font-bold text-health-healthy">{pipelineSnapshot.contracted}</p>
                <p className="text-xs text-muted-foreground">{t('consultor.pipeline.contracted')}</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('consultor.pipeline.newLeads')}</span>
              <Badge variant="secondary">{pipelineSnapshot.newLeads}</Badge>
            </div>
            {pipelineSnapshot.needsAction > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-health-at-risk/10 border border-health-at-risk/30">
                <AlertCircle className="h-4 w-4 text-health-at-risk" />
                <span className="text-xs text-health-at-risk">
                  {t('consultor.pipeline.needsAction', { count: pipelineSnapshot.needsAction })}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
