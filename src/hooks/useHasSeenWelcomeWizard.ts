/**
 * Reads `profiles.has_seen_welcome_wizard` for the current user.
 * Used by OnboardingTour and FounderWelcomePanel to defer themselves
 * until after the FounderWelcomeWizard has been dismissed — ensuring
 * a single onboarding surface is visible at a time.
 *
 * Returns:
 *  - `undefined` while loading or for non-founders (no decision yet)
 *  - `true` when the user has dismissed the wizard
 *  - `false` when the wizard is still pending
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export function useHasSeenWelcomeWizard(): boolean | undefined {
  const auth = useAuth() as any;
  const userId: string | undefined = auth?.user?.id;
  const isFounder: boolean = !!auth?.roles?.includes?.('founder');

  const { data, isLoading } = useQuery({
    queryKey: ['welcome-wizard-flag', userId],
    enabled: !!userId && isFounder,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('has_seen_welcome_wizard')
        .eq('id', userId!)
        .maybeSingle();
      if (error) return null;
      return (data as any)?.has_seen_welcome_wizard === true;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Non-founders or staff don't need to wait for the founder wizard.
  if (!isFounder) return true;
  if (isLoading) return undefined;
  return data === true ? true : false;
}
