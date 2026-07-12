import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { CheckCircle2, XCircle, Clock, User, Mail, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ClaimRequest {
  id: string;
  user_id: string;
  user_email: string | null;
  startup_id: string | null;
  workspace_id: string | null;
  status: string;
  match_method: string | null;
  requested_at: string;
  notes: string | null;
}

interface UnclaimedWorkspace {
  id: string;
  startup: { id: string; name: string } | null;
}

export function ClaimRequestsQueue() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<Record<string, string>>({});

  const { data: claims = [], isLoading, isError, error: claimsError, refetch } = useQuery({
    queryKey: ['claim-requests-pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('startup_claim_requests')
        .select('*')
        .eq('status', 'pending')
        .order('requested_at', { ascending: true });
      if (error) throw error;
      return (data || []) as ClaimRequest[];
    },
  });

  const { data: unclaimedWorkspaces = [] } = useQuery({
    queryKey: ['unclaimed-workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, startup:startups(id, name)')
        .eq('status', 'imported_unclaimed')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(w => ({
        id: w.id,
        startup: w.startup as UnclaimedWorkspace['startup'],
      }));
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ claimId, workspaceId }: { claimId: string; workspaceId: string }) => {
      const { error } = await supabase.rpc('approve_startup_claim', {
        p_claim_id: claimId,
        p_workspace_id: workspaceId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim-requests-pending'] });
      queryClient.invalidateQueries({ queryKey: ['unclaimed-workspaces'] });
      toast({
        title: t('claimStartup.approved', { defaultValue: 'Pedido aprovado' }),
        description: t('claimStartup.approvedDesc', { defaultValue: 'O founder foi associado ao workspace.' }),
      });
    },
    onError: () => {
      toast({
        title: t('common.error', { defaultValue: 'Erro' }),
        description: t('claimStartup.approveFailed', { defaultValue: 'Falha ao aprovar pedido.' }),
        variant: 'destructive',
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase.rpc('reject_startup_claim', {
        p_claim_id: claimId,
        p_reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim-requests-pending'] });
      toast({
        title: t('claimStartup.rejected', { defaultValue: 'Pedido rejeitado' }),
      });
    },
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Clock className="h-4 w-4 animate-spin" /> {t('common.loading', { defaultValue: 'Loading...' })}</div>;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span>{t('claimStartup.loadFailed', { defaultValue: 'Could not load claim requests.' })}</span>
          {claimsError instanceof Error ? <span className="text-xs opacity-70">({claimsError.message})</span> : null}
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          {t('common.retry', { defaultValue: 'Retry' })}
        </Button>
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        {t('claimStartup.noRequests', { defaultValue: 'No pending claim requests.' })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {claims.map((claim) => (
        <div key={claim.id} className="flex items-center gap-3 rounded-lg border p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Mail className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm font-medium truncate">{claim.user_email || claim.user_id}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {claim.match_method === 'email_match' ? 'Email Match' : t('claimStartup.manualRequest', { defaultValue: 'Pedido Manual' })}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(claim.requested_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={selectedWorkspaces[claim.id] || ''}
              onValueChange={(val) => setSelectedWorkspaces(prev => ({ ...prev, [claim.id]: val }))}
            >
              <SelectTrigger aria-label={t('claimStartup.selectStartup', { defaultValue: 'Selecionar startup...' })} className="w-[180px] h-8 text-xs">
                <SelectValue placeholder={t('claimStartup.selectStartup', { defaultValue: 'Selecionar startup...' })} />
              </SelectTrigger>
              <SelectContent>
                {unclaimedWorkspaces.map(w => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.startup?.name || w.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="default"
              className="h-8"
              disabled={!selectedWorkspaces[claim.id] || approveMutation.isPending} loading={approveMutation.isPending}
              onClick={() => approveMutation.mutate({ claimId: claim.id, workspaceId: selectedWorkspaces[claim.id] })}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {t('admin.approve', { defaultValue: 'Aprovar' })}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-destructive"
                  disabled={rejectMutation.isPending}
                  loading={rejectMutation.isPending}
                  aria-label={t('admin.reject', { defaultValue: 'Reject' })}
                  title={t('admin.reject', { defaultValue: 'Reject' })}
                >
                  <XCircle className="h-3 w-3" />
                  <span className="sr-only">{t('admin.reject', { defaultValue: 'Reject' })}</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('claimStartup.rejectConfirmTitle', { defaultValue: 'Reject this claim request?' })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('claimStartup.rejectConfirmDesc', {
                      defaultValue: 'The requester will be notified. This action cannot be undone.',
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel', { defaultValue: 'Cancel' })}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => rejectMutation.mutate(claim.id)}
                  >
                    {t('admin.reject', { defaultValue: 'Reject' })}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ))}
    </div>
  );
}
