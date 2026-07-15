/**
 * LifecycleMismatchPanel — Stream F (additive, read-only).
 *
 * Detects inconsistencies across already-loaded data (intake/contract/CRM/workspace)
 * and surfaces them as labelled warnings with a deep-link to the affected record.
 *
 * NEVER auto-repairs. NEVER writes. The existing safe Re-sync action remains
 * available elsewhere; this panel only points the operator at the discrepancy.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StartupContract } from '@/hooks/backoffice/useContracts';
import type { ContractIntake } from '@/hooks/useContractIntakes';

interface CrmItemLite {
  id: string;
  stage: string;
  linked_contract_id?: string | null;
  organization_name?: string | null;
}

interface WorkspaceLite {
  id: string;
  status?: string | null;
  startup_id?: string | null;
}

interface LifecycleMismatchPanelProps {
  contracts?: StartupContract[];
  intakes?: ContractIntake[];
  crmItems?: CrmItemLite[];
  workspaces?: WorkspaceLite[];
  onOpenContract?: (contractId: string) => void;
  className?: string;
}

interface Mismatch {
  id: string;
  severity: 'warn' | 'info' | 'error';
  title: string;
  detail: string;
  recordType: 'contract' | 'intake' | 'crm' | 'workspace';
  recordId: string;
  recordLabel?: string;
}

export function LifecycleMismatchPanel({
  contracts = [],
  intakes = [],
  crmItems = [],
  workspaces = [],
  onOpenContract,
  className,
}: LifecycleMismatchPanelProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  const mismatches = useMemo<Mismatch[]>(() => {
    const out: Mismatch[] = [];

    const wsById = new Map(workspaces.map((w) => [w.id, w]));

    // Index intakes by contract_id
    const intakeByContractId = new Map<string, ContractIntake>();
    intakes.forEach((i) => {
      if (i.contract_id) intakeByContractId.set(i.contract_id, i);
    });

    contracts.forEach((c) => {
      const label = c.organization_name || c.contract_number || c.id.slice(0, 8);
      const intake = intakeByContractId.get(c.id);

      // 1) intake signed/activated but contract not active
      if (intake && ['signed', 'activated'].includes(intake.status) && c.status !== 'active') {
        out.push({
          id: `intake-vs-contract-${c.id}`,
          severity: 'warn',
          title: t('lifecycleMismatch.intakeAheadOfContract.title', {
            defaultValue: 'Intake assinado mas contrato não está activo',
          }),
          detail: t('lifecycleMismatch.intakeAheadOfContract.detail', {
            defaultValue: 'intake.status="{{istate}}" / contract.status="{{cstate}}"',
            istate: intake.status,
            cstate: c.status,
          }),
          recordType: 'contract',
          recordId: c.id,
          recordLabel: label,
        });
      }

      // 2) contract active but workspace not active
      if (c.status === 'active' && c.workspace_id) {
        const ws = wsById.get(c.workspace_id);
        if (ws && ws.status && ws.status !== 'active') {
          out.push({
            id: `contract-vs-workspace-${c.id}`,
            severity: 'warn',
            title: t('lifecycleMismatch.contractActiveWorkspaceNot.title', {
              defaultValue: 'Contrato activo mas workspace não está activo',
            }),
            detail: t('lifecycleMismatch.contractActiveWorkspaceNot.detail', {
              defaultValue: 'workspace.status="{{wstate}}"',
              wstate: ws.status,
            }),
            recordType: 'contract',
            recordId: c.id,
            recordLabel: label,
          });
        }
      }

      // 3) contract sent_for_signature provider but no signature_provider populated
      if (
        c.status === 'pending_signature' &&
        !c.signature_provider
      ) {
        out.push({
          id: `contract-no-provider-${c.id}`,
          severity: 'warn',
          title: t('lifecycleMismatch.pendingSignatureNoProvider.title', {
            defaultValue: 'Contrato em pending_signature sem prestador definido',
          }),
          detail: t('lifecycleMismatch.pendingSignatureNoProvider.detail', {
            defaultValue: 'signature_provider está vazio.',
          }),
          recordType: 'contract',
          recordId: c.id,
          recordLabel: label,
        });
      }

      // 3b) ACTIVE contract without workspace — blocks activation & founder onboarding
      if (c.status === 'active' && !c.workspace_id) {
        out.push({
          id: `contract-active-no-workspace-${c.id}`,
          severity: 'error',
          title: t('lifecycleMismatch.activeNoWorkspace.title', {
            defaultValue: 'Contrato activo sem workspace',
          }),
          detail: t('lifecycleMismatch.activeNoWorkspace.detail', {
            defaultValue: 'Nenhum workspace associado — o founder não vê o produto.',
          }),
          recordType: 'contract',
          recordId: c.id,
          recordLabel: label,
        });
      }

      // 3c) contract terminated but workspace still active
      if (
        c.workspace_id &&
        c.status === 'terminated'
      ) {
        const ws = wsById.get(c.workspace_id);
        if (ws && ws.status === 'active') {
          out.push({
            id: `contract-closed-workspace-active-${c.id}`,
            severity: 'warn',
            title: t('lifecycleMismatch.closedContractActiveWorkspace.title', {
              defaultValue: 'Contrato terminado/anulado mas workspace continua activo',
            }),
            detail: t('lifecycleMismatch.closedContractActiveWorkspace.detail', {
              defaultValue: 'contract.status="{{cstate}}" / workspace.status="active"',
              cstate: c.status,
            }),
            recordType: 'contract',
            recordId: c.id,
            recordLabel: label,
          });
        }
      }

      // 3d) contract active but end_date in the past (expired without transition)
      if (c.status === 'active' && c.end_date) {
        const end = new Date(c.end_date);
        if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) {
          out.push({
            id: `contract-expired-still-active-${c.id}`,
            severity: 'warn',
            title: t('lifecycleMismatch.expiredStillActive.title', {
              defaultValue: 'Contrato activo com end_date no passado',
            }),
            detail: t('lifecycleMismatch.expiredStillActive.detail', {
              defaultValue: 'end_date={{end}} — necessita renovação ou encerramento.',
              end: c.end_date,
            }),
            recordType: 'contract',
            recordId: c.id,
            recordLabel: label,
          });
        }
      }

      // 3e) intake still in early stages but contract already progressed
      if (
        intake &&
        (intake.status === 'intake_requested' ||
          intake.status === 'intake_in_progress' ||
          intake.status === 'draft_internal') &&
        (c.status === 'pending_signature' || c.status === 'active')
      ) {
        out.push({
          id: `intake-behind-contract-${c.id}`,
          severity: 'info',
          title: t('lifecycleMismatch.intakeBehindContract.title', {
            defaultValue: 'Intake ainda em recolha mas contrato já avançou',
          }),
          detail: t('lifecycleMismatch.intakeBehindContract.detail', {
            defaultValue: 'intake.status="{{istate}}" / contract.status="{{cstate}}"',
            istate: intake.status,
            cstate: c.status,
          }),
          recordType: 'contract',
          recordId: c.id,
          recordLabel: label,
        });
      }
    });

    // 4) CRM stage = contracted but no linked_contract_id
    crmItems.forEach((item) => {
      if (item.stage === 'contracted' && !item.linked_contract_id) {
        out.push({
          id: `crm-no-contract-${item.id}`,
          severity: 'warn',
          title: t('lifecycleMismatch.crmContractedNoLink.title', {
            defaultValue: 'Lead em fase "contracted" sem contrato ligado',
          }),
          detail: t('lifecycleMismatch.crmContractedNoLink.detail', {
            defaultValue: 'funnel_items.linked_contract_id está vazio.',
          }),
          recordType: 'crm',
          recordId: item.id,
          recordLabel: item.organization_name || item.id.slice(0, 8),
        });
      }
    });

    // 4b) CRM item linked to a contract that no longer exists / is terminated,
    // but the CRM stage is not yet archived/rejected.
    const contractById = new Map(contracts.map((c) => [c.id, c]));
    crmItems.forEach((item) => {
      if (!item.linked_contract_id) return;
      const linked = contractById.get(item.linked_contract_id);
      if (!linked) return;
      if (
        (linked.status === 'terminated' || linked.status === 'voided' || linked.status === 'declined') &&
        !['rejected', 'archived', 'lost'].includes(item.stage)
      ) {
        out.push({
          id: `crm-stale-linked-${item.id}`,
          severity: 'info',
          title: t('lifecycleMismatch.crmStaleLinkedContract.title', {
            defaultValue: 'Lead ligada a contrato encerrado sem actualização de fase',
          }),
          detail: t('lifecycleMismatch.crmStaleLinkedContract.detail', {
            defaultValue: 'contract.status="{{cstate}}" / funnel.stage="{{fstate}}"',
            cstate: linked.status,
            fstate: item.stage,
          }),
          recordType: 'crm',
          recordId: item.id,
          recordLabel: item.organization_name || item.id.slice(0, 8),
        });
      }
    });

    return out;
  }, [contracts, intakes, crmItems, workspaces, t]);

  if (mismatches.length === 0) {
    return (
      <Card className={cn('border-success/30 bg-success/5', className)}>
        <CardContent className="py-3 flex items-center gap-2 text-sm text-success">
          <ShieldCheck className="h-4 w-4" />
          {t('lifecycleMismatch.allConsistent', {
            defaultValue: 'Estados de contrato/intake/CRM/workspace consistentes.',
          })}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border-warning/40', className)}>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            {t('lifecycleMismatch.title', { defaultValue: 'Inconsistências de ciclo de vida' })}
            <Badge variant="outline" className="text-[11px]">
              {mismatches.length}
            </Badge>
          </CardTitle>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2">
          <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
            {t('lifecycleMismatch.disclaimer', {
              defaultValue:
                'Apenas leitura. Nenhuma reparação automática. Use as acções existentes em cada registo.',
            })}
          </p>
          <ul className="space-y-2">
            {mismatches.map((m) => (
              <li
                key={m.id}
                className="rounded-md border border-warning/30 bg-warning/5 p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-snug">{m.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {m.recordLabel ? `${m.recordLabel} — ` : ''}{m.detail}
                    </div>

                  </div>
                  {m.recordType === 'contract' && onOpenContract && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs flex-shrink-0"
                      onClick={() => onOpenContract(m.recordId)}
                    >
                      {t('lifecycleMismatch.open', { defaultValue: 'Abrir' })}
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

export default LifecycleMismatchPanel;
