import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sparkles, Star, MessageSquare, CheckCircle, XCircle,
  AlertTriangle, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { notify } from "@/lib/notify";
import { useAuth } from '@/contexts/AuthContext';
import {
  useDocumentReviews,
  useCreateReview,
  useAnalyzePitchDeck,
} from '@/hooks/useDocumentReviews';

interface DocumentReviewPanelProps {
  documentId: string;
  workspaceId: string;
  documentName?: string;
  isStaff: boolean;
  isMentor: boolean;
  onClose: () => void;
}

const SCORE_DIMENSIONS = [
  { key: 'score_problem_solution', labelKey: 'review.problemSolution', defaultLabel: 'Problema / Solução' },
  { key: 'score_market', labelKey: 'review.market', defaultLabel: 'Mercado' },
  { key: 'score_business_model', labelKey: 'review.businessModel', defaultLabel: 'Modelo de Negócio' },
  { key: 'score_team', labelKey: 'review.team', defaultLabel: 'Equipa' },
  { key: 'score_traction', labelKey: 'review.traction', defaultLabel: 'Tração' },
  { key: 'score_design_clarity', labelKey: 'review.designClarity', defaultLabel: 'Design / Clareza' },
] as const;

const APPROVAL_OPTIONS = [
  { value: 'pending', labelKey: 'review.pending', defaultLabel: 'Pendente', icon: AlertTriangle, color: 'text-muted-foreground' },
  { value: 'approved', labelKey: 'review.approved', defaultLabel: 'Aprovado', icon: CheckCircle, color: 'text-[hsl(var(--success))]' },
  { value: 'needs_revision', labelKey: 'review.needsRevision', defaultLabel: 'Precisa Revisão', icon: AlertTriangle, color: 'text-[hsl(var(--warning))]' },
  { value: 'rejected', labelKey: 'review.rejected', defaultLabel: 'Rejeitado', icon: XCircle, color: 'text-destructive' },
];

export function DocumentReviewPanel({ documentId, workspaceId, documentName, isStaff, isMentor, onClose }: DocumentReviewPanelProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: reviews, isLoading } = useDocumentReviews(documentId);
  const createReview = useCreateReview();
  const analyzeMutation = useAnalyzePitchDeck();

  const canReview = isStaff || isMentor;

  const [showForm, setShowForm] = useState(false);
  const [showAiDetails, setShowAiDetails] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('pending');

  const handleAnalyzeWithAI = async () => {
    try {
      const analysis = await analyzeMutation.mutateAsync({ documentId, workspaceId });
      if (!user) return;

      await createReview.mutateAsync({
        document_id: documentId,
        workspace_id: workspaceId,
        reviewer_id: user.id,
        score_problem_solution: analysis.scores?.problem_solution,
        score_market: analysis.scores?.market,
        score_business_model: analysis.scores?.business_model,
        score_team: analysis.scores?.team,
        score_traction: analysis.scores?.traction,
        score_design_clarity: analysis.scores?.design_clarity,
        comments: analysis.summary,
        ai_analysis_json: analysis,
        ai_analyzed_at: new Date().toISOString(),
        approval_status: 'pending',
      });
      notify.success(t('review.aiAnalysisComplete', { defaultValue: 'Análise IA concluída!' }));
    } catch (error: any) {
      if (error?.message?.includes('Rate limit')) {
        notify.error(t('review.rateLimited', { defaultValue: 'Limite de pedidos excedido. Tente novamente mais tarde.' }));
      } else if (error?.message?.includes('credits')) {
        notify.error(t('review.creditsExhausted', { defaultValue: 'Créditos IA esgotados.' }));
      } else {
        notify.error(error?.message || t('review.aiAnalysisFailed', { defaultValue: 'Falha na análise IA.' }));
      }
    }
  };

  const handleSubmitReview = async () => {
    if (!user) return;
    try {
      await createReview.mutateAsync({
        document_id: documentId,
        workspace_id: workspaceId,
        reviewer_id: user.id,
        score_problem_solution: scores.score_problem_solution,
        score_market: scores.score_market,
        score_business_model: scores.score_business_model,
        score_team: scores.score_team,
        score_traction: scores.score_traction,
        score_design_clarity: scores.score_design_clarity,
        comments: comments || undefined,
        approval_status: approvalStatus,
      });
      notify.success(t('review.reviewSubmitted', { defaultValue: 'Avaliação submetida!' }));
      setShowForm(false);
      setScores({});
      setComments('');
      setApprovalStatus('pending');
    } catch (error: any) {
      notify.error(error?.message || t('review.submitFailed', { defaultValue: 'Falha ao submeter avaliação.' }));
    }
  };

  const aiReview = reviews?.find(r => r.ai_analysis_json);
  const humanReviews = reviews?.filter(r => !r.ai_analysis_json) || [];
  const displayName = documentName || t('review.document', { defaultValue: 'Documento' });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {t('review.documentReview', { defaultValue: 'Avaliação de Entregável' })}
          </DialogTitle>
          <DialogDescription>
            {t('review.panelDescriptionGeneric', {
              defaultValue: 'Avaliações humanas e IA de "{{name}}".',
              name: displayName,
            })}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* AI Analysis */}
            <Card className="border-primary/20">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-medium flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    {t('review.aiAnalysis', { defaultValue: 'Análise IA' })}
                  </h3>
                  {canReview && !aiReview && (
                    <Button size="sm" onClick={handleAnalyzeWithAI} disabled={analyzeMutation.isPending}>
                      {analyzeMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-1.5" />
                      )}
                      {analyzeMutation.isPending
                        ? t('review.analyzing', { defaultValue: 'A analisar...' })
                        : t('review.runAiAnalysis', { defaultValue: 'Gerar Análise IA' })
                      }
                    </Button>
                  )}
                </div>

                {aiReview ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {SCORE_DIMENSIONS.map(dim => {
                        const score = aiReview[dim.key as keyof typeof aiReview] as number | null;
                        return (
                          <div key={dim.key} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{t(dim.labelKey, { defaultValue: dim.defaultLabel })}</span>
                              <span className="font-medium">{score || '-'}/5</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-1.5">
                              <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${((score || 0) / 5) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {aiReview.comments && <p className="text-sm text-muted-foreground">{aiReview.comments}</p>}

                    {aiReview.ai_analysis_json && (
                      <div>
                        <button onClick={() => setShowAiDetails(!showAiDetails)} className="flex items-center gap-1 text-sm text-primary hover:underline">
                          {showAiDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {t('review.detailedRecommendations', { defaultValue: 'Recomendações detalhadas' })}
                        </button>
                        {showAiDetails && (
                          <div className="mt-3 space-y-3">
                            {aiReview.ai_analysis_json.top_priorities?.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium mb-1">{t('review.topPriorities', { defaultValue: 'Prioridades principais' })}</h4>
                                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                  {aiReview.ai_analysis_json.top_priorities.map((p: string, i: number) => <li key={i}>{p}</li>)}
                                </ul>
                              </div>
                            )}
                            {aiReview.ai_analysis_json.recommendations?.map((rec: any, i: number) => (
                              <div key={i} className="p-3 rounded-lg bg-muted/50 text-sm">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-medium">{rec.dimension}</span>
                                  <Badge variant="outline">{rec.score}/5</Badge>
                                </div>
                                <p className="text-muted-foreground mb-2">{rec.feedback}</p>
                                {rec.action_items?.length > 0 && (
                                  <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                                    {rec.action_items.map((a: string, j: number) => <li key={j}>{a}</li>)}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {t('review.analyzedAt', { defaultValue: 'Analisado em' })}{' '}
                      {aiReview.ai_analyzed_at ? format(new Date(aiReview.ai_analyzed_at), "dd MMM yyyy 'às' HH:mm", { locale: pt }) : '-'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('review.noAiAnalysis', { defaultValue: 'Ainda sem análise IA. Gere uma análise para obter recomendações automáticas.' })}
                  </p>
                )}
              </CardContent>
            </Card>

            <Separator />

            {/* Human Reviews */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  {t('review.humanReviews', { defaultValue: 'Avaliações Humanas' })}
                  {humanReviews.length > 0 && <Badge variant="secondary">{humanReviews.length}</Badge>}
                </h3>
                {canReview && (
                  <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                    {t('review.addReview', { defaultValue: 'Adicionar Avaliação' })}
                  </Button>
                )}
              </div>

              {showForm && canReview && (
                <Card className="mb-4">
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {SCORE_DIMENSIONS.map(dim => (
                        <div key={dim.key} className="space-y-1">
                          <Label className="text-xs">{t(dim.labelKey, { defaultValue: dim.defaultLabel })}</Label>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(n => (
                              <button
                                key={n}
                                onClick={() => setScores(prev => ({ ...prev, [dim.key]: n }))}
                                className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
                                  scores[dim.key] === n
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <Label className="text-xs">{t('review.comments', { defaultValue: 'Comentários' })}</Label>
                      <Textarea
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder={t('review.commentsPlaceholderGeneric', { defaultValue: 'Feedback detalhado sobre este entregável...' })}
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label className="text-xs">{t('review.approvalStatus', { defaultValue: 'Estado de Aprovação' })}</Label>
                      <Select value={approvalStatus} onValueChange={setApprovalStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {APPROVAL_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <div className="flex items-center gap-2">
                                <opt.icon className={`h-3.5 w-3.5 ${opt.color}`} />
                                {t(opt.labelKey, { defaultValue: opt.defaultLabel })}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button onClick={handleSubmitReview} disabled={createReview.isPending} className="w-full">
                      {createReview.isPending
                        ? t('common.saving', { defaultValue: 'A guardar...' })
                        : t('review.submitReview', { defaultValue: 'Submeter Avaliação' })
                      }
                    </Button>
                  </CardContent>
                </Card>
              )}

              {humanReviews.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('review.noHumanReviews', { defaultValue: 'Ainda sem avaliações humanas.' })}
                </p>
              ) : (
                <div className="space-y-3">
                  {humanReviews.map(review => (
                    <Card key={review.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={review.reviewer?.avatar_url || undefined} />
                              <AvatarFallback className="text-[10px]">{review.reviewer?.full_name?.charAt(0) || '?'}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{review.reviewer?.full_name || 'Reviewer'}</span>
                            <span className="text-xs text-muted-foreground">{format(new Date(review.created_at), "dd MMM yyyy", { locale: pt })}</span>
                          </div>
                          <Badge variant={
                            review.approval_status === 'approved' ? 'default' :
                            review.approval_status === 'rejected' ? 'destructive' : 'secondary'
                          }>
                            {t(`review.${review.approval_status}`, { defaultValue: review.approval_status })}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3">
                          {SCORE_DIMENSIONS.map(dim => {
                            const score = review[dim.key as keyof typeof review] as number | null;
                            if (!score) return null;
                            return (
                              <div key={dim.key} className="flex items-center gap-1 text-xs">
                                <Star className="h-3 w-3 text-primary" />
                                <span className="text-muted-foreground">{t(dim.labelKey, { defaultValue: dim.defaultLabel })}:</span>
                                <span className="font-medium">{score}/5</span>
                              </div>
                            );
                          })}
                        </div>

                        {review.comments && <p className="text-sm text-muted-foreground">{review.comments}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Badge showing review status for any document */
export function DocumentReviewBadge({ documentId }: { documentId: string }) {
  const { t } = useTranslation();
  const { data: reviews } = useDocumentReviews(documentId);

  if (!reviews?.length) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        {t('dataroomChecklist.noReview', { defaultValue: 'Sem avaliação' })}
      </Badge>
    );
  }

  const latestReview = reviews[0];
  const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    approved: { label: t('review.approved', { defaultValue: 'Aprovado' }), variant: 'default' },
    needs_revision: { label: t('review.needsRevision', { defaultValue: 'Precisa revisão' }), variant: 'secondary' },
    rejected: { label: t('review.rejected', { defaultValue: 'Rejeitado' }), variant: 'destructive' },
    pending: { label: t('review.pending', { defaultValue: 'Pendente' }), variant: 'outline' },
  };

  const status = statusMap[latestReview.approval_status] || statusMap.pending;

  return (
    <Badge variant={status.variant} className="text-xs">
      {status.label}
    </Badge>
  );
}
