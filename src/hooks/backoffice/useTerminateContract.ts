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
    // Close open room allocations. RLS failure here would silently leave the
    // room allocated forever — surface the error instead of swallowing it.
    const { error: allocErr } = await (supabase as any)
      .from('room_allocations')
      .update({ end_date: today })
      .eq('workspace_id', contract.workspace_id)
      .is('end_date', null);
    if (allocErr) throw new Error(`Failed to close room allocation: ${allocErr.message}`);
  }

  if (contract.workspace_id) {
    // Assign the cleanup task to the terminating user with status 'pending' so
    // useMyStaffTasks (filters assignee_id = me AND status IN ('pending','in_progress'))
    // actually surfaces it. Previous behaviour ({assignee_id: null, status: 'open'})
    // made the task invisible to everyone.
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    try {
      await (supabase as any).from('staff_tasks').insert({
        title: t('contractDetail.terminate.staffTaskTitle', { defaultValue: 'Cancelar sessões futuras (contrato terminado)' }),
        description: t('contractDetail.terminate.staffTaskDesc', {
          defaultValue: 'Contrato {{ref}} terminado. Reveja e cancele sessões futuras no calendário.',
          ref: contract.id.slice(0, 8),
        }),
        task_type: 'contract_terminated_cleanup',
        workspace_id: contract.workspace_id,
        assignee_id: currentUser?.id ?? null,
        priority: 'medium',
        status: 'pending',
        metadata: { contract_id: contract.id, reason: reason.trim() },
      });
    } catch { /* non-fatal */ }
  }

  if (archiveWorkspace && contract.workspace_id) {
    const { error: archErr } = await (supabase as any)
      .from('workspaces')
      .update({ status: 'archived', archived_at: nowIso })
      .eq('id', contract.workspace_id);
    if (archErr) throw new Error(`Failed to archive workspace: ${archErr.message}`);
  }

  try {
    await supabase.from('contract_lifecycle_events').insert({
      contract_id: contract.id,
      event_type: 'termination',
      event_date: today,
      notes: reason.trim(),
    } as any);
  } catch { /* non-fatal */ }

  // M-terminate: mirror the server-side syncIntakeOnClosed(outcome='terminated')
  // used by webhooks — otherwise the linked intake stays as 'activated' and the
  // CRM pipeline keeps reading the row as "contracted" indefinitely.
  try {
    const { data: intake } = await supabase
      .from('contract_intakes')
      .select('id, status, funnel_item_id')
      .eq('contract_id', contract.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intake && !['declined', 'voided', 'terminated', 'cancelled'].includes(intake.status as string)) {
      await (supabase as any)
        .from('contract_intakes')
        .update({ status: 'terminated' })
        .eq('id', intake.id);
      await supabase.from('intake_events').insert({
        intake_id: intake.id,
        event_type: 'lifecycle_sync_terminated',
        from_status: intake.status,
        to_status: 'terminated',
        metadata: { source: 'useTerminateContract', contract_id: contract.id },
      } as any);
    }

    // Resolve funnel_item_id via intake first, fall back to contract.funnel_item_id.
    let funnelItemId: string | null = intake?.funnel_item_id ?? null;
    if (!funnelItemId) {
      const { data: contractRow } = await supabase
        .from('startup_contracts')
        .select('funnel_item_id')
        .eq('id', contract.id)
        .maybeSingle();
      funnelItemId = (contractRow as any)?.funnel_item_id ?? null;
    }
    if (funnelItemId) {
      await supabase.from('funnel_items')
        .update({ stage: 'archived' })
        .eq('id', funnelItemId);
    }
  } catch { /* non-fatal — logged upstream by RLS/server */ }

  // P2.6: notifications are fanned out server-side. Client-side enumeration of
  // user_roles / workspace_users is blocked by RLS for some staff roles, which
  // silently dropped the founder notice. The RPC is staff-guarded and reliable.
  const { error: notifyErr } = await (supabase as any).rpc('notify_contract_event', {
    p_contract_id: contract.id,
    p_event_type: 'contract_terminated',
    p_staff_title: t('contractDetail.terminate.notifyStaffTitle', { defaultValue: 'Contrato terminado' }),
    p_staff_message: t('contractDetail.terminate.notifyStaffMsg', {
      defaultValue: 'Contrato {{ref}} foi terminado. Motivo: {{reason}}',
      ref: contract.id.slice(0, 8),
      reason: reason.trim(),
    }),
    p_founder_title: t('contractDetail.terminate.notifyFounderTitle', { defaultValue: 'O seu contrato foi terminado' }),
    p_founder_message: t('contractDetail.terminate.notifyFounderMsg', {
      defaultValue: 'A equipa Startup Leiria terminou o contrato. Motivo: {{reason}}',
      reason: reason.trim(),
    }),
    p_founder_link: '/workspace',
    p_staff_link: '/admin?tab=backoffice&subtab=contracts',
  });
  if (notifyErr) {
    // Non-fatal for the termination itself, but must not be invisible.
    console.warn('[useTerminateContract] notify_contract_event failed', notifyErr.message);
  }
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
