/**
 * AssignWorkspaceDialog — staff-only.
 *
 * Fixes the "contract active without workspace" lifecycle mismatch by linking
 * an existing workspace to the contract. Also triggers founder account creation
 * on the server so the founder appears in the users list.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Search, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notify';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import type { StartupContract } from '@/hooks/backoffice/useContracts';

interface WorkspaceOption {
  id: string;
  status?: string | null;
  startup?: { name?: string | null } | null;
}

interface AssignWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: StartupContract | null;
  workspaces: WorkspaceOption[];
  onAssigned?: (workspaceId: string) => void;
}

export function AssignWorkspaceDialog({
  open,
  onOpenChange,
  contract,
  workspaces,
  onAssigned,
}: AssignWorkspaceDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = workspaces.filter((w) => !!w.id);
    if (!q) return list.slice(0, 50);
    return list
      .filter((w) => (w.startup?.name || '').toLowerCase().includes(q) || w.id.toLowerCase().includes(q))
      .slice(0, 50);
  }, [workspaces, search]);

  const handleAssign = async () => {
    if (!contract || !selectedId) return;
    setSubmitting(true);
    try {
      const { data, error } = await invokeWithAuth('staff-assign-workspace-to-contract', {
        body: { contract_id: contract.id, workspace_id: selectedId },
      });
      if (error) throw error;
      const founderInfo = (data as any)?.founder;
      notify.success(
        t('lifecycleMismatch.assignSuccess', { defaultValue: 'Workspace atribuído ao contrato.' }),
      );
      if (founderInfo?.ok) {
        notify.info(
          t('lifecycleMismatch.founderCreated', {
            defaultValue: 'Conta do founder verificada / criada.',
          }),
        );
      }
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      onAssigned?.(selectedId);
      onOpenChange(false);
      setSelectedId(null);
      setSearch('');
    } catch (err: any) {
      notify.error(err?.message || t('common.error', { defaultValue: 'Erro' }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('lifecycleMismatch.assignWorkspaceTitle', {
              defaultValue: 'Atribuir workspace ao contrato',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('lifecycleMismatch.assignWorkspaceDescription', {
              defaultValue:
                'Selecione o workspace correspondente. O founder do contrato será adicionado como utilizador desse workspace.',
            })}
          </DialogDescription>
        </DialogHeader>

        {contract && (() => {
          const c = contract as StartupContract & {
            legal_representative_email?: string | null;
            legal_representative_name?: string | null;
          };
          return (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <div className="font-medium">
                {c.organization_name || c.contract_number || c.id.slice(0, 8)}
              </div>
              {c.legal_representative_email && (
                <div className="text-muted-foreground mt-0.5">
                  {t('lifecycleMismatch.founderLabel', { defaultValue: 'Founder' })}:{' '}
                  {c.legal_representative_name || c.legal_representative_email}
                </div>
              )}
            </div>
          );
        })()}

        <div className="space-y-2">
          <Label htmlFor="ws-search" className="text-xs">
            {t('common.search', { defaultValue: 'Pesquisar' })}
          </Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              id="ws-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('lifecycleMismatch.searchWorkspacePlaceholder', {
                defaultValue: 'Nome da startup ou ID…',
              })}
              className="pl-7"
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">
                {t('lifecycleMismatch.noWorkspacesFound', {
                  defaultValue: 'Nenhum workspace encontrado.',
                })}
              </div>
            ) : (
              filtered.map((w) => (
                <button
                  type="button"
                  key={w.id}
                  onClick={() => setSelectedId(w.id)}
                  className={cn(
                    'w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-2 transition-colors',
                    selectedId === w.id && 'bg-primary/10',
                  )}
                >
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {w.startup?.name || w.id.slice(0, 8)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {w.status || 'unknown'} · {w.id.slice(0, 8)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common.cancel', { defaultValue: 'Cancelar' })}
          </Button>
          <Button onClick={handleAssign} disabled={!selectedId || submitting}>
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            {t('lifecycleMismatch.assignConfirm', { defaultValue: 'Atribuir workspace' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssignWorkspaceDialog;
