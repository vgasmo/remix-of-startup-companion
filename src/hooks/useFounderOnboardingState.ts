/**
 * useFounderOnboardingState — Single source of truth for founder onboarding status.
 * 
 * READ-ONLY: Does NOT call claim_startup() RPC or perform any writes.
 * Used for routing decisions, empty-state rendering, and pending-state display.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export type FounderOnboardingStatus =
  | 'loading'
  | 'has_active_workspace'       // Founder has an active/claimed workspace — normal product access
  | 'needs_onboarding'           // Founder has workspace but needs to complete onboarding wizard
  | 'has_pending_workspace'      // Founder submitted a startup application, workspace is pending
  | 'has_pending_claim'          // Founder has a pending claim request awaiting staff review
  | 'needs_claim_verification'   // Founder has no workspace and no pending claim — should verify
  | 'not_founder'                // User is not a founder (staff, mentor, etc.)
  | 'staff_exempt';              // User is founder but also staff — exempt from gating

export interface FounderOnboardingState {
  status: FounderOnboardingStatus;
  /** The active workspace ID if status is 'has_active_workspace' */
  activeWorkspaceId: string | null;
  /** Startup name from the pending workspace or active workspace */
  startupName: string | null;
  /** Pending claim request details */
  pendingClaimEmail: string | null;
  pendingClaimCreatedAt: string | null;
  isLoading: boolean;
}

export function useFounderOnboardingState(): FounderOnboardingState {
  const { user, roles, isStaff, isFounder, isAuthReady } = useAuth();

  const isExempt = isStaff || roles.includes('mentor_externo');
  const shouldQuery = isAuthReady && !!user && isFounder && !isExempt;

  const { data, isLoading } = useQuery({
    queryKey: ['founder-onboarding-state', user?.id],
    queryFn: async (): Promise<Omit<FounderOnboardingState, 'isLoading'>> => {
      if (!user) {
        return { status: 'not_founder', activeWorkspaceId: null, startupName: null, pendingClaimEmail: null, pendingClaimCreatedAt: null };
      }

      // 1. Check for active/claimed workspace membership
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspace_users')
        .select(`
          workspace_id,
          workspaces!inner(id, status, needs_onboarding, startup_id, startups(name))
        `)
        .eq('user_id', user.id)
        .eq('active', true)
        .eq('role', 'founder')
        .limit(5);

      if (workspaceError) throw workspaceError;

      if (workspaceData && workspaceData.length > 0) {
        // Check for active/claimed workspace
        const activeWs = workspaceData.find((w: any) => 
          w.workspaces?.status === 'active' || w.workspaces?.status === 'claimed'
        );
        if (activeWs) {
          // Check if onboarding is still needed
          const needsOnboarding = (activeWs as any).workspaces?.needs_onboarding === true;
          if (needsOnboarding) {
            return {
              status: 'needs_onboarding',
              activeWorkspaceId: (activeWs as any).workspaces?.id || activeWs.workspace_id,
              startupName: (activeWs as any).workspaces?.startups?.name || null,
              pendingClaimEmail: null,
              pendingClaimCreatedAt: null,
            };
          }
          return {
            status: 'has_active_workspace',
            activeWorkspaceId: (activeWs as any).workspaces?.id || activeWs.workspace_id,
            startupName: (activeWs as any).workspaces?.startups?.name || null,
            pendingClaimEmail: null,
            pendingClaimCreatedAt: null,
          };
        }

        // Check for pending workspace (submitted application)
        const pendingWs = workspaceData.find((w: any) => 
          w.workspaces?.status === 'pending'
        );
        if (pendingWs) {
          return {
            status: 'has_pending_workspace',
            activeWorkspaceId: null,
            startupName: (pendingWs as any).workspaces?.startups?.name || null,
            pendingClaimEmail: null,
            pendingClaimCreatedAt: null,
          };
        }
      }

      // 2. Check for pending claim request
      const { data: claimData, error: claimError } = await supabase
        .from('startup_claim_requests')
        .select('id, status, user_email, created_at')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      if (claimError) throw claimError;

      if (claimData && claimData.length > 0) {
        return {
          status: 'has_pending_claim',
          activeWorkspaceId: null,
          startupName: null,
          pendingClaimEmail: claimData[0].user_email,
          pendingClaimCreatedAt: claimData[0].created_at,
        };
      }

      // 3. No workspace and no pending claim → needs verification
      return {
        status: 'needs_claim_verification',
        activeWorkspaceId: null,
        startupName: null,
        pendingClaimEmail: null,
        pendingClaimCreatedAt: null,
      };
    },
    enabled: shouldQuery,
    staleTime: 30_000, // 30 seconds — lightweight re-check
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  // Non-founder or exempt users
  if (!isFounder) {
    return { status: 'not_founder', activeWorkspaceId: null, startupName: null, pendingClaimEmail: null, pendingClaimCreatedAt: null, isLoading: false };
  }
  if (isExempt) {
    return { status: 'staff_exempt', activeWorkspaceId: null, startupName: null, pendingClaimEmail: null, pendingClaimCreatedAt: null, isLoading: false };
  }

  if (!isAuthReady || isLoading || !data) {
    return { status: 'loading', activeWorkspaceId: null, startupName: null, pendingClaimEmail: null, pendingClaimCreatedAt: null, isLoading: true };
  }

  return { ...data, isLoading: false };
}
