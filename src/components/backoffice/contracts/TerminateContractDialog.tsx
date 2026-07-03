/**
 * TerminateContractDialog — end a contract properly.
 *
 * Side-effects on confirm:
 *  1. startup_contracts: status='terminated', terminated_at=now, termination_reason
 *  2. room_allocations: close open allocations for the workspace (end_date=today)
 *  3. staff_tasks: enqueue "cancelar sessões futuras" (real Outlook events shouldn't be silently deleted)
 *  4. workspaces: optionally archive the workspace (user checkbox)
 *  5. contract_lifecycle_events: log 'termination'
 *  6. notifications: founders + staff (admin/consultor/backoffice)
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { notify } from '@/lib/notify';
import type { StartupContract } from '@/hooks/useBackoffice';

interface TerminateContractDialogProps {
  contract: StartupContract | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TerminateContractDialog({ contract, open, onOpenChange }: TerminateContractDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [archiveWorkspace, setArchiveWorkspace] = useState(true);

  const terminate = useMutation({
    mutationFn: async () => {
      if (!contract) throw new Error('no_contract');
      if (!reason.trim()) throw new Error('reason_required');

      const today = new Date().toISOString().split('T')[0];
      const nowIso = new Date().toISOString();

      // 1. contract row
      const { error: updErr } = await supabase
        .from('startup_contracts')
        .update({
          status: 'terminated',
          terminated_at: nowIso,
          termination_reason: reason.trim(),
        } as any)
        .eq('id', contract.id);
      if (updErr) throw updErr;

      // 2. free open room allocations for this workspace
      if (contract.workspace_id) {
        try {
          await (supabase as any)
            .from('room_allocations')
            .update({ end_date: today })
            .eq('workspace_id', contract.workspace_id)
            .is('end_date', null);
        } catch { /* non-fatal */ }
      }

      // 3. enqueue staff task for future-session cleanup
      // (real Outlook/Teams events; do not auto-delete)
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

      // 4. optionally archive workspace
      if (archiveWorkspace && contract.workspace_id) {
        try {
          await (supabase as any)
            .from('workspaces')
            .update({ status: 'archived', archived_at: nowIso })
            .eq('id', contract.workspace_id);
        } catch { /* non-fatal */ }
      }

      // 5. lifecycle event
      try {
        await supabase.from('contract_lifecycle_events').insert({
          contract_id: contract.id,
          event_type: 'termination',
          event_date: today,
          notes: reason.trim(),
        } as any);
      } catch { /* non-fatal */ }

      // 6. notifications
      try {
        const [{ data: staff }, { data: members }] = await Promise.all([
          supabase.from('user_roles').select('user_id').in('role', ['admin', 'consultor', 'backoffice']),
          contract.workspace_id
            ? supabase.from('workspace_users').select('user_id').eq('workspace_id', contract.workspace_id).eq('role', 'founder').eq('active', true)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const staffIds = (staff || []).map((s: any) => s.user_id);
        const founderIds = (members || []).map((m: any) => m.user_id);

        const rows: any[] = [];
        for (const uid of staffIds) {
          rows.push({
            user_id: uid,
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
        for (const uid of founderIds) {
          rows.push({
            user_id: uid,
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['room-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['contract-lifecycle-events'] });
      queryClient.invalidateQueries({ queryKey: ['lifecycle-events-contracts'] });
      queryClient.invalidateQueries({ queryKey: ['staff-tasks'] });
      notify.success(t('contractDetail.terminate.success', { defaultValue: 'Contrato terminado' }));
      setReason('');
      onOpenChange(false);
    },
    onError: (err: any) => {
      if (err?.message === 'reason_required') {
        notify.error(t('contractDetail.terminate.reasonRequired', { defaultValue: 'Indique o motivo da terminação.' }));
      } else {
        notify.error(err?.message || t('contractDetail.terminate.error', { defaultValue: 'Não foi possível terminar o contrato' }));
      }
    },
  });

  if (!contract) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {t('contractDetail.terminate.title', { defaultValue: 'Terminar contrato' })}
          </DialogTitle>
          <DialogDescription>
            {t('contractDetail.terminate.description', {
              defaultValue:
                'Esta ação marca o contrato como terminado, liberta as salas alocadas e cria uma tarefa para cancelar sessões futuras. Não pode ser desfeita automaticamente — apenas por renovação.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="terminate-reason">
              {t('contractDetail.terminate.reasonLabel', { defaultValue: 'Motivo da terminação' })}
              <span className="text-destructive"> *</span>
            </Label>
            <Textarea
              id="terminate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('contractDetail.terminate.reasonPlaceholder', { defaultValue: 'Ex: pedido do founder, incumprimento, mudança de programa…' })}
              className="min-h-[80px]"
            />
          </div>

          {contract.workspace_id && (
            <label className="flex items-start gap-2 rounded border border-border p-2 text-sm cursor-pointer">
              <Checkbox
                checked={archiveWorkspace}
                onCheckedChange={(v) => setArchiveWorkspace(v === true)}
                className="mt-0.5"
              />
              <span>
                {t('contractDetail.terminate.archiveWorkspaceLabel', { defaultValue: 'Arquivar workspace associado' })}
                <span className="block text-xs text-muted-foreground">
                  {t('contractDetail.terminate.archiveWorkspaceHint', { defaultValue: 'Pode reverter mais tarde a partir da lista de workspaces.' })}
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={terminate.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => terminate.mutate()}
            disabled={terminate.isPending || !reason.trim()}
          >
            {terminate.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
            {t('contractDetail.terminate.confirm', { defaultValue: 'Terminar contrato' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
