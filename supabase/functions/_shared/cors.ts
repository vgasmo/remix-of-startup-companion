/**
 * CORS helper for Supabase Edge Functions
 * Validates origin against allowlist from ALLOWED_ORIGINS env var
 */

// Default allowed origins (can be overridden via env)
const DEFAULT_ALLOWED = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://lovable.dev',
  'https://fb.startupleiria.com',
  // Lovable preview domains (dynamic subdomains)
  '*.lovable.app',
  // Backwards-compat / older preview host
  'https://id-preview--apxzuslwhjujgrcsfzqw.lovable.app',
  '*.lovableproject.com',
];

/**
 * Get CORS headers based on request origin
 * @param req - The incoming request
 * @returns CORS headers object
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  
  // Parse allowed origins from env (comma-separated)
  const envOrigins = Deno.env.get('ALLOWED_ORIGINS');
  const allowedOrigins = envOrigins 
    ? envOrigins.split(',').map(o => o.trim()).filter(Boolean)
    : DEFAULT_ALLOWED;
  
  // Check if origin is allowed
  const isAllowed = allowedOrigins.some(allowed => {
    // Support wildcard subdomains (e.g., *.lovable.app)
    // P0 fix: `origin.endsWith('lovable.app')` matches `evil-lovable.app`.
    // Require an exact host equal to the bare domain OR a proper `.domain` suffix.
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      return origin === `https://${domain}` || origin.endsWith(`.${domain}`);
    }
    return origin === allowed;
  });

  const baseHeaders: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };

  if (isAllowed && origin) {
    // Echo the specific allowed origin
    return {
      ...baseHeaders,
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    };
  }

  // If origin not allowed, don't set Allow-Origin (browser will block)
  // But still return other headers for consistency
  return baseHeaders;
}

/**
 * Handle OPTIONS preflight request
 * @param req - The incoming request
 * @returns Response for preflight
 */
export function handleCorsOptions(req: Request): Response {
  const corsHeaders = getCorsHeaders(req);
  
  // If no origin allowed, still return 200 but without Allow-Origin
  return new Response(null, { 
    status: 200, 
    headers: corsHeaders 
  });
}

/**
 * Create a JSON response with CORS headers
 * @param data - Response body
 * @param req - Original request (for origin check)
 * @param status - HTTP status code
 * @returns Response with CORS headers
 */
export function corsJsonResponse(
  data: unknown, 
  req: Request, 
  status = 200
): Response {
  const corsHeaders = getCorsHeaders(req);
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
