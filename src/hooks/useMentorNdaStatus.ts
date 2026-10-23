import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

const CURRENT_NDA_VERSION = 'PT-NDA-2026-01';

/**
 * Checks if the current user (mentor_externo) has accepted the NDA.
 * Returns { needsNda, isLoading } — only relevant for mentor_externo users who are NOT staff.
 */
export function useMentorNdaStatus() {
  const { user, roles, isStaff } = useAuth();
  const isMentorExterno = roles.includes('mentor_externo');
  const shouldCheck = !!user && isMentorExterno && !isStaff;

  const { data: hasAccepted, isLoading, isError, refetch } = useQuery({
    queryKey: ['mentor-nda-gate', user?.id],
    queryFn: async () => {
      if (!user) return true;
      const { data, error } = await supabase.rpc('has_accepted_nda', {
        _user_id: user.id,
        _nda_version: CURRENT_NDA_VERSION,
      });

      if (error) throw error;
      if (typeof data !== 'boolean') throw new Error('nda_verification_unavailable');
      return data;
    },
    enabled: shouldCheck,
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  });

  return {
    needsNda: shouldCheck && hasAccepted === false,
    isLoading: shouldCheck && isLoading,
    verificationError: shouldCheck && isError,
    retryVerification: refetch,
  };
}
