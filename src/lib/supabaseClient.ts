/**
 * Production-ready Supabase Client Wrapper
 * 
 * This file wraps the auto-generated Supabase client to ensure
 * production-critical auth settings are applied.
 * 
 * IMPORTANT: Always import from this file, not from @/integrations/supabase/client
 * 
 * Settings applied:
 * - persistSession: true (keep user logged in across refreshes)
 * - autoRefreshToken: true (automatically refresh tokens before expiry)
 * - detectSessionInUrl: true (CRITICAL for OAuth/magic link redirects)
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { createFetchWithTimeout } from '@/lib/fetchWithTimeout';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('[Supabase] Missing environment variables. Auth will not work.');
}

/**
 * Production-configured Supabase client with all auth options set correctly.
 * 
 * Key difference from auto-generated client:
 * - detectSessionInUrl: true - Required for OAuth and magic link callbacks
 */
export const supabaseClient = createClient<Database>(
  SUPABASE_URL || '',
  SUPABASE_PUBLISHABLE_KEY || '',
  {
    global: { fetch: createFetchWithTimeout() },
    auth: {
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // CRITICAL: Captures OAuth/magic link tokens from URL
      flowType: 'pkce', // More secure OAuth flow
    },
  }
);

// Re-export for backwards compatibility
export { supabaseClient as supabase };

// Export Database type for convenience
export type { Database };
