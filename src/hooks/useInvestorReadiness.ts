import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import type { Database } from '@/integrations/supabase/types';

type InvestorReadinessItem = Database['public']['Tables']['investor_readiness_items']['Row'];

export interface ReadinessStatus {
  id: string;
  workspace_id: string;
  item_id: string;
  status: string;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  item?: InvestorReadinessItem;
}

export function useInvestorReadinessItems(stage?: string, programId?: string) {
  return useQuery({
    queryKey: ['investor-readiness-items', stage, programId],
    queryFn: async () => {
      let query = supabase
        .from('investor_readiness_items')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (stage) {
        query = query.eq('stage', stage);
      }
      
      if (programId) {
        query = query.or(`program_id.eq.${programId},program_id.is.null`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as InvestorReadinessItem[];
    },
  });
}

export function useWorkspaceReadinessStatus(workspaceId?: string) {
  return useQuery({
    queryKey: ['workspace-readiness-status', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data, error } = await supabase
        .from('workspace_readiness_status')
        .select(`
          *,
          item:investor_readiness_items(*)
        `)
        .eq('workspace_id', workspaceId);
      
      if (error) throw error;
      return (data || []) as ReadinessStatus[];
    },
    enabled: !!workspaceId,
  });
}

export function useUpdateReadinessStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      workspaceId, 
      itemId, 
      isComplete, 
      notes 
    }: { 
      workspaceId: string; 
      itemId: string; 
      isComplete: boolean; 
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('workspace_readiness_status')
        .upsert({
          workspace_id: workspaceId,
          item_id: itemId,
          status: isComplete ? 'complete' : 'pending',
          completed_at: isComplete ? new Date().toISOString() : null,
          completed_by: isComplete ? user?.id : null,
          notes: notes || null,
        }, {
          onConflict: 'workspace_id,item_id'
        });
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-readiness-status', variables.workspaceId] });
    },
    onError: (error: Error) => {
      notify.error(error.message);
    },
  });
}

// Calculate readiness score as percentage
export function calculateReadinessScore(items: InvestorReadinessItem[], statuses: ReadinessStatus[]): number {
  if (!items.length) return 0;
  
  const completedCount = items.filter(item => 
    statuses.some(s => s.item_id === item.id && s.status === 'complete')
  ).length;
  
  return Math.round((completedCount / items.length) * 100);
}
