import { useTranslation } from 'react-i18next';
import { format, formatDistanceToNow } from 'date-fns';
import { AlertCircle, CheckCircle, ExternalLink, RefreshCw, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useUnresolvedIntegrationErrors,
  useResolveIntegrationError,
} from '@/hooks/useIntegrationErrors';

const integrationTypeLabels: Record<string, string> = {
  outlook: 'Outlook Calendar',
  teams: 'Microsoft Teams',
  webhook: 'Webhook',
  email: 'Email',
};

const integrationTypeColors: Record<string, string> = {
  outlook: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] ',
  teams: 'bg-primary/10 text-primary ',
  webhook: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ',
  email: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ',
};

interface IntegrationErrorsPanelProps {
  compact?: boolean;
  maxHeight?: string;
}

export function IntegrationErrorsPanel({ compact = false, maxHeight = '300px' }: IntegrationErrorsPanelProps) {
  const { t } = useTranslation();
  const { data: errors, isLoading, refetch } = useUnresolvedIntegrationErrors();
  const resolveMutation = useResolveIntegrationError();

  const handleResolve = async (errorId: string) => {
    await resolveMutation.mutateAsync(errorId);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {t('integrationErrors.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const errorCount = errors?.length || 0;

  return (
    <Card className={errorCount > 0 ? 'border-destructive/30' : ''}>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertCircle className={`h-4 w-4 ${errorCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            {t('integrationErrors.title')}
            {errorCount > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">{errorCount}</Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()} aria-label={t('common.refresh')}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        {errorCount === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
            {t('integrationErrors.allSmooth')}
          </div>
        ) : (
          <ScrollArea style={{ maxHeight }}>
            <div className="space-y-3">
              {errors?.map((error) => (
                <div
                  key={error.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge
                        variant="secondary"
                        className={integrationTypeColors[error.integration_type] || ''}
                      >
                        {integrationTypeLabels[error.integration_type] || error.integration_type}
                      </Badge>
                      {error.error_code && (
                        <Badge variant="outline" className="text-xs">
                          {error.error_code}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate">{error.error_message}</p>
                    {error.workspace && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Workspace: {error.workspace.startup?.name || 'Unknown'}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(error.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={()=> handleResolve(error.id)}
                        disabled={resolveMutation.isPending}
                       aria-label={t('common.close')}>
                        <X className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('integrationErrors.markResolved')}</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}