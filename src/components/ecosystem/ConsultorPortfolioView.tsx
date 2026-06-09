import { useMemo, useState } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, User, Building2, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EcosystemItem } from '@/hooks/useEcosystemItems';
import { getStartupStageLabel, getFunnelStageLabel, STARTUP_STAGE_KEYS, FUNNEL_STAGE_KEYS } from '@/lib/stageLabels';
import type { StartupStage } from '@/types/database';
import type { FunnelStage } from '@/constants/funnelStages';

interface ConsultorPortfolioViewProps {
  items: EcosystemItem[];
}

interface ConsultorGroup {
  id: string;
  name: string;
  items: EcosystemItem[];
}

export function ConsultorPortfolioView({ items }: ConsultorPortfolioViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, ConsultorGroup>();
    const unassignedKey = '__unassigned__';

    for (const item of items) {
      const key = item.owner_id || unassignedKey;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: key === unassignedKey
            ? t('ecosystem.unassigned', 'Sem consultor atribuído')
            : item.owner_name || t('common.unnamed', 'Sem nome'),
          items: [],
        });
      }
      map.get(key)!.items.push(item);
    }

    // Sort: assigned first (alphabetical), unassigned last
    return Array.from(map.values()).sort((a, b) => {
      if (a.id === unassignedKey) return 1;
      if (b.id === unassignedKey) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [items, t]);

  const getHealthColor = (score: string | null) => {
    if (!score) return 'bg-muted text-muted-foreground';
    const n = parseInt(score);
    if (n >= 70) return 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ';
    if (n >= 40) return 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ';
    return 'bg-destructive/10 text-destructive ';
  };

  return (
    <div className="space-y-3">
      {groups.map(group => {
        const isExpanded = expandedId === group.id;
        const workspaces = group.items.filter(i => i.item_type === 'workspace');
        const leads = group.items.filter(i => i.item_type === 'lead');

        return (
          <Collapsible
            key={group.id}
            open={isExpanded}
            onOpenChange={open => setExpandedId(open ? group.id : null)}
          >
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {group.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium">{group.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {workspaces.length} {t('ecosystem.workspaces', 'workspaces')} · {leads.length} {t('ecosystem.leads', 'leads')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {group.items.length}
                      </Badge>
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 pb-3 px-4">
                  <div className="space-y-1">
                    {group.items.map(item => (
                      <div
                        key={item.id}
                        className="group flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                        {...clickableProps(() => {
                          if (item.item_type === 'workspace' && item.workspace_id) {
                            navigate(`/workspace/${item.workspace_id}`);
                          } else if (item.item_type === 'lead' && item.funnel_item_id) {
                            navigate(`/crm?open=${item.funnel_item_id}`);
                          }
                        })}
                      >
                        <div className="flex-shrink-0">
                          {item.item_type === 'workspace' ? (
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Briefcase className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary group-hover:underline transition-colors">{item.name || t('common.unnamed')}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.program_name || '—'} · {item.stage
                              ? (item.stage in STARTUP_STAGE_KEYS
                                  ? getStartupStageLabel(t, item.stage as StartupStage)
                                  : item.stage in FUNNEL_STAGE_KEYS
                                    ? getFunnelStageLabel(t, item.stage as FunnelStage)
                                    : item.stage.replace(/_/g, ' '))
                              : '—'}
                          </p>
                        </div>
                        {item.health_score && (
                          <Badge variant="outline" className={cn('text-xs', getHealthColor(item.health_score))}>
                            {item.health_score}
                          </Badge>
                        )}
                        {item.startup_category && (
                          <Badge variant="outline" className="text-xs">
                            {item.startup_category}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}

      {groups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>{t('ecosystem.noItems', 'Sem dados para mostrar')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
