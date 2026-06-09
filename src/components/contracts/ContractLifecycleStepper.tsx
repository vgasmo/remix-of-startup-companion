/**
 * ContractLifecycleStepper — Full canonical lifecycle stepper
 * Phase A: Intake pipeline (from contract_intakes)
 * Phase B: Contract pipeline (from startup_contracts)
 * Terminal states shown as badges, not steps.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, Circle, XCircle, Clock, ArrowRight, Undo2, Info, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface LifecycleEvent {
  id: string;
  contract_id: string;
  event_type: string;
  event_date: string;
  details: { from_status?: string; to_status?: string } | null;
  performed_by: string | null;
  created_at: string;
}

interface IntakeRecord {
  id: string;
  contract_id: string | null;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Phase A: Intake states
const INTAKE_STATES = [
  'draft_internal',
  'intake_requested',
  'intake_in_progress',
  'intake_submitted',
  'review_pending',
  'approved_for_signature',
] as const;

// Phase B: Contract states
const CONTRACT_STATES = [
  'signature_sent',
  'signed',
  'activated',
] as const;

// Terminal states (shown as badges)
const TERMINAL_STATES = ['cancelled', 'terminated', 'suspended', 'expired', 'rejected'] as const;

// Map intake_status enum to our canonical stepper positions
const INTAKE_STATUS_MAP: Record<string, string> = {
  draft_internal: 'draft_internal',
  intake_requested: 'intake_requested',
  intake_in_progress: 'intake_in_progress',
  intake_submitted: 'intake_submitted',
  review_pending: 'review_pending',
  changes_requested: 'intake_in_progress', // loops back
  approved_for_signature: 'approved_for_signature',
  signature_sent: 'signature_sent',
  signed: 'signed',
  activated: 'activated',
};

// Map startup_contracts.status to Phase B position
const CONTRACT_STATUS_MAP: Record<string, string> = {
  draft: 'draft_internal', // maps to Phase A start if no intake
  pending_signature: 'signature_sent',
  active: 'activated',
};

// Build a unified order for all states
const ALL_STEPS = [...INTAKE_STATES, ...CONTRACT_STATES];
const STEP_ORDER: Record<string, number> = {};
ALL_STEPS.forEach((s, i) => { STEP_ORDER[s] = i; });

export interface ContractLifecycleStepperProps {
  contractId: string;
  currentStatus: string;
  workspaceId?: string;
  startDate?: string;
  signedAt?: string | null;
  createdAt?: string;
}

export function ContractLifecycleStepper({
  contractId,
  currentStatus,
  workspaceId,
  startDate,
  signedAt,
  createdAt,
}: ContractLifecycleStepperProps) {
  const { t } = useTranslation();
  const [historyOpen, setHistoryOpen] = useState(false);

  // Fetch lifecycle events
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['contract-lifecycle-events', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_lifecycle_events')
        .select('*')
        .eq('contract_id', contractId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as LifecycleEvent[];
    },
    enabled: !!contractId,
  });

  // Fetch linked intake
  const { data: intake, isLoading: intakeLoading } = useQuery({
    queryKey: ['contract-intake-for-stepper', contractId, workspaceId],
    queryFn: async () => {
      // Try by contract_id first, then by workspace_id
      let query = supabase
        .from('contract_intakes')
        .select('id, contract_id, status, submitted_at, reviewed_at, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(1);

      if (contractId) {
        const { data } = await query.eq('contract_id', contractId);
        if (data && data.length > 0) return data[0] as IntakeRecord;
      }

      if (workspaceId) {
        // Fallback: find intake via workspace contracts
        const { data: contracts } = await supabase
          .from('startup_contracts')
          .select('id')
          .eq('workspace_id', workspaceId);
        
        if (contracts && contracts.length > 0) {
          const contractIds = contracts.map(c => c.id);
          const { data } = await supabase
            .from('contract_intakes')
            .select('id, contract_id, status, submitted_at, reviewed_at, created_at, updated_at')
            .in('contract_id', contractIds)
            .order('created_at', { ascending: false })
            .limit(1);
          if (data && data.length > 0) return data[0] as IntakeRecord;
        }
      }

      return null;
    },
    enabled: !!contractId || !!workspaceId,
  });

  const isLoading = eventsLoading || intakeLoading;
  if (isLoading) return <Skeleton className="h-28 w-full" />;

  const hasIntake = !!intake;
  const intakeHadChangesRequested = intake?.status === 'changes_requested' || 
    events?.some(e => e.details?.to_status === 'changes_requested');

  // Determine current position in the unified pipeline
  let currentStep: string;
  const isTerminal = (TERMINAL_STATES as readonly string[]).includes(currentStatus) ||
    (intake && (TERMINAL_STATES as readonly string[]).includes(intake.status));

  if (hasIntake) {
    // If intake exists, use its status for Phase A, contract status for Phase B
    const intakeStep = INTAKE_STATUS_MAP[intake.status];
    const contractStep = CONTRACT_STATUS_MAP[currentStatus];
    // Use whichever is further along
    const intakeOrder = STEP_ORDER[intakeStep] ?? -1;
    const contractOrder = STEP_ORDER[contractStep] ?? -1;
    currentStep = contractOrder >= intakeOrder ? (contractStep || intakeStep) : intakeStep;
  } else {
    // No intake — use contract status mapped to Phase B
    currentStep = CONTRACT_STATUS_MAP[currentStatus] || currentStatus;
  }

  const currentOrder = STEP_ORDER[currentStep] ?? -1;

  // Build timestamps
  const timestamps: Record<string, string> = {};
  if (createdAt) timestamps['draft_internal'] = createdAt;
  if (intake?.created_at) timestamps['draft_internal'] = intake.created_at;
  if (intake?.submitted_at) timestamps['intake_submitted'] = intake.submitted_at;
  if (intake?.reviewed_at) timestamps['review_pending'] = intake.reviewed_at;
  if (signedAt) timestamps['signed'] = signedAt;
  if (startDate) timestamps['activated'] = startDate;

  events?.forEach(event => {
    if (event.event_type === 'status_change' && event.details?.to_status) {
      const mapped = INTAKE_STATUS_MAP[event.details.to_status] || CONTRACT_STATUS_MAP[event.details.to_status] || event.details.to_status;
      if (STEP_ORDER[mapped] !== undefined) {
        timestamps[mapped] = event.created_at || event.event_date;
      }
    }
  });

  // Terminal status label
  const terminalStatus = isTerminal
    ? (TERMINAL_STATES as readonly string[]).includes(currentStatus)
      ? currentStatus
      : intake?.status
    : null;

  // Build merged event history
  const mergedHistory: Array<{ date: string; from?: string; to: string; source: 'contract' | 'intake' }> = [];

  events?.forEach(event => {
    if (event.details?.to_status) {
      mergedHistory.push({
        date: event.created_at,
        from: event.details.from_status,
        to: event.details.to_status,
        source: 'contract',
      });
    }
  });

  // Synthetic intake events
  if (intake) {
    if (intake.created_at) mergedHistory.push({ date: intake.created_at, to: 'draft_internal', source: 'intake' });
    if (intake.submitted_at) mergedHistory.push({ date: intake.submitted_at, to: 'intake_submitted', source: 'intake' });
    if (intake.reviewed_at) mergedHistory.push({ date: intake.reviewed_at, to: intake.status === 'changes_requested' ? 'changes_requested' : 'review_pending', source: 'intake' });
  }

  mergedHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Render a step indicator
  const renderStep = (state: string, idx: number, stepsArray: readonly string[], showConnector: boolean) => {
    const order = STEP_ORDER[state];
    const isPast = order < currentOrder && !isTerminal;
    const isCurrent = state === currentStep && !isTerminal;
    const isFuture = order > currentOrder || isTerminal;
    const timestamp = timestamps[state];

    return (
      <div key={state} className="flex items-center flex-1 min-w-0">
        <div className="flex flex-col items-center gap-0.5 min-w-0 flex-1">
          <div
            className={cn(
              'h-7 w-7 rounded-full flex items-center justify-center border-2 transition-all duration-150',
              isPast && 'bg-primary border-primary text-primary-foreground',
              isCurrent && 'bg-primary/10 border-primary text-primary ring-2 ring-primary/20',
              isFuture && 'bg-muted border-muted-foreground/20 text-muted-foreground',
            )}
          >
            {isPast ? <Check className="h-3.5 w-3.5" /> : isCurrent ? <Circle className="h-2.5 w-2.5 fill-primary" /> : <Circle className="h-2.5 w-2.5" />}
          </div>
          <span
            className={cn(
              'text-[9px] font-medium text-center leading-tight max-w-[70px] px-0.5',
              isCurrent && 'text-primary font-semibold',
              isFuture && 'text-muted-foreground',
              isPast && 'text-foreground',
            )}
          >
            {t(`lifecycle.stepper.${state}`, { defaultValue: state })}
          </span>
          {timestamp && (
            <span className="text-[8px] text-muted-foreground">
              {format(new Date(timestamp), 'dd/MM/yy')}
            </span>
          )}
        </div>
        {showConnector && (
          <div className={cn(
            'h-0.5 w-4 shrink-0 -mx-0.5',
            order < currentOrder && !isTerminal ? 'bg-primary' : 'bg-muted-foreground/20',
          )} />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Phase A: Intake */}
      {hasIntake ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('lifecycle.stepper.phaseIntake', { defaultValue: 'Intake' })}
            </span>
            {intakeHadChangesRequested && (
              <Badge variant="outline" className="text-[8px] h-4 px-1 gap-0.5">
                <Undo2 className="h-2.5 w-2.5" />
                {t('lifecycle.stepper.changesRequested', { defaultValue: 'Correções solicitadas' })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-0">
            {INTAKE_STATES.map((state, idx) =>
              renderStep(state, idx, INTAKE_STATES, idx < INTAKE_STATES.length - 1)
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/50 rounded-md px-2.5 py-1.5">
          <Info className="h-3 w-3 shrink-0" />
          {t('lifecycle.stepper.noIntake', { defaultValue: 'Contrato sem processo de intake registado' })}
        </div>
      )}

      {/* Separator */}
      {hasIntake && (
        <div className="flex items-center gap-2 px-1">
          <div className="h-px flex-1 bg-border" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      {/* Phase B: Contract */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('lifecycle.stepper.phaseContract', { defaultValue: 'Contrato' })}
        </span>
        <div className="flex items-center gap-0">
          {CONTRACT_STATES.map((state, idx) =>
            renderStep(state, idx, CONTRACT_STATES, idx < CONTRACT_STATES.length - 1)
          )}
        </div>
      </div>

      {/* Terminal state indicator */}
      {isTerminal && terminalStatus && (
        <div className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-xs',
          terminalStatus === 'terminated' || terminalStatus === 'rejected' || terminalStatus === 'cancelled'
            ? 'bg-destructive/10 text-destructive'
            : terminalStatus === 'suspended'
              ? 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]'
              : 'bg-muted text-muted-foreground',
        )}>
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">
            {t(`lifecycle.stepper.${terminalStatus}`, { defaultValue: terminalStatus })}
          </span>
          {timestamps[terminalStatus] && (
            <span className="ml-auto opacity-70">
              {format(new Date(timestamps[terminalStatus]), 'dd/MM/yyyy')}
            </span>
          )}
        </div>
      )}

      {/* Merged Event History */}
      {mergedHistory.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="flex items-center gap-1 cursor-pointer hover:text-foreground text-[11px] transition-colors"
          >
            <ChevronDown className={cn('h-3 w-3 transition-transform', historyOpen && 'rotate-180')} />
            {t('lifecycle.stepper.eventHistory', { defaultValue: 'Histórico de eventos' })} ({mergedHistory.length})
          </button>
          {historyOpen && (
            <div className="mt-2 space-y-1 pl-2 border-l-2 border-muted ml-1 animate-fade-in">
              {mergedHistory.map((event, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>{format(new Date(event.date), 'dd/MM/yy HH:mm')}</span>
                  {event.from && (
                    <span className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[9px] h-4 px-1">
                        {t(`lifecycle.stepper.${event.from}`, { defaultValue: event.from })}
                      </Badge>
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  )}
                  <Badge variant="outline" className={cn('text-[9px] h-4 px-1', event.source === 'intake' && 'border-primary/30')}>
                    {t(`lifecycle.stepper.${event.to}`, { defaultValue: event.to })}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
