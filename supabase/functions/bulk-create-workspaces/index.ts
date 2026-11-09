import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { isAccountActive } from '../_shared/security.ts';

// Ferramenta de operador: converte leads em startup + workspace USANDO o RPC canónico
// staff_convert_funnel_item_to_startup (atómico, idempotente, cria membership e liga o contrato),
// em vez de inserir startups/workspaces à mão com a chave service role.
const STARTUP_STAGES = new Set(['ideation', 'validation', 'mvp', 'growth', 'scale']);
const FUNNEL_STAGE_RE = /^[a-z_]{2,40}$/;
const MAX_ITEMS = 200;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return corsJsonResponse({ error: 'No authorization header' }, req, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // Cliente com o JWT do chamador: o RPC corre como o utilizador (auth.uid()) e o RLS aplica-se.
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
    if (authError || !user) {
      return corsJsonResponse({ error: 'Unauthorized' }, req, 401);
    }

    // AGENTS.md: estado da conta verificado pelo helper partilhado antes de qualquer operação privilegiada
    if (!(await isAccountActive(supabaseAdmin, user.id))) {
      return corsJsonResponse({ error: 'Forbidden - account not active' }, req, 403);
    }

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    if (rolesError) {
      console.error('Error checking user roles:', rolesError.message);
      return corsJsonResponse({ error: 'Failed to verify permissions' }, req, 500);
    }
    const isStaff = roles?.some((r) => r.role === 'admin' || r.role === 'consultor');
    if (!isStaff) {
      console.warn('Non-staff user attempted bulk workspace creation:', user.id);
      return corsJsonResponse({ error: 'Forbidden - Staff access required' }, req, 403);
    }

    const body = await req.json().catch(() => ({}));
    const stage = typeof body.stage === 'string' ? body.stage : 'contracted';
    const defaultWorkspaceStage = typeof body.defaultWorkspaceStage === 'string' ? body.defaultWorkspaceStage : 'ideation';
    const dryRun = body.dryRun === true;
    if (!FUNNEL_STAGE_RE.test(stage)) {
      return corsJsonResponse({ error: 'invalid stage' }, req, 400);
    }
    if (!STARTUP_STAGES.has(defaultWorkspaceStage)) {
      return corsJsonResponse({ error: 'invalid defaultWorkspaceStage', allowed: [...STARTUP_STAGES] }, req, 400);
    }

    const { data: items, error: fetchError } = await supabaseUser
      .from('funnel_items')
      .select('id, organization_name, contact_name, contact_email, program_id, owner_consultant_id')
      .eq('stage', stage)
      .is('linked_workspace_id', null)
      .order('created_at', { ascending: true })
      .limit(MAX_ITEMS);
    if (fetchError) {
      console.error('Error fetching funnel items:', fetchError.message);
      return corsJsonResponse({ error: 'Failed to load funnel items' }, req, 500);
    }

    if (dryRun) {
      return corsJsonResponse({
        dryRun: true,
        count: items?.length || 0,
        items: items?.map((i) => ({
          id: i.id,
          name: i.organization_name || i.contact_name,
          email: i.contact_email,
          program_id: i.program_id,
          owner: i.owner_consultant_id,
        })),
      }, req);
    }

    const results = {
      created: 0,
      already_linked: 0,
      errors: [] as Array<{ id: string; name: string; error: string }>,
    };

    for (const item of items || []) {
      const name = item.organization_name || item.contact_name || 'Startup sem nome';
      if (!item.program_id) {
        results.errors.push({ id: item.id, name, error: 'missing_program_id' });
        continue;
      }
      const { data, error } = await supabaseUser.rpc('staff_convert_funnel_item_to_startup', {
        p_funnel_item_id: item.id,
        p_program_id: item.program_id,
        p_stage: defaultWorkspaceStage,
        p_project_name: name,
        p_health_notes: 'Workspace criado em lote a partir de lead CRM.',
      });
      if (error) {
        console.error(`convert failed for ${item.id}:`, error.message);
        results.errors.push({ id: item.id, name, error: error.message });
        continue;
      }
      if ((data as { was_existing?: boolean } | null)?.was_existing) results.already_linked++;
      else results.created++;
    }

    return corsJsonResponse(results, req);
  } catch (error) {
    console.error('Error in bulk-create-workspaces:', error instanceof Error ? error.message : error);
    return corsJsonResponse({ error: 'Internal error' }, req, 500);
  }
});
