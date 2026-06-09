/**
 * Shared security utilities for Supabase Edge Functions
 * Provides authentication and authorization helpers
 */

import { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsJsonResponse } from './cors.ts';

// Standard error codes
export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * Constant-time string comparison to prevent timing attacks on shared secrets.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

export interface SecurityError {
  error: string;
  code: string;
}

export interface AuthResult {
  user: User;
  token: string;
}

/**
 * Generate a unique request ID for logging
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Structured logger for edge functions
 */
export function createLogger(functionName: string, requestId: string) {
  const base = { fn: functionName, reqId: requestId };
  
  return {
    info: (msg: string, data?: Record<string, unknown>) => {
      console.log(JSON.stringify({ ...base, level: 'info', msg, ...data }));
    },
    warn: (msg: string, data?: Record<string, unknown>) => {
      console.warn(JSON.stringify({ ...base, level: 'warn', msg, ...data }));
    },
    error: (msg: string, error?: unknown, data?: Record<string, unknown>) => {
      const errorInfo = error instanceof Error 
        ? { errMsg: error.message, errName: error.name }
        : { errMsg: String(error) };
      console.error(JSON.stringify({ ...base, level: 'error', msg, ...errorInfo, ...data }));
    },
  };
}

/**
 * Create a standardized error response
 */
export function errorResponse(
  req: Request,
  message: string,
  code: string,
  status: number
): Response {
  return corsJsonResponse({ error: message, code }, req, status);
}

/**
 * Require a valid authenticated user
 * Use this for user-facing functions (category A)
 * 
 * @param req - The incoming request
 * @param supabaseClient - A Supabase client with the user's auth header
 * @returns User object or Response with 401 error
 */
export async function requireUser(
  req: Request,
  supabaseClient: SupabaseClient
): Promise<{ user: User } | { error: Response }> {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      error: errorResponse(req, 'Authorization header required', ErrorCode.UNAUTHORIZED, 401)
    };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseClient.auth.getUser(token);

  if (error || !user) {
    return {
      error: errorResponse(req, 'Invalid or expired token', ErrorCode.UNAUTHORIZED, 401)
    };
  }

  return { user };
}

/**
 * Require valid cron secret for system/scheduled functions
 * Use this for cron/system functions (category B)
 * 
 * @param req - The incoming request
 * @returns true if valid, or Response with 401 error
 */
export function requireCronSecret(
  req: Request
): { valid: true } | { error: Response } {
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  
  if (!expectedSecret) {
    console.error('[SECURITY] CRON_SECRET environment variable not configured');
    return {
      error: errorResponse(req, 'Server misconfigured', ErrorCode.INTERNAL_ERROR, 500)
    };
  }

  if (!cronSecret || cronSecret !== expectedSecret) {
    return {
      error: errorResponse(req, 'Invalid or missing cron secret', ErrorCode.UNAUTHORIZED, 401)
    };
  }

  return { valid: true };
}

/**
 * Require valid webhook secret for external webhook functions
 * Use this for webhook ingestion functions (category C)
 * 
 * @param req - The incoming request
 * @returns true if valid, or Response with 401 error
 */
export function requireWebhookSecret(
  req: Request
): { valid: true } | { error: Response } {
  const webhookSecret = req.headers.get('x-webhook-secret');
  const expectedSecret = Deno.env.get('WEBHOOK_SECRET');
  
  if (!expectedSecret) {
    console.error('[SECURITY] WEBHOOK_SECRET environment variable not configured');
    return {
      error: errorResponse(req, 'Server misconfigured', ErrorCode.INTERNAL_ERROR, 500)
    };
  }

  if (!webhookSecret || webhookSecret !== expectedSecret) {
    return {
      error: errorResponse(req, 'Invalid or missing webhook secret', ErrorCode.UNAUTHORIZED, 401)
    };
  }

  return { valid: true };
}

/**
 * Require either cron secret OR valid staff user (admin/consultor)
 * Allows manual triggers from authorized users
 * 
 * @param req - The incoming request
 * @param supabaseUserClient - Supabase client with user's auth header
 * @param supabaseAdminClient - Supabase client with service role key
 * @returns valid true or error response
 */
export async function requireCronOrStaff(
  req: Request,
  supabaseUserClient: SupabaseClient,
  supabaseAdminClient: SupabaseClient
): Promise<{ valid: true; userId?: string } | { error: Response }> {
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  
  // Check cron secret first
  if (expectedSecret && cronSecret && timingSafeEqual(cronSecret, expectedSecret)) {
    return { valid: true };
  }

  // Fall back to staff user auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return {
      error: errorResponse(req, 'Authorization or cron secret required', ErrorCode.UNAUTHORIZED, 401)
    };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseUserClient.auth.getUser(token);

  if (error || !user) {
    return {
      error: errorResponse(req, 'Invalid token', ErrorCode.UNAUTHORIZED, 401)
    };
  }

  // Check if user is staff (admin, consultor, or backoffice)
  const { data: roles } = await supabaseAdminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  const isStaff = roles?.some(r => 
    r.role === 'admin' || r.role === 'consultor' || r.role === 'backoffice'
  );
  
  if (!isStaff) {
    return {
      error: errorResponse(req, 'Staff access required', ErrorCode.FORBIDDEN, 403)
    };
  }

  return { valid: true, userId: user.id };
}

/**
 * Require either cron secret OR governance user (admin/backoffice only)
 * Use for compliance/governance operations like archive and backup triggers.
 * Consultors are excluded — these are governance-level operations.
 */
export async function requireCronOrGovernance(
  req: Request,
  supabaseUserClient: SupabaseClient,
  supabaseAdminClient: SupabaseClient
): Promise<{ valid: true; userId?: string } | { error: Response }> {
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  
  if (expectedSecret && cronSecret === expectedSecret) {
    return { valid: true };
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return {
      error: errorResponse(req, 'Authorization or cron secret required', ErrorCode.UNAUTHORIZED, 401)
    };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseUserClient.auth.getUser(token);

  if (error || !user) {
    return {
      error: errorResponse(req, 'Invalid token', ErrorCode.UNAUTHORIZED, 401)
    };
  }

  const { data: roles } = await supabaseAdminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  const isGovernance = roles?.some(r => 
    r.role === 'admin' || r.role === 'backoffice'
  );
  
  if (!isGovernance) {
    return {
      error: errorResponse(req, 'Governance access required (admin or backoffice)', ErrorCode.FORBIDDEN, 403)
    };
  }

  return { valid: true, userId: user.id };
}

/**
 * Validate workspace access for a user
 * 
 * @param supabase - Supabase client with service role
 * @param userId - User ID to check
 * @param workspaceId - Workspace ID to validate access for
 * @returns true if user has access
 */
export async function validateWorkspaceAccess(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const { data: hasAccess } = await supabase.rpc('has_workspace_access', {
    _user_id: userId,
    _workspace_id: workspaceId,
  });

  return hasAccess === true;
}

/**
 * Check if user account is active (not pending/suspended)
 * Use this for functions that should reject blocked users
 */
export async function isAccountActive(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data: isActive } = await supabase.rpc('is_account_active', {
    _user_id: userId,
  });

  return isActive === true;
}

/**
 * Validate workspace access AND account is active
 * Uses consolidated has_active_workspace_access function
 * Enforces: approved account + active membership + active workspace + not blocked
 */
export async function validateActiveWorkspaceAccess(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string
): Promise<boolean> {
  // First check account is active (separate call for clarity in logs)
  const accountActive = await isAccountActive(supabase, userId);
  if (!accountActive) {
    return false;
  }
  
  // Then check workspace access using the canonical function
  // Note: has_active_workspace_access now uses auth.uid() internally via RLS
  // For edge functions, we use has_workspace_access with explicit user check
  const { data: hasAccess } = await supabase.rpc('has_workspace_access', {
    _user_id: userId,
    _workspace_id: workspaceId,
  });

  return hasAccess === true;
}

/**
 * Check AI rate limit for a user
 * Returns true if within limit, false if exceeded
 */
export async function checkAIRateLimit(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string | null,
  functionName: string,
  maxRequests: number = 20
): Promise<boolean> {
  const { data: withinLimit } = await supabase.rpc('check_ai_rate_limit', {
    _user_id: userId,
    _workspace_id: workspaceId,
    _function_name: functionName,
    _max_requests: maxRequests,
  });

  return withinLimit === true;
}

/**
 * Safe error message - sanitize for external responses
 */
export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Don't expose internal error details
    const message = error.message;
    if (message.includes('secret') || message.includes('token') || message.includes('password')) {
      return 'Internal error';
    }
    return message.slice(0, 200);
  }
  return 'Unknown error';
}
