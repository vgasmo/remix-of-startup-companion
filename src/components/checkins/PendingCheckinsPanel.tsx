import React from 'react';
import { useAllPendingCheckins } from '@/hooks/useCheckins';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardCheck, AlertTriangle, Clock, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Link } from 'react-router-dom';

export function PendingCheckinsPanel() {
  const { data: pendingCheckins, isLoading } = useAllPendingCheckins();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Check-ins Pendentes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const overdueCount = pendingCheckins?.filter(c => c.compliance_status === 'overdue').length || 0;
  const needsUpdateCount = pendingCheckins?.filter(c => c.compliance_status === 'needs_update').length || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Check-ins Pendentes
          </span>
          <div className="flex gap-2">
            {overdueCount > 0 && (
              <Badge variant="destructive">{overdueCount} overdue</Badge>
            )}
            {needsUpdateCount > 0 && (
              <Badge variant="secondary">{needsUpdateCount} pending</Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!pendingCheckins?.length ? (
          <p className="text-muted-foreground text-center py-4">
            All check-ins are up to date! 🎉
          </p>
        ) : (
          <div className="space-y-3">
            {pendingCheckins.slice(0, 10).map(checkin => (
              <div
                key={checkin.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/workspace/${checkin.workspace_id}?tab=overview`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {checkin.startup_name}
                    </Link>
                    {checkin.compliance_status === 'overdue' ? (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Overdue
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {checkin.program_name} • Due {formatDistanceToNow(new Date(checkin.due_date), { 
                      addSuffix: true,
                      locale: pt 
                    })}
                  </p>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/workspace/${checkin.workspace_id}?tab=overview`}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
            {pendingCheckins.length > 10 && (
              <p className="text-sm text-muted-foreground text-center">
                +{pendingCheckins.length - 10} more pending check-ins
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
