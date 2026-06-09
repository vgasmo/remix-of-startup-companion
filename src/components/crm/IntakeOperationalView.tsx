/**
 * Intake Operational View — Backoffice/Consultant dashboard for intake pipeline.
 * Shows grouped intakes by state with empty states and next-action guidance.
 */
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Clock, AlertTriangle, CheckCircle2, FileText, ArrowRight,
  Mail, User, Building2, ClipboardCheck, Send, Eye,
  RotateCcw, Shield, Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useContractIntakes, type ContractIntake } from '@/hooks/useContractIntakes';
import { BACKOFFICE_VIEW_GROUPS, INTAKE_STATE_LABELS, type IntakeState } from '@/constants/intakeStates';
import { formatRelativeTime } from '@/lib/dateUtils';
import { differenceInDays } from 'date-fns';

interface IntakeOperationalViewProps {
  onSelectIntake?: (intake: ContractIntake) => void;
}

const GROUP_CONFIG = {
  awaiting_fill: {
    title: 'A Aguardar Preenchimento',
    icon: Mail,
    emptyText: 'Nenhum pedido a aguardar preenchimento do cliente.',
    emptyAction: 'Novos pedidos enviados aos clientes aparecerão aqui.',
    color: 'text-[hsl(var(--info))] ',
  },
  submitted_for_review: {
    title: 'Submetidos para Revisão',
    icon: ClipboardCheck,
    emptyText: 'Nenhuma submissão pendente de revisão.',
    emptyAction: 'Quando um cliente submeter os dados, aparecerá aqui para revisão.',
    color: 'text-[hsl(var(--success))] ',
  },
  changes_requested: {
    title: 'Correções Pedidas',
    icon: RotateCcw,
    emptyText: 'Nenhum intake a aguardar correções.',
    emptyAction: 'Intakes devolvidos ao cliente para correção aparecerão aqui.',
    color: 'text-[hsl(var(--warning))]',
  },
  ready_for_signature: {
    title: 'Aprovados p/ Assinatura',
    icon: CheckCircle2,
    emptyText: 'Nenhum intake aprovado a aguardar envio para assinatura.',
    emptyAction: 'Após aprovação, envie o contrato para assinatura digital.',
    color: 'text-primary',
  },
  sent_for_signature: {
    title: 'Enviados p/ Assinatura',
    icon: Send,
    emptyText: 'Nenhum contrato a aguardar assinatura.',
    emptyAction: 'Contratos enviados ao cliente para assinatura aparecerão aqui.',
    color: 'text-[hsl(var(--success))]',
  },
  signed_pending_activation: {
    title: 'Assinados — Pendentes de Ativação',
    icon: Shield,
    emptyText: 'Nenhum contrato assinado a aguardar ativação.',
    emptyAction: 'Após assinatura, ative o workspace e as condições operacionais.',
    color: 'text-[hsl(var(--success))] ',
  },
};

export function IntakeOperationalView({ onSelectIntake }: IntakeOperationalViewProps) {
  const { data: allIntakes, isLoading } = useContractIntakes();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-48 bg-muted/30 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const grouped: Record<string, ContractIntake[]> = {};
  Object.entries(BACKOFFICE_VIEW_GROUPS).forEach(([key, states]) => {
    grouped[key] = (allIntakes || []).filter(i => states.includes(i.status as IntakeState));
  });

  // Overdue detection
  const overdueIntakes = (allIntakes || []).filter(i => {
    if (!['intake_requested', 'intake_in_progress'].includes(i.status)) return false;
    const daysSince = differenceInDays(new Date(), new Date(i.created_at));
    return daysSince > 10;
  });

  return (
    <div className="space-y-4">
      {/* Overdue alert */}
      {overdueIntakes.length > 0 && (
        <Card className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/10">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[hsl(var(--warning))]">
                {overdueIntakes.length} pedido(s) sem resposta há mais de 10 dias
              </p>
              <p className="text-xs text-[hsl(var(--warning))]">
                Considere reenviar o email ou contactar diretamente o cliente.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grouped columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {Object.entries(GROUP_CONFIG).map(([key, config]) => {
          const intakes = grouped[key] || [];
          const Icon = config.icon;

          return (
            <Card key={key} className="flex flex-col">
              <CardHeader className="py-3 px-4">
                <CardTitle className={cn('text-sm font-semibold flex items-center justify-between', config.color)}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {config.title}
                  </span>
                  <Badge variant="secondary" className="text-xs">{intakes.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 pt-0 flex-1">
                <ScrollArea className="max-h-[300px]">
                  {intakes.length === 0 ? (
                    <div className="p-4 text-center space-y-1">
                      <Inbox className="h-6 w-6 mx-auto text-muted-foreground/40" />
                      <p className="text-xs text-muted-foreground">{config.emptyText}</p>
                      <p className="text-[10px] text-muted-foreground/70">{config.emptyAction}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {intakes.map(intake => (
                        <IntakeCard
                          key={intake.id}
                          intake={intake}
                          isOverdue={overdueIntakes.some(o => o.id === intake.id)}
                          onClick={() => onSelectIntake?.(intake)}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function IntakeCard({ intake, isOverdue, onClick }: { intake: ContractIntake; isOverdue: boolean; onClick: () => void }) {
  const missingCount = intake.missing_documents?.length || 0;

  return (
    <Card
      className={cn(
        'cursor-pointer hover:shadow-md transition-shadow',
        isOverdue && 'border-l-2 border-l-amber-500'
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {intake.organization_name || 'Sem nome'}
            </p>
            {intake.legal_representative_email && (
              <p className="text-[10px] text-muted-foreground truncate">
                {intake.legal_representative_email}
              </p>
            )}
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(intake.updated_at)}
          </span>
          {isOverdue && (
            <Badge variant="outline" className="text-[9px] h-4 border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]">
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
              Overdue
            </Badge>
          )}
          {missingCount > 0 && (
            <Badge variant="outline" className="text-[9px] h-4">
              {missingCount} doc(s) em falta
            </Badge>
          )}
          {intake.reminder_count > 0 && (
            <Badge variant="outline" className="text-[9px] h-4">
              {intake.reminder_count}x lembrado
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
