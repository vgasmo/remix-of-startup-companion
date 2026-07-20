/**
 * Contract Discounts Panel
 * Shows period-based discounts on a contract with add/edit/remove for staff
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Percent, Plus, Trash2, Calendar, AlertCircle } from 'lucide-react';
import { format, isAfter, isBefore, parseISO } from 'date-fns';
import { notify } from "@/lib/notify";
import { cn } from '@/lib/utils';

interface ContractDiscountsPanelProps {
  contractId: string;
  monthlyFee?: number;
  currency?: string;
  isStaff?: boolean;
  isAdmin?: boolean;
  compact?: boolean;
}

interface Discount {
  id: string;
  contract_id: string;
  discount_percentage: number;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  approved_by: string | null;
  created_at: string;
}

export function ContractDiscountsPanel({ contractId, monthlyFee, currency = 'EUR', isStaff = false, isAdmin = false, compact = false }: ContractDiscountsPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDiscount, setNewDiscount] = useState({
    discount_percentage: '',
    start_date: '',
    end_date: '',
    reason: '',
  });

  const { data: discounts, isLoading } = useQuery({
    queryKey: ['contract-discounts', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_discounts')
        .select('*')
        .eq('contract_id', contractId)
        .order('start_date', { ascending: true });
      if (error) throw error;
      return data as Discount[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('contract_discounts').insert({
        contract_id: contractId,
        discount_percentage: parseFloat(newDiscount.discount_percentage),
        start_date: newDiscount.start_date,
        end_date: newDiscount.end_date || null,
        reason: newDiscount.reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-discounts', contractId] });
      queryClient.invalidateQueries({ queryKey: ['funnel-linked-contract', contractId] });
      queryClient.invalidateQueries({ queryKey: ['contract', contractId] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setShowAddForm(false);
      setNewDiscount({ discount_percentage: '', start_date: '', end_date: '', reason: '' });
      notify.success(t('discounts.added'));
    },
    onError: () => notify.error(t('discounts.addError')),
  });

  const removeMutation = useMutation({
    mutationFn: async (discountId: string) => {
      const { error } = await supabase.from('contract_discounts').delete().eq('id', discountId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-discounts', contractId] });
      queryClient.invalidateQueries({ queryKey: ['funnel-linked-contract', contractId] });
      queryClient.invalidateQueries({ queryKey: ['contract', contractId] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      notify.success(t('discounts.removed'));
    },
    onError: () => notify.error(t('discounts.removeError')),
  });

  const today = new Date();
  
  const getDiscountStatus = (d: Discount): 'active' | 'future' | 'expired' => {
    const start = parseISO(d.start_date);
    if (isBefore(today, start)) return 'future';
    if (d.end_date && isAfter(today, parseISO(d.end_date))) return 'expired';
    return 'active';
  };

  const activeDiscount = discounts?.find(d => getDiscountStatus(d) === 'active');
  const effectiveFee = activeDiscount && monthlyFee 
    ? monthlyFee * (1 - activeDiscount.discount_percentage / 100) 
    : monthlyFee;

  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }

  // Compact mode for inline display
  if (compact) {
    if (!discounts?.length) return null;
    return (
      <div className="space-y-1">
        {discounts.map(d => {
          const status = getDiscountStatus(d);
          return (
            <div key={d.id} className="flex items-center gap-1.5 text-xs">
              <Badge 
                variant="outline" 
                className={cn(
                  'text-[10px] h-5',
                  status === 'active' && 'bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30',
                  status === 'future' && 'bg-[hsl(var(--info))]/15 text-[hsl(var(--info))] border-[hsl(var(--info))]/30',
                  status === 'expired' && 'bg-muted text-muted-foreground',
                )}
              >
                <Percent className="h-2.5 w-2.5 mr-0.5" />
                {d.discount_percentage}%
              </Badge>
              <span className="text-muted-foreground">
                {format(parseISO(d.start_date), 'dd/MM/yy')}
                {d.end_date ? ` → ${format(parseISO(d.end_date), 'dd/MM/yy')}` : ' →'}
              </span>
              {d.reason && (
                <span className="text-muted-foreground truncate max-w-[120px]" title={d.reason}>
                  ({d.reason})
                </span>
              )}
            </div>
          );
        })}
        {activeDiscount && monthlyFee && (
          <p className="text-[10px] text-[hsl(var(--warning))] font-medium">
            {t('discounts.effectiveFee')}: {effectiveFee?.toFixed(0)} {currency}/{t('common.month', { defaultValue: 'month' })}
          </p>
        )}
      </div>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Percent className="h-4 w-4 text-[hsl(var(--warning))]" />
            {t('discounts.title')}
          </span>
          {isAdmin && !showAddForm && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => setShowAddForm(true)}>
              <Plus className="h-3 w-3" />
              {t('discounts.add')}
            </Button>
          )}
          {isStaff && !isAdmin && !showAddForm && (
            <span className="text-[10px] text-muted-foreground">{t('contracts.discountApprovalRequired', { defaultValue: 'Apenas admin pode adicionar descontos' })}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {/* Active discount summary */}
        {activeDiscount && monthlyFee && (
          <div className="bg-[hsl(var(--warning))]/10 rounded-md p-2 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-[hsl(var(--warning))] flex-shrink-0" />
            <div className="text-xs">
              <span className="font-medium text-[hsl(var(--warning))]">
                {t('discounts.activeDiscount')}: {activeDiscount.discount_percentage}%
              </span>
              <span className="text-muted-foreground ml-1">
                — {t('discounts.effectiveFee')}: <strong>{effectiveFee?.toFixed(0)} {currency}</strong>/{t('common.month', { defaultValue: 'month' })}
                ({t('discounts.base')}: {monthlyFee} {currency})
              </span>
            </div>
          </div>
        )}

        {/* Discount list */}
        {discounts?.length ? (
          <div className="space-y-1.5">
            {discounts.map(d => {
              const status = getDiscountStatus(d);
              return (
                <div key={d.id} className={cn(
                  'flex items-center justify-between p-2 rounded-md border text-xs',
                  status === 'active' && 'border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5',
                  status === 'future' && 'border-[hsl(var(--info))]/30 bg-[hsl(var(--info))]/5',
                  status === 'expired' && 'border-border bg-muted/30 opacity-60',
                )}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        'text-[10px] h-5 flex-shrink-0',
                        status === 'active' && 'bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]',
                        status === 'future' && 'bg-[hsl(var(--info))]/15 text-[hsl(var(--info))]',
                        status === 'expired' && 'text-muted-foreground',
                      )}
                    >
                      {d.discount_percentage}%
                    </Badge>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-3 w-3 flex-shrink-0" />
                        {format(parseISO(d.start_date), 'dd/MM/yyyy')}
                        {d.end_date ? ` → ${format(parseISO(d.end_date), 'dd/MM/yyyy')}` : ` → ${t('discounts.noEnd')}`}
                      </div>
                      {d.reason && (
                        <p className="text-muted-foreground truncate">{d.reason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge variant={status === 'active' ? 'default' : 'secondary'} className="text-[10px] h-5">
                      {t(`discounts.${status}`)}
                    </Badge>
                    {isStaff && status !== 'expired' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => removeMutation.mutate(d.id)}
                        disabled={removeMutation.isPending} loading={removeMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : !showAddForm ? (
          <p className="text-xs text-muted-foreground py-2 text-center">
            {t('discounts.noDiscounts')}
          </p>
        ) : null}

        {/* Add form */}
        {showAddForm && (
          <div className="border rounded-md p-3 space-y-3 bg-background">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">{t('discounts.percentage')}</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  className="h-8 text-xs"
                  placeholder="25"
                  value={newDiscount.discount_percentage}
                  onChange={e => setNewDiscount(p => ({ ...p, discount_percentage: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">{t('discounts.startDate')}</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={newDiscount.start_date}
                  onChange={e => setNewDiscount(p => ({ ...p, start_date: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">{t('discounts.endDate')}</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={newDiscount.end_date}
                  onChange={e => setNewDiscount(p => ({ ...p, end_date: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t('discounts.reason')}</Label>
              <Textarea
                className="text-xs min-h-[40px] resize-none"
                placeholder={t('discounts.reasonPlaceholder')}
                value={newDiscount.reason}
                onChange={e => setNewDiscount(p => ({ ...p, reason: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAddForm(false)}>
                {t('discounts.cancel')}
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!newDiscount.discount_percentage || !newDiscount.start_date || addMutation.isPending} loading={addMutation.isPending}
                onClick={() => addMutation.mutate()}
              >
                {t('discounts.save')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
