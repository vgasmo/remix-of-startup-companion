/**
 * PendingContractBanner — Shows when a founder has a contract awaiting signature.
 * Prominent CTA to open the contract onboarding wizard.
 */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileSignature, ArrowRight, Clock, CheckCircle2 } from 'lucide-react';

interface PendingContractBannerProps {
  workspaceId: string;
}

export function PendingContractBanner({ workspaceId }: PendingContractBannerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: contracts } = useQuery({
    queryKey: ['founder-pending-contracts', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('startup_contracts')
        .select('id, contract_number, status, signature_status, monthly_fee, start_date, incubation_type:incubation_types(name)')
        .eq('workspace_id', workspaceId)
        .in('signature_status', ['sent_for_signature', 'intake_requested'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (!contracts?.length) return null;

  return (
    <>
      {contracts.map((c) => {
        const sigStatus = (c as any).signature_status;
        const isSent = sigStatus === 'sent_for_signature';
        const isSigned = sigStatus === 'signed';

        return (
          <Card key={c.id} className="border-primary/30 bg-primary/5 rounded-2xl shadow-sm">
            <CardContent className="py-4 px-5">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary/10 shrink-0">
                  <FileSignature className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      {t('founder.pendingContract.title', { defaultValue: 'Contrato de Incubação Pendente' })}
                    </p>
                    <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                      {(c as any).incubation_type?.name || c.contract_number || 'Contrato'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isSent
                      ? t('founder.pendingContract.sentForSignature', { defaultValue: 'Enviado para assinatura digital. Verifique o seu email.' })
                      : isSigned
                        ? t('founder.pendingContract.signed', { defaultValue: 'Contrato assinado. A aguardar ativação pela equipa.' })
                        : t('founder.pendingContract.action', { defaultValue: 'Preencha os dados e assine digitalmente para iniciar a incubação.' })
                    }
                  </p>
                  {c.monthly_fee && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.monthly_fee}€/mês{c.start_date && !Number.isNaN(new Date(c.start_date).getTime()) ? ` • ${t('founder.pendingContract.startDate', { defaultValue: 'Início previsto:' })} ${new Date(c.start_date).toLocaleDateString(i18n.language || 'pt-PT')}` : ''}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {isSent ? (
                    <div className="flex items-center gap-1.5 text-xs text-warning">
                      <Clock className="h-4 w-4" />
                      {t('founder.pendingContract.awaitingSignature', { defaultValue: 'A aguardar assinatura' })}
                    </div>
                  ) : isSigned ? (
                    <div className="flex items-center gap-1.5 text-xs text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      {t('founder.pendingContract.signedStatus', { defaultValue: 'Assinado' })}
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/contract-onboarding/${c.id}`)}
                      className="gap-1.5"
                    >
                      {t('founder.pendingContract.cta', { defaultValue: 'Assinar Contrato' })}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
