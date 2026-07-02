import { useTranslation } from 'react-i18next';
import { FileText, Phone, Calendar, CheckSquare, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActivityType } from '@/hooks/useActivityTimeline';
import { cn } from '@/lib/utils';

interface QuickActionsProps {
  onAddActivity: (type: ActivityType) => void;
  onAddTask: () => void;
  onSyncEmails: () => void;
  emailSyncEnabled: boolean;
  isSyncingEmails: boolean;
}

export function QuickActions({
  onAddActivity,
  onAddTask,
  onSyncEmails,
  emailSyncEnabled,
  isSyncingEmails,
}: QuickActionsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button size="sm" variant="outline" className="h-8" onClick={() => onAddActivity('note')}>
        <FileText className="h-3 w-3 mr-1" />
        {t('crm.addNote')}
      </Button>
      <Button size="sm" variant="outline" className="h-8" onClick={() => onAddActivity('call')}>
        <Phone className="h-3 w-3 mr-1" />
        {t('crm.logCall')}
      </Button>
      <Button size="sm" variant="outline" className="h-8" onClick={() => onAddActivity('meeting')}>
        <Calendar className="h-3 w-3 mr-1" />
        {t('crm.logMeeting')}
      </Button>
      <Button size="sm" variant="outline" className="h-8" onClick={() => onAddTask()}>
        <CheckSquare className="h-3 w-3 mr-1" />
        {t('crm.addTask')}
      </Button>
      {emailSyncEnabled && (
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={onSyncEmails}
          disabled={isSyncingEmails}
        >
          <Mail className={cn('h-3 w-3 mr-1', isSyncingEmails && 'animate-pulse')} />
          {t('crm.syncEmails')}
        </Button>
      )}
    </div>
  );
}
