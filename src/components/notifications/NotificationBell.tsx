import { useState } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck, Trash2, Clock, AlertTriangle, Mail, Siren, Sparkles, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  Notification,
} from '@/hooks/useNotifications';
import { formatRelativeTime } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

// CRM notification type icons - more specific mappings
const NOTIFICATION_ICONS: Record<string, typeof Bell> = {
  task_due: Clock,
  task_overdue: AlertTriangle,
  next_action_due: Pin,
  next_action_overdue: AlertTriangle,
  recap_ready: Sparkles,
  email_sync_done: Mail,
  overdue_escalated: Siren,
  system: Bell,
  // Automation types
  discount_expiring: Clock,
  contract_anniversary: Sparkles,
  founder_inactive: Clock,
  contract_expiring: AlertTriangle,
  checkin_overdue: Clock,
  kpi_stale: AlertTriangle,
  crm_lead_stale: Clock,
  milestone_overdue: AlertTriangle,
  pending_approval: Bell,
  intake_stale: Mail,
  session_no_notes: Pin,
  workspace_no_consultant: Siren,
};

// Type-specific colors for better visual hierarchy
const NOTIFICATION_COLORS: Record<string, string> = {
  task_due: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]',
  task_overdue: 'bg-destructive/10 text-destructive',
  next_action_due: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]',
  next_action_overdue: 'bg-destructive/10 text-destructive',
  recap_ready: 'bg-primary/10 text-primary',
  email_sync_done: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]',
  overdue_escalated: 'bg-destructive/10 text-destructive',
  system: 'bg-muted text-muted-foreground',
  // Automation types
  discount_expiring: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]',
  contract_anniversary: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ',
  founder_inactive: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ',
  contract_expiring: 'bg-destructive/10 text-destructive',
  checkin_overdue: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]',
  kpi_stale: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ',
  crm_lead_stale: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]',
  milestone_overdue: 'bg-destructive/10 text-destructive',
  pending_approval: 'bg-primary/10 text-primary ',
  intake_stale: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]',
  session_no_notes: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]',
  workspace_no_consultant: 'bg-destructive/10 text-destructive',
};

export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: notifications, isLoading } = useNotifications();
  const unreadCount = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteNotification = useDeleteNotification();

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markRead.mutate(notification.id);
    }
    if (notification.link) {
      window.location.href = notification.link;
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t('common._iconOpenNotifications')}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold text-sm">{t('notifications.title')}</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending} loading={markAllRead.isPending}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              {t('notifications.markAllRead')}
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t('common.loading')}
            </div>
          ) : !notifications?.length ? (
            <div className="p-8 text-center">
              <Bell className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">{t('emptyStates.noNotifications')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('emptyStates.noNotificationsDesc')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
                const colorClass = NOTIFICATION_COLORS[notification.type] || 'bg-muted text-muted-foreground';
                
                return (
                  <div
                    key={notification.id}
                    className={cn(
                      'p-3 hover:bg-muted/50 cursor-pointer transition-colors flex gap-3 group',
                      !notification.read && 'bg-primary/5'
                    )}
                    {...clickableProps(() => handleNotificationClick(notification))}
                  >
                    <div className={cn(
                      'shrink-0 mt-0.5 h-8 w-8 rounded-full flex items-center justify-center',
                      colorClass
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          'text-sm truncate',
                          !notification.read && 'font-medium'
                        )}>
                          {notification.title}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification.mutate(notification.id);
                          }}
                         aria-label={t('common.delete')}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {notification.message && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {notification.message}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatRelativeTime(notification.created_at)}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="shrink-0 mt-1">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}