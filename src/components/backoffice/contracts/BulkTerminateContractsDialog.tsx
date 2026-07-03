/**
 * BulkTerminateContractsDialog — collect one reason and terminate many contracts
 * through the shared `useBulkTerminateContracts` hook. Same side-effects as single termination.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useBulkTerminateContracts } from '@/hooks/backoffice/useTerminateContract';
import type { StartupContract } from '@/hooks/useBackoffice';

interface BulkTerminateContractsDialogProps {
  contracts: Array<Pick<StartupContract, 'id' | 'workspace_id'>>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

export function BulkTerminateContractsDialog({ contracts, open, onOpenChange, onDone }: BulkTerminateContractsDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [archiveWorkspace, setArchiveWorkspace] = useState(true);
  const bulkTerminate = useBulkTerminateContracts();

  const handleConfirm = () => {
    bulkTerminate.mutate(
      { contracts, reason, archiveWorkspace },
      {
        onSuccess: () => {
          setReason('');
          onOpenChange(false);
          onDone?.();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {t('contracts.bulk.terminateTitle', { defaultValue: 'Terminar contratos' })}
          </DialogTitle>
          <DialogDescription>
            {t('contracts.bulk.terminateDescription', {
              count: contracts.length,
              defaultValue: 'Vai terminar {{count}} contratos. Liberta as salas alocadas e cria tarefas para cancelar sessões futuras.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-terminate-reason">
              {t('contractDetail.terminate.reasonLabel', { defaultValue: 'Motivo da terminação' })}
              <span className="text-destructive"> *</span>
            </Label>
            <Textarea
              id="bulk-terminate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('contractDetail.terminate.reasonPlaceholder', { defaultValue: 'Ex: pedido do founder, incumprimento, mudança de programa…' })}
              className="min-h-[80px]"
            />
          </div>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bulkTerminate.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={bulkTerminate.isPending || !reason.trim()}
          >
            {bulkTerminate.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
            {t('contracts.bulk.terminateConfirm', { defaultValue: 'Terminar {{count}} contratos', count: contracts.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
