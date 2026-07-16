import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface ProposalMaterial {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  file_path: string | null;
  program_id: string | null;
  attach_to_proposal: boolean;
}

/**
 * Loads program-scoped support materials available to attach to a commercial
 * proposal email. Includes globals (program_id IS NULL) and materials tied to
 * `programId`. Only rows with a `file_path` are returned (nothing to sign
 * otherwise).
 */
export function useProposalMaterials(programId: string | null | undefined) {
  return useQuery({
    queryKey: ['proposal-materials', programId ?? 'none'],
    queryFn: async (): Promise<ProposalMaterial[]> => {
      let q = supabase
        .from('support_materials')
        .select('id, title, description, category, file_path, program_id, attach_to_proposal')
        .eq('status', 'approved')
        .not('file_path', 'is', null)
        .order('attach_to_proposal', { ascending: false })
        .order('title');

      if (programId) {
        q = q.or(`program_id.is.null,program_id.eq.${programId}`);
      } else {
        q = q.is('program_id', null);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ProposalMaterial[];
    },
    enabled: programId !== undefined,
  });
}
