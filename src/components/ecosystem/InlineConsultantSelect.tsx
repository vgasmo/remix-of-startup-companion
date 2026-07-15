import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from '@/lib/notify';
import { logger } from '@/lib/logger';
import { ConsultantCombobox } from './ConsultantCombobox';

interface Props {
  workspaceId: string;
  currentOwnerId: string | null;
  currentOwnerName: string | null;
  onAssigned?: () => void;
}

export function InlineConsultantSelect({
  workspaceId,
  currentOwnerId,
  onAssigned,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const handleAssign = async (consultantId: string | null) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({ assigned_consultor_id: consultantId })
        .eq('id', workspaceId);
      if (error) throw error;
      notify.success(
        t('ecosystem.consultantAssigned', {
          defaultValue: 'Consultor atribuído com sucesso',
        }),
      );
      queryClient.invalidateQueries({ queryKey: ['ecosystem-items-v2'] });
      // Fire notification email (best-effort; ignore failures).
      if (consultantId) {
        supabase.functions
          .invoke('send-notification-email', {
            body: {
              type: 'consultant_assigned',
              workspace_id: workspaceId,
              consultant_id: consultantId,
            },
          })
          .catch((e) => logger.warn('consultant_assigned_email_failed', {}, e));
      }
      onAssigned?.();
    } catch (err) {
      logger.error('consultant_assign_failed', {}, err);
      notify.error(t('common.errorSaving', { defaultValue: 'Erro ao guardar' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConsultantCombobox
      value={currentOwnerId}
      onChange={handleAssign}
      disabled={saving}
      size="sm"
      triggerClassName="w-[160px]"
      stopPropagation
    />
  );
}
