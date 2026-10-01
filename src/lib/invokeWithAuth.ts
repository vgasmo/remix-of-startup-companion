import { supabase } from "@/lib/supabaseClient";
import { parseApiError } from "@/lib/apiError";

type InvokeOptions = Parameters<typeof supabase.functions.invoke>[1];

/**
 * Ensures we always send an Authorization header when calling backend functions.
 * Returns a standardized error shape for consistent UI handling.
 * 
 * @param functionName - Edge function name
 * @param options - Invoke options (body, headers, etc.)
 * @returns Result with data or error (backward compatible)
 */
export async function invokeWithAuth<T = any>(
  functionName: string,
  options?: InvokeOptions
): Promise<{ data: T | null; error: Error | null }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError) {
    // Log structured error but return simple Error for compatibility
    const parsed = parseApiError(sessionError, `invokeWithAuth:${functionName}`);
    return { 
      data: null, 
      error: new Error(parsed.message)
    };
  }

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { 
      data: null, 
      error: new Error("Please sign in to continue.")
    };
  }

  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    ...options,
    headers: {
      ...(options?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    const parsed = parseApiError(error, `invokeWithAuth:${functionName}`);
    // O FunctionsHttpError traz a Response em error.context: usar o status e a mensagem reais do servidor.
    // Só 401/403 viram '403: Access denied' (há chamadores que testam esse texto).
    const ctx = (error as { context?: unknown }).context;
    let status: number | undefined;
    let serverMsg: string | undefined;
    if (ctx instanceof Response) {
      status = ctx.status;
      try {
        const body = await ctx.clone().json();
        serverMsg = typeof body?.message === 'string' ? body.message
          : typeof body?.error === 'string' ? body.error
          : undefined;
      } catch { /* corpo não-JSON */ }
    }
    if (status === 401 || status === 403 || parsed.code === 'FORBIDDEN') {
      return { data: null, error: new Error(`403: Access denied (${functionName})`) };
    }
    return { 
      data: null, 
      error: new Error(serverMsg || parsed.message)
    };
  }

  // Handle edge function returning error in the body (non-throw path)
  if (data && typeof data === 'object' && 'error' in data && !('id' in data)) {
    const bodyError = (data as any).error;
    if (typeof bodyError === 'string' && bodyError.toLowerCase().includes('access denied')) {
      return { data: null, error: new Error(`403: Access denied (${functionName})`) };
    }
  }

  return { data, error: null };
}
