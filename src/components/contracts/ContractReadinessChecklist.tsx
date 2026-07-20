/**
 * ContractReadinessChecklist — Stream F (additive, read-only).
 *
 * Derives 7 readiness checks purely from already-fetched contract + intake fields
 * and renders them via the shared ReadinessCard for parity with the CRM lead view.
 * No writes. No queries. The provider-switch warning is presentational only —
 * it never changes provider state silently.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSignature } from 'lucide-react';
import { ReadinessCard, type ReadinessItem } from '@/components/shared/ReadinessCard';
import type { StartupContract } from '@/hooks/backoffice/useContracts';
import type { ContractIntake } from '@/hooks/useContractIntakes';

interface ContractReadinessChecklistProps {
  contract: Partial<StartupContract> & Record<string, any>;
  intake?: Partial<ContractIntake> | null;
  className?: string;
}

export function ContractReadinessChecklist({
  contract,
  intake,
  className,
}: ContractReadinessChecklistProps) {
  const { t } = useTranslation();

  const { items, alreadySent, provider } = useMemo(() => {
    const list: ReadinessItem[] = [];

    // 1. Legal representative present
    const repName =
      intake?.legal_representative_name ||
      (contract as any)?.legal_representative_name ||
      null;
    const repEmail =
      intake?.legal_representative_email ||
      (contract as any)?.legal_representative_email ||
      null;
    list.push({
      key: 'legalRep',
      label: t('contractReadiness.legalRep', { defaultValue: 'Representante legal preenchido' }),
      ok: Boolean(repName && repEmail),
      detail: repName ? `${repName}` : undefined,
    });

    // 2. Company NIF + address present
    const nif = intake?.company_nif || (contract as any)?.company_nif || null;
    const address = intake?.company_address || (contract as any)?.company_address || null;
    list.push({
      key: 'companyData',
      label: t('contractReadiness.companyData', { defaultValue: 'NIF e morada da empresa' }),
      ok: Boolean(nif && address),
      detail: nif ? `NIF ${nif}` : undefined,
    });

    // 3. Modality / building / space
    const hasIncubationType = Boolean(contract?.incubation_type_id);
    const hasBuilding = Boolean(contract?.building_id);
    const hasSpace = Boolean((contract as any)?.space_id) || hasBuilding;
    const modalityOk = hasIncubationType && hasBuilding && hasSpace;
    list.push({
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
    list.push({
      key: 'pricing',
      label: t('contractReadiness.pricing', { defaultValue: 'Snapshot de preço presente' }),
      ok: Boolean(pricingSnapshot) || hasMonthlyFee,
    });

    // 5. Generated PDF present
    const docUrl = contract?.document_url || (contract as any)?.generated_document_url || null;
    list.push({
      key: 'document',
      label: t('contractReadiness.document', { defaultValue: 'Documento gerado disponível' }),
      ok: Boolean(docUrl),
    });

    // 6. Signature provider selected
    const providerVal = contract?.signature_provider ?? null;
    list.push({
      key: 'provider',
      label: t('contractReadiness.provider', { defaultValue: 'Prestador de assinatura selecionado' }),
      ok: Boolean(providerVal),
      detail: providerVal ? String(providerVal).toUpperCase() : undefined,
    });

    // 7. Provider not silently switched after send
    const sigStatus = (contract?.signature_status || '').toLowerCase();
    const sent = ['sent', 'pending', 'sent_to_signers', 'awaiting_signature', 'in_progress'].includes(sigStatus);
    list.push({
      key: 'sentLock',
      label: t('contractReadiness.sentLock', {
        defaultValue: 'Não trocar prestador silenciosamente após envio',
      }),
      ok: !sent || Boolean(providerVal),
      detail: sent
        ? t('contractReadiness.sentLockWarning', {
            defaultValue: 'Já enviado. Mudar de prestador exige cancelar e reenviar manualmente.',
          })
        : undefined,
    });

    return { items: list, alreadySent: sent, provider: providerVal };
  }, [contract, intake, t]);

  const okCount = items.filter((i) => i.ok).length;
  const complete = okCount === items.length;

  return (
    <ReadinessCard
      className={className}
      titleIcon={FileSignature}
      title={t('contractReadiness.title', { defaultValue: 'Prontidão do contrato' })}
      items={items}
      score={okCount}
      maxScore={items.length}
      statusLabel={
        complete
          ? t('contractReadiness.statusReady', { defaultValue: 'Pronto para envio' })
          : alreadySent
          ? t('contractReadiness.statusSent', { defaultValue: 'Enviado — aguarda assinatura' })
          : t('contractReadiness.statusPending', { defaultValue: 'Em preparação' })
      }
      statusTone={complete ? 'success' : alreadySent ? 'warning' : 'muted'}
      alert={
        alreadySent
          ? {
              tone: 'warning',
              title: t('contractReadiness.providerLockTitle', {
                defaultValue: 'Prestador bloqueado para troca silenciosa',
              }),
              body: t('contractReadiness.providerLockBody', {
                defaultValue:
                  'O contrato foi enviado para assinatura. Para mudar de prestador é obrigatório cancelar o envio actual antes de selecionar outro.',
              }),
            }
          : null
      }
      hint={t('contractReadiness.notReadyHint', {
        defaultValue:
          'Resolva os itens em falta para libertar o envio para assinatura. Esta verificação é apenas informativa.',
      })}
    />
  );
}

export default ContractReadinessChecklist;
