/**
 * useTerminateContract — shared termination side-effects hook.
 * Consumed by TerminateContractDialog (single) and the bulk termination bar.
 *
 * Ensures every terminate path performs the SAME lifecycle work:
 *  - contract row (status/terminated_at/termination_reason)
 *  - free open room allocations
 *  - enqueue staff_task for future-session cleanup
 *  - optional workspace archive
 *  - lifecycle event
 *  - notifications (staff + founders)
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import { notify } from '@/lib/notify';
import type { StartupContract } from '@/hooks/useBackoffice';

export interface TerminateInput {
  contract: Pick<StartupContract, 'id' | 'workspace_id'>;
  reason: string;
  archiveWorkspace?: boolean;
}

async function terminateOne(input: TerminateInput, t: (k: string, o?: any) => string): Promise<void> {
  const { contract, reason, archiveWorkspace } = input;
  const today = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();

  const { error: updErr } = await supabase
    .from('startup_contracts')
    .update({
      status: 'terminated',
      terminated_at: nowIso,
      termination_reason: reason.trim(),
    } as any)
    .eq('id', contract.id);
  if (updErr) throw updErr;

  if (contract.workspace_id) {
    try {
      await (supabase as any)
        .from('room_allocations')
        .update({ end_date: today })
        .eq('workspace_id', contract.workspace_id)
        .is('end_date', null);
    } catch { /* non-fatal */ }
  }

  if (contract.workspace_id) {
    try {
      await (supabase as any).from('staff_tasks').insert({
        title: t('contractDetail.terminate.staffTaskTitle', { defaultValue: 'Cancelar sessões futuras (contrato terminado)' }),
        description: t('contractDetail.terminate.staffTaskDesc', {
          defaultValue: 'Contrato {{ref}} terminado. Reveja e cancele sessões futuras no calendário.',
          ref: contract.id.slice(0, 8),
        }),
        task_type: 'contract_terminated_cleanup',
        workspace_id: contract.workspace_id,
        priority: 'medium',
        status: 'open',
        metadata: { contract_id: contract.id, reason: reason.trim() },
      });
    } catch { /* non-fatal */ }
  }

  if (archiveWorkspace && contract.workspace_id) {
    try {
      await (supabase as any)
        .from('workspaces')
        .update({ status: 'archived', archived_at: nowIso })
        .eq('id', contract.workspace_id);
    } catch { /* non-fatal */ }
  }

  try {
    await supabase.from('contract_lifecycle_events').insert({
      contract_id: contract.id,
      event_type: 'termination',
      event_date: today,
      notes: reason.trim(),
    } as any);
  } catch { /* non-fatal */ }

  try {
    const [{ data: staff }, { data: members }] = await Promise.all([
      supabase.from('user_roles').select('user_id').in('role', ['admin', 'consultor', 'backoffice']),
      contract.workspace_id
        ? supabase.from('workspace_users').select('user_id').eq('workspace_id', contract.workspace_id).eq('role', 'founder').eq('active', true)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const rows: any[] = [];
    for (const s of (staff || [])) {
      rows.push({
        user_id: (s as any).user_id,
        type: 'contract_terminated',
        title: t('contractDetail.terminate.notifyStaffTitle', { defaultValue: 'Contrato terminado' }),
        message: t('contractDetail.terminate.notifyStaffMsg', {
          defaultValue: 'Contrato {{ref}} foi terminado. Motivo: {{reason}}',
          ref: contract.id.slice(0, 8),
          reason: reason.trim(),
        }),
        entity_type: 'contract',
        entity_id: contract.id,
        link: '/admin?tab=backoffice&subtab=contracts',
      });
    }
    for (const m of (members || [])) {
      rows.push({
        user_id: (m as any).user_id,
        type: 'contract_terminated',
        title: t('contractDetail.terminate.notifyFounderTitle', { defaultValue: 'O seu contrato foi terminado' }),
        message: t('contractDetail.terminate.notifyFounderMsg', {
          defaultValue: 'A equipa Startup Leiria terminou o contrato. Motivo: {{reason}}',
          reason: reason.trim(),
        }),
        entity_type: 'contract',
        entity_id: contract.id,
        link: '/workspace',
      });
    }
    if (rows.length) {
      await supabase.from('notifications').insert(rows);
    }
  } catch { /* non-fatal */ }
}

export function useTerminateContract() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TerminateInput) => {
      if (!input.reason.trim()) throw new Error('reason_required');
      await terminateOne(input, t);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['room-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['contract-lifecycle-events'] });
      queryClient.invalidateQueries({ queryKey: ['lifecycle-events-contracts'] });
      queryClient.invalidateQueries({ queryKey: ['staff-tasks'] });
      notify.success(t('contractDetail.terminate.success', { defaultValue: 'Contrato terminado' }));
    },
    onError: (err: any) => {
      if (err?.message === 'reason_required') {
        notify.error(t('contractDetail.terminate.reasonRequired', { defaultValue: 'Indique o motivo da terminação.' }));
      } else {
        notify.error(err?.message || t('contractDetail.terminate.error', { defaultValue: 'Não foi possível terminar o contrato' }));
      }
    },
  });
}

export function useBulkTerminateContracts() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contracts, reason, archiveWorkspace }: { contracts: Array<Pick<StartupContract, 'id' | 'workspace_id'>>; reason: string; archiveWorkspace?: boolean }) => {
      if (!reason.trim()) throw new Error('reason_required');
      let ok = 0;
      let failed = 0;
      for (const c of contracts) {
        try {
          await terminateOne({ contract: c, reason, archiveWorkspace }, t);
          ok++;
        } catch (e) {
          console.warn('bulk terminate failed for contract', c.id, e);
          failed++;
        }
      }
      return { ok, failed };
    },
    onSuccess: ({ ok }) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['room-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['contract-lifecycle-events'] });
      queryClient.invalidateQueries({ queryKey: ['lifecycle-events-contracts'] });
      queryClient.invalidateQueries({ queryKey: ['staff-tasks'] });
      notify.success(t('contracts.bulk.terminateSuccess', { count: ok, defaultValue: '{{count}} contratos terminados' }));
    },
    onError: (err: any) => {
      if (err?.message === 'reason_required') {
        notify.error(t('contractDetail.terminate.reasonRequired', { defaultValue: 'Indique o motivo da terminação.' }));
      } else {
        notify.error(err?.message || t('contractDetail.terminate.error', { defaultValue: 'Não foi possível terminar os contratos' }));
      }
    },
  });
}
