import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  CheckCircle2, 
  Circle, 
  ListChecks, 
  MessageSquare, 
  Calendar, 
  AlertTriangle,
  Mail,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useSessionWorkflow, useUpdateSessionWorkflow } from '@/hooks/useGovernance';
import { notify } from "@/lib/notify";

interface SessionWorkflowCardProps {
  sessionId: string;
  workspaceId: string;
  canWrite: boolean;
  onCreateAction?: () => void;
  onScheduleSession?: () => void;
  onSendFollowup?: () => void;
}

interface ChecklistItem {
  id: keyof Omit<WorkflowState, 'session_id' | 'created_at' | 'updated_at' | 'completed_at'>;
  label: string;
  description: string;
  icon: React.ReactNode;
  action?: () => void;
  actionLabel?: string;
}

interface WorkflowState {
  session_id: string;
  decisions_done: boolean;
  actions_done: boolean;
  followup_sent: boolean;
  next_session_planned: boolean;
  risks_done: boolean;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}

export function SessionWorkflowCard({ 
  sessionId, 
  workspaceId, 
  canWrite,
  onCreateAction,
  onScheduleSession,
  onSendFollowup,
}: SessionWorkflowCardProps) {
  const { t } = useTranslation();
  const { data: workflowData } = useSessionWorkflow(sessionId);
  const updateSessionWorkflow = useUpdateSessionWorkflow();
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const workflow = workflowData as WorkflowState | undefined;

  

  const checklistItems: ChecklistItem[] = [
    {
      id: 'decisions_done',
      label: 'Decisions Captured',
      description: 'Record key decisions made during the session',
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      id: 'actions_done',
      label: 'Action Items Created',
      description: 'Create action items from session discussions',
      icon: <ListChecks className="h-4 w-4" />,
      action: onCreateAction,
      actionLabel: 'Create Action',
    },
    {
      id: 'followup_sent',
      label: 'Follow-up Sent',
      description: 'Send summary email to participants',
      icon: <Mail className="h-4 w-4" />,
      action: onSendFollowup,
      actionLabel: 'Send Email',
    },
    {
      id: 'next_session_planned',
      label: 'Next Session Planned',
      description: 'Schedule the next meeting',
      icon: <Calendar className="h-4 w-4" />,
      action: onScheduleSession,
      actionLabel: 'Schedule',
    },
    {
      id: 'risks_done',
      label: 'Risks Noted',
      description: 'Document any risks or blockers identified',
      icon: <AlertTriangle className="h-4 w-4" />,
    },
  ];

  const completedCount = checklistItems.filter(
    item => workflow?.[item.id]
  ).length;
  const progress = (completedCount / checklistItems.length) * 100;
  const isComplete = completedCount === checklistItems.length;

  const handleToggle = async (itemId: string, currentValue: boolean) => {
    if (!canWrite) return;
    
    setIsUpdating(itemId);
    try {
      await updateSessionWorkflow.mutateAsync({
        sessionId,
        updates: { [itemId]: !currentValue },
      });
    } catch (error) {
      notify.error(t('sessions.checklistUpdateFailed', 'Failed to update checklist'));
    } finally {
      setIsUpdating(null);
    }
  };

  if (!workflow) {
    return null;
  }

  return (
    <Card className={isComplete ? 'border-[hsl(var(--success))]/30' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-5 w-5 text-primary" />
            Post-Session Checklist
          </CardTitle>
          {isComplete ? (
            <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Complete
            </Badge>
          ) : (
            <Badge variant="secondary">
              {completedCount}/{checklistItems.length}
            </Badge>
          )}
        </div>
        <Progress value={progress} className="h-1.5 mt-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        {checklistItems.map((item) => {
          const isDone = workflow[item.id];
          const isLoading = isUpdating === item.id;

          return (
            <div 
              key={item.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                isDone 
                  ? 'bg-[hsl(var(--success))]/50 border-[hsl(var(--success))]/30 ' 
                  : 'bg-muted/30 border-transparent hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggle(item.id, isDone)}
                  disabled={!canWrite || isLoading}
                  className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isDone 
                      ? 'bg-success border-success text-success-foreground' 
                      : 'border-muted-foreground/30 hover:border-primary'
                  } ${!canWrite ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : null}
                </button>
                <div>
                  <p className={`font-medium text-sm ${isDone ? 'text-[hsl(var(--success))]' : ''}`}>
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
              {!isDone && item.action && canWrite && (
                <Button variant="ghost" size="sm" onClick={item.action}>
                  {item.actionLabel}
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
