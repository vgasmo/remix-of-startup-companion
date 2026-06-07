/**
 * Hook for managing contract intake lifecycle.
 * Provides CRUD, status transitions with validation, audit trail,
 * and data snapshot on approval for the two-phase onboarding flow.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthContext';
import {
  type IntakeState,
  isValidIntakeTransition,
  INTAKE_TO_CRM_STAGE,
  CUSTOMER_EDITABLE_STATES,
} from '@/constants/intakeStates';

export type { IntakeState };

export interface ContractIntake {
  id: string;
  funnel_item_id: string | null;
  contract_id: string | null;
  status: IntakeState;
  organization_name: string | null;
  company_nif: string | null;
  company_address: string | null;
  company_city: string | null;
  company_postal_code: string | null;
  company_country: string | null;
  iban: string | null;
  legal_representative_name: string | null;
  legal_representative_email: string | null;
  legal_representative_phone: string | null;
  billing_email: string | null;
  startup_description: string | null;
  website: string | null;
  documents_json: Record<string, any> | null;
  missing_documents: string[] | null;
  intake_token_expires_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  changes_requested_notes: string | null;
  approved_data_snapshot: Record<string, any> | null;
  last_reminder_sent_at: string | null;
  reminder_count: number;
  created_by: string | null;
  assigned_to: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntakeEvent {
  id: string;
  intake_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  performed_by: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

/** Fetch all intakes with optional status filter */
export function useContractIntakes(statusFilter?: IntakeState | IntakeState[]) {
  return useQuery({
    queryKey: ['contract-intakes', statusFilter],
    queryFn: async (): Promise<ContractIntake[]> => {
      let query = supabase
        .from('contract_intakes')
        .select('*')
        .order('updated_at', { ascending: false });

      if (statusFilter) {
        if (Array.isArray(statusFilter)) {
          query = query.in('status', statusFilter);
        } else {
          query = query.eq('status', statusFilter);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ContractIntake[];
    },
  });
}

/** Fetch single intake by ID */
export function useContractIntake(intakeId: string | undefined) {
  return useQuery({
    queryKey: ['contract-intake', intakeId],
    enabled: !!intakeId,
    queryFn: async (): Promise<ContractIntake | null> => {
      const { data, error } = await supabase
        .from('contract_intakes')
        .select('*')
        .eq('id', intakeId!)
        .maybeSingle();
      if (error) throw error;
      return data as ContractIntake | null;
    },
  });
}

/** Fetch intake by funnel item ID */
export function useIntakeByFunnelItem(funnelItemId: string | undefined) {
  return useQuery({
    queryKey: ['contract-intake-by-funnel', funnelItemId],
    enabled: !!funnelItemId,
    queryFn: async (): Promise<ContractIntake | null> => {
      const { data, error } = await supabase
        .from('contract_intakes')
        .select('*')
        .eq('funnel_item_id', funnelItemId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ContractIntake | null;
    },
  });
}

/** Fetch intake events (audit trail) */
export function useIntakeEvents(intakeId: string | undefined) {
  return useQuery({
    queryKey: ['intake-events', intakeId],
    enabled: !!intakeId,
    queryFn: async (): Promise<IntakeEvent[]> => {
      const { data, error } = await supabase
        .from('intake_events')
        .select('*')
        .eq('intake_id', intakeId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as IntakeEvent[];
    },
  });
}

/** Create a new intake request from CRM + send real email */
export function useCreateIntake() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      funnelItemId: string;
      organizationName: string;
      contactEmail: string;
      contactName: string;
      assignedTo?: string;
    }) => {
      const tokenArr = new Uint8Array(32);
      crypto.getRandomValues(tokenArr);
      const token = Array.from(tokenArr, b => b.toString(16).padStart(2, '0')).join('');
      // Hash the token before storing (plaintext never persisted)
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const tokenHash = Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('contract_intakes')
        .insert({
          funnel_item_id: params.funnelItemId,
          status: 'intake_requested',
          organization_name: params.organizationName,
          legal_representative_email: params.contactEmail,
          legal_representative_name: params.contactName,
          intake_token_hash: tokenHash,
          intake_token_expires_at: expiresAt.toISOString(),
          created_by: user?.id,
          assigned_to: params.assignedTo || user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Move CRM stage
      await supabase.from('funnel_items')
        .update({ stage: 'intake_requested' })
        .eq('id', params.funnelItemId);

      // Audit trail
      await supabase.from('intake_events').insert({
        intake_id: data.id,
        event_type: 'intake_created',
        to_status: 'intake_requested',
        performed_by: user?.id,
        metadata: {
          funnel_item_id: params.funnelItemId,
          organization_name: params.organizationName,
        },
      });

      const publicUrl = `${window.location.origin}/contract-intake/${token}`;

      // Send real email to the lead
      let emailSent = false;
      let emailError: string | null = null;
      if (params.contactEmail) {
        try {
          const { error: emailErr } = await supabase.functions.invoke('send-intake-email', {
            body: {
              type: 'intake_request',
              intakeId: data.id,
              recipientEmail: params.contactEmail,
              recipientName: params.contactName,
              organizationName: params.organizationName,
              intakeToken: token,
            },
          });
          if (emailErr) {
            emailError = typeof emailErr === 'string' ? emailErr : 'Erro ao enviar email';
            logger.warn('intake_email_send_failed', { error: String(emailErr) });
          } else {
            emailSent = true;
          }
        } catch (err: any) {
          emailError = err?.message || 'Erro ao enviar email';
          logger.warn('intake_email_send_error', { error: err?.message });
        }
      }

      return { intake: data, token, publicUrl, emailSent, emailError };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-intakes'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-items'] });
      queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
    },
    onError: (err: any) => {
      notify.error(err?.message || 'Erro ao criar pedido de contratação');
    },
  });
}

/** Transition intake status with validation and audit trail */
export function useTransitionIntakeStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      intakeId: string;
      newStatus: IntakeState;
      notes?: string;
      metadata?: Record<string, any>;
    }) => {
      // Get current status
      const { data: current, error: fetchErr } = await supabase
        .from('contract_intakes')
        .select('status, funnel_item_id, organization_name, company_nif, company_address, company_city, company_postal_code, iban, legal_representative_name, legal_representative_email, legal_representative_phone, billing_email, startup_description, website, documents_json, missing_documents, submitted_at')
        .eq('id', params.intakeId)
        .single();
      if (fetchErr) throw fetchErr;

      const currentStatus = current.status as IntakeState;

      // Validate transition
      if (!isValidIntakeTransition(currentStatus, params.newStatus)) {
        throw new Error(`Transição inválida: ${currentStatus} → ${params.newStatus}`);
      }

      const updateFields: Record<string, any> = {
        status: params.newStatus,
      };

      // Status-specific field updates
      if (params.newStatus === 'intake_submitted') {
        updateFields.submitted_at = new Date().toISOString();
      }
      if (params.newStatus === 'review_pending') {
        updateFields.submitted_at = updateFields.submitted_at || current.submitted_at || new Date().toISOString();
      }
      if (params.newStatus === 'approved_for_signature') {
        updateFields.reviewed_by = user?.id;
        updateFields.reviewed_at = new Date().toISOString();
        updateFields.review_notes = params.notes || null;
        // Freeze data snapshot
        updateFields.approved_data_snapshot = {
          organization_name: current.organization_name,
          company_nif: current.company_nif,
          company_address: current.company_address,
          company_city: current.company_city,
          company_postal_code: current.company_postal_code,
          iban: current.iban,
          legal_representative_name: current.legal_representative_name,
          legal_representative_email: current.legal_representative_email,
          legal_representative_phone: current.legal_representative_phone,
          billing_email: current.billing_email,
          startup_description: current.startup_description,
          website: current.website,
          documents_json: current.documents_json,
          missing_documents: current.missing_documents,
          frozen_at: new Date().toISOString(),
          frozen_by: user?.id,
        };

        // CANONICAL INVARIANT: A semantically complete contract MUST exist before
        // approving for signature. We do NOT auto-create skeletal contracts.
        const { data: intakeFull } = await supabase
          .from('contract_intakes')
          .select('contract_id, funnel_item_id, organization_name')
          .eq('id', params.intakeId)
          .single();

        if (!intakeFull?.contract_id) {
          // Block: no contract linked — staff must create one with complete commercial truth first
          throw new Error(
            'Não é possível aprovar para assinatura: nenhum contrato associado. ' +
            'Crie um contrato com modalidade, edifício e condições comerciais definidas antes de aprovar.'
          );
        }

        // Verify the linked contract is semantically complete (has incubation type + pricing)
        const { data: linkedContract } = await supabase
          .from('startup_contracts')
          .select('id, incubation_type_id, monthly_fee, status')
          .eq('id', intakeFull.contract_id)
          .single();

        if (!linkedContract?.incubation_type_id) {
          throw new Error(
            'Contrato incompleto: a modalidade de incubação não está definida. ' +
            'Complete os dados comerciais do contrato antes de aprovar para assinatura.'
          );
        }
      }
      if (params.newStatus === 'changes_requested') {
        updateFields.changes_requested_notes = params.notes || null;
        // Reset reminder count so intake reminders restart for corrections
        updateFields.reminder_count = 0;
        updateFields.last_reminder_sent_at = null;
      }

      const { error } = await supabase
        .from('contract_intakes')
        .update(updateFields)
        .eq('id', params.intakeId);
      if (error) throw error;

      // Sync CRM stage if funnel item is linked
      if (current.funnel_item_id) {
        const crmStage = INTAKE_TO_CRM_STAGE[params.newStatus];
        if (crmStage) {
          await supabase.from('funnel_items')
            .update({ stage: crmStage })
            .eq('id', current.funnel_item_id);
        }
      }

      // Audit trail
      await supabase.from('intake_events').insert({
        intake_id: params.intakeId,
        event_type: `status_changed_to_${params.newStatus}`,
        from_status: currentStatus,
        to_status: params.newStatus,
        performed_by: user?.id,
        metadata: { notes: params.notes, ...params.metadata },
      });

      // Send changes_requested email automatically
      if (params.newStatus === 'changes_requested') {
        // Fetch intake token for the email link
        const { data: intakeData } = await supabase
          .from('contract_intakes')
          .select('legal_representative_email, legal_representative_name, organization_name')
          .eq('id', params.intakeId)
          .single();

        if (intakeData?.legal_representative_email) {
          try {
            // Rotate token so the email link is fresh and the DB only stores the hash
            const { data: freshToken } = await supabase.rpc('staff_rotate_intake_token', { p_intake_id: params.intakeId });
            if (freshToken) {
              await supabase.functions.invoke('send-intake-email', {
                body: {
                  type: 'changes_requested',
                  intakeId: params.intakeId,
                  recipientEmail: intakeData.legal_representative_email,
                  recipientName: intakeData.legal_representative_name,
                  organizationName: intakeData.organization_name,
                  intakeToken: freshToken,
                  changesNotes: params.notes,
                },
              });
            }
          } catch (emailErr) {
            logger.warn('changes_requested_email_failed', { error: String(emailErr) });
          }
        }
      }
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['contract-intakes'] });
      queryClient.invalidateQueries({ queryKey: ['contract-intake'] });
      queryClient.invalidateQueries({ queryKey: ['contract-intake-by-funnel'] });
      queryClient.invalidateQueries({ queryKey: ['intake-events'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-items'] });
      queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });

      // Notify backoffice when intake is submitted for review
      if (params.newStatus === 'intake_submitted' || params.newStatus === 'review_pending') {
        supabase.from('activity_log').insert({
          user_id: user?.id || '00000000-0000-0000-0000-000000000000',
          entity_type: 'intake',
          entity_id: params.intakeId,
          action: 'intake_submitted_for_review',
          metadata: { status: params.newStatus },
        }).then(() => {});
      }
    },
  });
}
