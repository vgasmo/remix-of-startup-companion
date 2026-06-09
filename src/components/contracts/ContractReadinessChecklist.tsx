/**
 * ContractReadinessChecklist — Stream F (additive, read-only).
 *
 * Derives 7 readiness checks purely from already-fetched contract + intake fields.
 * No writes. No queries. The provider-switch warning is presentational only —
 * it never changes provider state silently.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, AlertTriangle, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StartupContract } from '@/hooks/backoffice/useContracts';
import type { ContractIntake } from '@/hooks/useContractIntakes';

interface ContractReadinessChecklistProps {
  contract: Partial<StartupContract> & Record<string, any>;
  intake?: Partial<ContractIntake> | null;
  className?: string;
}

interface CheckItem {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export function ContractReadinessChecklist({
  contract,
  intake,
  className,
}: ContractReadinessChecklistProps) {
  const { t } = useTranslation();

  const items = useMemo<CheckItem[]>(() => {
    const result: CheckItem[] = [];

    // 1. Legal representative present
    const repName =
      intake?.legal_representative_name ||
      (contract as any)?.legal_representative_name ||
      null;
    const repEmail =
      intake?.legal_representative_email ||
      (contract as any)?.legal_representative_email ||
      null;
    result.push({
      key: 'legalRep',
      label: t('contractReadiness.legalRep', { defaultValue: 'Representante legal preenchido' }),
      ok: Boolean(repName && repEmail),
      detail: repName ? `${repName}` : undefined,
    });

    // 2. Company NIF + address present
    const nif = intake?.company_nif || (contract as any)?.company_nif || null;
    const address = intake?.company_address || (contract as any)?.company_address || null;
    result.push({
      key: 'companyData',
      label: t('contractReadiness.companyData', { defaultValue: 'NIF e morada da empresa' }),
      ok: Boolean(nif && address),
      detail: nif ? `NIF ${nif}` : undefined,
    });

    // 3. Modality / building / space (only require where applicable)
    const hasIncubationType = Boolean(contract?.incubation_type_id);
    const hasBuilding = Boolean(contract?.building_id);
    // Space allocation may live in contract.space_id or related field; treat as soft check.
    const hasSpace = Boolean((contract as any)?.space_id) || hasBuilding;
    const modalityOk = hasIncubationType && hasBuilding && hasSpace;
    result.push({
      key: 'modality',
      label: t('contractReadiness.modality', { defaultValue: 'Modalidade, edifício e espaço' }),
      ok: modalityOk,
      detail: !hasIncubationType
        ? t('contractReadiness.missingIncubationType', { defaultValue: 'Falta tipo de incubação' })
        : !hasBuilding
        ? t('contractReadiness.missingBuilding', { defaultValue: 'Falta edifício' })
        : undefined,
    });

    // 4. Pricing snapshot present
    const pricingSnapshot =
      (contract as any)?.pricing_snapshot ||
      (contract as any)?.pricing_breakdown ||
      null;
    const hasMonthlyFee = typeof contract?.monthly_fee === 'number' && (contract.monthly_fee ?? 0) > 0;
    result.push({
      key: 'pricing',
      label: t('contractReadiness.pricing', { defaultValue: 'Snapshot de preço presente' }),
      ok: Boolean(pricingSnapshot) || hasMonthlyFee,
    });

    // 5. Generated PDF present
    const docUrl = contract?.document_url || (contract as any)?.generated_document_url || null;
    result.push({
      key: 'document',
      label: t('contractReadiness.document', { defaultValue: 'Documento gerado disponível' }),
      ok: Boolean(docUrl),
    });

    // 6. Signature provider selected
    const provider = contract?.signature_provider ?? null;
    result.push({
      key: 'provider',
      label: t('contractReadiness.provider', { defaultValue: 'Prestador de assinatura selecionado' }),
      ok: Boolean(provider),
      detail: provider ? provider.toUpperCase() : undefined,
    });

    // 7. Provider already sent — warning, not a check (rendered separately below as well)
    const sigStatus = (contract?.signature_status || '').toLowerCase();
    const alreadySent = ['sent', 'pending', 'sent_to_signers', 'awaiting_signature', 'in_progress'].includes(sigStatus);
    result.push({
      key: 'sentLock',
      label: t('contractReadiness.sentLock', {
        defaultValue: 'Não trocar prestador silenciosamente após envio',
      }),
      ok: !alreadySent || Boolean(provider),
      detail: alreadySent
        ? t('contractReadiness.sentLockWarning', {
            defaultValue: 'Já enviado. Mudar de prestador exige cancelar e reenviar manualmente.',
          })
        : undefined,
    });

    return result;
  }, [contract, intake, t]);

  const ready = items.every((i) => i.ok);
  const okCount = items.filter((i) => i.ok).length;

  const sigStatus = (contract?.signature_status || '').toLowerCase();
  const alreadySent = ['sent', 'pending', 'sent_to_signers', 'awaiting_signature', 'in_progress'].includes(sigStatus);

  return (
    <Card className={cn('border-muted/60', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {ready ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )}
            {t('contractReadiness.title', { defaultValue: 'Prontidão do contrato' })}
          </CardTitle>
          <Badge variant={ready ? 'default' : 'outline'} className="text-[11px]">
            {okCount}/{items.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li
              key={it.key}
              className="flex items-start gap-2 text-sm"
              aria-label={`${it.label}: ${it.ok ? 'ok' : 'pending'}`}
            >
              {it.ok ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 flex-shrink-0" />
              ) : (
                <Circle className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className={cn('leading-snug', !it.ok && 'text-muted-foreground')}>
                  {it.label}
                </div>
                {it.detail && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">{it.detail}</div>
                )}
              </div>
            </li>
          ))}
        </ul>

        {alreadySent && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 p-2.5 text-xs text-[hsl(var(--warning))]"
          >
            <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="leading-snug">
              <strong className="block">
                {t('contractReadiness.providerLockTitle', {
                  defaultValue: 'Prestador bloqueado para troca silenciosa',
                })}
              </strong>
              {t('contractReadiness.providerLockBody', {
                defaultValue:
                  'O contrato foi enviado para assinatura. Para mudar de prestador é obrigatório cancelar o envio actual antes de selecionar outro.',
              })}
            </div>
          </div>
        )}

        {!ready && !alreadySent && (
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground pt-1">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>
              {t('contractReadiness.notReadyHint', {
                defaultValue:
                  'Resolva os itens em falta para libertar o envio para assinatura. Esta verificação é apenas informativa.',
              })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ContractReadinessChecklist;
