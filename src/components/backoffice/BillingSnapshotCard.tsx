import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Wallet, AlertCircle, CalendarClock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import { supabase } from '@/lib/supabaseClient';
import { computeEffectiveDiscount } from '@/lib/contractLifecycle';

const fmtEUR = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function BillingSnapshotCardInner() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['backoffice-billing-snapshot'],
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const in60 = new Date(today.getTime() + 60 * 86400000).toISOString().slice(0, 10);

      const [mrrRes, overdueRes, renewalsRes] = await Promise.all([
        supabase
          .from('startup_contracts' as any)
          .select('id, monthly_fee, discount_percentage, discount_reason, contract_discounts(id, discount_percentage, start_date, end_date, reason)')
          .eq('status', 'active'),
        supabase
          .from('invoices' as any)
          .select('total, status, due_date')
          .or(`status.eq.overdue,and(status.eq.pending,due_date.lt.${todayStr})`),
        supabase
          .from('startup_contracts' as any)
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .gte('end_date', todayStr)
          .lte('end_date', in60),
      ]);

      const mrr = (mrrRes.data || []).reduce((sum: number, c: any) => {
        const fee = Number(c.monthly_fee) || 0;
        const disc = computeEffectiveDiscount(c.contract_discounts, c.discount_percentage, c.discount_reason);
        return sum + fee * (1 - disc.effectivePct / 100);
      }, 0);

      const overdueList = overdueRes.data || [];
      const overdueAmount = overdueList.reduce((s: number, i: any) => s + (Number(i.total) || 0), 0);

      return {
        mrr,
        overdueCount: overdueList.length,
        overdueAmount,
        renewals: renewalsRes.count ?? 0,
        unavailable: !!overdueRes.error,
      };
    },
  });

  return (
    <Card className="border-border/60 rounded-xl">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* MRR */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {t('backoffice.billing.mrr', { defaultValue: 'MRR previsto' })}
              </p>
              {isLoading ? (
                <Skeleton className="h-7 w-28 mt-1" />
              ) : (
                <p className="text-xl font-semibold tabular-nums leading-tight">{fmtEUR.format(data?.mrr ?? 0)}</p>
              )}
            </div>
          </div>

          {/* Overdue */}
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
              (data?.overdueCount ?? 0) > 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
            }`}>
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {t('backoffice.billing.overdue', { defaultValue: 'Faturas em atraso' })}
              </p>
              {isLoading ? (
                <Skeleton className="h-7 w-16 mt-1" />
              ) : data?.unavailable ? (
                <p className="text-xs text-muted-foreground italic">
                  {t('backoffice.billing.unavailable', { defaultValue: 'Dados indisponíveis' })}
                </p>
              ) : (
                <>
                  <p className={`text-xl font-semibold tabular-nums leading-tight ${
                    (data?.overdueCount ?? 0) > 0 ? 'text-destructive' : ''
                  }`}>
                    {data?.overdueCount ?? 0}
                  </p>
                  {(data?.overdueAmount ?? 0) > 0 && (
                    <p className="text-[11px] text-destructive/80 tabular-nums">
                      {fmtEUR.format(data!.overdueAmount)}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Renewals */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-info/10 text-info flex items-center justify-center shrink-0">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {t('backoffice.billing.renewals', { defaultValue: 'Renovações (60 dias)' })}
              </p>
              {isLoading ? (
                <Skeleton className="h-7 w-12 mt-1" />
              ) : (
                <p className="text-xl font-semibold tabular-nums leading-tight">{data?.renewals ?? 0}</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function BillingSnapshotCard() {
  return (
    <WidgetErrorBoundary name="BillingSnapshotCard">
      <BillingSnapshotCardInner />
    </WidgetErrorBoundary>
  );
}
