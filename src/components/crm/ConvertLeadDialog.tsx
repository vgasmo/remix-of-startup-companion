import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Briefcase } from 'lucide-react';
import { useConvertToStartup, type FunnelItem } from '@/hooks/useFunnel';
import { usePrograms } from '@/hooks/useAdminData';

interface ConvertLeadDialogProps {
  item: FunnelItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConverted?: (workspaceId: string) => void;
}

const STAGES = ['ideation', 'validation', 'mvp', 'growth', 'scale'] as const;

export function ConvertLeadDialog({ item, open, onOpenChange, onConverted }: ConvertLeadDialogProps) {
  const { t } = useTranslation();
  const { data: programs, isLoading: loadingPrograms } = usePrograms();
  const convert = useConvertToStartup();

  const [programId, setProgramId] = useState<string>('');
  const [stage, setStage] = useState<typeof STAGES[number]>('ideation');

  useEffect(() => {
    if (open) {
      setProgramId(item.program_id || '');
      setStage('ideation');
    }
  }, [open, item.program_id]);

  const activePrograms = (programs || []).filter((p: any) => p.is_active !== false);

  const handleConvert = async () => {
    if (!programId) return;
    try {
      const result = await convert.mutateAsync({
        funnelItemId: item.id,
        programId,
        stage,
      });
      onConverted?.(result.workspace.id);
      onOpenChange(false);
    } catch {
      // toast handled in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            {t('crm.convertToWorkspace.title', { defaultValue: 'Converter em Workspace' })}
          </DialogTitle>
          <DialogDescription>
            {t('crm.convertToWorkspace.description', {
              name: item.organization_name || item.contact_name || '',
              defaultValue: 'Cria a startup e o workspace para "{{name}}". O workspace ficará pendente até a ativação por contrato.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="program">
              {t('crm.convertToWorkspace.program', { defaultValue: 'Programa' })}
            </Label>
            <Select value={programId} onValueChange={setProgramId} disabled={loadingPrograms}>
              <SelectTrigger id="program">
                <SelectValue
                  placeholder={t('crm.convertToWorkspace.selectProgram', {
                    defaultValue: 'Selecionar programa',
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                {activePrograms.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage">
              {t('crm.convertToWorkspace.stage', { defaultValue: 'Estágio inicial' })}
            </Label>
            <Select value={stage} onValueChange={(v) => setStage(v as typeof STAGES[number])}>
              <SelectTrigger id="stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`stages.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={convert.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConvert} disabled={!programId || convert.isPending}>
            {convert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('crm.convertToWorkspace.confirm', { defaultValue: 'Converter' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
