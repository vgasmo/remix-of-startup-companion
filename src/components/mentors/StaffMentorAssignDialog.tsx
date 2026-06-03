import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UserPlus, Loader2, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { MentorRecommendationWidget } from './MentorRecommendationWidget';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';

interface StaffMentorAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  workspaceId: string;
  expertiseTags: string[];
  suggestedMentorId?: string | null;
}

export function StaffMentorAssignDialog({
  open,
  onOpenChange,
  requestId,
  workspaceId,
  expertiseTags,
  suggestedMentorId,
}: StaffMentorAssignDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(suggestedMentorId || null);

  // NDA compliance check for selected mentor
  const { data: hasNda } = useQuery({
    queryKey: ['mentor-nda-check', selectedMentorId],
    queryFn: async () => {
      if (!selectedMentorId) return true;
      const { data } = await supabase
        .from('mentor_nda_acceptances')
        .select('id')
        .eq('user_id', selectedMentorId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!selectedMentorId,
  });

  // Assign mentor mutation - adds to workspace_users and updates request
  const assignMentor = useMutation({
    mutationFn: async () => {
      if (!selectedMentorId) throw new Error('No mentor selected');

      // Check if mentor is already assigned to workspace
      const { data: existing } = await supabase
        .from('workspace_users')
        .select('id, active')
        .eq('workspace_id', workspaceId)
        .eq('user_id', selectedMentorId)
        .eq('role', 'mentor_externo')
        .maybeSingle();

      if (existing) {
        // Reactivate if inactive
        if (!existing.active) {
          await supabase
            .from('workspace_users')
            .update({ active: true })
            .eq('id', existing.id);
        }
      } else {
        // Add new workspace user
        const { error: wsError } = await supabase
          .from('workspace_users')
          .insert({
            workspace_id: workspaceId,
            user_id: selectedMentorId,
            role: 'mentor_externo',
            active: true,
          });
        if (wsError) throw wsError;
      }

      // Update the request status
      const { error: reqError } = await supabase
        .from('mentor_requests')
        .update({
          status: 'fulfilled',
          assigned_mentor_id: selectedMentorId,
          fulfilled_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (reqError) throw reqError;

      // Resolve the real founder user id for this workspace.
      // founder_id MUST be a founder auth.users.id (not the workspace id).
      // Pre-v4.0 code wrote workspaceId here — that legacy is now corrected.
      const { data: founderRow } = await supabase
        .from('workspace_users')
        .select('user_id, created_at')
        .eq('workspace_id', workspaceId)
        .eq('role', 'founder')
        .eq('active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const founderUserId = founderRow?.user_id ?? null;

      // Create/refresh a mentor_connections row keyed by (mentor_id, workspace_id).
      // workspace_id is the canonical reference; founder_id is populated when known.
      if (founderUserId) {
        await supabase
          .from('mentor_connections')
          .upsert(
            {
              mentor_id: selectedMentorId,
              founder_id: founderUserId,
              workspace_id: workspaceId,
              status: 'connected',
              responded_at: new Date().toISOString(),
            },
            { onConflict: 'mentor_id,workspace_id' },
          );
      } else {
        // No active founder yet (unclaimed/imported workspace).
        // The mentor↔workspace link is fully captured by workspace_users above.
        // We intentionally do NOT insert into mentor_connections without a real
        // founder user id — writing workspace_id into founder_id is a legacy
        // anti-pattern that v4.0 corrects. Mentor visibility still works because
        // it joins via workspace_users.
        logger.warn('mentor_connection_skipped_no_founder', {
          workspaceId,
          mentorId: selectedMentorId,
          reason: 'No active founder on workspace; supplementary mentor_connections row not created.',
        });
      }

      // Connection insertion errors are intentionally non-fatal (supplementary record).
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-mentor-requests'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-users'] });
      notify.success(t('mentors.mentorAssigned', 'Mentor assigned successfully'));
      onOpenChange(false);
    },
    onError: (error) => {
      logger.error('Assignment error', {}, error);
      notify.error(t('common.error'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t('mentors.assignMentor', 'Assign Mentor')}
          </DialogTitle>
          <DialogDescription>
            {t('mentors.assignMentorDesc', 'Selecione um mentor para associar a este workspace. Será adicionado como mentor externo com acesso de leitura às notas e sessões.')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <MentorRecommendationWidget
            requestedTags={expertiseTags}
            workspaceId={workspaceId}
            onSelectMentor={setSelectedMentorId}
            selectedMentorId={selectedMentorId}
          />
        </div>

        {/* NDA compliance warning */}
        {selectedMentorId && hasNda === false && (
          <Alert variant="destructive" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('mentors.ndaNotSigned', 'Este mentor ainda não assinou o NDA. O acesso aos dados do workspace ficará bloqueado até que o NDA seja aceite.')}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => assignMentor.mutate()}
            disabled={!selectedMentorId || assignMentor.isPending}
          >
            {assignMentor.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            {t('mentors.confirmAssignment', 'Confirm Assignment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
