/**
 * ProvenanceBadge — read-only truth/provenance indicators.
 *
 * Stream F (additive): clarifies WHERE a piece of data is canonical
 * vs. a derived/secondary copy. No writes, no business logic.
 *
 * Variants:
 *  - contract-truth   → always "startup_contracts" (canonical)
 *  - intake-state     → current contract_intakes.status
 *  - crm-phase        → current funnel_items.stage (macro)
 *  - archive-status   → SharePoint copy, explicitly NON-canonical
 */
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ShieldCheck, FileSignature, Workflow, Archive, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'contract-truth' | 'intake-state' | 'crm-phase' | 'archive-status';

interface ProvenanceBadgeProps {
  variant: Variant;
  /** State value (e.g. intake status, CRM stage). Ignored for contract-truth. */
  value?: string | null;
  className?: string;
  /** Optional override for the human-readable label of `value`. */
  label?: string;
}

const VARIANT_CONFIG: Record<Variant, {
  icon: typeof ShieldCheck;
  cls: string;
  i18nLabelKey: string;
  i18nDescKey: string;
  defaultLabel: string;
  defaultDesc: string;
}> = {
  'contract-truth': {
    icon: ShieldCheck,
    cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
    i18nLabelKey: 'provenance.contractTruth.label',
    i18nDescKey: 'provenance.contractTruth.desc',
    defaultLabel: 'Fonte canónica: startup_contracts',
    defaultDesc: 'Os dados financeiros e contratuais lidos aqui vêm da tabela canónica startup_contracts.',
  },
  'intake-state': {
    icon: FileSignature,
    cls: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/30',
    i18nLabelKey: 'provenance.intakeState.label',
    i18nDescKey: 'provenance.intakeState.desc',
    defaultLabel: 'Estado intake',
    defaultDesc: 'Estado operacional do formulário de onboarding (contract_intakes.status).',
  },
  'crm-phase': {
    icon: Workflow,
    cls: 'bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300',
    i18nLabelKey: 'provenance.crmPhase.label',
    i18nDescKey: 'provenance.crmPhase.desc',
    defaultLabel: 'Fase CRM',
    defaultDesc: 'Macro-fase comercial no pipeline (funnel_items.stage). Não substitui o estado operacional do contrato.',
  },
  'archive-status': {
    icon: Archive,
    cls: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30',
    i18nLabelKey: 'provenance.archiveStatus.label',
    i18nDescKey: 'provenance.archiveStatus.desc',
    defaultLabel: 'Cópia SharePoint — não canónica',
    defaultDesc: 'Reflete o estado do arquivo de backup em SharePoint. Não é a fonte de verdade do contrato.',
  },
};

export function ProvenanceBadge({ variant, value, className, label }: ProvenanceBadgeProps) {
  const { t } = useTranslation();
  const cfg = VARIANT_CONFIG[variant];
  const Icon = cfg.icon;

  const baseLabel = t(cfg.i18nLabelKey, { defaultValue: cfg.defaultLabel });
  const description = t(cfg.i18nDescKey, { defaultValue: cfg.defaultDesc });

  const display = variant === 'contract-truth'
    ? baseLabel
    : `${baseLabel}: ${label ?? value ?? '—'}`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'gap-1.5 font-medium border text-[11px] py-0.5 px-2 cursor-help',
              cfg.cls,
              className
            )}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            <span className="truncate max-w-[260px]">{display}</span>
            <Info className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[320px] text-xs leading-relaxed">
          {description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default ProvenanceBadge;
