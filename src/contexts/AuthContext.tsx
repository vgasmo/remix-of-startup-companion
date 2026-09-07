import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { AppRole } from '@/types/database';
import { resetSession, setCacheOwner } from '@/lib/sessionReset';
import { hydrateCache, queryClient } from '@/lib/queryClient';
import { logger } from '@/lib/logger';
import { track } from '@/lib/analytics';

export type AccountStatus = 'pending' | 'approved' | 'suspended';

export interface ProfileWithStatus {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  account_status: AccountStatus;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: ProfileWithStatus | null;
  roles: AppRole[];
  isLoading: boolean;
  isAuthReady: boolean;
  /** P0.3: true when profile/roles could not be loaded — do NOT treat as "no roles". */
  authError: boolean;
  retryUserData: () => Promise<void>;
  isAdmin: boolean;
  isConsultor: boolean;
  isBackoffice: boolean;
  isStaff: boolean;
  isMentor: boolean;
  isExternalMentor: boolean;
  isFounder: boolean;
  isAccountApproved: boolean;
  isAccountPending: boolean;
  isAccountSuspended: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, selectedRole?: 'founder' | 'mentor_externo', returnTo?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileWithStatus | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState(false);
  const userIdRef = useRef<string | null>(null);
  // Refs mirror the latest loaded permissions so a failed *refetch* never blanks
  // the screen for a user whose roles/profile are already in memory (P0.3-bis).
  const rolesRef = useRef<AppRole[]>([]);
  const profileRef = useRef<ProfileWithStatus | null>(null);

  const fetchUserData = useCallback(async (userId: string, opts?: { isRefetch?: boolean }): Promise<void> => {
    // P0.3: supabase-js never throws — it returns { data, error }. Treating an
    // error as "no roles" silently strips every permission from the user, so we
    // retry with backoff and surface authError instead of degrading.
    const MAX_ATTEMPTS = 3;
    const surfaceError = () => {
      // A failed refetch with permissions already loaded must not cover the UI.
      if (opts?.isRefetch && (rolesRef.current.length > 0 || profileRef.current)) return;
      setAuthError(true);
    };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const [profileResult, rolesResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, email, full_name, avatar_url, account_status, created_at, updated_at')
            .eq('id', userId)
            .maybeSingle(),
          supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', userId)
        ]);

        // A fetch for user X must never write state after a logout or a switch to Y.
        if (userIdRef.current !== userId) return;

        if (profileResult.error || rolesResult.error) {
          logger.error('fetch_user_data_failed', {
            userId: userId.slice(0, 8),
            attempt,
            profileError: profileResult.error?.message,
            rolesError: rolesResult.error?.message,
          });
          if (attempt < MAX_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, 400 * attempt));
            continue;
          }
          surfaceError();
          return;
        }

        if (profileResult.data) {
          const profileData = profileResult.data as Record<string, unknown>;
          const nextProfile: ProfileWithStatus = {
            id: profileData.id as string,
            email: profileData.email as string,
            full_name: profileData.full_name as string | null,
            avatar_url: profileData.avatar_url as string | null,
            account_status: (profileData.account_status as AccountStatus) || 'approved',
            created_at: profileData.created_at as string,
            updated_at: profileData.updated_at as string,
          };
          profileRef.current = nextProfile;
          setProfile(nextProfile);
        }

        const nextRoles = (rolesResult.data ?? []).map(r => r.role as AppRole);
        rolesRef.current = nextRoles;
        setRoles(nextRoles);
        setAuthError(false);
        return;
      } catch (error) {
        logger.error('fetch_user_data_threw', { userId: userId.slice(0, 8), attempt }, error);
        if (userIdRef.current !== userId) return;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, 400 * attempt));
          continue;
        }
        surfaceError();
      }
    }
  }, []);

  const retryUserData = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    setAuthError(false);
    setIsAuthReady(false);
    try {
      await fetchUserData(uid);
    } finally {
      setIsAuthReady(true);
    }
  }, [fetchUserData]);

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (!isMounted) return;
        
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        userIdRef.current = initialSession?.user?.id ?? null;
        
        if (initialSession?.user) {
          // Hydrate cache ONLY after confirming user identity
          hydrateCache(initialSession.user.id);
          setCacheOwner(initialSession.user.id);
          await fetchUserData(initialSession.user.id);
        }
      } catch (error) {
        logger.error('auth_init_failed', {}, error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsAuthReady(true);
        }
      }
    };

    let initialUserId: string | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!isMounted) return;
        
        setSession(newSession);
        setUser(newSession?.user ?? null);
        userIdRef.current = newSession?.user?.id ?? null;
        
        if (event === 'SIGNED_OUT') {
          resetSession(queryClient, 'logout');
          setProfile(null);
          setRoles([]);
          profileRef.current = null;
          rolesRef.current = [];
          // P0.4: without this, signing back in as the same user hits the
          // duplicate-SIGNED_IN early return and isAuthReady stays false forever.
          initialUserId = null;
          setIsAuthReady(true);
        } else if (event === 'TOKEN_REFRESHED') {
          // Token refresh — no need to re-fetch profile/roles, just update session
          return;
        } else if (event === 'INITIAL_SESSION') {
          // Skip — handled by initializeAuth to avoid duplicate fetch
          initialUserId = newSession?.user?.id ?? null;
          return;
        } else if (newSession?.user) {
          // Real auth change (SIGNED_IN, USER_UPDATED)
          // Skip the duplicate SIGNED_IN only when we still hold that user's data.
          if (
            newSession.user.id === initialUserId &&
            event === 'SIGNED_IN' &&
            userIdRef.current === newSession.user.id &&
            rolesRef.current.length > 0
          ) {
            setIsAuthReady(true);
            return;
          }
          // Detect user switch — clear previous user's cache
          const previousUid = localStorage.getItem('sl-cache-uid');
          if (previousUid && previousUid !== newSession.user.id) {
            resetSession(queryClient, 'user_switch');
          }
          setCacheOwner(newSession.user.id);
          hydrateCache(newSession.user.id);

          setIsAuthReady(false);
          
          setTimeout(async () => {
            if (isMounted) {
              await fetchUserData(newSession.user.id);
              setIsAuthReady(true);
            }
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setIsAuthReady(true);
        }
      }
    );

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  // Realtime: react to suspension / role changes on the current user's own
  // profile and user_roles rows so the effect is immediate (no manual reload).
  // Also re-check on window focus as a belt-and-braces fallback.
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const refetch = () => { void fetchUserData(uid); };

    const channel = supabase
      .channel(`self-auth-${uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles', filter: `user_id=eq.${uid}` }, refetch)
      .subscribe();

    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id, fetchUserData]);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsAuthReady(false);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      logger.warn('sign_in_failed', { domain: email.split('@')[1] });
      setIsAuthReady(true);
    } else {
      void track('login');
    }
    return { error: error as Error | null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string, selectedRole?: 'founder' | 'mentor_externo', returnTo?: string) => {
    // Preserve invite/accept-invite return URLs so accounts created from an
    // invitation flow land on the acceptance page instead of the generic root.
    const redirectUrl = returnTo
      ? `${window.location.origin}${returnTo.startsWith('/') ? returnTo : `/${returnTo}`}`
      : `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          selected_role: selectedRole
        }
      }
    });
    if (error) {
      logger.warn('sign_up_failed', { domain: email.split('@')[1] });
    }
    return { error: error as Error | null };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    await fetchUserData(user.id);
  }, [user?.id, fetchUserData]);

  const signOut = useCallback(async () => {
    try {
      setIsAuthReady(false);
      resetSession(queryClient, 'logout');
      await supabase.auth.signOut();
    } catch (e) {
      logger.error('signout_failed', {}, e);
    } finally {
      setProfile(null);
      setRoles([]);
      setIsAuthReady(true);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
  }, []);

  const value = useMemo<AuthContextType>(() => {
    const isAdmin = roles.includes('admin');
    const isConsultor = roles.includes('consultor');
    const isBackoffice = roles.includes('backoffice');
    const isStaff = isAdmin || isConsultor || isBackoffice;
    const isExternalMentor = roles.includes('mentor_externo') && !isConsultor && !isAdmin;
    const isMentor = roles.includes('mentor_externo') || isConsultor || isAdmin;
    const isFounder = roles.includes('founder');
    return {
      user,
      session,
      profile,
      roles,
      isLoading,
      isAuthReady,
      authError,
      retryUserData,
      isAdmin,
      isConsultor,
      isBackoffice,
      isStaff,
      isMentor,
      isExternalMentor,
      isFounder,
      isAccountApproved: profile?.account_status === 'approved',
      isAccountPending: profile?.account_status === 'pending',
      isAccountSuspended: profile?.account_status === 'suspended',
      signIn,
      signUp,
      signOut,
      refreshProfile,
    };
  }, [user, session, profile, roles, isLoading, isAuthReady, authError, retryUserData, signIn, signUp, signOut, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
