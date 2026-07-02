import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, MessageSquare, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useRecomputeHealth, useUpdateHealthNotes, type HealthComputationResult } from '@/hooks/useHealthScore';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { notify } from "@/lib/notify";
import type { Database } from '@/integrations/supabase/types';

type HealthScore = Database['public']['Enums']['health_score'];

interface HealthScorePanelProps {
  workspaceId: string;
  healthScore: HealthScore | null;
  healthStatus: string | null;
  healthNotes: string | null;
  canWrite: boolean;
}

export function HealthScorePanel({
  workspaceId,
  healthScore,
  healthStatus,
  healthNotes,
  canWrite,
}: HealthScorePanelProps) {
  const { t } = useTranslation();
  const recomputeHealth = useRecomputeHealth(workspaceId);
  const updateHealthNotes = useUpdateHealthNotes(workspaceId);
  
  const [showNotesEditor, setShowNotesEditor] = useState(false);
  const [editedNotes, setEditedNotes] = useState(healthNotes || '');
  const [lastComputation, setLastComputation] = useState<HealthComputationResult | null>(null);

  const handleRecompute = async () => {
    try {
      const result = await recomputeHealth.mutateAsync();
      setLastComputation(result.computation);
      notify.success(t('workspace.healthScoreRecomputed'));
    } catch {
      notify.error(t('workspace.failedToRecomputeHealthScore'));
    }
  };

  const handleSaveNotes = async () => {
    try {
      await updateHealthNotes.mutateAsync(editedNotes || null);
      notify.success(t('workspace.healthNotesSaved'));
      setShowNotesEditor(false);
    } catch {
      notify.error(t('workspace.failedToSaveNotes'));
    }
  };

  const handleCancelNotes = () => {
    setEditedNotes(healthNotes || '');
    setShowNotesEditor(false);
  };

  // Softer status colors - using muted tones to reduce visual noise
  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'green': return 'bg-health-healthy/10 text-health-healthy border-health-healthy/20';
      case 'yellow': return 'bg-health-at-risk/10 text-health-at-risk border-health-at-risk/20';
      case 'red': return 'bg-health-critical/10 text-health-critical border-health-critical/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{t('health.title', 'Health Score')}</CardTitle>
          {canWrite && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRecompute}
              disabled={recomputeHealth.isPending} loading={recomputeHealth.isPending}
              className="h-7 text-xs"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${recomputeHealth.isPending ? 'animate-spin' : ''}`} />
              Recompute
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score Display */}
        <div className="flex items-center gap-3">
          <HealthBadge score={healthScore} size="lg" />
          {healthStatus && (
            <Badge variant="outline" className={`${getStatusColor(healthStatus)} text-xs font-medium`}>
              {healthStatus === 'green' ? 'Saudável' : healthStatus === 'yellow' ? 'Atenção' : healthStatus === 'red' ? 'Crítico' : healthStatus}
            </Badge>
          )}
        </div>

        {/* Last Computation Results */}
        {lastComputation && (
          <div className="text-xs space-y-1 p-2 bg-muted/50 rounded-lg">
            <div className="font-medium">{t('health.latestComputation', { score: lastComputation.score, defaultValue: 'Última computação ({{score}}/100):' })}</div>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              {lastComputation.reasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Health Notes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t('health.notes', 'Notas de Health')}</span>
            {canWrite && !showNotesEditor && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowNotesEditor(true)}
                className="h-6 text-xs"
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                {healthNotes ? t('common.edit', 'Edit') : t('healthScore.addNote', 'Add note')}
              </Button>
            )}
          </div>

          {showNotesEditor ? (
            <div className="space-y-2">
              <Textarea
                value={editedNotes}
                onChange={e => setEditedNotes(e.target.value)}
                placeholder={t('healthScore.addContextPlaceholder', 'Add context about the health score (e.g., reasons for override, action plan)...')}
                rows={3}
                className="text-sm"
              />
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  onClick={handleSaveNotes}
                  disabled={updateHealthNotes.isPending} loading={updateHealthNotes.isPending}
                  className="h-7"
                >
                  <Check className="h-3 w-3 mr-1" />
                  Save
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleCancelNotes}
                  className="h-7"
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : healthNotes ? (
            <div className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">
              {healthNotes}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">
              No notes added
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
