/**
 * TerminateContractDialog — end a single contract properly.
 * Delegates side-effects to `useTerminateContract` so single/bulk paths are identical.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTerminateContract } from '@/hooks/backoffice/useTerminateContract';
import type { StartupContract } from '@/hooks/useBackoffice';

interface TerminateContractDialogProps {
  contract: StartupContract | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TerminateContractDialog({ contract, open, onOpenChange }: TerminateContractDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [archiveWorkspace, setArchiveWorkspace] = useState(true);
  const terminate = useTerminateContract();

  const handleConfirm = () => {
    if (!contract) return;
    terminate.mutate(
      { contract: { id: contract.id, workspace_id: contract.workspace_id }, reason, archiveWorkspace },
      {
        onSuccess: () => {
          setReason('');
          onOpenChange(false);
        },
      }
    );
  };

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
            onClick={handleConfirm}
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
