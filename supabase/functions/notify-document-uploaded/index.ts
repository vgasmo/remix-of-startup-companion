import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';

interface Body {
  document_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return corsJsonResponse({ error: 'Authorization required' }, req, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) return corsJsonResponse({ error: 'Unauthorized' }, req, 401);

    const { document_id } = (await req.json()) as Body;
    if (!document_id) return corsJsonResponse({ error: 'document_id is required' }, req, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: doc, error: docErr } = await admin
      .from('documents')
      .select('id, name, workspace_id, document_type, category, uploaded_by')
      .eq('id', document_id)
      .single();
    if (docErr || !doc) return corsJsonResponse({ error: 'Document not found' }, req, 404);

    // Caller must have access to this workspace.
    const { data: hasAccess } = await admin.rpc('has_workspace_access', {
      _user_id: user.id,
      _workspace_id: doc.workspace_id,
    });
    if (!hasAccess) return corsJsonResponse({ error: 'Access denied' }, req, 403);

    // Startup name for the message
    const { data: ws } = await admin
      .from('workspaces')
      .select('startup:startups(name)')
      .eq('id', doc.workspace_id)
      .single();
    const startupName = (ws?.startup as any)?.name || 'A startup';

    // Reviewers = active consultors + external mentors on this workspace.
    // Skip the uploader so they don't get notified about their own upload.
    const { data: reviewers } = await admin
      .from('workspace_users')
      .select('user_id, role')
      .eq('workspace_id', doc.workspace_id)
      .eq('active', true)
      .in('role', ['consultor', 'mentor_externo']);

    const rows = (reviewers || [])
      .filter((r) => r.user_id && r.user_id !== doc.uploaded_by)
      .map((r) => ({
        user_id: r.user_id,
        type: 'document_uploaded',
        title: `Novo documento: ${doc.name}`,
        message: `${startupName} ${doc.document_type === 'link' ? 'partilhou um link' : 'submeteu um documento'}${doc.category ? ` (${doc.category})` : ''}.`,
        link: `/workspace/${doc.workspace_id}?tab=documents&document=${doc.id}`,
        entity_type: 'document',
        entity_id: doc.id,
        metadata: {
          workspace_id: doc.workspace_id,
          document_name: doc.name,
          startup_name: startupName,
          category: doc.category,
          document_type: doc.document_type,
        },
      }));

    if (rows.length) {
      const { error: insErr } = await admin.from('notifications').insert(rows);
      if (insErr) {
        console.error('[notify-document-uploaded] insert failed', insErr);
        return corsJsonResponse({ error: insErr.message }, req, 500);
      }
    }

    return corsJsonResponse({ success: true, notified: rows.length }, req, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[notify-document-uploaded] error', msg);
    return corsJsonResponse({ error: msg }, req, 500);
  }
});
