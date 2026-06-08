import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
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
  signUp: (email: string, password: string, fullName: string, selectedRole?: 'founder' | 'mentor_externo') => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileWithStatus | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const fetchUserData = useCallback(async (userId: string): Promise<void> => {
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
      
      if (profileResult.data) {
        const profileData = profileResult.data as Record<string, unknown>;
        setProfile({
          id: profileData.id as string,
          email: profileData.email as string,
          full_name: profileData.full_name as string | null,
          avatar_url: profileData.avatar_url as string | null,
          account_status: (profileData.account_status as AccountStatus) || 'approved',
          created_at: profileData.created_at as string,
          updated_at: profileData.updated_at as string,
        });
      }
      
      if (rolesResult.data) {
        setRoles(rolesResult.data.map(r => r.role as AppRole));
      }
    } catch (error) {
      logger.error('fetch_user_data_failed', { userId: userId.slice(0, 8) }, error);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (!isMounted) return;
        
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        
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
        
        if (event === 'SIGNED_OUT') {
          resetSession(queryClient, 'logout');
          setProfile(null);
          setRoles([]);
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
          // Skip if same user as initial session (already fetched)
          if (newSession.user.id === initialUserId && event === 'SIGNED_IN') {
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

  const signIn = async (email: string, password: string) => {
    setIsAuthReady(false);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      logger.warn('sign_in_failed', { domain: email.split('@')[1] });
      setIsAuthReady(true);
    } else {
      void track('login');
    }
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string, selectedRole?: 'founder' | 'mentor_externo') => {
    const redirectUrl = `${window.location.origin}/`;
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
  };

  const signOut = async () => {
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
      // Force redirect to login after sign out
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
  };

  const isAdmin = roles.includes('admin');
  const isConsultor = roles.includes('consultor');
  const isBackoffice = roles.includes('backoffice');
  const isStaff = isAdmin || isConsultor || isBackoffice;
  const isExternalMentor = roles.includes('mentor_externo') && !isConsultor && !isAdmin;
  const isMentor = roles.includes('mentor_externo') || isConsultor || isAdmin;
  const isFounder = roles.includes('founder');
  
  const isAccountApproved = profile?.account_status === 'approved';
  const isAccountPending = profile?.account_status === 'pending';
  const isAccountSuspended = profile?.account_status === 'suspended';

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      roles,
      isLoading,
      isAuthReady,
      isAdmin,
      isConsultor,
      isBackoffice,
      isStaff,
      isMentor,
      isExternalMentor,
      isFounder,
      isAccountApproved,
      isAccountPending,
      isAccountSuspended,
      signIn,
      signUp,
      signOut
    }}>
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
