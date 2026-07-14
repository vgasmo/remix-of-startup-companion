import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from '@/lib/notify';
import { usePrograms } from '@/hooks/useAdminData';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

interface ProgramSwitcherProps {
  workspaceId: string;
  currentProgramId: string;
  size?: 'sm' | 'default';
  className?: string;
}

/**
 * Dropdown to move a workspace between programs (incubation ⇄ acceleration ⇄ …).
 * Staff-only. Resets stage_id and current_week because the target program has its own
 * stage tree / weeks. Logs a lifecycle event for auditability.
 */
export function ProgramSwitcher({
  workspaceId,
  currentProgramId,
  size = 'default',
  className,
}: ProgramSwitcherProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: programs = [], isLoading } = usePrograms();
  const [pendingProgramId, setPendingProgramId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activePrograms = programs.filter((p: any) => p.is_active !== false);
  const targetProgram = programs.find((p: any) => p.id === pendingProgramId);
  const currentProgram = programs.find((p: any) => p.id === currentProgramId);

  const commit = async () => {
    if (!pendingProgramId) return;
    setSaving(true);
    try {
      const targetType = (targetProgram as any)?.program_type ?? null;
      const patch: Record<string, unknown> = {
        program_id: pendingProgramId,
        stage_id: null, // stages are program-scoped
      };
      if (targetType === 'acceleration') patch.current_week = 1;
      else patch.current_week = null;

      const { error } = await supabase
        .from('workspaces')
        .update(patch)
        .eq('id', workspaceId);
      if (error) throw error;

      // Best-effort lifecycle log (silent on failure)
      try {
        const { data: userData } = await supabase.auth.getUser();
        await supabase.from('activity_log').insert({
          workspace_id: workspaceId,
          user_id: userData.user?.id ?? null,
          action: 'workspace.program_changed',
          entity_type: 'workspace',
          entity_id: workspaceId,
          metadata: {
            from_program_id: currentProgramId,
            to_program_id: pendingProgramId,
            from_program_name: (currentProgram as any)?.name ?? null,
            to_program_name: (targetProgram as any)?.name ?? null,
          },
        } as any);
      } catch {
        /* non-critical */
      }

      notify.success(
        t('programSwitcher.updated', {
          defaultValue: 'Programa atualizado',
        }),
      );
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces-paged'] });
      setPendingProgramId(null);
    } catch (err) {
      notify.error(
        t('programSwitcher.updateFailed', {
          defaultValue: 'Falha ao alterar programa',
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Select
        value={currentProgramId}
        onValueChange={(v) => {
          if (v && v !== currentProgramId) setPendingProgramId(v);
        }}
        disabled={isLoading}
      >
        <SelectTrigger
          className={className ?? (size === 'sm' ? 'h-8 w-[180px] text-xs' : 'w-[200px]')}
          aria-label={t('programSwitcher.label', { defaultValue: 'Programa' })}
        >
          <SelectValue placeholder={t('programSwitcher.label', { defaultValue: 'Programa' })} />
        </SelectTrigger>
        <SelectContent>
          {activePrograms.map((p: any) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
              {p.program_type ? (
                <span className="text-muted-foreground ml-2 text-xs">
                  ({p.program_type === 'acceleration'
                    ? t('programSwitcher.acceleration', { defaultValue: 'Aceleração' })
                    : t('programSwitcher.incubation', { defaultValue: 'Incubação' })})
                </span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog
        open={!!pendingProgramId}
        onOpenChange={(open) => !open && !saving && setPendingProgramId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('programSwitcher.confirmTitle', { defaultValue: 'Alterar programa?' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('programSwitcher.confirmDesc', {
                defaultValue:
                  'A startup será movida de "{{from}}" para "{{to}}". A fase (stage) e a semana atual serão reiniciadas — os marcos e ações existentes são preservados.',
                from: (currentProgram as any)?.name ?? '—',
                to: (targetProgram as any)?.name ?? '—',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>
              {t('common.cancel', { defaultValue: 'Cancelar' })}
            </AlertDialogCancel>
            <AlertDialogAction onClick={commit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('programSwitcher.confirm', { defaultValue: 'Confirmar' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
