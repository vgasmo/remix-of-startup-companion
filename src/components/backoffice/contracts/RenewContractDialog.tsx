/**
 * RenewContractDialog — one-click contract renewal.
 * Pre-fills new_start = day after current end, new_end = +12 months, fee carried over.
 * On confirm: updates the contract's end_date and logs a lifecycle event.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabaseClient';
import { notify } from '@/lib/notify';
import { suggestRenewalWindow, LIFECYCLE_THRESHOLDS } from '@/lib/contractLifecycle';
import type { StartupContract } from '@/hooks/useBackoffice';
import { Loader2, RefreshCw } from 'lucide-react';

interface RenewContractDialogProps {
  contract: StartupContract | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenewContractDialog({ contract, open, onOpenChange }: RenewContractDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const suggestion = useMemo(() => {
    if (!contract) return { start: '', end: '' };
    return suggestRenewalWindow(
      { start_date: contract.start_date, end_date: contract.end_date, status: contract.status },
      LIFECYCLE_THRESHOLDS.defaultRenewalMonths,
    );
  }, [contract]);

  const [newStart, setNewStart] = useState(suggestion.start);
  const [newEnd, setNewEnd] = useState(suggestion.end);
  const [monthlyFee, setMonthlyFee] = useState<number>(contract?.monthly_fee ?? 0);

  // Reset form when a new contract opens
  useMemo(() => {
    setNewStart(suggestion.start);
    setNewEnd(suggestion.end);
    setMonthlyFee(contract?.monthly_fee ?? 0);
  }, [contract?.id, suggestion.start, suggestion.end, contract?.monthly_fee]);

  const renew = useMutation({
    mutationFn: async () => {
      if (!contract) throw new Error('no contract');
      const { error: updErr } = await supabase
        .from('startup_contracts')
        .update({
          end_date: newEnd,
          monthly_fee: monthlyFee,
        })
        .eq('id', contract.id);
      if (updErr) throw updErr;
      // Best-effort lifecycle event log
      try {
        await supabase.from('contract_lifecycle_events').insert({
          contract_id: contract.id,
          event_type: 'renewal',
          event_date: newStart,
          notes: `Renovado até ${newEnd} · ${monthlyFee}€/mês`,
        } as any);
      } catch {
        // non-fatal
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['lifecycle-events-contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract-lifecycle-events'] });
      notify.success(t('contractDetail.renewSuccess', { defaultValue: 'Contrato renovado' }));
      onOpenChange(false);
    },
    onError: () => {
      notify.error(t('contractDetail.renewError', { defaultValue: 'Não foi possível renovar o contrato' }));
    },
  });

  if (!contract) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            {t('contractDetail.renewTitle', { defaultValue: 'Renovar contrato' })}
          </DialogTitle>
          <DialogDescription>
            {t('contractDetail.renewDesc', {
              defaultValue:
                'Renova por 12 meses a partir do dia seguinte ao fim atual. Atualiza a data de fim e regista um evento no histórico.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="renew-start">{t('contractDetail.renewStart', { defaultValue: 'Novo início' })}</Label>
            <Input
              id="renew-start"
              type="date"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="renew-end">{t('contractDetail.renewEnd', { defaultValue: 'Novo fim' })}</Label>
            <Input
              id="renew-end"
              type="date"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="renew-fee">{t('contractDetail.renewFee', { defaultValue: 'Mensalidade (€)' })}</Label>
            <Input
              id="renew-fee"
              type="number"
              min={0}
              step={1}
              value={monthlyFee}
              onChange={(e) => setMonthlyFee(Number(e.target.value))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => renew.mutate()} disabled={renew.isPending || !newEnd}>
            {renew.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
            {t('contractDetail.confirmRenew', { defaultValue: 'Confirmar renovação' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
