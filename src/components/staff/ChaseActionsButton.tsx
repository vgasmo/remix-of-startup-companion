import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Bell, Loader2 } from 'lucide-react';
import { useLogActivity } from '@/hooks/useActivityLog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ChaseActionsButtonProps {
  workspaceId: string;
  startupName: string;
  overdueCount: number;
  founderId?: string;
}

export function ChaseActionsButton({ 
  workspaceId, 
  startupName, 
  overdueCount,
  founderId 
}: ChaseActionsButtonProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const logActivityMutation = useLogActivity();
  const [isSending, setIsSending] = useState(false);

  const handleChaseActions = async () => {
    if (!user || overdueCount === 0) return;
    
    setIsSending(true);
    try {
      // Log the chase action
      await logActivityMutation.mutateAsync({
        action: 'chase_actions',
        entityType: 'workspace',
        entityId: workspaceId,
        workspaceId: workspaceId,
        metadata: {
          overdue_count: overdueCount,
          message_sent: true,
          startup_name: startupName
        }
      });

      toast({
        title: t('triage.chaseSuccess', 'Follow-up sent'),
        description: t('triage.chaseSuccessDescription', 'The founder has been notified about overdue actions'),
      });
    } catch (error) {
      logger.error('Failed to send chase message', {}, error);
      toast({
        title: t('common.error', 'Error'),
        description: t('triage.chaseError', 'Failed to send follow-up message'),
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  if (overdueCount === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={handleChaseActions}
            disabled={isSending} loading={isSending}
            className="text-warning border-warning/50 hover:bg-warning/10"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('triage.chaseTooltip', 'Send follow-up reminder for {{count}} overdue actions', { count: overdueCount })}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
