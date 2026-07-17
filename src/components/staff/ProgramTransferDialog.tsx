import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from '@/lib/notify';
import { usePrograms } from '@/hooks/useAdminData';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowRightLeft } from 'lucide-react';

interface Props {
  workspaceId: string;
  currentProgramId: string | null;
  trigger?: React.ReactNode;
}

/**
 * Staff-only programme transfer with server-side dry-run preview.
 * Backed by RPC `staff_transfer_workspace_program`.
 */
export function ProgramTransferDialog({ workspaceId, currentProgramId, trigger }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: programs = [] } = usePrograms();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string>('');
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const active = programs.filter((p: any) => p.is_active !== false && p.id !== currentProgramId);

  const runDry = async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('staff_transfer_workspace_program' as any, {
        p_workspace_id: workspaceId,
        p_target_program_id: targetId,
        p_dry_run: true,
      });
      if (error) throw error;
      setPreview(data);
    } catch (e: any) {
      notify.error(e?.message ?? 'Falha na simulação');
    } finally {
      setLoading(false);
    }
  };

  const commit = async () => {
    if (!targetId || !preview) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('staff_transfer_workspace_program' as any, {
        p_workspace_id: workspaceId,
        p_target_program_id: targetId,
        p_dry_run: false,
      });
      if (error) throw error;
      notify.success(t('programTransfer.done', { defaultValue: 'Programa transferido' }));
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      qc.invalidateQueries({ queryKey: ['workspaces-paged'] });
      qc.invalidateQueries({ queryKey: ['ecosystem-items'] });
      setOpen(false);
      setPreview(null);
      setTargetId('');
    } catch (e: any) {
      notify.error(e?.message ?? 'Falha na transferência');
    } finally {
      setLoading(false);
    }
  };

  const impact = preview?.impact ?? {};

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPreview(null); setTargetId(''); } }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowRightLeft className="h-3.5 w-3.5" />
            {t('programTransfer.action', { defaultValue: 'Mover de programa' })}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('programTransfer.title', { defaultValue: 'Transferir workspace' })}</DialogTitle>
          <DialogDescription>
            {t('programTransfer.desc', { defaultValue: 'Simula primeiro; nada é alterado sem confirmação.' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Select value={targetId} onValueChange={(v) => { setTargetId(v); setPreview(null); }}>
            <SelectTrigger>
              <SelectValue placeholder={t('programTransfer.pick', { defaultValue: 'Programa de destino' })} />
            </SelectTrigger>
            <SelectContent>
              {active.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} <span className="text-muted-foreground text-xs ml-2">({p.program_type})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {preview && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <div className="font-medium">{t('programTransfer.previewTitle', { defaultValue: 'Previsão' })}</div>
              <div>Sessões preservadas: <b>{impact.sessions_preserved ?? 0}</b></div>
              <div>Ações preservadas: <b>{impact.actions_preserved ?? 0}</b></div>
              <div>KPIs preservados: <b>{impact.kpis_preserved ?? 0}</b></div>
              <div>Marcos mantidos: <b>{impact.milestones_kept ?? 0}</b></div>
              <div>Marcos arquivados (específicos do programa): <b>{impact.milestones_archived ?? 0}</b></div>
              <div className="text-xs text-muted-foreground pt-1">
                Stage será reiniciado{preview.current_week_reset ? '; semana volta a 1' : ''}.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!preview ? (
            <Button onClick={runDry} disabled={!targetId || loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('programTransfer.simulate', { defaultValue: 'Simular' })}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={loading}>
                {t('common.back', { defaultValue: 'Voltar' })}
              </Button>
              <Button onClick={commit} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t('programTransfer.confirm', { defaultValue: 'Confirmar transferência' })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
