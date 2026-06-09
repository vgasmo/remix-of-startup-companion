/**
 * Pricing Breakdown Component
 * Shows the rule-based pricing derivation for a contract
 */
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calculator, Info, AlertTriangle, Percent, Building2, Ruler } from 'lucide-react';
import { type PricingResult, formatContractCurrency } from '@/lib/pricingEngine';
import { cn } from '@/lib/utils';

interface PricingBreakdownProps {
  pricing: PricingResult;
  compact?: boolean;
}

export function PricingBreakdown({ pricing, compact = false }: PricingBreakdownProps) {
  const { t } = useTranslation();

  if (compact) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('pricing.baseFee')}</span>
          <span>{formatContractCurrency(pricing.baseFee, pricing.currency)}</span>
        </div>
        {pricing.spaceSurcharge > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Ruler className="h-3 w-3" />
              {t('pricing.spaceSurcharge')}
            </span>
            <span>+{formatContractCurrency(pricing.spaceSurcharge, pricing.currency)}</span>
          </div>
        )}
        {pricing.totalDiscountPercentage > 0 && (
          <div className="flex items-center justify-between text-sm text-[hsl(var(--success))]">
            <span className="flex items-center gap-1">
              <Percent className="h-3 w-3" />
              {t('pricing.discount')} ({pricing.totalDiscountPercentage}%)
            </span>
            <span>-{formatContractCurrency(pricing.discountAmount, pricing.currency)}</span>
          </div>
        )}
        <Separator />
        <div className="flex items-center justify-between font-semibold">
          <span>{t('pricing.effectiveFee')}</span>
          <span className="text-primary">{formatContractCurrency(pricing.effectiveMonthlyFee, pricing.currency)}/mês</span>
        </div>
        {pricing.isManualOverride && (
          <Badge variant="outline" className="text-[10px] text-[hsl(var(--warning))]">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {t('pricing.manualOverride')}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            {t('pricing.breakdown')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Base Fee */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">{t('pricing.baseFee')}</span>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-xs">{pricing.baseFeeSource}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="font-medium">{formatContractCurrency(pricing.baseFee, pricing.currency)}</span>
          </div>

          {/* Space Surcharge */}
          {pricing.spaceSurcharge > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{t('pricing.spaceSurcharge')}</span>
                {pricing.spaceSurchargeSource && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{pricing.spaceSurchargeSource}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <span className="font-medium">+{formatContractCurrency(pricing.spaceSurcharge, pricing.currency)}</span>
            </div>
          )}

          <Separator />

          {/* Gross */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('pricing.grossFee')}</span>
            <span>{formatContractCurrency(pricing.grossMonthlyFee, pricing.currency)}</span>
          </div>

          {/* Active Discounts */}
          {pricing.activeDiscounts.filter(d => d.isActive).map(discount => (
            <div key={discount.id} className="flex items-center justify-between text-[hsl(var(--success))]">
              <div className="flex items-center gap-2">
                <Percent className="h-3.5 w-3.5" />
                <span className="text-sm">
                  {discount.percentage}% — {discount.reason || t('pricing.noReason')}
                </span>
              </div>
              <span>-{formatContractCurrency(pricing.grossMonthlyFee * discount.percentage / 100, pricing.currency)}</span>
            </div>
          ))}

          {pricing.totalDiscountPercentage > 0 && <Separator />}

          {/* Effective Fee */}
          <div className="flex items-center justify-between">
            <span className="font-semibold">{t('pricing.effectiveFee')}</span>
            <span className="text-lg font-bold text-primary">
              {formatContractCurrency(pricing.effectiveMonthlyFee, pricing.currency)}/mês
            </span>
          </div>

          {/* Manual Override Warning */}
          {pricing.isManualOverride && (
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 rounded-lg px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('pricing.manualOverrideWarning')}
            </div>
          )}

          {/* Warnings */}
          {pricing.warnings.map((warning, i) => (
            <div
              key={i}
              className={cn(
                'flex items-center gap-2 text-xs rounded-lg px-3 py-1.5',
                warning.severity === 'critical' ? 'bg-destructive/10 text-destructive' :
                warning.severity === 'warning' ? 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]' :
                'bg-muted text-muted-foreground'
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {warning.message}
            </div>
          ))}

          {/* Audit Trail */}
          {pricing.auditTrail.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">
                {t('pricing.auditTrail')}
              </summary>
              <ul className="mt-1.5 space-y-0.5 pl-4 list-disc">
                {pricing.auditTrail.map((entry, i) => (
                  <li key={i}>{entry}</li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
