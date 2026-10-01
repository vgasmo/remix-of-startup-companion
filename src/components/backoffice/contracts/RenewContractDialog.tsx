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
import { findContractAllocations } from '@/hooks/useBackoffice';
import { Loader2, RefreshCw } from 'lucide-react';
import type { TablesUpdate } from '@/integrations/supabase/types';

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

  const canRenew = !!contract && ['active', 'expired'].includes((contract.status || '') as string);

  const renew = useMutation({
    mutationFn: async () => {
      if (!contract) throw new Error('no contract');
      if (!canRenew) throw new Error('invalid_status');

      // start_date = início da incubação (cron de aniversários, "Ano N", limite de 3 anos): nunca sobrescrever
      const patch: TablesUpdate<'startup_contracts'> = { end_date: newEnd, monthly_fee: monthlyFee };
      if (contract.status === 'expired') {
        patch.status = 'active';
        patch.terminated_at = null;
        patch.termination_reason = null;
      }

      const { error: updErr } = await supabase
        .from('startup_contracts')
        .update(patch)
        .eq('id', contract.id);
      if (updErr) throw updErr;

      // Prolonga as alocações em curso deste contrato
      try {
        const today = new Date().toISOString().split('T')[0];
        const ids = (await findContractAllocations(contract))
          .filter((a) => a.end_date && a.end_date >= today).map((a) => a.id);
        if (ids.length) {
          const { data: upd, error: allocUpdErr } = await supabase.from('room_allocations')
            .update({ end_date: newEnd }).in('id', ids).select('id');
          if (allocUpdErr || (upd?.length ?? 0) !== ids.length) throw new Error(allocUpdErr?.message ?? 'rls');
        }
      } catch {
        notify.warn('Contrato renovado, mas a alocação da sala não foi prolongada. Prolongue-a em Espaços.');
      }

      // Evento de ciclo de vida: a tabela não tem 'notes'; o texto vai em details
      const { data: authData } = await supabase.auth.getUser();
      const { error: evErr } = await supabase.from('contract_lifecycle_events').insert({
        contract_id: contract.id,
        event_type: 'renewal',
        event_date: new Date().toISOString().split('T')[0],
        performed_by: authData.user?.id ?? null,
        details: {
          previous_end_date: contract.end_date,
          new_term_start: newStart || null,
          new_end_date: newEnd,
          previous_monthly_fee: contract.monthly_fee,
          monthly_fee: monthlyFee,
        },
      });
      if (evErr) console.warn('[RenewContractDialog] lifecycle event failed', evErr.message);

      // P2.6: fan out via staff-guarded RPC — client-side enumeration of
      // user_roles/workspace_users is blocked by RLS and silently skipped founders.
      const { error: notifyErr } = await (supabase as any).rpc('notify_contract_event', {
        p_contract_id: contract.id,
        p_event_type: 'contract_renewed',
        p_staff_title: t('contractDetail.renewNotifyTitle', { defaultValue: 'Contrato renovado' }),
        p_staff_message: t('contractDetail.renewNotifyMsg', { defaultValue: 'O contrato foi renovado até {{end}}.', end: newEnd }),
        p_founder_title: t('contractDetail.renewNotifyTitle', { defaultValue: 'Contrato renovado' }),
        p_founder_message: t('contractDetail.renewNotifyMsg', { defaultValue: 'O contrato foi renovado até {{end}}.', end: newEnd }),
        p_founder_link: contract.workspace_id ? `/workspace/${contract.workspace_id}` : '/my-workspaces',
        p_staff_link: '/admin?tab=backoffice&subtab=contracts',
      });
      if (notifyErr) {
        console.warn('[RenewContractDialog] notify_contract_event failed', notifyErr.message);
        notify.warn(t('contractDetail.notifyFailed', { defaultValue: 'Contrato atualizado, mas as notificações falharam.' }));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['lifecycle-events-contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract-lifecycle-events'] });
      queryClient.invalidateQueries({ queryKey: ['room-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['rooms-with-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['building-occupancy'] });
      notify.success(t('contractDetail.renewSuccess', { defaultValue: 'Contrato renovado' }));
      onOpenChange(false);
    },
    onError: (err: any) => {
      if (err?.message === 'invalid_status') {
        notify.error(t('contractDetail.renewInvalidStatus', { defaultValue: 'Só é possível renovar contratos ativos ou expirados.' }));
      } else {
        notify.error(t('contractDetail.renewError', { defaultValue: 'Não foi possível renovar o contrato' }));
      }
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
              readOnly
              disabled
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
