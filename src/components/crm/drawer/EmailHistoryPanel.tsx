/**
 * CRM Drawer - Email History Panel
 * Shows synced Outlook emails from communication_log for the funnel item or workspace
 * Includes AI-powered summary generation
 */
import { useTranslation } from 'react-i18next';
import { Mail, ArrowDownLeft, ArrowUpRight, RefreshCw, Sparkles, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { formatRelativeTime } from '@/lib/dateUtils';
import { useRelationshipRecap, useGenerateRecap } from '@/hooks/useActivityTimeline';
import { cn } from '@/lib/utils';

interface EmailHistoryPanelProps {
  funnelItemId?: string;
  workspaceId?: string;
  onSyncEmails: () => void;
  isSyncing: boolean;
  emailSyncEnabled: boolean;
}

export function EmailHistoryPanel({ funnelItemId, workspaceId, onSyncEmails, isSyncing, emailSyncEnabled }: EmailHistoryPanelProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language.startsWith('pt') ? 'pt' : 'en';

  const { data: emails, isLoading } = useQuery({
    queryKey: ['crm-emails', funnelItemId, workspaceId],
    queryFn: async () => {
      let query = supabase
        .from('communication_log')
        .select('id, subject, preview, direction, channel, occurred_at, from_address, status')
        .in('channel', ['email', 'outlook'])
        .order('occurred_at', { ascending: false })
        .limit(100);

      if (funnelItemId) {
        query = query.eq('funnel_item_id', funnelItemId);
      } else if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!(funnelItemId || workspaceId),
  });

  const { data: recap, isLoading: loadingRecap } = useRelationshipRecap({
    funnelItemId,
    workspaceId,
    language,
  });

  const generateRecap = useGenerateRecap();

  const handleGenerateRecap = () => {
    generateRecap.mutate({
      funnelItemId,
      workspaceId,
      language,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  const hasEmails = emails && emails.length > 0;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" />
          {t('crm.emailHistory', { defaultValue: 'Histórico de Email' })}
          {hasEmails && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {emails.length}
            </Badge>
          )}
        </p>
        <div className="flex items-center gap-1">
          {hasEmails && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={handleGenerateRecap}
              disabled={generateRecap.isPending}
            >
              {generateRecap.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {t('crm.generateSummary', { defaultValue: 'Resumo IA' })}
            </Button>
          )}
          {emailSyncEnabled && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={onSyncEmails}
              disabled={isSyncing}
            >
              <RefreshCw className={cn('h-3 w-3', isSyncing && 'animate-spin')} />
              {t('crm.sync', { defaultValue: 'Sincronizar' })}
            </Button>
          )}
        </div>
      </div>

      {recap && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-primary flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {t('crm.aiSummary', { defaultValue: 'Resumo IA' })}
              </p>
              <span className="text-[10px] text-muted-foreground">
                {t('crm.itemsAnalyzed', { count: recap.items_analyzed, defaultValue: '{{count}} interações analisadas' })}
              </span>
            </div>
            <p className="text-sm text-foreground">{recap.summary}</p>
            {Array.isArray(recap.key_points) && (recap.key_points as string[]).length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('crm.keyPoints', { defaultValue: 'Pontos-chave' })}
                </p>
                <ul className="space-y-0.5">
                  {(recap.key_points as string[]).slice(0, 3).map((point, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(recap.next_best_actions) && (recap.next_best_actions as string[]).length > 0 && (
              <div className="p-2 rounded bg-primary/10 border border-primary/20">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-0.5">
                  {t('crm.nextAction', { defaultValue: 'Próxima ação' })}
                </p>
                <p className="text-xs font-medium">{(recap.next_best_actions as string[])[0]}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!hasEmails ? (
        <Card className="flex-1 border-dashed">
          <CardContent className="flex h-full min-h-[220px] flex-col items-center justify-center p-4 text-center">
            <Mail className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('crm.noEmails', { defaultValue: 'Sem emails sincronizados' })}
            </p>
            {emailSyncEnabled && (
              <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={onSyncEmails} disabled={isSyncing}>
                <RefreshCw className="h-3 w-3 mr-1" />
                {t('crm.syncNow', { defaultValue: 'Sincronizar agora' })}
              </Button>
            )}
            {!emailSyncEnabled && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('crm.emailSyncDisabled', { defaultValue: 'Ative a feature flag crm_graph_email_sync para sincronizar.' })}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="flex-1 min-h-[220px]">
          <div className="space-y-1">
            {emails.map(email => (
              <Card key={email.id} className="border-border/40 hover:bg-muted/40 transition-colors">
                <CardContent className="p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">
                      {email.direction === 'inbound' ? (
                        <ArrowDownLeft className="h-3.5 w-3.5 text-[hsl(var(--info))]" />
                      ) : (
                        <ArrowUpRight className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium truncate">{email.subject || t('crm.noSubject', { defaultValue: '(sem assunto)' })}</p>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {formatRelativeTime(email.occurred_at)}
                        </span>
                      </div>
                      {email.from_address && (
                        <p className="text-[10px] text-muted-foreground truncate">{email.from_address}</p>
                      )}
                      {email.preview && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{email.preview}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
