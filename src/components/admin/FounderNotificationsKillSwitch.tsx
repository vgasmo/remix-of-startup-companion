/**
 * FounderNotificationsKillSwitch — Admin-only global switch that blocks all
 * in-app notifications for founders / team members. Enforced server-side by
 * the `trg_block_founder_notifications` trigger on public.notifications.
 */
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { BellOff } from 'lucide-react';
import { notify } from '@/lib/notify';

const SETTING_KEY = 'notifications.founders_disabled';

export function FounderNotificationsKillSwitch() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: disabled, isLoading } = useQuery({
    queryKey: ['system-setting', SETTING_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      return data?.value === true || data?.value === 'true';
    },
  });

  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from('system_settings')
        .upsert(
          {
            key: SETTING_KEY,
            value: next,
            description: 'When true, blocks all in-app notifications for founders/team members',
          },
          { onConflict: 'key' },
        );
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ['system-setting', SETTING_KEY] });
      notify.success(
        next
          ? t('systemSettings.founderNotifications.disabledToast', { defaultValue: 'Notificações dos founders desativadas' })
          : t('systemSettings.founderNotifications.enabledToast', { defaultValue: 'Notificações dos founders reativadas' }),
      );
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellOff className="h-4 w-4 text-primary" aria-hidden="true" />
          {t('systemSettings.founderNotifications.title', { defaultValue: 'Notificações dos Founders' })}
        </CardTitle>
        <CardDescription>
          {t('systemSettings.founderNotifications.description', {
            defaultValue:
              'Desativa globalmente todas as notificações in-app para founders e membros de equipa. Staff e mentores continuam a receber.',
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="founder-notifications-kill-switch" className="text-sm">
              {t('systemSettings.founderNotifications.switchLabel', { defaultValue: 'Bloquear notificações para founders' })}
            </Label>
            <Switch
              id="founder-notifications-kill-switch"
              checked={!!disabled}
              onCheckedChange={(v) => toggle.mutate(v)}
              disabled={toggle.isPending}
              aria-label={t('systemSettings.founderNotifications.switchLabel', { defaultValue: 'Bloquear notificações para founders' })}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
