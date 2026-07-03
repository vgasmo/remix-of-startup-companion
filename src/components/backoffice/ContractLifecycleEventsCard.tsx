/**
 * ContractLifecycleEventsCard — Dashboard card showing upcoming lifecycle deadlines
 * Anniversaries, biennial price reviews, notice windows, incubation limits
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RenewContractDialog } from '@/components/backoffice/contracts/RenewContractDialog';
import {
  CalendarClock, Cake, AlertTriangle, Clock, FileText,
  CheckCircle2, RefreshCw, Bell
} from 'lucide-react';
import { format, differenceInDays, addYears, subDays } from 'date-fns';
import { cn } from '@/lib/utils';


interface ContractForEvents {
  id: string;
  start_date: string;
  end_date: string | null;
  status: string;
  monthly_fee: number;
  contract_number: string | null;
  workspace: { id: string; startup: { name: string } | null } | null;
  incubation_type: { name: string; contract_type: string | null } | null;
}

interface LifecycleEvent {
  contractId: string;
  startupName: string;
  contractNumber: string | null;
  eventType: 'anniversary' | 'biennial_review' | 'notice_window' | 'incubation_limit' | 'post_incubation';
  deadline: Date;
  daysUntil: number;
  severity: 'info' | 'warning' | 'critical';
  actionKey: string;
}

export function ContractLifecycleEventsCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [renewContract, setRenewContract] = useState<ContractForEvents | null>(null);




  const { data: contracts, isLoading } = useQuery({
    queryKey: ['lifecycle-events-contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('startup_contracts')
        .select(`
          id, start_date, end_date, status, monthly_fee, contract_number,
          workspace:workspaces(id, startup:startups(name)),
          incubation_type:incubation_types(name, contract_type)
        `)
        .eq('status', 'active')
        .order('start_date', { ascending: true });
      if (error) throw error;
      return data as ContractForEvents[];
    },
  });

  const events = useMemo(() => {
    if (!contracts) return [];
    const today = new Date();
    const result: LifecycleEvent[] = [];

    contracts.forEach(contract => {
      const startDate = new Date(contract.start_date);
      const startupName = contract.workspace?.startup?.name || '—';
      const monthsSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
      const yearsSinceStart = Math.floor(monthsSinceStart / 12);

      // 1. Anniversary within 60 days
      const nextAnniversary = addYears(startDate, yearsSinceStart + 1);
      const daysToAnniversary = differenceInDays(nextAnniversary, today);
      if (daysToAnniversary > 0 && daysToAnniversary <= 60) {
        result.push({
          contractId: contract.id,
          startupName,
          contractNumber: contract.contract_number,
          eventType: 'anniversary',
          deadline: nextAnniversary,
          daysUntil: daysToAnniversary,
          severity: daysToAnniversary <= 15 ? 'warning' : 'info',
          actionKey: 'lifecycle.stepper.reviewFees',
        });
      }

      // 2. Biennial price review — contracts ~24 months old (within 90 days of 2-year mark)
      const twoYearMark = addYears(startDate, 2);
      const daysToTwoYear = differenceInDays(twoYearMark, today);
      // Also check every subsequent 2-year interval
      const nextReviewYear = yearsSinceStart < 2 ? 2 : yearsSinceStart + (yearsSinceStart % 2 === 0 ? 2 : 1);
      const nextReviewDate = addYears(startDate, nextReviewYear);
      const daysToNextReview = differenceInDays(nextReviewDate, today);
      
      if (daysToNextReview > 0 && daysToNextReview <= 90) {
        result.push({
          contractId: contract.id,
          startupName,
          contractNumber: contract.contract_number,
          eventType: 'biennial_review',
          deadline: nextReviewDate,
          daysUntil: daysToNextReview,
          severity: daysToNextReview <= 30 ? 'critical' : 'warning',
          actionKey: 'lifecycle.stepper.prepareReview',
        });
      }

      // 3. 60-day notice window (price review notice must be sent 60 days before effect)
      // The notice window opens 60 days before any biennial review
      const noticeDeadline = subDays(nextReviewDate, 60);
      const daysToNotice = differenceInDays(noticeDeadline, today);
      if (daysToNotice >= -5 && daysToNotice <= 30 && daysToNextReview > 0) {
        result.push({
          contractId: contract.id,
          startupName,
          contractNumber: contract.contract_number,
          eventType: 'notice_window',
          deadline: noticeDeadline,
          daysUntil: Math.max(0, daysToNotice),
          severity: daysToNotice <= 0 ? 'critical' : 'warning',
          actionKey: 'lifecycle.stepper.sendNotice',
        });
      }

      // 4. 3-year incubation limit (within 90 days)
      const threeYearMark = addYears(startDate, 3);
      const daysToThreeYear = differenceInDays(threeYearMark, today);
      if (daysToThreeYear > 0 && daysToThreeYear <= 90) {
        result.push({
          contractId: contract.id,
          startupName,
          contractNumber: contract.contract_number,
          eventType: 'incubation_limit',
          deadline: threeYearMark,
          daysUntil: daysToThreeYear,
          severity: daysToThreeYear <= 30 ? 'critical' : 'warning',
          actionKey: 'lifecycle.stepper.planTransition',
        });
      }

      // 5. Post-incubation (already past 3 years)
      if (monthsSinceStart >= 36) {
        result.push({
          contractId: contract.id,
          startupName,
          contractNumber: contract.contract_number,
          eventType: 'post_incubation',
          deadline: threeYearMark,
          daysUntil: 0,
          severity: 'critical',
          actionKey: 'lifecycle.stepper.reviewPostIncubation',
        });
      }
    });

    // Sort by severity then days
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return result.sort((a, b) => 
      severityOrder[a.severity] !== severityOrder[b.severity]
        ? severityOrder[a.severity] - severityOrder[b.severity]
        : a.daysUntil - b.daysUntil
    );
  }, [contracts]);

  const EVENT_ICONS: Record<string, React.ReactNode> = {
    anniversary: <Cake className="h-4 w-4" />,
    biennial_review: <RefreshCw className="h-4 w-4" />,
    notice_window: <Bell className="h-4 w-4" />,
    incubation_limit: <AlertTriangle className="h-4 w-4" />,
    post_incubation: <Clock className="h-4 w-4" />,
  };

  const EVENT_COLORS: Record<string, string> = {
    anniversary: 'bg-info/10 text-info',
    biennial_review: 'bg-warning/10 text-warning',
    notice_window: 'bg-warning/10 text-warning',
    incubation_limit: 'bg-destructive/10 text-destructive',
    post_incubation: 'bg-destructive/10 text-destructive',
  };

  const criticalCount = events.filter(e => e.severity === 'critical').length;

  return (
    <Card className={cn('rounded-2xl', criticalCount > 0 && 'border-destructive/50')}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-5 w-5" />
          {t('lifecycle.stepper.upcomingEvents')}
          {criticalCount > 0 && (
            <Badge variant="destructive" className="ml-auto">{criticalCount}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 bg-muted/40 rounded-lg" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-sm">{t('lifecycle.stepper.noEvents')}</span>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {events.slice(0, 15).map((event, idx) => {
                const goToContract = () =>
                  navigate(`/admin?tab=backoffice&subtab=contracts&contract=${event.contractId}`);
                const canRenew = event.eventType === 'anniversary' || event.eventType === 'incubation_limit';
                const openRenew = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  const c = contracts?.find(x => x.id === event.contractId);
                  if (c) setRenewContract(c);
                };
                return (
                <div
                  role="button"
                  tabIndex={0}
                  key={`${event.contractId}-${event.eventType}-${idx}`}
                  onClick={goToContract}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToContract(); } }}
                  aria-label={t('lifecycle.stepper.openContractAria', {
                    defaultValue: 'Abrir contrato de {{startup}}',
                    startup: event.startupName,
                  })}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border flex items-start gap-3 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                    event.severity === 'critical' && 'bg-destructive/5 border-destructive/30',
                    event.severity === 'warning' && 'bg-warning/5 border-warning/30',
                    event.severity === 'info' && 'bg-info/5 border-info/30',
                  )}
                >
                  <div className={cn(
                    'mt-0.5',
                    event.severity === 'critical' && 'text-destructive',
                    event.severity === 'warning' && 'text-warning',
                    event.severity === 'info' && 'text-info',
                  )}>
                    {EVENT_ICONS[event.eventType]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium truncate">{event.startupName}</span>
                      {event.contractNumber && (
                        <span className="text-[10px] text-muted-foreground font-mono">#{event.contractNumber}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={cn('text-[10px] h-5', EVENT_COLORS[event.eventType])}>
                        {t(`lifecycle.stepper.eventType.${event.eventType}`)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {event.daysUntil > 0
                          ? `${event.daysUntil} ${t('lifecycle.stepper.daysLeft')}`
                          : t('lifecycle.stepper.overdue')}
                        {' · '}
                        {format(event.deadline, 'dd/MM/yyyy')}
                      </span>
                    </div>
                  </div>
                  {canRenew && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 shrink-0"
                      onClick={openRenew}
                    >
                      <RefreshCw className="h-3 w-3" />
                      {t('contractDetail.renewCta', { defaultValue: 'Renovar' })}
                    </Button>
                  )}
                </div>
                );
              })}

            </div>
          </ScrollArea>
        )}
      </CardContent>
      <RenewContractDialog
        contract={renewContract as any}
        open={!!renewContract}
        onOpenChange={(o) => !o && setRenewContract(null)}
      />
    </Card>
  );
}

