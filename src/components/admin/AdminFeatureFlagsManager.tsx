/**
 * Admin panel for managing feature flags
 * Controls which new features are enabled globally or per-program
 */

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Flag, Globe, Building2, Layers, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFeatureFlags, useUpdateFeatureFlag, useDeleteWorkspaceFlag } from '@/hooks/useFeatureFlags';
import { notify } from "@/lib/notify";

const FLAG_DESCRIPTIONS: Record<string, { label: string; description: string }> = {
  public_first_contact_booking: {
    label: 'Public First Contact Booking',
    description: 'Allow external leads to book first contact sessions via public links (no login required)',
  },
  funnel_ui: {
    label: 'Funnel Management UI',
    description: 'Enable leads/funnel management interface in admin panel',
  },
  founder_gamification: {
    label: 'Founder Gamification',
    description: 'Enable XP, badges, and streak tracking for founders',
  },
  traction_stage: {
    label: 'Traction Stage',
    description: 'Enable traction stage between MVP and growth stages',
  },
};

export function AdminFeatureFlagsManager() {
  const { t } = useTranslation();
  const { data: flags, isLoading } = useFeatureFlags();
  const updateFlag = useUpdateFeatureFlag();
  const deleteWorkspaceFlag = useDeleteWorkspaceFlag();

  const handleToggle = (flagId: string, currentEnabled: boolean) => {
    updateFlag.mutate(
      { id: flagId, enabled: !currentEnabled },
      {
        onSuccess: () => {
          notify.success(t('admin.featureFlags.flagToggled', { state: !currentEnabled ? t('common.enabled', 'ativada') : t('common.disabled', 'desativada'), defaultValue: `Feature flag ${!currentEnabled ? 'ativada' : 'desativada'}` }));
        },
        onError: (error) => {
          notify.error(t('admin.flagUpdateFailed', 'Erro ao atualizar flag'), { description: error.message });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // Group flags by scope
  const globalFlags = flags?.filter((f) => f.scope === 'global') ?? [];
  const programFlags = flags?.filter((f) => f.scope === 'program') ?? [];
  const workspaceFlags = flags?.filter((f) => f.scope === 'workspace') ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flag className="h-5 w-5" />
          {t('admin.featureFlags.title', 'Feature Flags')}
        </CardTitle>
        <CardDescription>
          {t('admin.featureFlags.description', 'Control which new features are enabled. All flags are OFF by default for safety.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Global flags */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Globe className="h-4 w-4" />
            {t('admin.featureFlags.globalFlags', 'Flags Globais')}
          </div>
          {globalFlags.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('admin.featureFlags.noGlobalFlags', 'Sem flags globais configuradas')}</p>
          ) : (
            <div className="space-y-3">
              {globalFlags.map((flag) => {
                const meta = FLAG_DESCRIPTIONS[flag.key] ?? {
                  label: flag.key,
                  description: flag.description ?? '',
                };
                return (
                  <div
                    key={flag.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{meta.label}</span>
                        <Badge variant="outline" className="text-xs">
                          {flag.key}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{meta.description}</p>
                    </div>
                    <Switch
                      checked={flag.enabled}
                      onCheckedChange={() => handleToggle(flag.id, flag.enabled)}
                      disabled={updateFlag.isPending}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Program-scoped flags */}
        {programFlags.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="h-4 w-4" />
              {t('admin.featureFlags.programOverrides', 'Overrides de Programa')}
            </div>
            <div className="space-y-3">
              {programFlags.map((flag) => {
                const meta = FLAG_DESCRIPTIONS[flag.key] ?? {
                  label: flag.key,
                  description: flag.description ?? '',
                };
                return (
                  <div
                    key={flag.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{meta.label}</span>
                        <Badge variant="secondary" className="text-xs">
                          Program: {flag.program_id?.slice(0, 8)}...
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{meta.description}</p>
                    </div>
                    <Switch
                      checked={flag.enabled}
                      onCheckedChange={() => handleToggle(flag.id, flag.enabled)}
                      disabled={updateFlag.isPending}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Workspace-scoped overrides (admin-only pilots) */}
        {workspaceFlags.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Layers className="h-4 w-4" />
              {t('admin.featureFlags.workspaceOverrides', 'Overrides de Workspace (piloto)')}
            </div>
            <div className="space-y-3">
              {workspaceFlags.map((flag) => {
                const meta = FLAG_DESCRIPTIONS[flag.key] ?? {
                  label: flag.key,
                  description: flag.description ?? '',
                };
                return (
                  <div
                    key={flag.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{meta.label}</span>
                        <Badge variant="outline" className="text-xs">{flag.key}</Badge>
                        <Badge variant="secondary" className="text-xs">
                          WS: {flag.workspace_id?.slice(0, 8)}…
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{meta.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={flag.enabled}
                        onCheckedChange={() => handleToggle(flag.id, flag.enabled)}
                        disabled={updateFlag.isPending}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={t('common.remove', 'Remover') as string}
                        onClick={() => {
                          deleteWorkspaceFlag.mutate(flag.id, {
                            onSuccess: () => notify.success(t('admin.featureFlags.overrideRemoved', 'Override removido — workspace volta ao default global.')),
                            onError: (err: any) => notify.error(err?.message ?? 'Erro'),
                          });
                        }}
                        disabled={deleteWorkspaceFlag.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
