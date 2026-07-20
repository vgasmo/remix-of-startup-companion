/**
 * AssignWorkspaceDialog — staff-only.
 *
 * Fixes the "contract active without workspace" lifecycle mismatch by either
 * linking an existing workspace to the contract, or creating a brand new
 * workspace+startup from the contract data. On success, the server also
 * ensures the founder auth account + membership exist, so the founder
 * shows up in the workspace users list.
 */
import { useEffect, useMemo, useState } from 'react';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, Building2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notify';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { usePrograms } from '@/hooks/useAdminData';
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

const STAGES = ['ideation', 'validation', 'mvp', 'growth', 'scale'] as const;

export function AssignWorkspaceDialog({
  open,
  onOpenChange,
  contract,
  workspaces,
  onAssigned,
}: AssignWorkspaceDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: programs } = usePrograms();

  const [mode, setMode] = useState<'assign' | 'create'>('assign');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const contractExt = contract as
    | (StartupContract & {
        legal_representative_email?: string | null;
        legal_representative_name?: string | null;
      })
    | null;

  const [newName, setNewName] = useState('');
  const [newProgramId, setNewProgramId] = useState<string>('');
  const [newStage, setNewStage] = useState<string>('ideation');

  useEffect(() => {
    if (open && contractExt) {
      setNewName(contractExt.organization_name || '');
      setSelectedId(null);
      setSearch('');
      setMode('assign');
      setNewProgramId('');
      setNewStage('ideation');
    }
  }, [open, contractExt?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = workspaces.filter((w) => !!w.id);
    if (!q) return list.slice(0, 50);
    return list
      .filter(
        (w) =>
          (w.startup?.name || '').toLowerCase().includes(q) || w.id.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [workspaces, search]);

  const invalidateAll = () => {
    // Broad invalidation so the workspace list, member/user lists, and
    // consultant/admin views refresh immediately after assignment.
    [
      ['contracts'],
      ['workspaces'],
      ['workspace-members'],
      ['admin-workspace-users'],
      ['admin-profiles'],
      ['profiles'],
      ['startups'],
      ['pending-user-accounts'],
      ['user_roles'],
      ['staff-work-queue'],
    ].forEach((key) => queryClient.invalidateQueries({ queryKey: key as string[] }));
  };

  const submit = async () => {
    if (!contract) return;
    if (mode === 'assign' && !selectedId) return;
    if (mode === 'create' && !newName.trim()) return;

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { contract_id: contract.id };
      if (mode === 'assign') {
        body.workspace_id = selectedId;
      } else {
        body.create = {
          startup_name: newName.trim(),
          program_id: newProgramId || null,
          stage: newStage,
        };
      }
      const { data, error } = await invokeWithAuth('staff-assign-workspace-to-contract', {
        body,
      });
      if (error) throw error;
      const founderInfo = (data as any)?.founder;
      const wsId = (data as any)?.workspace_id ?? selectedId ?? '';

      notify.success(
        mode === 'create'
          ? t('lifecycleMismatch.createSuccess', {
              defaultValue: 'Workspace criado e ligado ao contrato.',
            })
          : t('lifecycleMismatch.assignSuccess', {
              defaultValue: 'Workspace atribuído ao contrato.',
            }),
      );
      if (founderInfo?.ok) {
        notify.info(
          t('lifecycleMismatch.founderCreated', {
            defaultValue: 'Conta do founder verificada / criada.',
          }),
        );
      }
      invalidateAll();
      onAssigned?.(wsId);
      onOpenChange(false);
    } catch (err: any) {
      notify.error(err?.message || t('common.error', { defaultValue: 'Erro' }));
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel =
    mode === 'create'
      ? t('lifecycleMismatch.createConfirm', { defaultValue: 'Criar workspace' })
      : t('lifecycleMismatch.assignConfirm', { defaultValue: 'Atribuir workspace' });

  const submitDisabled =
    submitting || (mode === 'assign' ? !selectedId : !newName.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('lifecycleMismatch.assignOrCreateTitle', {
              defaultValue: 'Atribuir ou criar workspace',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('lifecycleMismatch.assignOrCreateDescription', {
              defaultValue:
                'Ligue este contrato a um workspace existente ou crie um novo. O founder do contrato será adicionado como utilizador.',
            })}
          </DialogDescription>
        </DialogHeader>

        {contractExt && (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <div className="font-medium">
              {contractExt.organization_name ||
                contractExt.contract_number ||
                contractExt.id.slice(0, 8)}
            </div>
            {contractExt.legal_representative_email && (
              <div className="text-muted-foreground mt-0.5">
                {t('lifecycleMismatch.founderLabel', { defaultValue: 'Founder' })}:{' '}
                {contractExt.legal_representative_name || contractExt.legal_representative_email}
              </div>
            )}
          </div>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'assign' | 'create')}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="assign">
              {t('lifecycleMismatch.tabAssign', { defaultValue: 'Atribuir existente' })}
            </TabsTrigger>
            <TabsTrigger value="create">
              <Plus className="h-3 w-3 mr-1" />
              {t('lifecycleMismatch.tabCreate', { defaultValue: 'Criar novo' })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assign" className="space-y-2 mt-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
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
          </TabsContent>

          <TabsContent value="create" className="space-y-3 mt-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-ws-name" className="text-xs">
                {t('lifecycleMismatch.newStartupName', { defaultValue: 'Nome da startup' })}
              </Label>
              <Input
                id="new-ws-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={contractExt?.organization_name || ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {t('lifecycleMismatch.newProgram', { defaultValue: 'Programa' })}
              </Label>
              <Select value={newProgramId || '__none__'} onValueChange={(v) => setNewProgramId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.optional', { defaultValue: 'Opcional' })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {t('common.none', { defaultValue: 'Nenhum' })}
                  </SelectItem>
                  {(programs || []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {t('lifecycleMismatch.newStage', { defaultValue: 'Fase' })}
              </Label>
              <Select value={newStage} onValueChange={setNewStage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common.cancel', { defaultValue: 'Cancelar' })}
          </Button>
          <Button onClick={submit} disabled={submitDisabled}>
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssignWorkspaceDialog;
