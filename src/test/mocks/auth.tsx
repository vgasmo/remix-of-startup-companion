import React from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types/database';

/**
 * Mock auth context for tests.
 * Usage: wrap components with <MockAuthProvider roles={['admin']}>
 */
interface MockAuthProviderProps {
  children: React.ReactNode;
  roles?: AppRole[];
  userId?: string;
  email?: string;
  fullName?: string;
  accountStatus?: 'pending' | 'approved' | 'suspended';
}

const AuthContext = React.createContext<ReturnType<typeof useAuth> | undefined>(undefined);

export function MockAuthProvider({
  children,
  roles = ['founder'],
  userId = 'test-user-id',
  email = 'test@example.com',
  fullName = 'Test User',
  accountStatus = 'approved',
}: MockAuthProviderProps) {
  const isAdmin = roles.includes('admin');
  const isConsultor = roles.includes('consultor');
  const isBackoffice = roles.includes('backoffice');
  const isStaff = isAdmin || isConsultor || isBackoffice;
  const isMentor = roles.includes('mentor_externo') || isConsultor || isAdmin;
  const isFounder = roles.includes('founder');

  const value = {
    user: { id: userId, email } as any,
    session: { access_token: 'mock-token' } as any,
    profile: {
      id: userId,
      email,
      full_name: fullName,
      avatar_url: null,
      account_status: accountStatus,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    roles,
    isLoading: false,
    isAuthReady: true,
    authError: false,
    retryUserData: async () => {},
    isAdmin,
    isConsultor,
    isBackoffice,
    isStaff,
    isMentor,
    isFounder,
    isAccountApproved: accountStatus === 'approved',
    isAccountPending: accountStatus === 'pending',
    isAccountSuspended: accountStatus === 'suspended',
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null }),
    signOut: async () => {},
    refreshProfile: async () => {},
  };

  return (
    <AuthContext.Provider value={value as any}>
      {children}
    </AuthContext.Provider>
  );
}
