/**
 * Session Sync Status indicator and Re-sync button
 * Shows Outlook sync status and allows manual re-sync
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Check, AlertCircle, Clock, Calendar, Video, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { notify } from "@/lib/notify";
import { syncOutlookCalendar } from '@/hooks/useIntegrationTriggers';
import { cn } from '@/lib/utils';

interface SessionSyncStatusProps {
  sessionId: string;
  workspaceId: string;
  syncStatus: string | null;
  syncError: string | null;
  syncedAt: string | null;
  teamsMeetingUrl: string | null;
  canWrite: boolean;
  onSyncComplete?: () => void;
}

export function SessionSyncStatus({
  sessionId,
  workspaceId,
  syncStatus,
  syncError,
  syncedAt,
  teamsMeetingUrl,
  canWrite,
  onSyncComplete,
}: SessionSyncStatusProps) {
  const { t } = useTranslation();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleResync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSyncing(true);
    
    try {
      const result = await syncOutlookCalendar({
        sessionId,
        action: 'update',
        workspaceId,
      });

      if (result.success) {
        notify.success(t('sessions.syncSuccess', 'Session synced to Outlook'));
        onSyncComplete?.();
      } else if (result.reason === 'not_configured') {
        notify.info(t('sessions.syncNotConfigured', 'Outlook sync not configured for this workspace'));
      } else {
        notify.error(t('sessions.syncFailed', 'Sync failed'), {
          description: result.reason,
        });
      }
    } catch (err) {
      notify.error(t('sessions.syncFailed', 'Sync failed'));
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusIcon = () => {
    switch (syncStatus) {
      case 'synced':
        return <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />;
      case 'error':
        return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
      case 'pending':
        return <Clock className="h-3.5 w-3.5 text-amber-500" />;
      default:
        return <Calendar className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getStatusVariant = (): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (syncStatus) {
      case 'synced':
        return 'secondary';
      case 'error':
        return 'destructive';
      case 'pending':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getStatusLabel = () => {
    switch (syncStatus) {
      case 'synced':
        return t('sessions.syncStatusSynced', 'Synced');
      case 'error':
        return t('sessions.syncStatusError', 'Sync Error');
      case 'pending':
        return t('sessions.syncStatusPending', 'Pending');
      default:
        return t('sessions.syncStatusNotSynced', 'Not synced');
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Sync Status Badge */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={getStatusVariant()}
            className={cn(
              "text-xs gap-1 cursor-help",
              syncStatus === 'synced' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
              syncStatus === 'pending' && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            )}
          >
            {getStatusIcon()}
            <span className="hidden sm:inline">{getStatusLabel()}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{t('sessions.outlookSync', 'Sync Outlook')}: {getStatusLabel()}</p>
            {syncError && (
              <p className="text-xs text-destructive">{syncError}</p>
            )}
            {syncedAt && (
              <p className="text-xs text-muted-foreground">
                Last synced: {new Date(syncedAt).toLocaleString()}
              </p>
            )}
            {!syncStatus && (
              <p className="text-xs text-muted-foreground">
                Configure Outlook integration in workspace settings to enable calendar sync.
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Teams Meeting Link */}
      {teamsMeetingUrl && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                window.open(teamsMeetingUrl, '_blank');
              }}
            >
              <Video className="h-4 w-4 text-blue-600" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('sessions.joinTeamsMeeting', 'Entrar na Reunião Teams')}</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Re-sync Button */}
      {canWrite && (syncStatus === 'error' || syncStatus === 'pending') && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleResync}
              disabled={isSyncing}
            >
              <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('sessions.resync', 'Re-sync to Outlook')}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
