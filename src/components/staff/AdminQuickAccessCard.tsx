/**
 * AdminQuickAccessCard — Promotes high-value admin tools that are buried in tabs.
 * Read-only shortcut card for the Staff Cockpit.
 */
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  MapPin,
  FileText,
  Building2,
  Settings,
  ArrowRight,
  Boxes,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickLink {
  label: string;
  description: string;
  icon: typeof MapPin;
  href: string;
  /** If the target is a tab inside /backoffice, include the tab value */
  tab?: string;
}

export function AdminQuickAccessCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const links: QuickLink[] = [
    {
      label: t('staffCockpit.quickAccess.spaceOps', { defaultValue: 'Consola de Operações' }),
      description: t('staffCockpit.quickAccess.spaceOpsDesc', { defaultValue: 'Alocações, startups e espaços' }),
      icon: MapPin,
      href: '/admin?tab=backoffice&subtab=spaces',
    },
    {
      label: t('staffCockpit.quickAccess.contracts', { defaultValue: 'Contratos' }),
      description: t('staffCockpit.quickAccess.contractsDesc', { defaultValue: 'Gestão e renovações' }),
      icon: FileText,
      href: '/admin?tab=backoffice&subtab=contracts',
    },
    {
      label: t('staffCockpit.quickAccess.infrastructure', { defaultValue: 'Infraestrutura' }),
      description: t('staffCockpit.quickAccess.infrastructureDesc', { defaultValue: 'Edifícios, salas e plantas' }),
      icon: Building2,
      href: '/admin?tab=backoffice&subtab=spaces',
    },
    {
      label: t('staffCockpit.quickAccess.systemSettings', { defaultValue: 'Configurações Sistema' }),
      description: t('staffCockpit.quickAccess.systemSettingsDesc', { defaultValue: 'Flags, logs e integrações' }),
      icon: Settings,
      href: '/system-settings',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="h-4 w-4 text-primary" />
          {t('staffCockpit.quickAccess.title', { defaultValue: 'Acesso Rápido' })}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t('staffCockpit.quickAccess.subtitle', { defaultValue: 'Ferramentas operacionais mais utilizadas.' })}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {links.map(link => {
            const Icon = link.icon;
            return (
              <button
                key={link.href}
                onClick={() => navigate(link.href)}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-xl text-left',
                  'border border-border/50 bg-card',
                  'hover:bg-muted/50 hover:border-primary/20 transition-all duration-200',
                  'group',
                )}
              >
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1">
                    {link.label}
                    <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {link.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
