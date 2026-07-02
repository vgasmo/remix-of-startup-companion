/**
 * Standardized API error handling for consistent error messaging
 * Use this for all Supabase and Edge Function calls
 */

import { logError } from './logError';
import i18n from '@/i18n';

export interface ApiError {
  message: string;
  code: string;
  details?: string;
  retryable: boolean;
}

export interface ApiResult<T> {
  data: T | null;
  error: ApiError | null;
}

/**
 * Standard error codes matching edge function error codes
 */
export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Map error codes to user-friendly messages (localized via i18n `errors.*` namespace).
 * Access via getErrorMessage(code) — do not read this record directly.
 */
const ERROR_MESSAGES: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, prop: string) => i18n.t(`errors.${prop}`, { defaultValue: 'Something went wrong.' }),
});


/**
 * Parse various error formats into a standardized ApiError
 */
export function parseApiError(error: unknown, context?: string): ApiError {
  // Supabase error format
  if (error && typeof error === 'object' && 'message' in error) {
    const supabaseError = error as { message: string; code?: string; details?: string };
    
    // Check for specific Supabase error patterns
    if (supabaseError.message.includes('JWT')) {
      return {
        message: ERROR_MESSAGES[ErrorCode.UNAUTHORIZED],
        code: ErrorCode.UNAUTHORIZED,
        details: context,
        retryable: false,
      };
    }
    
    if (supabaseError.message.includes('permission denied') || supabaseError.message.includes('RLS')) {
      return {
        message: ERROR_MESSAGES[ErrorCode.FORBIDDEN],
        code: ErrorCode.FORBIDDEN,
        details: context,
        retryable: false,
      };
    }
    
    if (supabaseError.code === '23505') {
      return {
        message: 'This item already exists.',
        code: ErrorCode.BAD_REQUEST,
        details: context,
        retryable: false,
      };
    }
    
    return {
      message: supabaseError.message.slice(0, 200),
      code: supabaseError.code || ErrorCode.INTERNAL_ERROR,
      details: context,
      retryable: true,
    };
  }
  
  // Edge function error format
  if (error && typeof error === 'object' && 'error' in error && 'code' in error) {
    const edgeError = error as { error: string; code: string };
    return {
      message: ERROR_MESSAGES[edgeError.code] || edgeError.error.slice(0, 200),
      code: edgeError.code,
      details: context,
      retryable: edgeError.code === ErrorCode.RATE_LIMITED || edgeError.code === ErrorCode.INTERNAL_ERROR,
    };
  }
  
  // Network/fetch errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      message: ERROR_MESSAGES[ErrorCode.NETWORK_ERROR],
      code: ErrorCode.NETWORK_ERROR,
      details: context,
      retryable: true,
    };
  }
  
  // Standard Error
  if (error instanceof Error) {
    return {
      message: error.message.slice(0, 200),
      code: ErrorCode.INTERNAL_ERROR,
      details: context,
      retryable: true,
    };
  }
  
  // Unknown error format
  return {
    message: ERROR_MESSAGES[ErrorCode.INTERNAL_ERROR],
    code: ErrorCode.INTERNAL_ERROR,
    details: context,
    retryable: true,
  };
}

/**
 * Handle API errors with logging and standardized response
 */
export function handleApiError(error: unknown, context: string): ApiError {
  const apiError = parseApiError(error, context);
  
  // Log the error with context
  if (error instanceof Error) {
    logError(error, { action: context });
  } else {
    logError(new Error(apiError.message), { action: context });
  }
  
  return apiError;
}

/**
 * Wrap an async API call with standardized error handling
 */
export async function safeApiCall<T>(
  fn: () => Promise<T>,
  context: string
): Promise<ApiResult<T>> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: handleApiError(error, context) };
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: ApiError): boolean {
  return error.retryable;
}

/**
 * Get a user-friendly error message
 */
export function getUserMessage(error: ApiError): string {
  return ERROR_MESSAGES[error.code] || error.message;
}
