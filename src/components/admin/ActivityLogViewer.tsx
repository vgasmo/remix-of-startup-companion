import React from 'react';
import { useActivityLog } from '@/hooks/useActivityLog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { Activity, FileText, CheckCircle, Users, Calendar, Target } from 'lucide-react';

const entityIcons: Record<string, React.ReactNode> = {
  action_item: <CheckCircle className="h-4 w-4" />,
  session: <Calendar className="h-4 w-4" />,
  milestone: <Target className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
  workspace: <Users className="h-4 w-4" />,
};

const actionColors: Record<string, string> = {
  created: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ',
  updated: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] ',
  deleted: 'bg-destructive/10 text-destructive ',
  completed: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

interface ActivityLogViewerProps {
  workspaceId?: string;
  maxHeight?: string;
}

export function ActivityLogViewer({ workspaceId, maxHeight = '400px' }: ActivityLogViewerProps) {
  const { data: activities, isLoading } = useActivityLog(workspaceId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Activity Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea style={{ maxHeight }}>
          {!activities?.length ? (
            <div className="flex flex-col items-center text-center py-8">
              <div className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center mb-2">
                <Activity className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-0.5">
                Sem atividade registada
              </p>
              <p className="text-xs text-muted-foreground max-w-[240px]">
                As ações realizadas neste contexto serão registadas aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={activity.profile?.avatar_url || undefined} />
                    <AvatarFallback>
                      {activity.profile?.full_name?.[0] || activity.profile?.email?.[0] || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {activity.profile?.full_name || activity.profile?.email || 'Unknown'}
                      </span>
                      <Badge 
                        variant="secondary" 
                        className={actionColors[activity.action] || 'bg-muted text-foreground'}
                      >
                        {activity.action}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {entityIcons[activity.entity_type] || <Activity className="h-3 w-3" />}
                        {activity.entity_type.replace('_', ' ')}
                      </span>
                    </div>
                    {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {(activity.metadata as Record<string, string>).title || 
                         (activity.metadata as Record<string, string>).name || 
                         JSON.stringify(activity.metadata).slice(0, 50)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
