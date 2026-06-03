import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { 
  Shield, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ChevronRight,
  AlertTriangle,
  FileCheck,
  Send,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStageGateReviews, useStageGateCriteria, useRequestStageGateReview, useApproveStageGateReview } from '@/hooks/useGovernance';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from "@/lib/notify";
import { StartupStage } from '@/types/database';
import { getStartupStageLabel } from '@/lib/stageLabels';

interface GovernanceTabProps {
  workspaceId: string;
  programId: string;
  currentStage: StartupStage;
  canWrite: boolean;
}

const STAGES: StartupStage[] = ['ideation', 'validation', 'mvp', 'growth', 'scale'];

export function GovernanceTab({ workspaceId, programId, currentStage, canWrite }: GovernanceTabProps) {
  const { t } = useTranslation();
  const { isAdmin, isConsultor, isFounder } = useAuth();
  const isStaff = isAdmin || isConsultor;
  
  const { data: stageGateReviews, isLoading: reviewsLoading } = useStageGateReviews(workspaceId);
  const { data: stageGateCriteriaData } = useStageGateCriteria(programId, currentStage);
  const requestStageGateReview = useRequestStageGateReview();
  const approveStageGateReview = useApproveStageGateReview();
  
  const isLoading = reviewsLoading;
  const stageGateCriteria = stageGateCriteriaData ? [stageGateCriteriaData] : [];

  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [targetStage, setTargetStage] = useState<StartupStage | ''>('');
  const [evidence, setEvidence] = useState('');
  const [decision, setDecision] = useState<'approved' | 'conditional' | 'rejected'>('approved');
  const [conditions, setConditions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentStageIndex = STAGES.indexOf(currentStage);
  const nextStage = currentStageIndex < STAGES.length - 1 ? STAGES[currentStageIndex + 1] : null;

  // Get criteria for current stage
  const currentCriteria = stageGateCriteria?.find(c => c.stage === currentStage);
  const criteriaList = (currentCriteria?.criteria_json as { items?: string[] })?.items || [];

  // Get pending review for current stage
  const pendingReview = stageGateReviews?.find(
    r => r.from_stage === currentStage && r.status === 'pending'
  );

  // Get all reviews for history
  const reviewHistory = stageGateReviews?.filter(r => r.status !== 'pending') || [];

  const handleRequestReview = async () => {
    if (!nextStage) return;
    
    setIsSubmitting(true);
    try {
      await requestStageGateReview.mutateAsync({
        workspaceId,
        fromStage: currentStage,
        toStage: nextStage,
        evidence: evidence.trim() || undefined,
      });
      notify.success(t('workspace.stageGateReviewRequested'));
      setShowRequestDialog(false);
      setEvidence('');
    } catch (error) {
      notify.error(t('workspace.failedToRequestReview'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveReview = async () => {
    if (!selectedReview) return;
    
    setIsSubmitting(true);
    try {
      await approveStageGateReview.mutateAsync({
        workspaceId,
        reviewId: selectedReview.id,
        status: decision,
        conditions: decision === 'conditional' ? conditions.trim() : undefined,
      });
      notify.success(t('workspace.review', { decision: decision }));
      setShowApproveDialog(false);
      setSelectedReview(null);
      setDecision('approved');
      setConditions('');
    } catch (error) {
      notify.error(t('workspace.failedToUpdateReview'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{t('governance.approved', 'Approved')}</Badge>;
      case 'conditional':
        return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{t('governance.conditional', 'Conditional')}</Badge>;
      case 'rejected':
        return <Badge variant="destructive">{t('governance.rejected', 'Rejected')}</Badge>;
      case 'pending':
        return <Badge variant="secondary">{t('governance.pendingReview', 'Pending Review')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Stage Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {t('governance.stageGateProgress', 'Stage Gate Progress')}
          </CardTitle>
          <CardDescription>
            {t('governance.stageGateProgressDesc', 'Track your progress through program stages')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Stage Progress Bar */}
          <div className="flex items-center gap-2 mb-6">
            {STAGES.map((stage, index) => (
              <div key={stage} className="flex items-center flex-1">
                <div className={`flex-1 h-2 rounded-full ${
                  index < currentStageIndex 
                    ? 'bg-green-500' 
                    : index === currentStageIndex 
                    ? 'bg-primary' 
                    : 'bg-muted'
                }`} />
                {index < STAGES.length - 1 && (
                  <ChevronRight className={`h-4 w-4 mx-1 ${
                    index < currentStageIndex ? 'text-green-500' : 'text-muted-foreground'
                  }`} />
                )}
              </div>
            ))}
          </div>
          
          <div className="flex justify-between text-xs text-muted-foreground mb-6">
            {STAGES.map((stage, index) => (
              <span 
                key={stage} 
                className={`${
                  index === currentStageIndex ? 'font-semibold text-foreground' : ''
                }`}
              >
                {getStartupStageLabel(t, stage)}
              </span>
            ))}
          </div>

          {/* Current Stage Status */}
          <div className="p-4 rounded-lg bg-muted/50 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('governance.currentStage', 'Current Stage')}</p>
                <p className="text-lg font-semibold">{getStartupStageLabel(t, currentStage)}</p>
              </div>
              {nextStage && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{t('governance.nextStage', 'Next Stage')}</p>
                  <p className="text-lg font-semibold text-primary">{getStartupStageLabel(t, nextStage)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Pending Review Status */}
          {pendingReview && (
            <div className="p-4 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-900/10 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="font-medium">{t('governance.reviewPending', 'Stage gate review pending')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('governance.requestedAt', 'Requested {{date}}', { date: format(new Date(pendingReview.requested_at), 'MMM d, yyyy') })}
                    </p>
                  </div>
                </div>
                {isStaff && (
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSelectedReview(pendingReview);
                      setShowApproveDialog(true);
                    }}
                  >
                    {t('governance.review', 'Review')}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Request Review Button */}
          {!pendingReview && nextStage && canWrite && isFounder && !isStaff && (
            <Button 
              onClick={() => setShowRequestDialog(true)}
              className="w-full"
            >
              <Send className="h-4 w-4 mr-2" />
              {t('governance.requestReviewTo', 'Request Stage Gate Review to {{stage}}', { stage: getStartupStageLabel(t, nextStage) })}
            </Button>
          )}

          {!nextStage && (
            <div className="text-center py-4 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p>{t('governance.completedAllStages', 'Congratulations! You\'ve completed all stages.')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stage Gate Criteria */}
      {criteriaList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-primary" />
              {t('governance.requirementsFor', 'Requirements for {{from}} → {{to}}', { 
                from: getStartupStageLabel(t, currentStage), 
                to: nextStage ? getStartupStageLabel(t, nextStage) : t('governance.nextStage', 'Next Stage') 
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {criteriaList.map((criterion, index) => (
                <div key={index} className="flex items-start gap-3 p-2 rounded hover:bg-muted/50">
                  <div className="h-5 w-5 rounded border border-muted-foreground/30 flex items-center justify-center mt-0.5">
                    <span className="text-xs text-muted-foreground">{index + 1}</span>
                  </div>
                  <p className="text-sm">{criterion}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review History */}
      {reviewHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('governance.reviewHistory', 'Review History')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {reviewHistory.map((review) => (
                <div key={review.id} className="flex items-start justify-between p-4 rounded-lg bg-muted/30">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium capitalize">{review.from_stage}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium capitalize">{review.to_stage}</span>
                      {getStatusBadge(review.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Reviewed {review.reviewed_at ? format(new Date(review.reviewed_at), 'MMM d, yyyy') : 'N/A'}
                    </p>
                    {review.conditions && (
                      <p className="text-sm mt-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
                        Conditions: {review.conditions}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Request Review Dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('governance.requestReviewTitle', 'Request Stage Gate Review')}</DialogTitle>
            <DialogDescription>
              {t('governance.requestReviewDesc', 'Request a review to advance from {{from}} to {{to}}', { 
                from: getStartupStageLabel(t, currentStage), 
                to: nextStage ? getStartupStageLabel(t, nextStage) : t('governance.nextStage', 'next stage') 
              })}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('governance.evidenceNotes', 'Evidence & Notes (optional)')}</Label>
              <Textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder={t('governance.evidencePlaceholder', 'Describe why you\'re ready for the next stage, key achievements, metrics...')}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestDialog(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleRequestReview} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('governance.submitRequest', 'Submit Request')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Review Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('governance.reviewRequestTitle', 'Review Stage Gate Request')}</DialogTitle>
            <DialogDescription>
              {selectedReview && (
                <>
                  {t('governance.reviewRequestDesc', 'Review request from {{from}} to {{to}}', {
                    from: getStartupStageLabel(t, selectedReview.from_stage as StartupStage),
                    to: getStartupStageLabel(t, selectedReview.to_stage as StartupStage)
                  })}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {selectedReview?.evidence_json && (
              <div className="p-3 rounded bg-muted/50">
                <p className="text-sm font-medium mb-1">{t('governance.submittedEvidence', 'Submitted Evidence:')}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedReview.evidence_json as { notes?: string })?.notes || t('governance.noNotesProvided', 'No notes provided')}
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>{t('governance.decision', 'Decision')}</Label>
              <Select value={decision} onValueChange={(v) => setDecision(v as typeof decision)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      {t('governance.approved', 'Approve')}
                    </div>
                  </SelectItem>
                  <SelectItem value="conditional">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      {t('governance.conditionalApproval', 'Conditional Approval')}
                    </div>
                  </SelectItem>
                  <SelectItem value="rejected">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      {t('governance.rejected', 'Reject')}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {decision === 'conditional' && (
              <div className="space-y-2">
                <Label>{t('governance.conditions', 'Conditions')}</Label>
                <Textarea
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                  placeholder={t('governance.conditionsPlaceholder', 'Describe the conditions that must be met...')}
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button 
              onClick={handleApproveReview} 
              disabled={isSubmitting || (decision === 'conditional' && !conditions.trim())}
              variant={decision === 'rejected' ? 'destructive' : 'default'}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {decision === 'approved' 
                ? t('governance.approved', 'Approve') 
                : decision === 'conditional' 
                ? t('governance.approveWithConditions', 'Approve with Conditions') 
                : t('governance.rejected', 'Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
