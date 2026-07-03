import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { documentUploadedKey } from '../_shared/notificationEventKey.ts';
import { resolveLocalesByUserIds, type Locale } from '../_shared/i18n.ts';

const STRINGS = {
  pt: {
    title: (n: string) => `Novo documento: ${n}`,
    submittedLink: (s: string) => `${s} partilhou um link`,
    submittedDoc: (s: string) => `${s} submeteu um documento`,
    categorySuffix: (c: string) => ` (${c})`,
    period: '.',
  },
  en: {
    title: (n: string) => `New document: ${n}`,
    submittedLink: (s: string) => `${s} shared a link`,
    submittedDoc: (s: string) => `${s} submitted a document`,
    categorySuffix: (c: string) => ` (${c})`,
    period: '.',
  },
} as const;


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

    const reviewerIds = (reviewers || [])
      .map((r) => r.user_id as string)
      .filter((id) => id && id !== doc.uploaded_by);

    const localeMap = await resolveLocalesByUserIds(admin, reviewerIds);

    const rows = reviewerIds.map((userId) => {
      const locale: Locale = localeMap.get(userId) ?? 'pt';
      const s = STRINGS[locale];
      const verb = doc.document_type === 'link' ? s.submittedLink(startupName) : s.submittedDoc(startupName);
      return {
        user_id: userId,
        type: 'document_uploaded',
        title: s.title(doc.name),
        message: `${verb}${doc.category ? s.categorySuffix(doc.category) : ''}${s.period}`,
        link: `/workspace/${doc.workspace_id}?tab=documents&document=${doc.id}`,
        entity_type: 'document',
        entity_id: doc.id,
        event_key: documentUploadedKey(doc.id, userId),
        metadata: {
          workspace_id: doc.workspace_id,
          document_name: doc.name,
          startup_name: startupName,
          category: doc.category,
          document_type: doc.document_type,
          locale,
        },
      };
    });


    if (rows.length) {
      // Cannot use upsert onConflict here — the unique index on (user_id, event_key)
      // is partial (WHERE event_key IS NOT NULL) and Postgres can't infer it for
      // ON CONFLICT via supabase-js. Do a manual dedupe: fetch existing keys, then insert.
      const eventKeys = rows.map((r) => r.event_key).filter(Boolean) as string[];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: existing, error: exErr } = await admin
        .from('notifications')
        .select('user_id,event_key')
        .in('user_id', userIds)
        .in('event_key', eventKeys);
      if (exErr) {
        console.error('[notify-document-uploaded] dedupe select failed', exErr);
        return corsJsonResponse({ error: exErr.message }, req, 500);
      }
      const seen = new Set((existing ?? []).map((r: any) => `${r.user_id}|${r.event_key}`));
      const toInsert = rows.filter((r) => !seen.has(`${r.user_id}|${r.event_key}`));
      if (toInsert.length) {
        const { error: insErr } = await admin.from('notifications').insert(toInsert);
        if (insErr) {
          console.error('[notify-document-uploaded] insert failed', insErr);
          return corsJsonResponse({ error: insErr.message }, req, 500);
        }
      }
    }

    return corsJsonResponse({ success: true, notified: rows.length }, req, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[notify-document-uploaded] error', msg);
    return corsJsonResponse({ error: msg }, req, 500);
  }
});
