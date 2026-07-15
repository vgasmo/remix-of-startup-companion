import { useTranslation } from 'react-i18next';
import { useRoomAllocations, type RoomAllocation } from '@/hooks/useBackoffice';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Building2, User, Calendar, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { useDateLocale, timeAgo } from '@/lib/dateLocale';
import { cn } from '@/lib/utils';

interface RoomAllocationHistoryProps {
  roomId: string;
  roomName?: string;
}

export function RoomAllocationHistory({ roomId, roomName }: RoomAllocationHistoryProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { data: allocations, isLoading } = useRoomAllocations(roomId);

  const getOccupantName = (alloc: RoomAllocation): string => {
    return alloc.workspace?.startup?.name ||
      alloc.funnel_item?.organization_name ||
      alloc.funnel_item?.contact_name ||
      t('admin.backoffice.unknownOccupant', 'Unknown');
  };

  const isActive = (alloc: RoomAllocation): boolean => {
    if (!alloc.end_date) return true;
    return new Date(alloc.end_date) >= new Date();
  };

  const getAllocTypeBadge = (type: string) => {
    const variants: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      permanent: { label: 'Permanent', variant: 'default' },
      temporary: { label: 'Temporary', variant: 'secondary' },
      hotdesk: { label: 'Hot Desk', variant: 'outline' },
    };
    const config = variants[type] || { label: type, variant: 'outline' };
    return <Badge variant={config.variant} className="text-xs">{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!allocations || allocations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{t('admin.backoffice.noAllocationHistory', 'No allocation history for this room')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          {t('admin.backoffice.allocationHistory', 'Allocation History')}
        </h4>
        <Badge variant="secondary" className="text-xs">
          {allocations.length} {t('admin.backoffice.allocations', 'allocations')}
        </Badge>
      </div>

      <ScrollArea className="h-[250px]">
        <div className="space-y-2 pr-2">
          {allocations.map((alloc) => {
            const occupantName = getOccupantName(alloc);
            const active = isActive(alloc);

            return (
              <Card
                key={alloc.id}
                className={cn(
                  'transition-all',
                  active && 'border-primary/50 bg-primary/5'
                )}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {alloc.workspace?.startup ? (
                          <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className={cn(
                          'font-medium text-sm truncate',
                          active && 'text-primary'
                        )}>
                          {occupantName}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>{format(new Date(alloc.start_date), 'MMM dd, yyyy', { locale: dateLocale })}</span>
                        <ArrowRight className="h-3 w-3 shrink-0" />
                        {alloc.end_date ? (
                          <span>{format(new Date(alloc.end_date), 'MMM dd, yyyy', { locale: dateLocale })}</span>
                        ) : (
                          <span className="text-primary font-medium">{t('admin.backoffice.present', 'Present')}</span>
                        )}
                      </div>

                      {alloc.notes && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {alloc.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {getAllocTypeBadge(alloc.allocation_type)}
                      {active && (
                        <Badge variant="default" className="text-xs bg-accent text-accent-foreground">
                          {t('admin.backoffice.active', 'Active')}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {active && alloc.start_date && (
                    <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                      {t('admin.backoffice.occupiedFor', 'Occupied for')} {timeAgo(new Date(alloc.start_date))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
