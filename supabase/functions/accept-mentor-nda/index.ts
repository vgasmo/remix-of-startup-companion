import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';

const CURRENT_NDA_VERSION = 'PT-NDA-2026-01';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return corsJsonResponse({ error: 'Authorization required' }, req, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Create client with caller's JWT — RLS enforces mentor role + ownership
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify caller identity
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return corsJsonResponse({ error: 'Invalid token' }, req, 401);
    }

    const userId = user.id;

    // Get user agent and hash IP for privacy
    const userAgent = req.headers.get('User-Agent') || null;
    const clientIp = req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
                     req.headers.get('CF-Connecting-IP') ||
                     'unknown';

    const ipHashSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!ipHashSecret) return corsJsonResponse({ error: 'Internal server error' }, req, 500);

    // HMAC com segredo do servidor (o sal fixo no código tornava o hash reversível por força bruta).
    const hmacKey = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(ipHashSecret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(clientIp));
    const ipHash = Array.from(new Uint8Array(sig)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');

    // Regista o aceite — RLS garante que só mentor_externo insere a sua própria linha.
    // O 1.º aceite é a prova: ignoreDuplicates (ON CONFLICT DO NOTHING) não reescreve data nem IP,
    // e accepted_at fica com o DEFAULT now() da tabela.
    const { error: upsertError } = await supabase
      .from('mentor_nda_acceptances')
      .upsert({
        user_id: userId,
        nda_version: CURRENT_NDA_VERSION,
        ip_hash: ipHash,
        user_agent: userAgent?.substring(0, 500),
      }, {
        onConflict: 'user_id,nda_version',
        ignoreDuplicates: true,
      });

    if (upsertError) {
      console.error('NDA upsert error:', upsertError);
      // Surface a clear message if RLS blocks (e.g. non-mentor user)
      if (upsertError.code === '42501' || upsertError.message?.includes('row-level security')) {
        return corsJsonResponse({ error: 'Only external mentors can accept the NDA' }, req, 403);
      }
      return corsJsonResponse({ error: 'Failed to record NDA acceptance' }, req, 500);
    }

    // Devolve a data realmente gravada (a do 1.º aceite, se já existia)
    const { data: stored, error: storedError } = await supabase
      .from('mentor_nda_acceptances')
      .select('accepted_at')
      .eq('user_id', userId)
      .eq('nda_version', CURRENT_NDA_VERSION)
      .maybeSingle();

    if (storedError || !stored?.accepted_at) {
      return corsJsonResponse({ error: 'Failed to verify NDA acceptance' }, req, 500);
    }

    return corsJsonResponse({
      success: true,
      message: 'NDA accepted successfully',
      nda_version: CURRENT_NDA_VERSION,
      accepted_at: stored.accepted_at,
    }, req);

  } catch (error: any) {
    console.error('Accept NDA error:', error);
    return corsJsonResponse({ error: 'Internal server error' }, req, 500);
  }
});
