import { useDateLocale } from '@/lib/dateLocale';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Building2, CalendarCheck, Target, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { differenceInMonths, addYears, format } from 'date-fns';
import i18n from 'i18next';

interface IncubationStatusCardProps {
  workspaceId: string;
}

export const IncubationStatusCard = memo(function IncubationStatusCard({
  workspaceId,
}: IncubationStatusCardProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  // Fetch contract start date for this workspace
  const { data: contractData } = useQuery({
    queryKey: ['incubation-contract-start', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('startup_contracts')
        .select('start_date')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 300_000,
    enabled: !!workspaceId,
  });

  const startDate = contractData?.start_date ?? null;

  // Top 3 pending milestones
  const { data: pendingMilestones } = useQuery({
    queryKey: ['incubation-pending-milestones', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('milestones')
        .select('id, title, target_date, status')
        .eq('workspace_id', workspaceId)
        .in('status', ['not_started', 'in_progress'])
        .order('target_date', { ascending: true, nullsFirst: false })
        .limit(3);
      if (error) throw error;
      return data || [];
    },
    staleTime: 120_000,
    enabled: !!workspaceId,
  });

  const incubationStats = useMemo(() => {
    if (!startDate) return null;
    const start = new Date(startDate);
    const now = new Date();
    const months = differenceInMonths(now, start);
    const nextReview = addYears(start, Math.ceil(differenceInMonths(now, start) / 12) || 1);
    return { months, nextReview };
  }, [startDate]);

  if (!startDate) return null;

  return (
    <Card className="rounded-2xl overflow-hidden border-border/50 bg-gradient-to-r from-muted/20 via-background to-muted/20">
      <CardContent className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">
              {t('workspace.incubationStatus.title', { defaultValue: 'Estado da Incubação' })}
            </h3>
          </div>
          <Badge variant="secondary" className="text-xs">
            {t('workspace.incubationStatus.ongoing', { defaultValue: 'Em curso' })}
          </Badge>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Incubation Time */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-xl border border-border/40 bg-muted/20 p-3"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] text-muted-foreground font-medium">
                {t('workspace.incubationStatus.incubationTime', { defaultValue: 'Tempo de Incubação' })}
              </span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {incubationStats ? (
                t('workspace.incubationStatus.monthsCount', {
                  count: incubationStats.months,
                  defaultValue: '{{count}} meses',
                })
              ) : '—'}
            </p>
          </motion.div>

          {/* Next Contract Review */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="rounded-xl border border-border/40 bg-muted/20 p-3"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <CalendarCheck className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />
              <span className="text-[11px] text-muted-foreground font-medium">
                {t('workspace.incubationStatus.nextReview', { defaultValue: 'Próxima Revisão' })}
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {incubationStats?.nextReview
                ? format(incubationStats.nextReview, 'MMM yyyy', { locale })
                : '—'}
            </p>
          </motion.div>
        </div>

        {/* Top 3 pending milestones */}
        {pendingMilestones && pendingMilestones.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                {t('workspace.incubationStatus.pendingMilestones', { defaultValue: 'Marcos Pendentes' })}
              </span>
            </div>
            <div className="space-y-1.5">
              {pendingMilestones.map((m, idx) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + idx * 0.05, duration: 0.25 }}
                  className="flex items-center gap-2 rounded-lg border border-border/30 bg-background/50 px-3 py-2"
                >
                  <div className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    m.status === 'in_progress' ? 'bg-primary' : 'bg-muted-foreground/30',
                  )} />
                  <span className="text-xs text-foreground truncate flex-1">{m.title}</span>
                  {m.target_date && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(new Date(m.target_date), 'dd MMM', { locale })}
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
