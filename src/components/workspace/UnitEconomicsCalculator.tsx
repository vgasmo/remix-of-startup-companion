import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Info, Save, Loader2, ChevronLeft, ChevronRight, History, BookOpen } from 'lucide-react';
import { format, startOfMonth, subMonths, addMonths, isSameMonth } from 'date-fns';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { notify } from "@/lib/notify";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { QuickHelp, GlossaryTooltip } from '@/components/ui/GlossaryTooltip';
import {
  useUnitEconomicsHistory,
  useCurrentMonthUnitEconomics,
  useSaveUnitEconomics,
  type UnitEconomicsFormData,
} from '@/hooks/useUnitEconomics';

// Validation schema
const unitEconomicsSchema = z.object({
  marketing_costs: z.number().min(0, 'Must be non-negative'),
  sales_costs: z.number().min(0, 'Must be non-negative'),
  new_customers: z.number().int().min(0, 'Must be non-negative integer'),
  arpu: z.number().min(0, 'Must be non-negative'),
  gross_margin: z.number().min(0, 'Min 0%').max(100, 'Max 100%'),
  monthly_churn_rate: z.number().min(0, 'Min 0%').max(100, 'Max 100%'),
});

interface MetricInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  tooltip?: string;
  error?: string;
  disabled?: boolean;
}

function MetricInput({ label, value, onChange, prefix, suffix, tooltip, error, disabled }: MetricInputProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm font-medium">{label}</Label>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            {prefix}
          </span>
        )}
        <Input
          type="number"
          value={value || ''}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={`${prefix ? 'pl-7' : ''} ${suffix ? 'pr-8' : ''} ${error ? 'border-destructive' : ''}`}
          min={0}
          step="any"
          disabled={disabled}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface ResultCardProps {
  label: string;
  value: string;
  status: 'good' | 'warning' | 'bad' | 'neutral';
  description?: string;
  previousValue?: number | null;
}

function ResultCard({ label, value, status, description, previousValue }: ResultCardProps) {
  const statusColors = {
    good: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    bad: 'text-red-600 dark:text-red-400',
    neutral: 'text-foreground',
  };

  const StatusIcon = {
    good: CheckCircle,
    warning: AlertTriangle,
    bad: TrendingDown,
    neutral: TrendingUp,
  }[status];

  return (
    <div className="p-4 rounded-lg bg-muted/50 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <StatusIcon className={`h-4 w-4 ${statusColors[status]}`} />
      </div>
      <p className={`text-2xl font-bold ${statusColors[status]}`}>{value}</p>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

interface UnitEconomicsCalculatorProps {
  workspaceId: string;
}

export function UnitEconomicsCalculator({ workspaceId }: UnitEconomicsCalculatorProps) {
  const { t } = useTranslation();
  const [selectedMonth, setSelectedMonth] = useState<Date>(startOfMonth(new Date()));
  const [hasChanges, setHasChanges] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  // Form state
  const [marketingCosts, setMarketingCosts] = useState(0);
  const [salesCosts, setSalesCosts] = useState(0);
  const [newCustomers, setNewCustomers] = useState(0);
  const [arpu, setArpu] = useState(0);
  const [grossMargin, setGrossMargin] = useState(70);
  const [monthlyChurnRate, setMonthlyChurnRate] = useState(5);

  // Data hooks
  const { data: history, isLoading: loadingHistory } = useUnitEconomicsHistory(workspaceId);
  const saveUnitEconomics = useSaveUnitEconomics(workspaceId);

  const currentMonthKey = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const selectedMonthKey = format(selectedMonth, 'yyyy-MM-dd');
  const isCurrentMonth = isSameMonth(selectedMonth, new Date());

  // Find data for selected month
  const selectedMonthData = useMemo(() => {
    return history?.find(h => h.period_month === selectedMonthKey);
  }, [history, selectedMonthKey]);

  // Find previous month data for comparison
  const previousMonthData = useMemo(() => {
    const prevMonth = format(subMonths(selectedMonth, 1), 'yyyy-MM-dd');
    return history?.find(h => h.period_month === prevMonth);
  }, [history, selectedMonth]);

  // Load saved data when month changes
  useEffect(() => {
    if (selectedMonthData) {
      setMarketingCosts(selectedMonthData.marketing_costs || 0);
      setSalesCosts(selectedMonthData.sales_costs || 0);
      setNewCustomers(selectedMonthData.new_customers || 0);
      setArpu(selectedMonthData.arpu || 0);
      setGrossMargin(selectedMonthData.gross_margin || 70);
      setMonthlyChurnRate(selectedMonthData.monthly_churn_rate || 5);
      setHasChanges(false);
    } else {
      // Reset to defaults for new month
      setMarketingCosts(0);
      setSalesCosts(0);
      setNewCustomers(0);
      setArpu(0);
      setGrossMargin(70);
      setMonthlyChurnRate(5);
      setHasChanges(false);
    }
    setValidationErrors({});
  }, [selectedMonthData, selectedMonthKey]);

  // Calculated metrics
  const metrics = useMemo(() => {
    const cac = newCustomers > 0 ? (marketingCosts + salesCosts) / newCustomers : 0;
    const customerLifetimeMonths = monthlyChurnRate > 0 ? 1 / (monthlyChurnRate / 100) : 0;
    const ltv = arpu * customerLifetimeMonths * (grossMargin / 100);
    const ltvCacRatio = cac > 0 ? ltv / cac : 0;
    const paybackPeriod = arpu > 0 && grossMargin > 0 ? cac / (arpu * (grossMargin / 100)) : 0;

    return {
      cac,
      customerLifetimeMonths,
      ltv,
      ltvCacRatio,
      paybackPeriod,
    };
  }, [marketingCosts, salesCosts, newCustomers, arpu, grossMargin, monthlyChurnRate]);

  // Status helpers
  const getLtvCacStatus = (ratio: number): 'good' | 'warning' | 'bad' | 'neutral' => {
    if (ratio === 0) return 'neutral';
    if (ratio >= 3) return 'good';
    if (ratio >= 1) return 'warning';
    return 'bad';
  };

  const getPaybackStatus = (months: number): 'good' | 'warning' | 'bad' | 'neutral' => {
    if (months === 0) return 'neutral';
    if (months <= 12) return 'good';
    if (months <= 18) return 'warning';
    return 'bad';
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000) return `€${(value / 1000).toFixed(1)}k`;
    return `€${value.toFixed(0)}`;
  };

  const handleInputChange = (setter: (v: number) => void, value: number) => {
    setter(value);
    setHasChanges(true);
    setValidationErrors({});
  };

  const handleSave = async () => {
    const formData: UnitEconomicsFormData = {
      marketing_costs: marketingCosts,
      sales_costs: salesCosts,
      new_customers: newCustomers,
      arpu: arpu,
      gross_margin: grossMargin,
      monthly_churn_rate: monthlyChurnRate,
    };

    // Validate
    const result = unitEconomicsSchema.safeParse(formData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach(err => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      setValidationErrors(errors);
      notify.error(t('unitEconomics.fixValidationErrors'));
      return;
    }

    try {
      await saveUnitEconomics.mutateAsync(formData);
      notify.success(t('unitEconomics.savedSuccess'));
      setHasChanges(false);
    } catch (error: any) {
      notify.error(error.message || t('common.errorGeneric'));
    }
  };

  const goToPreviousMonth = () => {
    setSelectedMonth(subMonths(selectedMonth, 1));
  };

  const goToNextMonth = () => {
    const next = addMonths(selectedMonth, 1);
    if (!isSameMonth(next, new Date()) && next > new Date()) return;
    setSelectedMonth(next);
  };

  const goToCurrentMonth = () => {
    setSelectedMonth(startOfMonth(new Date()));
  };

  if (loadingHistory) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            <CardTitle>{t('unitEconomics.title')}</CardTitle>
          </div>
          {history && history.length > 0 && (
            <Badge variant="outline" className="gap-1">
              <History className="h-3 w-3" />
              {history.length} {t('unitEconomics.months')}
            </Badge>
          )}
        </div>
        <CardDescription>
          {t('unitEconomics.description')}
        </CardDescription>
        
        {/* Month Selector */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center min-w-[120px]">
              <span className="font-medium">{format(selectedMonth, 'MMMM yyyy')}</span>
              {selectedMonthData && (
                <p className="text-xs text-muted-foreground">{t('unitEconomics.saved')}</p>
              )}
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={goToNextMonth}
              disabled={isCurrentMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {!isCurrentMonth && (
            <Button variant="ghost" size="sm" onClick={goToCurrentMonth}>
              {t('unitEconomics.goToCurrentMonth')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              {t('unitEconomics.customerAcquisition')}
            </h4>
            <MetricInput
              label={t('unitEconomics.marketingCosts')}
              value={marketingCosts}
              onChange={(v) => handleInputChange(setMarketingCosts, v)}
              prefix="€"
              tooltip={t('unitEconomics.marketingCostsTooltip')}
              error={validationErrors.marketing_costs}
              disabled={!isCurrentMonth}
            />
            <MetricInput
              label={t('unitEconomics.salesCosts')}
              value={salesCosts}
              onChange={(v) => handleInputChange(setSalesCosts, v)}
              prefix="€"
              tooltip={t('unitEconomics.salesCostsTooltip')}
              error={validationErrors.sales_costs}
              disabled={!isCurrentMonth}
            />
            <MetricInput
              label={t('unitEconomics.newCustomers')}
              value={newCustomers}
              onChange={(v) => handleInputChange(setNewCustomers, Math.floor(v))}
              tooltip={t('unitEconomics.newCustomersTooltip')}
              error={validationErrors.new_customers}
              disabled={!isCurrentMonth}
            />
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              {t('unitEconomics.revenueRetention')}
            </h4>
            <MetricInput
              label={t('unitEconomics.arpu')}
              value={arpu}
              onChange={(v) => handleInputChange(setArpu, v)}
              prefix="€"
              tooltip={t('unitEconomics.arpuTooltip')}
              error={validationErrors.arpu}
              disabled={!isCurrentMonth}
            />
            <MetricInput
              label={t('unitEconomics.grossMargin')}
              value={grossMargin}
              onChange={(v) => handleInputChange(setGrossMargin, v)}
              suffix="%"
              tooltip={t('unitEconomics.grossMarginTooltip')}
              error={validationErrors.gross_margin}
              disabled={!isCurrentMonth}
            />
            <MetricInput
              label={t('unitEconomics.monthlyChurnRate')}
              value={monthlyChurnRate}
              onChange={(v) => handleInputChange(setMonthlyChurnRate, v)}
              suffix="%"
              tooltip={t('unitEconomics.monthlyChurnRateTooltip')}
              error={validationErrors.monthly_churn_rate}
              disabled={!isCurrentMonth}
            />
          </div>
        </div>

        {/* Save Button */}
        {isCurrentMonth && (
          <div className="flex justify-end">
            <Button 
              onClick={handleSave} 
              disabled={!hasChanges || saveUnitEconomics.isPending}
            >
              {saveUnitEconomics.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {t('common.save')}
                </>
              )}
            </Button>
          </div>
        )}

        <Separator />

        {/* Results Section */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            {t('unitEconomics.calculatedMetrics')}
          </h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ResultCard
              label="CAC"
              value={metrics.cac > 0 ? formatCurrency(metrics.cac) : '-'}
              status="neutral"
              description={t('unitEconomics.cacDescription')}
              previousValue={previousMonthData?.cac}
            />
            <ResultCard
              label="LTV"
              value={metrics.ltv > 0 ? formatCurrency(metrics.ltv) : '-'}
              status="neutral"
              description={t('unitEconomics.ltvDescription')}
              previousValue={previousMonthData?.ltv}
            />
            <ResultCard
              label="LTV:CAC Ratio"
              value={metrics.ltvCacRatio > 0 ? `${metrics.ltvCacRatio.toFixed(1)}x` : '-'}
              status={getLtvCacStatus(metrics.ltvCacRatio)}
              description={metrics.ltvCacRatio >= 3 ? t('unitEconomics.healthyRatio') : metrics.ltvCacRatio >= 1 ? t('unitEconomics.needsImprovement') : t('unitEconomics.belowTarget')}
            />
            <ResultCard
              label="Payback Period"
              value={metrics.paybackPeriod > 0 ? `${metrics.paybackPeriod.toFixed(1)} mo` : '-'}
              status={getPaybackStatus(metrics.paybackPeriod)}
              description={metrics.paybackPeriod <= 12 ? t('unitEconomics.goodPayback') : t('unitEconomics.considerReducingCac')}
            />
          </div>

          {/* Customer Lifetime */}
          <div className="p-4 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('unitEconomics.avgCustomerLifetime')}</p>
                <p className="text-lg font-semibold">
                  {metrics.customerLifetimeMonths > 0 
                    ? `${metrics.customerLifetimeMonths.toFixed(1)} months`
                    : '-'}
                </p>
              </div>
              <Badge variant="outline">
                {t('unitEconomics.basedOnChurn', { rate: monthlyChurnRate })}
              </Badge>
            </div>
          </div>
        </div>

        {/* Educational Section */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-2 text-sm">
              <BookOpen className="h-4 w-4" />
              {t('unitEconomics.whatDoTheseMetricsMean')}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <GlossaryTooltip term="cac" showIcon={false}>
                    <span className="cursor-help underline decoration-dotted">CAC</span>
                  </GlossaryTooltip>
                </div>
                <p className="text-xs text-muted-foreground">{t('unitEconomics.cacExplanation')}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <GlossaryTooltip term="ltv" showIcon={false}>
                    <span className="cursor-help underline decoration-dotted">LTV</span>
                  </GlossaryTooltip>
                </div>
                <p className="text-xs text-muted-foreground">{t('unitEconomics.ltvExplanation')}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <GlossaryTooltip term="ltvCacRatio" showIcon={false}>
                    <span className="cursor-help underline decoration-dotted">Rácio LTV:CAC</span>
                  </GlossaryTooltip>
                </div>
                <p className="text-xs text-muted-foreground">{t('unitEconomics.ltvCacExplanation')}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <GlossaryTooltip term="paybackPeriod" showIcon={false}>
                    <span className="cursor-help underline decoration-dotted">{t('financial.payback', 'Payback')}</span>
                  </GlossaryTooltip>
                </div>
                <p className="text-xs text-muted-foreground">{t('unitEconomics.paybackExplanation')}</p>
              </div>
            </div>
            
            <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm font-medium text-primary mb-2">💡 {t('unitEconomics.tipsTitle')}</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>{t('unitEconomics.tip1')}</li>
                <li>{t('unitEconomics.tip2')}</li>
                <li>{t('unitEconomics.tip3')}</li>
              </ul>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
