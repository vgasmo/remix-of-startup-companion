import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface StageHistoryItem {
  id: string;
  workspace_id: string;
  from_stage: string | null;
  to_stage: string;
  changed_by: string | null;
  changed_at: string;
  notes: string | null;
}

export function useStageHistory(workspaceId: string) {
  return useQuery({
    queryKey: ['stage-history', workspaceId],
    queryFn: async (): Promise<StageHistoryItem[]> => {
      const { data, error } = await supabase
        .from('stage_history')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('changed_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
  });
}

export interface MilestoneHistoryItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
}

export function useMilestoneHistory(workspaceId: string) {
  return useQuery({
    queryKey: ['milestone-history', workspaceId],
    queryFn: async (): Promise<MilestoneHistoryItem[]> => {
      const { data, error } = await supabase
        .from('milestones')
        .select('id, title, description, status, completed_at, created_at')
        .eq('workspace_id', workspaceId)
        .is('archived_at', null)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
  });
}
