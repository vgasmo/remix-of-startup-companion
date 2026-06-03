import { useTranslation } from 'react-i18next';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { notify } from "@/lib/notify";
import { Bell, Mail } from 'lucide-react';

export function NotificationSettings() {
  const { t } = useTranslation();
  const { data: prefs, isLoading } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  const DAYS = [
    t('settingsPage.sunday'),
    t('settingsPage.monday'),
    t('settingsPage.tuesday'),
    t('settingsPage.wednesday'),
    t('settingsPage.thursday'),
    t('settingsPage.friday'),
    t('settingsPage.saturday')
  ];

  const handleToggleDigest = async (enabled: boolean) => {
    try {
      await updatePrefs.mutateAsync({ email_digest_enabled: enabled });
      notify.success(enabled ? t('settingsPage.emailDigest') + ' ' + t('common.success').toLowerCase() : t('settingsPage.emailDigest') + ' disabled');
    } catch (error: any) {
      notify.error(error.message || t('common.errorGeneric'));
    }
  };

  const handleFrequencyChange = async (frequency: string) => {
    try {
      await updatePrefs.mutateAsync({ digest_frequency: frequency });
      notify.success(t('common.success'));
    } catch (error: any) {
      notify.error(error.message || t('common.errorGeneric'));
    }
  };

  const handleDayChange = async (day: string) => {
    try {
      await updatePrefs.mutateAsync({ digest_day: parseInt(day) });
      notify.success(t('common.success'));
    } catch (error: any) {
      notify.error(error.message || t('common.errorGeneric'));
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  const digestEnabled = prefs?.email_digest_enabled ?? true;
  const digestFrequency = prefs?.digest_frequency ?? 'weekly';
  const digestDay = prefs?.digest_day ?? 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" aria-hidden="true" />
          {t('settingsPage.notificationSettings')}
        </CardTitle>
        <CardDescription>{t('settingsPage.notificationSettingsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Mail className="h-4 w-4" aria-hidden="true" />
              {t('settingsPage.emailDigest')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('settingsPage.digestEnabled')}
            </p>
          </div>
          <Switch
            checked={digestEnabled}
            onCheckedChange={handleToggleDigest}
            disabled={updatePrefs.isPending}
            aria-label={t('settingsPage.emailDigest')}
          />
        </div>

        {digestEnabled && (
          <div className="grid gap-4 sm:grid-cols-2 pl-6 border-l-2 border-muted">
            <div className="space-y-2">
              <Label>{t('settingsPage.digestFrequency')}</Label>
              <Select value={digestFrequency} onValueChange={handleFrequencyChange} disabled={updatePrefs.isPending}>
                <SelectTrigger aria-label={t('settingsPage.digestFrequency')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t('settings.daily')}</SelectItem>
                  <SelectItem value="weekly">{t('settings.weekly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {digestFrequency === 'weekly' && (
              <div className="space-y-2">
                <Label>{t('settings.dayOfWeek')}</Label>
                <Select value={digestDay.toString()} onValueChange={handleDayChange} disabled={updatePrefs.isPending}>
                  <SelectTrigger aria-label={t('settings.dayOfWeek')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((day, i) => (
                      <SelectItem key={i} value={i.toString()}>{day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
