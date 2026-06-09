/**
 * RecordDrawer sub-components - Activity Timeline
 */
import { useTranslation } from 'react-i18next';
import {
  Mail,
  Phone,
  Calendar,
  CheckSquare,
  FileText,
  Sparkles,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react';
import { ActivityType, ActivityEntry } from '@/hooks/useActivityTimeline';
import { formatRelativeTime } from '@/lib/dateUtils';

export function ActivityItem({ activity }: { activity: ActivityEntry }) {
  const { t } = useTranslation();
  
  const iconMap: Record<ActivityType, typeof Mail> = {
    email: Mail,
    call: Phone,
    meeting: Calendar,
    task: CheckSquare,
    note: FileText,
    system: Sparkles,
  };
  
  const Icon = iconMap[activity.activity_type] || FileText;
  
  return (
    <div className="flex gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="shrink-0 mt-0.5">
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium truncate">{activity.subject || t(`crm.activityType.${activity.activity_type}`)}</p>
          {activity.direction && (
            <span className="shrink-0">
              {activity.direction === 'inbound' ? (
                <ArrowDownRight className="h-3 w-3 text-[hsl(var(--info))]" />
              ) : (
                <ArrowUpRight className="h-3 w-3 text-[hsl(var(--success))]" />
              )}
            </span>
          )}
        </div>
        {activity.preview && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{activity.preview}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          {formatRelativeTime(activity.occurred_at)}
          {activity.external_source && ` • ${activity.external_source}`}
        </p>
      </div>
    </div>
  );
}
