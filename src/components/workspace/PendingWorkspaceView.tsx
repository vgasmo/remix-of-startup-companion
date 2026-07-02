import { useTranslation } from 'react-i18next';
import { Clock, CheckCircle2, Building2, FileText, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StageBadge } from '@/components/ui/StageBadge';
import { formatRelativeTime } from '@/lib/dateUtils';
import { StartupStage } from '@/types/database';

interface PendingWorkspaceViewProps {
  workspace: {
    id: string;
    stage: StartupStage;
    created_at: string;
    startup: {
      name: string;
      description: string | null;
    } | null;
    program: {
      name: string;
    } | null;
  };
}

export function PendingWorkspaceView({ workspace }: PendingWorkspaceViewProps) {
  const { t } = useTranslation();
  
  return (
    <div className="max-w-2xl mx-auto py-8">
      <Link to="/my-workspaces" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')}
      </Link>

      <Card className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/50">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-[hsl(var(--warning))]/10">
              <Clock className="h-10 w-10 text-[hsl(var(--warning))]" />
            </div>
          </div>
          <CardTitle className="text-2xl flex items-center justify-center gap-2">
            <Building2 className="h-6 w-6" />
            {workspace.startup?.name}
          </CardTitle>
          <CardDescription className="text-base">
            {t('founder.applicationUnderReview')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Badge */}
          <div className="flex justify-center">
            <Badge variant="secondary" className="text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 px-4 py-1">
              <Clock className="h-3.5 w-3.5 mr-1" />
              {t('founder.pending')}
            </Badge>
          </div>

          {/* Application Details */}
          <div className="p-4 rounded-lg bg-background border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('createStartup.programLabel')}</span>
              <span className="font-medium">{workspace.program?.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('createStartup.currentStage')}</span>
              <StageBadge stage={workspace.stage} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('admin.submitted', 'Submitted')}</span>
              <span className="text-sm">{formatDistanceToNow(new Date(workspace.created_at), { addSuffix: true })}</span>
            </div>
          </div>

          {/* Description if available */}
          {workspace.startup?.description && (
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm flex items-start gap-2">
                <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                {workspace.startup.description}
              </p>
            </div>
          )}

          {/* What happens next */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">{t('approval.whatHappensNext', 'What happens next?')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-[hsl(var(--success))]" />
                {t('approval.step1', 'Our team will review your application')}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                {t('approval.step2', 'You\'ll be notified once approved')}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                {t('approval.step3', 'Access all workspace features after approval')}
              </li>
            </ul>
          </div>

          {/* Response time note */}
          <p className="text-center text-sm text-muted-foreground">
            {t('founder.responseTime')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
