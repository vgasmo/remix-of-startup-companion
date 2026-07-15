import { timeAgo } from '@/lib/dateLocale';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, subDays, isAfter, isBefore } from 'date-fns';
import {
  CheckCircle2,
  FileText,
  Calendar,
  User,
  Filter,
  Search,
  ChevronDown,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useActivityLog } from '@/hooks/useActivityLog';


const entityIcons: Record<string, typeof FileText> = {
  action_item: CheckCircle2,
  session: Calendar,
  document: FileText,
  kpi: FileText,
  milestone: FileText,
};

const actionColors: Record<string, string> = {
  created: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ',
  updated: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] ',
  deleted: 'bg-destructive/10 text-destructive ',
  completed: 'bg-primary/10 text-primary ',
};

interface ActivityLogViewerEnhancedProps {
  workspaceId?: string;
  maxHeight?: string;
}

export function ActivityLogViewerEnhanced({ workspaceId, maxHeight = '500px' }: ActivityLogViewerEnhancedProps) {
  const { t } = useTranslation();
  const { data: activities, isLoading } = useActivityLog(workspaceId);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [showFilters, setShowFilters] = useState(false);

  // Quick date presets
  const datePresets = [
    { label: t('activityLog.today'), value: 'today' },
    { label: t('activityLog.last7Days'), value: '7d' },
    { label: t('activityLog.last30Days'), value: '30d' },
  ];

  const applyDatePreset = (preset: string) => {
    const now = new Date();
    switch (preset) {
      case 'today':
        setDateRange({ from: new Date(now.setHours(0, 0, 0, 0)), to: new Date() });
        break;
      case '7d':
        setDateRange({ from: subDays(now, 7), to: new Date() });
        break;
      case '30d':
        setDateRange({ from: subDays(now, 30), to: new Date() });
        break;
    }
  };

  // Get unique action/entity types from data
  const actionTypes = useMemo(() => {
    if (!activities) return [];
    return [...new Set(activities.map(a => a.action))];
  }, [activities]);

  const entityTypes = useMemo(() => {
    if (!activities) return [];
    return [...new Set(activities.map(a => a.entity_type))];
  }, [activities]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    if (!activities) return [];
    
    return activities.filter(activity => {
      // Search filter
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const matchesUser = activity.profile?.full_name?.toLowerCase().includes(searchLower);
        const matchesEntity = activity.entity_type.toLowerCase().includes(searchLower);
        const matchesAction = activity.action.toLowerCase().includes(searchLower);
        if (!matchesUser && !matchesEntity && !matchesAction) return false;
      }

      // Action filter
      if (actionFilter !== 'all' && activity.action !== actionFilter) return false;

      // Entity filter
      if (entityFilter !== 'all' && activity.entity_type !== entityFilter) return false;

      // Date range filter
      const activityDate = new Date(activity.created_at);
      if (dateRange.from && isBefore(activityDate, dateRange.from)) return false;
      if (dateRange.to && isAfter(activityDate, dateRange.to)) return false;

      return true;
    });
  }, [activities, searchQuery, actionFilter, entityFilter, dateRange]);

  const clearFilters = () => {
    setSearchQuery('');
    setActionFilter('all');
    setEntityFilter('all');
    setDateRange({});
  };

  const hasActiveFilters = searchQuery || actionFilter !== 'all' || entityFilter !== 'all' || dateRange.from || dateRange.to;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {t('activityLog.title')}
          </CardTitle>
          <Button 
            variant={showFilters ? 'secondary' : 'outline'} 
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            {t('activityLog.filters')}
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-2">{t('activityLog.active')}</Badge>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Search & Filters */}
        {showFilters && (
          <div className="space-y-3 p-3 rounded-lg bg-muted/50">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('activityLog.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  {t('activityLog.clear')}
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t('activityLog.action')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('activityLog.allActions')}</SelectItem>
                  {actionTypes.map(action => (
                    <SelectItem key={action} value={action}>{action}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t('activityLog.entity')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('activityLog.allEntities')}</SelectItem>
                  {entityTypes.map(entity => (
                    <SelectItem key={entity} value={entity}>{entity.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-1">
                {datePresets.map(preset => (
                  <Button
                    key={preset.value}
                    variant="outline"
                    size="sm"
                    onClick={() => applyDatePreset(preset.value)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Activity List */}
        <ScrollArea style={{ maxHeight }}>
          <div className="space-y-2">
            {filteredActivities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>{t('activityLog.noActivities')}</p>
              </div>
            ) : (
              filteredActivities.map(activity => {
                const Icon = entityIcons[activity.entity_type] || FileText;
                return (
                  <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={activity.profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">
                        {activity.profile?.full_name?.slice(0, 2).toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{activity.profile?.full_name || 'Unknown'}</span>
                        <Badge variant="outline" className={`text-xs ${actionColors[activity.action] || ''}`}>
                          {activity.action}
                        </Badge>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Icon className="h-3 w-3" />
                          {activity.entity_type.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {timeAgo(new Date(activity.created_at))}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Results count */}
        <div className="text-xs text-muted-foreground text-center">
          {t('activityLog.showing', { count: filteredActivities.length, total: activities?.length || 0 })}
        </div>
      </CardContent>
    </Card>
  );
}
