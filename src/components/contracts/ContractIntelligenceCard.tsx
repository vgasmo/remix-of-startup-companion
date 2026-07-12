import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, AlertTriangle, Calendar, CheckCircle2, Info, Shield, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import { invokeWithAuth } from "@/lib/invokeWithAuth";

interface ContractAnalysis {
  key_dates: Array<{ date: string; description: string; is_critical: boolean }>;
  missing_info: Array<{ field: string; severity: string; suggestion: string }>;
  recommended_actions: Array<{ action: string; priority: string }>;
  risk_level: string;
  risk_justification: string;
}

interface ContractIntelligenceCardProps {
  contractId: string;
  contractLabel?: string;
}

const RISK_COLORS: Record<string, string> = {
  low: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ',
  medium: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ',
  high: 'bg-destructive/10 text-destructive ',
};

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  low: <Info className="h-3.5 w-3.5 text-muted-foreground" />,
  medium: <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />,
  high: <AlertTriangle className="h-3.5 w-3.5 text-destructive" />,
};

export function ContractIntelligenceCard({ contractId, contractLabel }: ContractIntelligenceCardProps) {
  const { t } = useTranslation();
  const [showConfirm, setShowConfirm] = useState(false);
  const [analysis, setAnalysis] = useState<ContractAnalysis | null>(null);

  const analyzeContract = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeWithAuth('analyze-contract', {
        body: { contractId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setAnalysis(data.analysis);
      setShowConfirm(false);
    },
  });

  const handleAnalyze = () => {
    setShowConfirm(true);
  };

  const confirmAnalyze = () => {
    analyzeContract.mutate();
  };

  if (!analysis) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleAnalyze}
          disabled={analyzeContract.isPending} loading={analyzeContract.isPending}
        >
          {analyzeContract.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {t('contracts.aiAnalysis', 'AI Analysis')}
        </Button>

        {/* Human-in-the-loop confirmation */}
        <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                {t('contracts.confirmAnalysis', 'Confirm AI Analysis')}
              </DialogTitle>
              <DialogDescription>
                {t('contracts.confirmAnalysisDesc', 'AI will analyze contract details and flag key dates, missing info, and risks. No changes will be made automatically.')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirm(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button onClick={confirmAnalyze} disabled={analyzeContract.isPending} loading={analyzeContract.isPending}>
                {analyzeContract.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {t('contracts.analyze', 'Analyze')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Card className="rounded-2xl border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('contracts.aiInsights', 'AI Contract Insights')}
          </CardTitle>
          <Badge className={cn('text-xs', RISK_COLORS[analysis.risk_level] || RISK_COLORS.medium)}>
            {t(`contracts.risk.${analysis.risk_level}`, analysis.risk_level)} {t('contracts.risk.label', 'risk')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <p className="text-xs text-muted-foreground">{analysis.risk_justification}</p>

        {/* Key Dates */}
        {analysis.key_dates.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {t('contracts.keyDates', 'Key Dates')}
            </p>
            <div className="space-y-1.5">
              {analysis.key_dates.map((d, i) => (
                <div key={i} className={cn(
                  'flex items-start gap-2 text-xs p-2 rounded-lg',
                  d.is_critical ? 'bg-destructive/5 border border-destructive/20' : 'bg-muted/50'
                )}>
                  <span className="font-mono text-[10px] mt-0.5 flex-shrink-0">{d.date}</span>
                  <span className="text-muted-foreground">{d.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missing Info */}
        {analysis.missing_info.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {t('contracts.missingInfo', 'Missing Information')}
            </p>
            <div className="space-y-1.5">
              {analysis.missing_info.map((m, i) => (
                <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-muted/50">
                  {SEVERITY_ICONS[m.severity]}
                  <div>
                    <span className="font-medium">{m.field}</span>
                    <span className="text-muted-foreground ml-1">— {m.suggestion}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended Actions */}
        {analysis.recommended_actions.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> {t('contracts.recommendedActions', 'Recommended Actions')}
            </p>
            <div className="space-y-1.5">
              {analysis.recommended_actions.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-primary/5">
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {a.priority}
                  </Badge>
                  <span>{a.action}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground"
          onClick={() => setAnalysis(null)}
        >
          {t('contracts.rerunAnalysis', 'Run again')}
        </Button>
      </CardContent>
    </Card>
  );
}
