import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { denyIfAccountInactive } from '../_shared/security.ts';

const Body = z.object({ userId: z.string().uuid(), status: z.enum(['suspended', 'approved']) }).strict();

Deno.serve(async (req) => {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return reply(500, { error: 'Service configuration unavailable' });
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return reply(401, { error: 'Unauthorized' });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return reply(401, { error: 'Unauthorized' });
    const denied = await denyIfAccountInactive(req, admin, auth.user.id);
    if (denied) return denied;
    const { data: caller, error: callerError } = await admin.from('profiles')
      .select('account_status').eq('id', auth.user.id).maybeSingle();
    const { data: roles, error: rolesError } = await admin.from('user_roles')
      .select('role').eq('user_id', auth.user.id).eq('role', 'admin');
    if (callerError || rolesError || caller?.account_status !== 'approved' || !roles?.length) {
      return reply(403, { error: 'Approved admin required' });
    }
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return reply(400, { error: 'Invalid account status request' });
    const { userId, status } = parsed.data;
    const { data: target, error: targetError } = await admin.from('profiles')
      .select('id, account_status').eq('id', userId).maybeSingle();
    if (targetError || !target) return reply(404, { error: 'Account unavailable' });
    if (status === 'suspended') {
      const { data: targetRoles, error } = await admin.from('user_roles')
        .select('role').eq('user_id', userId).eq('role', 'admin');
      if (error || userId === auth.user.id || targetRoles?.length) {
        return reply(403, { error: 'Cannot suspend this account' });
      }
    }
    const { data: changed, error: updateError } = await admin.from('profiles')
      .update({ account_status: status }).eq('id', userId).select('id');
    if (updateError || !changed?.length) return reply(500, { error: 'Account status update failed' });
    if (status === 'suspended') {
      // Fail closed for existing JWTs before attempting the remote Auth operation.
      // Banning blocks sign-in/refresh; it does NOT delete sessions or revoke JWTs.
      // Do not use the caller's JWT with admin.signOut: that logs out the admin.
      const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
      if (banError) return reply(502, { error: 'Authentication suspension failed' });
    }
    if (status === 'approved') {
      const { error: unbanError } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
      if (unbanError) return reply(502, { error: 'Authentication reactivation failed' });
    }
    return reply(200, { success: true, userId, status });
  } catch {
    return reply(500, { error: 'Account status operation failed' });
  }
});