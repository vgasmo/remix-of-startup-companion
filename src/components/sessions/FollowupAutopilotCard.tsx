import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
  Send,
  CheckCircle,
  Calendar,
  Loader2,
  Mail,
  ClipboardList,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';

interface FollowupAutopilotCardProps {
  sessionId: string;
  workspaceId: string;
  sessionTitle: string;
  scheduledAt: string;
  decisions?: string | null;
  actions?: Array<{
    id: string;
    title: string;
    due_date: string | null;
    status: string;
  }>;
  workflowState?: {
    followup_sent?: boolean;
    actions_done?: boolean;
    decisions_done?: boolean;
  } | null;
  founderEmail?: string | null;
  startupName: string;
}

export function FollowupAutopilotCard({
  sessionId,
  workspaceId,
  sessionTitle,
  scheduledAt,
  decisions,
  actions = [],
  workflowState,
  founderEmail,
  startupName,
}: FollowupAutopilotCardProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [createFollowupTask, setCreateFollowupTask] = useState(true);

  const hasActions = actions.length > 0;
  const overdueActions = actions.filter(
    (a) => a.due_date && new Date(a.due_date) < new Date() && a.status !== 'completed'
  );
  const newActions = actions.filter((a) => a.status === 'pending' || a.status === 'in_progress');

  const shouldShowFollowup = hasActions || overdueActions.length > 0 || !!decisions;
  const isFollowupSent = workflowState?.followup_sent;

  const handleSendFollowup = async () => {
    if (!user) return;

    setSending(true);
    try {
      // Create follow-up email summary
      const summaryParts = [];
      
      if (decisions) {
        summaryParts.push(`**Decisões:**\n${decisions}`);
      }
      
      if (newActions.length > 0) {
        const actionList = newActions
          .map((a) => `- ${a.title}${a.due_date ? ` (prazo: ${format(new Date(a.due_date), 'dd/MM')})` : ''}`)
          .join('\n');
        summaryParts.push(`**Ações:**\n${actionList}`);
      }

      // Log email to email_log
      await supabase.from('email_log').insert({
        workspace_id: workspaceId,
        session_id: sessionId,
        created_by: user.id,
        email_type: 'session_followup',
        subject: `Resumo da Sessão: ${sessionTitle}`,
        body: summaryParts.join('\n\n'),
        recipients: founderEmail ? [{ email: founderEmail }] : [],
        status: 'pending',
      });

      // Update workflow state
      await supabase
        .from('session_workflow_state')
        .upsert({
          session_id: sessionId,
          followup_sent: true,
          updated_at: new Date().toISOString(),
        });

      // Create staff task for follow-up if requested
      if (createFollowupTask && (hasActions || overdueActions.length > 0)) {
        const followupDate = new Date();
        followupDate.setDate(followupDate.getDate() + 7);

        await supabase.from('staff_tasks').insert({
          assignee_id: user.id, // Assign to current user (consultant)
          workspace_id: workspaceId,
          created_by: user.id,
          title: t('followup.taskTitle', { startup: startupName }),
          description: t('followup.taskDescription', {
            session: sessionTitle,
            actionsCount: newActions.length,
          }),
          task_type: 'followup',
          due_date: followupDate.toISOString().split('T')[0],
          status: 'pending',
        });
      }

      // Log activity
      await supabase.from('activity_log').insert({
        user_id: user.id,
        workspace_id: workspaceId,
        entity_type: 'session',
        entity_id: sessionId,
        action: 'sent_session_followup',
        metadata: { actions_count: newActions.length, created_task: createFollowupTask },
      });

      notify.success(t('followup.sent'));
    } catch (error) {
      logger.error('Failed to send follow-up', {}, error);
      notify.error(t('followup.error'));
    } finally {
      setSending(false);
    }
  };

  if (!shouldShowFollowup) {
    return null;
  }

  return (
    <Card className={isFollowupSent ? 'border-green-200 bg-green-50/30 dark:border-green-900 dark:bg-green-950/10' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            {t('followup.title')}
          </CardTitle>
          {isFollowupSent && (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle className="h-3 w-3 text-green-600" />
              {t('followup.sent')}
            </Badge>
          )}
        </div>
        <CardDescription>
          {t('followup.description')}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary Preview */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm">
          {decisions && (
            <div>
              <p className="font-medium text-xs text-muted-foreground mb-1">{t('followup.decisions')}</p>
              <p className="line-clamp-2">{decisions}</p>
            </div>
          )}
          
          {newActions.length > 0 && (
            <div>
              <p className="font-medium text-xs text-muted-foreground mb-1">
                {t('followup.actionsCount', { count: newActions.length })}
              </p>
              <ul className="space-y-1">
                {newActions.slice(0, 3).map((action) => (
                  <li key={action.id} className="flex items-center gap-2 text-xs">
                    <ClipboardList className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate">{action.title}</span>
                    {action.due_date && (
                      <Badge variant="outline" className="text-[10px] ml-auto">
                        {format(new Date(action.due_date), 'dd/MM')}
                      </Badge>
                    )}
                  </li>
                ))}
                {newActions.length > 3 && (
                  <li className="text-xs text-muted-foreground">
                    +{newActions.length - 3} {t('followup.moreActions')}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Create follow-up task option */}
        {!isFollowupSent && (hasActions || overdueActions.length > 0) && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="create-task"
              checked={createFollowupTask}
              onCheckedChange={(checked) => setCreateFollowupTask(!!checked)}
            />
            <Label htmlFor="create-task" className="text-sm cursor-pointer">
              {t('followup.createTaskIn7Days')}
            </Label>
          </div>
        )}

        {/* Send Button */}
        {!isFollowupSent && (
          <Button onClick={handleSendFollowup} disabled={sending} className="w-full">
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Mail className="h-4 w-4 mr-2" />
            )}
            {t('followup.sendSummary')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
