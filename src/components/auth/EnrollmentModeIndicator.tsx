/**
 * Enrollment Mode Indicator for Login Page
 * Shows a subtle, non-alarming banner when the platform is in invite-only mode.
 * Helps founders understand why signup might be gated.
 */

import { useTranslation } from 'react-i18next';
import { Shield, Globe } from 'lucide-react';
import { useFeatureFlag } from '@/hooks/useFeatureFlags';
import { cn } from '@/lib/utils';

export function EnrollmentModeIndicator() {
  const { t } = useTranslation();
  const isOpenRegistration = useFeatureFlag('open_registration');

  if (isOpenRegistration) {
    // Open enrollment — show welcoming indicator
    return (
      <div className={cn(
        'flex items-start gap-2.5 p-3 rounded-xl border text-xs',
        'border-[hsl(var(--success))]/40',
        'bg-[hsl(var(--success))]/10',
        'text-foreground'
      )}>
        <Globe className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--success))]" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            {t('login.openEnrollmentBanner', { defaultValue: 'Inscrições abertas' })}
          </p>
          <p className="text-muted-foreground">
            {t('login.openEnrollmentBannerDesc', { 
              defaultValue: 'Pode criar a sua conta livremente. Se a sua startup já está no ecossistema, o sistema irá associá-la automaticamente após o registo.' 
            })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      'flex items-start gap-2.5 p-3 rounded-xl border text-xs',
      'border-[hsl(var(--warning))]/40',
      'bg-[hsl(var(--warning))]/10',
      'text-foreground'
    )}>
      <Shield className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--warning))]" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">
          {t('login.inviteOnlyBanner', { defaultValue: 'Plataforma por convite' })}
        </p>
        <p className="text-muted-foreground">
          {t('login.inviteOnlyBannerDesc', { 
            defaultValue: 'O registo está atualmente limitado a convites. Se a sua startup já faz parte do ecossistema, pode fazer login normalmente. Para novos registos, contacte a equipa Startup Leiria.' 
          })}
        </p>
      </div>
    </div>
  );
}
