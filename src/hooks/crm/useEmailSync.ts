/**
 * Hook for CRM email sync operations and status monitoring.
 * Manages Outlook email sync triggers and sync health visibility.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { notify } from "@/lib/notify";
import { useTranslation } from 'react-i18next';

export interface EmailSyncStatus {
  id: string;
  consultant_user_id: string;
  provider: string;
  mailbox_email: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  last_success_at: string | null;
  emails_processed: number;
  emails_logged: number;
  emails_unmatched: number;
  emails_ignored: number;
  sync_state: string;
}

export interface UnmatchedEmail {
  id: string;
  subject: string | null;
  preview: string | null;
  from_address: string | null;
  direction: string | null;
  occurred_at: string;
  matched_contact_email: string | null;
  matching_confidence: string | null;
  matching_method: string | null;
  consultant_user_id: string | null;
  participants_json: Record<string, unknown> | null;
  needs_review: boolean;
  ignored: boolean;
}

/** Fetch sync status for the current user or all consultants (staff) */
export function useEmailSyncStatus(allConsultants = false) {
  return useQuery({
    queryKey: ['email-sync-status', allConsultants],
    queryFn: async (): Promise<EmailSyncStatus[]> => {
      let query = supabase
        .from('email_sync_status')
        .select('*')
        .order('last_sync_at', { ascending: false });

      if (!allConsultants) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        query = query.eq('consultant_user_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as EmailSyncStatus[];
    },
  });
}

/** Fetch unmatched / needs-review emails */
export function useUnmatchedEmails(limit = 50) {
  return useQuery({
    queryKey: ['unmatched-emails', limit],
    queryFn: async (): Promise<UnmatchedEmail[]> => {
      const { data, error } = await supabase
        .from('communication_log')
        .select('id, subject, preview, from_address, direction, occurred_at, matched_contact_email, matching_confidence, matching_method, consultant_user_id, participants_json, needs_review, ignored')
        .eq('needs_review', true)
        .eq('ignored', false)
        .eq('external_source', 'outlook_email')
        .order('occurred_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as unknown as UnmatchedEmail[];
    },
  });
}

/** Trigger an email sync for the current consultant */
export function useTriggerEmailSync() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async () => {
      const result = await invokeWithAuth('sync-outlook-emails', { body: {} });
      if (result.error) throw result.error;
      if (result.data?.error) throw new Error(result.data.error);
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['email-sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['unmatched-emails'] });
      queryClient.invalidateQueries({ queryKey: ['crm-emails'] });
      queryClient.invalidateQueries({ queryKey: ['activity-timeline'] });
      notify.success(
        t('crm.emailSyncComplete', {
          defaultValue: `Sincronização concluída: ${data?.logged || 0} emails registados, ${data?.unmatched || 0} para revisão`,
        })
      );
    },
    onError: (err: Error) => {
      notify.error(err.message || t('crm.emailSyncFailed', { defaultValue: 'Erro na sincronização de emails' }));
    },
  });
}

/** Attach an unmatched email to a CRM entity */
export function useAttachEmailToCrm() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (params: {
      emailId: string;
      funnelItemId?: string;
      workspaceId?: string;
      startupId?: string;
    }) => {
      const update: Record<string, unknown> = {
        needs_review: false,
        matching_method: 'manual_staff',
        matching_confidence: 'high',
      };
      if (params.funnelItemId) update.funnel_item_id = params.funnelItemId;
      if (params.workspaceId) update.workspace_id = params.workspaceId;
      if (params.startupId) update.matched_startup_id = params.startupId;

      const { error } = await supabase
        .from('communication_log')
        .update(update as never)
        .eq('id', params.emailId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unmatched-emails'] });
      queryClient.invalidateQueries({ queryKey: ['activity-timeline'] });
      notify.success(t('crm.emailAttached', { defaultValue: 'Email associado ao CRM' }));
    },
  });
}

/** Mark an unmatched email as ignored */
export function useIgnoreEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (emailId: string) => {
      const { error } = await supabase
        .from('communication_log')
        .update({ ignored: true, needs_review: false })
        .eq('id', emailId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unmatched-emails'] });
    },
  });
}
