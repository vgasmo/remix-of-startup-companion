import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { pt, enUS } from 'date-fns/locale';
import { Activity, Search, User, Filter, ChevronDown } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActivityLog, ActivityLogEntry } from '@/hooks/useActivityLog';
import { cn } from '@/lib/utils';

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ',
  updated: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] ',
  deleted: 'bg-destructive/10 text-destructive ',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected: 'bg-destructive/10 text-destructive ',
  completed: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ',
  default: 'bg-muted text-muted-foreground',
};

function getActionColor(action: string): string {
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (action.toLowerCase().includes(key)) return color;
  }
  return ACTION_COLORS.default;
}

export function AdminAuditLog() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith('pt') ? pt : enUS;
  const [searchQuery, setSearchQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');

  const { data: entries, isLoading } = useActivityLog();

  // Get unique entity types for filter
  const entityTypes = [...new Set(entries?.map(e => e.entity_type) || [])].sort();

  const filteredEntries = entries?.filter(entry => {
    if (entityFilter !== 'all' && entry.entity_type !== entityFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        entry.action.toLowerCase().includes(q) ||
        entry.entity_type.toLowerCase().includes(q) ||
        entry.profile?.full_name?.toLowerCase().includes(q) ||
        entry.profile?.email?.toLowerCase().includes(q)
      );
    }
    return true;
  }) || [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('auditLog.searchPlaceholder', 'Search actions, users...')}
            className="pl-9 h-9"
          />
        </div>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <Filter className="h-3.5 w-3.5 mr-2" />
            <SelectValue placeholder={t('auditLog.allEntities', 'All entities')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('auditLog.allEntities', 'All entities')}</SelectItem>
            {entityTypes.map(type => (
              <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Log Entries */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : filteredEntries.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t('auditLog.noEntries', 'No audit log entries found')}</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="space-y-2">
            {filteredEntries.map(entry => (
              <Card key={entry.id} className="rounded-xl border-border/60">
                <CardContent className="p-3 flex items-start gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={entry.profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-xs bg-muted">
                      {entry.profile?.full_name?.slice(0, 2).toUpperCase() || <User className="h-3 w-3" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {entry.profile?.full_name || entry.profile?.email || 'System'}
                      </span>
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', getActionColor(entry.action))}>
                        {entry.action.replace(/_/g, ' ')}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {entry.entity_type.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(entry.created_at), "d MMM yyyy 'às' HH:mm", { locale: dateLocale })}
                    </p>
                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <details className="mt-1">
                        <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                          {t('auditLog.details', 'Details')}
                        </summary>
                        <pre className="text-[10px] text-muted-foreground mt-1 bg-muted/50 rounded p-2 overflow-auto max-h-24">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
