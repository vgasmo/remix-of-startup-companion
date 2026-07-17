/**
 * CRM Drawer - Email History Panel
 * Shows synced Outlook emails from communication_log for the funnel item or workspace
 * Includes AI-powered summary generation
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, ArrowDownLeft, ArrowUpRight, RefreshCw, Sparkles, Loader2, ChevronDown, Archive, ArchiveRestore } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { formatRelativeTime } from '@/lib/dateUtils';
import { useRelationshipRecap, useGenerateRecap } from '@/hooks/useActivityTimeline';
import { clickableProps } from '@/lib/clickable';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

/** Convert email body (HTML or text) to safe plain text for display. */
function emailBodyToText(body: string | null | undefined): string {
  if (!body) return '';
  // Strip script/style blocks then tags; decode a few common entities.
  const stripped = body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return stripped
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const VISIBLE_EMAIL_COUNT = 5;

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
  const [showAll, setShowAll] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: emails, isLoading } = useQuery({
    queryKey: ['crm-emails', funnelItemId, workspaceId, showArchived],
    queryFn: async () => {
      let query = supabase
        .from('communication_log')
        .select('id, subject, preview, direction, channel, occurred_at, from_address, status, archived_at')
        .in('channel', ['email', 'outlook'])
        .order('occurred_at', { ascending: false })
        .limit(100);

      if (!showArchived) {
        query = query.is('archived_at', null);
      }

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

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const { error } = await supabase
        .from('communication_log')
        .update({ archived_at: archive ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['crm-emails'] });
      notify.success(
        vars.archive
          ? t('crm.emailArchived', { defaultValue: 'Email arquivado' })
          : t('crm.emailUnarchived', { defaultValue: 'Email restaurado' }),
      );
    },
    onError: () => {
      notify.error(t('common.errorOccurred', { defaultValue: 'Ocorreu um erro' }));
    },
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
              disabled={generateRecap.isPending} loading={generateRecap.isPending}
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
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={() => setShowArchived((v) => !v)}
            title={showArchived
              ? t('crm.hideArchived', { defaultValue: 'Ocultar arquivados' })
              : t('crm.showArchived', { defaultValue: 'Ver arquivados' })}
          >
            {showArchived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
            {showArchived
              ? t('crm.hideArchived', { defaultValue: 'Ocultar arquivados' })
              : t('crm.showArchived', { defaultValue: 'Arquivados' })}
          </Button>
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
            {(() => {
              const visibleEmails = emails.slice(0, VISIBLE_EMAIL_COUNT);
              const hiddenEmails = emails.slice(VISIBLE_EMAIL_COUNT);
              const renderRow = (email: typeof emails[number]) => {
                const isArchived = !!email.archived_at;
                return (
                  <Card
                    key={email.id}
                    className={cn(
                      'group border-border/40 hover:bg-muted/40 hover:border-primary/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      isArchived && 'opacity-60',
                    )}
                    {...clickableProps(() => setSelectedId(email.id), {
                      label: email.subject || t('crm.noSubject', { defaultValue: '(sem assunto)' }),
                    })}
                  >
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
                            <p className="text-xs font-medium truncate flex items-center gap-1">
                              {isArchived && <Archive className="h-3 w-3 text-muted-foreground" />}
                              {email.subject || t('crm.noSubject', { defaultValue: '(sem assunto)' })}
                            </p>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            archiveMutation.mutate({ id: email.id, archive: !isArchived });
                          }}
                          disabled={archiveMutation.isPending}
                          title={isArchived
                            ? t('crm.unarchive', { defaultValue: 'Restaurar' })
                            : t('crm.archive', { defaultValue: 'Arquivar' })}
                          aria-label={isArchived
                            ? t('crm.unarchive', { defaultValue: 'Restaurar' })
                            : t('crm.archive', { defaultValue: 'Arquivar' })}
                        >
                          {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              };


              return (
                <>
                  {visibleEmails.map(renderRow)}
                  {hiddenEmails.length > 0 && (
                    <Collapsible open={showAll} onOpenChange={setShowAll}>
                      <CollapsibleContent className="space-y-1 pt-1 data-[state=open]:animate-in data-[state=closed]:animate-out">
                        {hiddenEmails.map(renderRow)}
                      </CollapsibleContent>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full h-7 text-xs mt-1 justify-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAll && 'rotate-180')} />
                          {showAll
                            ? t('crm.showLess', { defaultValue: 'Mostrar menos' })
                            : t('crm.showMoreEmails', { count: hiddenEmails.length, defaultValue: 'Mostrar mais {{count}}' })}
                        </Button>
                      </CollapsibleTrigger>
                    </Collapsible>
                  )}
                </>
              );
            })()}
          </div>
        </ScrollArea>
      )}

      <EmailDetailDialog
        emailId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function EmailDetailDialog({ emailId, onClose }: { emailId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: email, isLoading } = useQuery({
    queryKey: ['crm-email-detail', emailId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communication_log')
        .select('id, subject, body, preview, from_address, direction, occurred_at, participants_json')
        .eq('id', emailId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!emailId,
  });

  const bodyText = emailBodyToText(email?.body ?? email?.preview ?? '');

  return (
    <Dialog open={!!emailId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-base break-words">
            {email?.subject || t('crm.noSubject', { defaultValue: '(sem assunto)' })}
          </DialogTitle>
          {email && (
            <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {email.from_address && <span className="truncate">{email.from_address}</span>}
              <span>·</span>
              <span>{formatRelativeTime(email.occurred_at)}</span>
              {email.direction && (
                <>
                  <span>·</span>
                  <span className="uppercase tracking-wider">
                    {email.direction === 'inbound'
                      ? t('crm.inbound', { defaultValue: 'Recebido' })
                      : t('crm.outbound', { defaultValue: 'Enviado' })}
                  </span>
                </>
              )}
            </DialogDescription>
          )}
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          {isLoading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          ) : bodyText ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground leading-relaxed">
              {bodyText}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground italic py-4">
              {t('crm.emailNoBody', { defaultValue: 'Sem conteúdo disponível para este email.' })}
            </p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

