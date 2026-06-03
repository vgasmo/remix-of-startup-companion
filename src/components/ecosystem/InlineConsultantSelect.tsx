import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { UserCog } from 'lucide-react';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  workspaceId: string;
  currentOwnerId: string | null;
  currentOwnerName: string | null;
  onAssigned?: () => void;
}

export function InlineConsultantSelect({ workspaceId, currentOwnerId, currentOwnerName, onAssigned }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: consultants } = useQuery({
    queryKey: ['consultants-list'],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'consultor']);

      if (!roles?.length) return [];

      const ids = roles.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from('profiles_safe')
        .select('id, full_name')
        .in('id', ids);

      return (profiles || []).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleAssign = async (consultantId: string) => {
    setSaving(true);
    try {
      const value = consultantId === 'none' ? null : consultantId;
      const { error } = await supabase
        .from('workspaces')
        .update({ assigned_consultor_id: value })
        .eq('id', workspaceId);

      if (error) throw error;

      notify.success(t('ecosystem.consultantAssigned', { defaultValue: 'Consultor atribuído com sucesso' }));
      queryClient.invalidateQueries({ queryKey: ['ecosystem-items'] });
      onAssigned?.();
    } catch (err) {
      logger.error('consultant_assign_failed', {}, err);
      notify.error(t('common.errorSaving', { defaultValue: 'Erro ao guardar' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Select
      value={currentOwnerId || 'none'}
      onValueChange={handleAssign}
      disabled={saving}
    >
      <SelectTrigger
        className="h-8 w-[160px] text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue>
          {currentOwnerName ? (
            <span className="truncate">{currentOwnerName}</span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground">
              <UserCog className="h-3 w-3" />
              {t('ecosystem.assignConsultant', { defaultValue: 'Atribuir...' })}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        <SelectItem value="none">
          <span className="text-muted-foreground">{t('ecosystem.noConsultant', { defaultValue: 'Sem consultor' })}</span>
        </SelectItem>
        {consultants?.map(c => (
          <SelectItem key={c.id} value={c.id}>
            {c.full_name || c.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
