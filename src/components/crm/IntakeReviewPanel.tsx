/**
 * Intake Review Panel — Staff component for reviewing submitted intake data.
 * Shows customer-submitted data, missing docs, action buttons,
 * and the "Enviar para Assinatura" action when approved.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CheckCircle2, AlertTriangle, XCircle, Building2,
  User, Mail, Phone, Globe, CreditCard, Clock, Shield,
  ClipboardCheck, RotateCcw, Loader2, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ContractIntake, useTransitionIntakeStatus, useIntakeEvents } from '@/hooks/useContractIntakes';
import { INTAKE_STATE_LABELS, type IntakeState, REVIEWABLE_STATES } from '@/constants/intakeStates';
import { formatRelativeTime } from '@/lib/dateUtils';
import { notify } from "@/lib/notify";
import { invokeWithAuth } from '@/lib/invokeWithAuth';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);


interface IntakeReviewPanelProps {
  intake: ContractIntake;
  onClose?: () => void;
}

const SIGNATURE_PROVIDERS = [
  { value: 'docusign', label: 'DocuSign' },
  { value: 'pandadoc', label: 'PandaDoc' },
  { value: 'manual', label: 'Manual' },
] as const;

export function IntakeReviewPanel({ intake, onClose }: IntakeReviewPanelProps) {
  const [actionNotes, setActionNotes] = useState('');
  const [showNotes, setShowNotes] = useState<'approve' | 'changes' | 'cancel' | null>(null);
  const [sendingSignature, setSendingSignature] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const transition = useTransitionIntakeStatus();
  const { data: events } = useIntakeEvents(intake.id);

  const canReview = REVIEWABLE_STATES.includes(intake.status as IntakeState);
  const isApproved = intake.status === 'approved_for_signature';
  const isSigned = intake.status === 'signed';
  const isSignatureSent = intake.status === 'signature_sent';

  const handleTransition = async (newStatus: IntakeState) => {
    try {
      await transition.mutateAsync({
        intakeId: intake.id,
        newStatus,
        notes: actionNotes,
      });
      notify.success(`Estado atualizado para: ${INTAKE_STATE_LABELS[newStatus]}`);
      setShowNotes(null);
      setActionNotes('');
    } catch (err: any) {
      notify.error(err?.message || 'Erro ao atualizar estado');
    }
  };

  /** Send to signature — staff-authenticated action via edge function */
  const handleSendToSignature = async () => {
    if (!intake.contract_id) {
      notify.error(t('crm.nenhumContratoAssociadoAEste'));
      return;
    }
    if (!selectedProvider) {
      notify.error(t('crm.selecioneUmProviderDeAssinatura'));
      return;
    }
    setSendingSignature(true);
    try {
      const snapshot = intake.approved_data_snapshot || {};
      const { data, error } = await invokeWithAuth('public-contract-onboarding', {
        body: {
          action: 'staff_submit_signing',
          contractId: intake.contract_id,
          signatureProvider: selectedProvider,
          signerEmail: (snapshot as any).legal_representative_email || intake.legal_representative_email,
          signerName: (snapshot as any).legal_representative_name || intake.legal_representative_name,
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      // NOTE: Do NOT transition intake here — the edge function already
      // performed syncIntakeOnSent server-side. A duplicate client-side
      // transition would cause a false-failure or double audit event.

      notify.success(t('crm.contratoEnviadoParaAssinatura'));
    } catch (err: any) {
      notify.error(err?.message || 'Erro ao enviar para assinatura');
    } finally {
      setSendingSignature(false);
    }
  };

  const statusColor: Record<string, string> = {
    intake_requested: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]',
    intake_in_progress: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]',
    intake_submitted: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]',
    review_pending: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]',
    changes_requested: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]',
    approved_for_signature: 'bg-lime-100 text-lime-800',
    signature_sent: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]',
    signed: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]',
    activated: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]',
    cancelled: 'bg-destructive/10 text-destructive',
  };

  const missingDocs = intake.missing_documents || [];

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Revisão de Intake
          </CardTitle>
          <Badge className={cn('text-xs', statusColor[intake.status] || 'bg-muted')}>
            {INTAKE_STATE_LABELS[intake.status as IntakeState] || intake.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Customer Data Summary */}
        <div className="space-y-2 text-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('intake.submittedData', 'Dados Submetidos')}</p>
          <div className="grid gap-1.5">
            <DataRow icon={Building2} label="Organização" value={intake.organization_name} />
            <DataRow icon={CreditCard} label="NIF" value={intake.company_nif} />
            <DataRow icon={User} label="Representante" value={intake.legal_representative_name} />
            <DataRow icon={Mail} label="Email" value={intake.legal_representative_email} />
            <DataRow icon={Phone} label="Telefone" value={intake.legal_representative_phone} />
            <DataRow icon={Mail} label="Email Faturação" value={intake.billing_email} />
            <DataRow icon={Globe} label="Website" value={intake.website} />
            {intake.company_address && (
              <DataRow icon={Building2} label="Morada" value={`${intake.company_address}, ${intake.company_city || ''} ${intake.company_postal_code || ''}`} />
            )}
            {intake.iban && <DataRow icon={CreditCard} label="IBAN" value={intake.iban} />}
          </div>
        </div>

        {/* Missing Documents Warning */}
        {missingDocs.length > 0 && (
          <div className="rounded-md border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/10 p-3">
            <p className="text-xs font-semibold text-[hsl(var(--warning))] flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Documentos em Falta ({missingDocs.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {missingDocs.map(doc => (
                <Badge key={doc} variant="outline" className="text-[10px] border-[hsl(var(--warning))]/30">
                  {doc.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Changes Requested Notes */}
        {intake.changes_requested_notes && intake.status === 'changes_requested' && (
          <div className="rounded-md border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/10 p-3">
            <p className="text-xs font-semibold text-[hsl(var(--warning))] mb-1">{t('intake.changesRequested', 'Correções Pedidas')}</p>
            <p className="text-xs text-[hsl(var(--warning))]">{intake.changes_requested_notes}</p>
          </div>
        )}

        {/* Timestamps */}
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          {intake.submitted_at && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Submetido: {formatRelativeTime(intake.submitted_at)}
            </span>
          )}
          {intake.reviewed_at && (
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Revisto: {formatRelativeTime(intake.reviewed_at)}
            </span>
          )}
        </div>

        <Separator />

        {/* Review Action Buttons */}
        {canReview && (
          <div className="space-y-2">
            {showNotes ? (
              <div className="space-y-2">
                <Textarea
                  placeholder={
                    showNotes === 'approve' ? 'Notas de aprovação (opcional)...' :
                    showNotes === 'changes' ? 'Descreva as correções necessárias...' :
                    'Motivo do cancelamento...'
                  }
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  {showNotes === 'approve' && (
                    <Button
                      size="sm"
                      className="gap-1.5 bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]"
                      onClick={() => handleTransition('approved_for_signature')}
                      disabled={transition.isPending} loading={transition.isPending}
                    >
                      {transition.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Confirmar Aprovação
                    </Button>
                  )}
                  {showNotes === 'changes' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/10"
                      onClick={() => handleTransition('changes_requested')}
                      disabled={transition.isPending || !actionNotes.trim()} loading={transition.isPending}
                    >
                      {transition.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                      Confirmar Pedido
                    </Button>
                  )}
                  {showNotes === 'cancel' && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1.5"
                      onClick={() => handleTransition('cancelled')}
                      disabled={transition.isPending} loading={transition.isPending}
                    >
                      {transition.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                      Confirmar Cancelamento
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { setShowNotes(null); setActionNotes(''); }}>
                    Voltar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]"
                  onClick={() => setShowNotes('approve')}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Aprovar para Assinatura
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/10"
                  onClick={() => setShowNotes('changes')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Pedir Correções
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-destructive hover:bg-destructive/10"
                  onClick={() => setShowNotes('cancel')}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── APPROVED: Send to Signature CTA ── */}
        {isApproved && (
          <div className="space-y-3">
            {intake.approved_data_snapshot && (
              <div className="rounded-md border border-lime-200 bg-lime-50 dark:bg-lime-900/20 p-3">
                <p className="text-xs font-semibold text-lime-800 dark:text-lime-200 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Dados Congelados para Contrato
                </p>
                <p className="text-[10px] text-lime-700 dark:text-lime-300 mt-1">
                  Snapshot criado em {intake.approved_data_snapshot.frozen_at ? new Date(intake.approved_data_snapshot.frozen_at as string).toLocaleString('pt-PT') : '—'}
                </p>
              </div>
            )}

            {/* Provider selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('intake.signatureProvider', 'Provider de Assinatura')}</label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecionar provider..." />
                </SelectTrigger>
                <SelectContent>
                  {SIGNATURE_PROVIDERS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full gap-2"
              onClick={handleSendToSignature}
              disabled={sendingSignature || !selectedProvider} loading={sendingSignature}
            >
              {sendingSignature ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar para Assinatura
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              O contrato será enviado para assinatura digital via {selectedProvider ? SIGNATURE_PROVIDERS.find(p => p.value === selectedProvider)?.label : '—'}.
            </p>
          </div>
        )}

        {/* Signature sent info */}
        {isSignatureSent && (
          <div className="rounded-md border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 p-3">
            <p className="text-xs font-semibold text-[hsl(var(--success))] flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5" />
              Contrato Enviado para Assinatura
            </p>
            <p className="text-[10px] text-[hsl(var(--success))] mt-1">
              A aguardar assinatura do cliente. Verifique o estado no provider de assinatura.
            </p>
          </div>
        )}

        {/* Signed info */}
        {isSigned && (
          <div className="rounded-md border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 p-3">
            <p className="text-xs font-semibold text-[hsl(var(--success))] flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Contrato Assinado
            </p>
            <p className="text-[10px] text-[hsl(var(--success))] mt-1">
              Pendente de ativação do workspace e condições operacionais.
            </p>
          </div>
        )}

        {/* Audit Trail */}
        {events && events.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('intake.history', 'Histórico')}</p>
            <ScrollArea  viewportClassName="max-h-32">
              <div className="space-y-1">
                {events.map(ev => (
                  <div key={ev.id} className="flex items-start gap-2 text-[10px] text-muted-foreground py-0.5">
                    <Clock className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>
                      <span className="font-medium">{ev.event_type.replace(/_/g, ' ')}</span>
                      {ev.from_status && ev.to_status && (
                        <span className="ml-1">({ev.from_status} → {ev.to_status})</span>
                      )}
                      <span className="ml-1">{formatRelativeTime(ev.created_at)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DataRow({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-muted-foreground text-[10px]">{label}: </span>
        <span className="text-xs">{value}</span>
      </div>
    </div>
  );
}
