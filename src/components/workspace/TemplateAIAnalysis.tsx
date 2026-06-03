import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, CheckCircle2, AlertTriangle, HelpCircle, Loader2, ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { AiFallbackCard } from '@/components/ui/AiFallbackCard';

interface AIAnalysis {
  overall_score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  questions: string[];
  recommendation: 'approve' | 'needs_changes' | 'needs_discussion';
}

interface TemplateAIAnalysisProps {
  instanceId: string;
  onApplyRecommendation?: (recommendation: 'approved' | 'needs_changes', notes: string) => void;
}

export function TemplateAIAnalysis({ instanceId, onApplyRecommendation }: TemplateAIAnalysisProps) {
  const { t } = useTranslation();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyze-template', {
        body: { instance_id: instanceId },
      });

      if (fnError) throw fnError;
      if (data.error) {
        setError(data.error);
        notify.error(data.error);
        return;
      }

      setAnalysis(data.analysis);
      notify.success(t('templates.aiAnalysisComplete', 'AI analysis complete'));
    } catch (err: any) {
      const status = err?.status ?? err?.context?.status;
      if (status === 401 || status === 500 || status === 404) {
        setError('__ai_unavailable__');
      } else {
        const message = err.message || 'Failed to analyze template';
        setError(message);
        notify.error(message);
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApply = (decision: 'approved' | 'needs_changes') => {
    if (!analysis || !onApplyRecommendation) return;
    
    // Build notes from AI analysis
    let notes = `AI Analysis Score: ${analysis.overall_score}/10\n\n`;
    notes += `Summary: ${analysis.summary}\n\n`;
    
    if (analysis.improvements.length > 0) {
      notes += `Suggested Improvements:\n${analysis.improvements.map(i => `• ${i}`).join('\n')}\n\n`;
    }
    
    if (analysis.questions.length > 0) {
      notes += `Questions to Consider:\n${analysis.questions.map(q => `• ${q}`).join('\n')}`;
    }

    onApplyRecommendation(decision, notes.trim());
  };

  const getRecommendationBadge = () => {
    if (!analysis) return null;
    
    switch (analysis.recommendation) {
      case 'approve':
        return <Badge className="bg-green-100 text-green-700"><ThumbsUp className="h-3 w-3 mr-1" /> {t('templates.recommendApprove')}</Badge>;
      case 'needs_changes':
        return <Badge className="bg-amber-100 text-amber-700"><ThumbsDown className="h-3 w-3 mr-1" /> {t('templates.needsChanges')}</Badge>;
      case 'needs_discussion':
        return <Badge className="bg-blue-100 text-blue-700"><MessageSquare className="h-3 w-3 mr-1" /> {t('templates.needsDiscussion')}</Badge>;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600 dark:text-green-400';
    if (score >= 6) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  if (!analysis && !analyzing && !error) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleAnalyze}
        className="gap-2"
      >
        <Sparkles className="h-4 w-4" />
        {t('templates.aiAnalyze', 'AI Analyze')}
      </Button>
    );
  }

  if (analyzing) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-6 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {t('templates.analyzing', 'Analyzing template submission...')}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    if (error === '__ai_unavailable__') {
      return <AiFallbackCard title={t('templates.aiAnalysis', 'AI Analysis')} />;
    }
    return (
      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyze}
            className="mt-3"
          >
            {t('common.tryAgain', 'Try Again')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!analysis) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-primary/20">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {t('templates.aiAnalysis', 'AI Analysis')}
              </span>
              <div className="flex items-center gap-2">
                <span className={`font-bold ${getScoreColor(analysis.overall_score)}`}>
                  {analysis.overall_score}/10
                </span>
                {getRecommendationBadge()}
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Score Progress */}
            <div>
              <Progress value={analysis.overall_score * 10} className="h-2" />
            </div>

            {/* Summary */}
            <p className="text-sm text-muted-foreground">{analysis.summary}</p>

            {/* Strengths */}
            {analysis.strengths.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                  {t('templates.strengths', 'Strengths')}
                </h4>
                <ul className="space-y-1">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-green-600 dark:text-green-400 mt-1">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Improvements */}
            {analysis.improvements.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  {t('templates.improvements', 'Suggested Improvements')}
                </h4>
                <ul className="space-y-1">
                  {analysis.improvements.map((imp, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-amber-600 dark:text-amber-400 mt-1">•</span>
                      {imp}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Questions */}
            {analysis.questions.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <HelpCircle className="h-3 w-3 text-blue-600" />
                  {t('templates.questions', 'Questions to Consider')}
                </h4>
                <ul className="space-y-1">
                  {analysis.questions.map((q, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-blue-600 mt-1">•</span>
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Apply Buttons */}
            {onApplyRecommendation && (
              <div className="flex gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApply('approved')}
                  className="flex-1"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {t('templates.applyApprove', 'Apply & Approve')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApply('needs_changes')}
                  className="flex-1"
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  {t('templates.applyChanges', 'Apply & Request Changes')}
                </Button>
              </div>
            )}

            {/* Re-analyze */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAnalyze}
              className="w-full text-xs"
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {t('templates.reAnalyze', 'Re-analyze')}
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
