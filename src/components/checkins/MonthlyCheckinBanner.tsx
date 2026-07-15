import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { usePendingCheckin, useSubmitCheckin, useSkipCheckin, CheckinQuestion, SubmitCheckinPayload } from '@/hooks/useCheckins';
import { useAllKpiDefinitions, KpiDefinition } from '@/hooks/useKpis';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, Clock, AlertTriangle, Send } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { useQuickWinToast } from '@/hooks/useQuickWinToast';

interface MonthlyCheckinBannerProps {
  workspaceId: string;
}

export function MonthlyCheckinBanner({ workspaceId }: MonthlyCheckinBannerProps) {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  
  const { data: pendingCheckin, isLoading } = usePendingCheckin(workspaceId);
  const { data: kpiDefinitions } = useAllKpiDefinitions();
  const submitCheckin = useSubmitCheckin();
  const skipCheckin = useSkipCheckin();
  const { showQuickWin } = useQuickWinToast();

  // Auto-open form when landing here from a smart nudge / one-thing-today CTA (?open=checkin)
  useEffect(() => {
    if (searchParams.get('open') === 'checkin' && pendingCheckin) {
      setShowForm(true);
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, pendingCheckin, setSearchParams]);

  // i18n-aware date formatting
  const formatDate = (date: Date) => {
    const locale = i18n.language === 'pt' ? 'pt-PT' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
  };

  if (isLoading || !pendingCheckin) return null;

  const daysUntilDue = differenceInDays(new Date(pendingCheckin.due_date), new Date());
  const isOverdue = daysUntilDue < 0;
  const definition = pendingCheckin.definition;
  const questions: CheckinQuestion[] = definition?.questions || [];
  const kpiIds = definition?.kpi_definition_ids || [];

  const handleInputChange = (id: string, value: string | number) => {
    setResponses(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async () => {
    const payload: SubmitCheckinPayload[] = [];

    // Add question responses
    questions.forEach(q => {
      const value = responses[q.id];
      if (value !== undefined && value !== '') {
        payload.push({
          question_id: q.id,
          response_value: q.type === 'text' ? String(value) : undefined,
          response_number: q.type !== 'text' ? Number(value) : undefined,
        });
      }
    });

    // Add KPI responses
    kpiIds.forEach(kpiId => {
      const value = responses[`kpi_${kpiId}`];
      if (value !== undefined && value !== '') {
        payload.push({
          question_id: `kpi_${kpiId}`,
          response_number: Number(value),
          kpi_definition_id: kpiId,
        });
      }
    });

    await submitCheckin.mutateAsync({
      instanceId: pendingCheckin.id,
      responses: payload,
    });
    showQuickWin('monthly_wins_submitted');
    setShowForm(false);
    setResponses({});
  };

  const handleSkip = async () => {
    await skipCheckin.mutateAsync(pendingCheckin.id);
  };

  const kpiDefsMap = new Map(kpiDefinitions?.map(k => [k.id, k]) || []);

  return (
    <>
      <Alert 
        variant={isOverdue ? 'destructive' : 'default'} 
        className="mb-4 border-primary/20 bg-primary/5"
      >
        <ClipboardCheck className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          {t('monthlyWins.pending', 'Monthly Wins Pending')}
          {isOverdue ? (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {t('monthlyWins.overdue', 'Overdue')}
            </Badge>
          ) : daysUntilDue <= 1 ? (
            <Badge variant="secondary" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {daysUntilDue === 0 ? t('monthlyWins.dueToday', 'Due today') : t('monthlyWins.dueTomorrow', 'Due tomorrow')}
            </Badge>
          ) : null}
        </AlertTitle>
        <AlertDescription className="flex items-center justify-between mt-2">
          <span>
            {t('monthlyWins.dueOn', 'Due {{date}}', { date: formatDate(new Date(pendingCheckin.due_date)) })}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              {t('monthlyWins.skip', 'Skip')}
            </Button>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Send className="h-4 w-4 mr-1" />
              {t('monthlyWins.complete', 'Complete')}
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              {definition?.name || t('monthlyWins.title', 'Monthly Wins')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Questions */}
            {questions.map((q, idx) => (
              <div key={q.id} className="space-y-2">
                <Label htmlFor={q.id}>{idx + 1}. {q.question}</Label>
                {q.type === 'text' ? (
                  <Textarea
                    id={q.id}
                    value={responses[q.id] || ''}
                    onChange={(e) => handleInputChange(q.id, e.target.value)}
                    placeholder={t('monthlyWins.yourAnswer', 'Your answer...')}
                  />
                ) : q.type === 'scale' ? (
                  <div className="flex gap-2">
                    {[1,2,3,4,5].map(n => (
                      <Button
                        key={n}
                        variant={responses[q.id] === n ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleInputChange(q.id, n)}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Input
                    id={q.id}
                    type="number"
                    value={responses[q.id] || ''}
                    onChange={(e) => handleInputChange(q.id, e.target.value)}
                    placeholder={t('monthlyWins.enterNumber', 'Enter a number...')}
                  />
                )}
              </div>
            ))}

            {/* KPIs */}
            {kpiIds.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">{t('monthlyWins.kpisThisMonth', 'KPIs this month')}</h4>
                {kpiIds.map(kpiId => {
                  const kpi = kpiDefsMap.get(kpiId) as KpiDefinition | undefined;
                  if (!kpi) return null;
                  return (
                    <div key={kpiId} className="space-y-2 mb-4">
                      <Label htmlFor={`kpi_${kpiId}`}>
                        {kpi.name} {kpi.unit && <span className="text-muted-foreground">({kpi.unit})</span>}
                      </Label>
                      <Input
                        id={`kpi_${kpiId}`}
                        type="number"
                        value={responses[`kpi_${kpiId}`] || ''}
                        onChange={(e) => handleInputChange(`kpi_${kpiId}`, e.target.value)}
                        placeholder={t('monthlyWins.enterKpi', 'Enter {{name}}...', { name: kpi.name })}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitCheckin.isPending} loading={submitCheckin.isPending}>
              {submitCheckin.isPending ? t('monthlyWins.submitting', 'Submitting...') : t('monthlyWins.submit', 'Submit Monthly Wins')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
