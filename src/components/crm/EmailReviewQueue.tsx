/**
 * Email Review Queue — shows unmatched/low-confidence emails for staff triage.
 * Staff can attach to CRM contact/startup, or ignore.
 */
import { useTranslation } from 'react-i18next';
import { Mail, ArrowDownLeft, ArrowUpRight, Link2, XCircle, AlertTriangle, Inbox } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useUnmatchedEmails, useIgnoreEmail } from '@/hooks/crm/useEmailSync';
import { formatRelativeTime } from '@/lib/dateUtils';

interface EmailReviewQueueProps {
  onAttach?: (emailId: string) => void;
}

export function EmailReviewQueue({ onAttach }: EmailReviewQueueProps) {
  const { t } = useTranslation();
  const { data: emails, isLoading } = useUnmatchedEmails();
  const ignoreEmail = useIgnoreEmail();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
          {t('crm.emailReviewQueue', { defaultValue: 'Emails para Revisão' })}
          {emails && emails.length > 0 && (
            <Badge variant="secondary" className="text-xs">{emails.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!emails || emails.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('crm.noUnmatchedEmails', { defaultValue: 'Sem emails por resolver' })}
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2">
              {emails.map(email => (
                <Card key={email.id} className="border-border/40">
                  <CardContent className="p-3">
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
                          <p className="text-xs font-medium truncate">{email.subject || '(sem assunto)'}</p>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatRelativeTime(email.occurred_at)}
                          </span>
                        </div>
                        {email.from_address && (
                          <p className="text-[10px] text-muted-foreground truncate">{email.from_address}</p>
                        )}
                        {email.preview && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{email.preview}</p>
                        )}
                        {email.matching_method && (
                          <Badge variant="outline" className="text-[10px] mt-1">
                            {email.matching_method}
                          </Badge>
                        )}
                        <div className="flex items-center gap-1.5 mt-2">
                          {onAttach && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] gap-1"
                              onClick={() => onAttach(email.id)}
                            >
                              <Link2 className="h-3 w-3" />
                              {t('crm.attachToCrm', { defaultValue: 'Associar' })}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] gap-1 text-muted-foreground"
                            onClick={() => ignoreEmail.mutate(email.id)}
                            disabled={ignoreEmail.isPending} loading={ignoreEmail.isPending}
                          >
                            <XCircle className="h-3 w-3" />
                            {t('crm.ignoreEmail', { defaultValue: 'Ignorar' })}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
