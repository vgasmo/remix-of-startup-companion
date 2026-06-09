import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { HelpCircle, RefreshCw, Edit2, TrendingUp, TrendingDown, Minus, ChevronDown, Activity, Calendar, BarChart3, ClipboardCheck, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useWorkspaceHealth, useSetHealthOverride, useRecomputeHealthScores, getHealthScoreConfig, HealthExplanationFactor } from '@/hooks/useHealthScore';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { HealthScoreTooltip } from './HealthScoreTooltip';
import type { Database } from '@/integrations/supabase/types';

type HealthScore = Database['public']['Enums']['health_score'];

interface HealthScoreCardProps {
  workspaceId: string;
  programId?: string | null;
  canManage?: boolean;
}

interface HealthModel {
  weights_json: {
    actions: number;
    sessions: number;
    kpis: number;
    checkins: number;
  };
  thresholds_json: {
    thriving: number;
    healthy: number;
    stable: number;
    at_risk: number;
  };
  is_enabled: boolean;
}

const DEFAULT_WEIGHTS = { actions: 30, sessions: 20, kpis: 30, checkins: 20 };

export function HealthScoreCard({ workspaceId, programId, canManage = false }: HealthScoreCardProps) {
  const { t, i18n } = useTranslation();
  const { roles } = useAuth();
  const isStaff = roles.includes('admin') || roles.includes('consultor');
  const { data: health, isLoading } = useWorkspaceHealth(workspaceId);
  const setOverride = useSetHealthOverride();
  const recompute = useRecomputeHealthScores();

  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideValue, setOverrideValue] = useState<HealthScore | 'none'>('none');
  const [overrideReason, setOverrideReason] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Fetch program health model for breakdown
  const { data: model } = useQuery({
    queryKey: ['program-health-model', programId],
    queryFn: async () => {
      if (!programId) return null;
      const { data, error } = await supabase
        .from('program_health_model')
        .select('*')
        .eq('program_id', programId)
        .eq('is_enabled', true)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as HealthModel | null;
    },
    enabled: !!programId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {t('health.title', { defaultValue: 'Health Score' })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  const effectiveScore = health?.health_score_override || health?.health_score;
  const config = getHealthScoreConfig(effectiveScore || null);
  const hasOverride = !!health?.health_score_override;
  const numericScore = health?.health_score_numeric || 0;
  const explanation = health?.health_score_explanation || [];
  const weights = model?.weights_json || DEFAULT_WEIGHTS;
  const components = (health?.health_score_components as { actions: number; sessions: number; kpis: number; checkins: number } | null) || null;

  const handleOverrideSave = () => {
    setOverride.mutate({
      workspaceId,
      override: overrideValue === 'none' ? null : overrideValue,
      reason: overrideReason,
    });
    setShowOverrideDialog(false);
    setOverrideValue('none');
    setOverrideReason('');
  };

  const openOverrideDialog = () => {
    setOverrideValue(health?.health_score_override as HealthScore || 'none');
    setOverrideReason('');
    setShowOverrideDialog(true);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              {t('health.title', { defaultValue: 'Health Score' })}
              <HealthScoreTooltip components={components} numericScore={numericScore} />
            </CardTitle>
            <div className="flex items-center gap-1">
              {isStaff && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => recompute.mutate()}
                        disabled={recompute.isPending}
                      >
                        <RefreshCw className={`h-4 w-4 ${recompute.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('health.recalculate', { defaultValue: 'Recalcular scores' })}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={openOverrideDialog}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('health.setOverride')}</TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Main Score Display */}
          <div className="flex items-center gap-4">
            <div className={`text-4xl font-bold p-4 rounded-xl ${config.color}`}>
              {config.icon}
            </div>
          <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{t(config.labelKey)}</span>
                {hasOverride && (
                  <Badge variant="outline" className="text-xs">
                    {t('health.manualOverride')}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{t(config.descriptionKey)}</p>
              {numericScore > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>{t('health.numericScore')}</span>
                    <span className="font-medium">{numericScore}/100</span>
                  </div>
                  <Progress value={numericScore} className="h-2" />
                </div>
              )}
            </div>
          </div>

          {/* Explanation Section */}
          {explanation.length > 0 && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t('health.whyThisScore')}</span>
              </div>
              <div className="space-y-2">
                {explanation.slice(0, 4).map((factor: HealthExplanationFactor, index: number) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {factor.impact === 'positive' && <TrendingUp className="h-4 w-4 text-[hsl(var(--success))]" />}
                      {factor.impact === 'negative' && <TrendingDown className="h-4 w-4 text-destructive" />}
                      {factor.impact === 'neutral' && <Minus className="h-4 w-4 text-muted-foreground" />}
                      <span>{factor.factor}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">{factor.details}</span>
                      <Badge variant="secondary" className="text-xs">
                        {factor.score}/{factor.maxScore}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collapsible: How Health is Calculated */}
          <Collapsible open={showBreakdown} onOpenChange={setShowBreakdown}>
            <CollapsibleTrigger className="flex items-center justify-between w-full border-t pt-3 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                <span>{t('health.howCalculated')}</span>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3">
              {/* Weights Grid */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 rounded bg-muted">
                  <Activity className="h-4 w-4 mx-auto mb-1" />
                  <div>{t('health.components.actions')}</div>
                  <div className="font-bold">{weights.actions}%</div>
                </div>
                <div className="p-2 rounded bg-muted">
                  <Calendar className="h-4 w-4 mx-auto mb-1" />
                  <div>{t('health.components.sessions')}</div>
                  <div className="font-bold">{weights.sessions}%</div>
                </div>
                <div className="p-2 rounded bg-muted">
                  <BarChart3 className="h-4 w-4 mx-auto mb-1" />
                  <div>{t('health.components.kpis')}</div>
                  <div className="font-bold">{weights.kpis}%</div>
                </div>
                <div className="p-2 rounded bg-muted">
                  <ClipboardCheck className="h-4 w-4 mx-auto mb-1" />
                  <div>{t('health.components.checkins')}</div>
                  <div className="font-bold">{weights.checkins}%</div>
                </div>
              </div>

              {/* Component Scores if available */}
              {components && (
                <div className="space-y-2">
                  {(['actions', 'sessions', 'kpis', 'checkins'] as const).map((key) => {
                    const score = components[key] || 0;
                    const weight = weights[key];
                    const weighted = (score * weight) / 100;
                    return (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        <span className="w-16 text-muted-foreground">{t(`health.components.${key}`)}</span>
                        <Progress value={score} className="flex-1 h-2" />
                        <span className="w-8 text-right">{score}</span>
                        <span className="text-muted-foreground">× {weight}% =</span>
                        <span className="w-8 font-medium">{weighted.toFixed(0)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {t('health.scoreExplanation')}
              </p>
            </CollapsibleContent>
          </Collapsible>

          {/* Last updated */}
          {health?.health_score_updated_at && (
            <p className="text-xs text-muted-foreground text-right">
              {t('common.updated', { defaultValue: 'Atualizado' })}: {new Date(health.health_score_updated_at).toLocaleDateString(i18n.language === 'pt' ? 'pt-PT' : 'en-US', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Override Dialog */}
      <Dialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('health.setHealthOverride')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('health.newScore')}</Label>
              <Select value={overrideValue} onValueChange={(v) => setOverrideValue(v as HealthScore | 'none')}>
                <SelectTrigger>
                  <SelectValue placeholder={t('health.selectScore')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="flex items-center gap-2">
                      ❌ {t('health.removeOverride')}
                    </span>
                  </SelectItem>
                  <SelectItem value="thriving">
                    <span className="flex items-center gap-2">🌟 {t('health.levels.thriving')}</span>
                  </SelectItem>
                  <SelectItem value="healthy">
                    <span className="flex items-center gap-2">✅ {t('health.levels.healthy')}</span>
                  </SelectItem>
                  <SelectItem value="stable">
                    <span className="flex items-center gap-2">➡️ {t('health.levels.stable')}</span>
                  </SelectItem>
                  <SelectItem value="at_risk">
                    <span className="flex items-center gap-2">⚠️ {t('health.levels.at_risk')}</span>
                  </SelectItem>
                  <SelectItem value="critical">
                    <span className="flex items-center gap-2">🚨 {t('health.levels.critical')}</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('health.reasonLabel')}</Label>
              <Textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={t('health.reasonPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOverrideDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleOverrideSave} disabled={setOverride.isPending}>
              {setOverride.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
