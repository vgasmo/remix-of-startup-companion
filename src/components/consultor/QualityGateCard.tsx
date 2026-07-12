import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, CheckCircle2, AlertTriangle, XCircle, RefreshCw, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useQualityCheckResult, useComputeQualityScore, useWorkspaceQualityMode } from '@/hooks/useQualityGates';
import { cn } from '@/lib/utils';

interface QualityGateCardProps {
  entityType: 'session' | 'proposal' | 'followup';
  entityId: string;
  entityData: Record<string, unknown>;
  workspaceId: string;
  onScoreComputed?: (score: number, isBlocking: boolean) => void;
}

export function QualityGateCard({ entityType, entityId, entityData, workspaceId, onScoreComputed }: QualityGateCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { data: result, isLoading } = useQualityCheckResult(entityType, entityId);
  const { data: qualityMode } = useWorkspaceQualityMode(workspaceId);
  const computeMutation = useComputeQualityScore();
  const isStrict = qualityMode === 'strict';

  // Keep onScoreComputed in a ref so changing identity doesn't re-trigger effects.
  const onScoreComputedRef = useRef(onScoreComputed);
  useEffect(() => { onScoreComputedRef.current = onScoreComputed; }, [onScoreComputed]);

  // Auto-compute once when there's no cached result and we're idle.
  useEffect(() => {
    if (!result && !isLoading && entityId && !computeMutation.isPending && !computeMutation.isError) {
      computeMutation.mutate({ entityType, entityId, entityData });
    }
  }, [entityId, result, isLoading, computeMutation.isPending, computeMutation.isError]);

  // Fire score-computed only when the score itself changes.
  const lastReportedScoreRef = useRef<number | null>(null);
  useEffect(() => {
    if (result && lastReportedScoreRef.current !== result.score) {
      lastReportedScoreRef.current = result.score;
      const isBlocking = isStrict && result.score < 70;
      onScoreComputedRef.current?.(result.score, isBlocking);
    }
  }, [result, isStrict]);

  const handleRecompute = () => { computeMutation.reset(); computeMutation.mutate({ entityType, entityId, entityData }); };

  const getScoreColor = (score: number) => { if (score >= 80) return 'text-[hsl(var(--success))]'; if (score >= 60) return 'text-[hsl(var(--warning))]'; return 'text-destructive'; };
  const getScoreLabel = (score: number) => { if (score >= 80) return t('quality.good', 'Bom'); if (score >= 60) return t('quality.needsWork', 'Precisa de trabalho'); return t('quality.incomplete', 'Incompleto'); };
  const getScoreIcon = (score: number) => { if (score >= 80) return CheckCircle2; if (score >= 60) return AlertTriangle; return XCircle; };

  // Error branch — never spin forever.
  if (!result && computeMutation.isError) {
    return (
      <Card className="bg-muted/30 border-warning/30">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] shrink-0" />
            <span className="text-sm text-muted-foreground truncate">
              {t('quality.computeError', { defaultValue: 'Não foi possível calcular a qualidade' })}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={handleRecompute} disabled={computeMutation.isPending} loading={computeMutation.isPending}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', computeMutation.isPending && 'animate-spin')} />
            {t('common.retry', { defaultValue: 'Tentar novamente' })}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || computeMutation.isPending || !result) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="p-4 flex items-center justify-center">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm text-muted-foreground">{t('quality.checking', 'A verificar qualidade...')}</span>
        </CardContent>
      </Card>
    );
  }

  const ScoreIcon = getScoreIcon(result.score);
  const isBlocking = isStrict && result.score < 70;

  return (
    <Card className={cn('transition-colors', isBlocking && 'border-destructive/30 bg-destructive/50')}>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">{t('quality.title', 'Verificação de Qualidade')}</CardTitle>
              {isStrict && <Badge variant="outline" className="text-xs">{t('quality.strictMode', 'Modo Estrito')}</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <div className={cn('flex items-center gap-1.5', getScoreColor(result.score))}>
                <ScoreIcon className="h-4 w-4" />
                <span className="font-semibold">{result.score}</span>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          <Progress value={result.score} className={cn('h-1.5', result.score >= 80 && '[&>div]:bg-[hsl(var(--success))]', result.score >= 60 && result.score < 80 && '[&>div]:bg-[hsl(var(--warning))]', result.score < 60 && '[&>div]:bg-destructive')} />
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {result.missing_items.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">{t('quality.missing', 'Em falta:')}</p>
                <div className="space-y-1.5">
                  {result.missing_items.map((item) => (
                    <div key={item.key} className="flex items-start gap-2 p-2 rounded bg-destructive/10 text-sm">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-destructive">{item.label}</p>
                        <p className="text-xs text-destructive/80">{item.hint}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.passed_items.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">{t('quality.completed', 'Concluído:')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.passed_items.map((item) => (
                    <Badge key={item.key} variant="secondary" className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">
                      <CheckCircle2 className="h-3 w-3 mr-1" />{item.label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {result.coach_hints.length > 0 && (
              <div className="p-3 rounded-lg bg-[hsl(var(--info))]/10 border border-[hsl(var(--info))]/30">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-[hsl(var(--info))]" />
                  <p className="text-xs font-medium text-[hsl(var(--info))]">{t('quality.coachTips', 'Dicas de Coach')}</p>
                </div>
                <ul className="space-y-1">
                  {result.coach_hints.map((hint, i) => (
                    <li key={i} className="text-xs text-[hsl(var(--info))]">{hint}</li>
                  ))}
                </ul>
              </div>
            )}
            {isBlocking && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <p className="text-sm text-destructive font-medium">
                  ⚠️ {t('quality.blockingWarning', { entityType, defaultValue: `Este ${entityType} não pode ser marcado como pronto até a pontuação atingir 70+` })}
                </p>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={handleRecompute} disabled={computeMutation.isPending} loading={computeMutation.isPending}>
                <RefreshCw className={cn('h-3.5 w-3.5 mr-1', computeMutation.isPending && 'animate-spin')} />
                {t('quality.recalculate', 'Recalcular')}
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
