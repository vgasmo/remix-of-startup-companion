import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO, differenceInDays, startOfDay, addDays, isWithinInterval } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Milestone } from '@/hooks/useMilestones';

interface MilestoneGanttProps {
  milestones: Milestone[];
  className?: string;
}

const STATUS_COLORS = {
  not_started: 'bg-muted',
  in_progress: 'bg-primary',
  completed: 'bg-[hsl(var(--success))]',
  delayed: 'bg-destructive',
};

export function MilestoneGantt({ milestones, className }: MilestoneGanttProps) {
  const { t } = useTranslation();
  const { chartData, dateRange, totalDays } = useMemo(() => {
    const milestonesWithDates = milestones.filter(m => m.target_date);
    
    if (milestonesWithDates.length === 0) {
      return { chartData: [], dateRange: { start: new Date(), end: new Date() }, totalDays: 30 };
    }

    const dates = milestonesWithDates.map(m => parseISO(m.target_date!));
    const minDate = startOfDay(new Date(Math.min(...dates.map(d => d.getTime()))));
    const maxDate = startOfDay(new Date(Math.max(...dates.map(d => d.getTime()))));
    
    // Add padding
    const start = addDays(minDate, -7);
    const end = addDays(maxDate, 14);
    const totalDays = Math.max(differenceInDays(end, start), 30);

    const chartData = milestonesWithDates.map(m => {
      const targetDate = parseISO(m.target_date!);
      const position = (differenceInDays(targetDate, start) / totalDays) * 100;
      
      return {
        ...m,
        position: Math.max(0, Math.min(100, position)),
        targetDate,
      };
    });

    return { chartData, dateRange: { start, end }, totalDays };
  }, [milestones]);

  // Generate month markers
  const monthMarkers = useMemo(() => {
    const markers: { label: string; position: number }[] = [];
    let currentDate = dateRange.start;
    
    while (currentDate <= dateRange.end) {
      const position = (differenceInDays(currentDate, dateRange.start) / totalDays) * 100;
      if (position >= 0 && position <= 100) {
        markers.push({
          label: format(currentDate, 'MMM'),
          position,
        });
      }
      currentDate = addDays(currentDate, 30);
    }
    
    return markers;
  }, [dateRange, totalDays]);

  // Today marker
  const todayPosition = useMemo(() => {
    const today = startOfDay(new Date());
    if (isWithinInterval(today, { start: dateRange.start, end: dateRange.end })) {
      return (differenceInDays(today, dateRange.start) / totalDays) * 100;
    }
    return null;
  }, [dateRange, totalDays]);

  if (chartData.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-muted-foreground">
          Add milestones with target dates to see the Gantt chart
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{t('milestones.timeline', 'Milestone Timeline')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline header */}
          <div className="relative h-8 mb-2 border-b">
            {monthMarkers.map((marker, i) => (
              <div
                key={i}
                className="absolute text-xs text-muted-foreground"
                style={{ left: `${marker.position}%` }}
              >
                {marker.label}
              </div>
            ))}
          </div>

          {/* Today marker */}
          {todayPosition !== null && (
            <div
              className="absolute top-8 bottom-0 w-0.5 bg-primary z-10"
              style={{ left: `${todayPosition}%` }}
            >
              <Badge 
                variant="default" 
                className="absolute -top-6 -translate-x-1/2 text-[10px] px-1.5"
              >
                Today
              </Badge>
            </div>
          )}

          {/* Milestones */}
          <div className="space-y-2 pt-2">
            {chartData.map((milestone) => (
              <div key={milestone.id} className="relative h-10 flex items-center">
                {/* Track */}
                <div className="absolute inset-x-0 h-1 bg-muted/50 rounded-full" />
                
                {/* Milestone marker */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`absolute z-20 cursor-pointer transition-transform hover:scale-125`}
                      style={{ left: `${milestone.position}%` }}
                    >
                      <div className={`
                        h-4 w-4 rounded-full border-2 border-background shadow-sm
                        ${STATUS_COLORS[milestone.status]}
                      `} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="font-medium">{milestone.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(milestone.targetDate, 'MMM d, yyyy')}
                    </p>
                    <Badge variant="outline" className="mt-1 text-xs capitalize">
                      {milestone.status.replace('_', ' ')}
                    </Badge>
                  </TooltipContent>
                </Tooltip>

                {/* Label */}
                <div 
                  className="absolute text-xs font-medium truncate max-w-[150px]"
                  style={{ 
                    left: `${Math.min(milestone.position + 2, 70)}%`,
                    transform: milestone.position > 70 ? 'translateX(-100%)' : 'none'
                  }}
                >
                  {milestone.title}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-6 pt-4 border-t text-xs">
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <div key={status} className="flex items-center gap-1.5">
                <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
                <span className="text-muted-foreground capitalize">{status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
