// generate-first-contact-brief
// Staff-only. Assembles a structured, source-tagged brief for a funnel_item
// using booking form answers, prior communications, and (when present) the
// cached pitch-deck analysis. Never mutates stage/tier/owner — it only writes
// funnel_items.metadata_json.ai_brief for staff review.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

interface Body { funnel_item_id: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsOptions(req);
  const cors = getCorsHeaders(req);
  const jsonHeaders = { ...cors, 'Content-Type': 'application/json' };

  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const sbSvc = createClient(url, svc);

    const { data: userData } = await sbUser.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

    const { data: roles } = await sbSvc.from('user_roles').select('role').eq('user_id', uid);
    const isStaff = (roles ?? []).some((r: any) => r.role === 'admin' || r.role === 'consultant');
    if (!isStaff) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: jsonHeaders });

    const body = await req.json() as Body;
    if (!body?.funnel_item_id) return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: jsonHeaders });

    const { data: item, error: itemErr } = await sbSvc
      .from('funnel_items')
      .select('id, organization_name, contact_name, contact_email, phone, stage, program_id, metadata_json')
      .eq('id', body.funnel_item_id)
      .maybeSingle();
    if (itemErr || !item) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: jsonHeaders });

    const meta = (item.metadata_json ?? {}) as any;
    const bookingForm = meta?.booking?.form ?? null;
    const pitchAnalysis = meta?.pitch_analysis ?? null;

    // Timeline (last 30 entries)
    const { data: comms } = await sbSvc
      .from('communication_log')
      .select('kind, direction, subject, summary, occurred_at, original_timestamp')
      .eq('funnel_item_id', item.id)
      .order('occurred_at', { ascending: false })
      .limit(30);

    // Assemble the input context that the model would receive.
    // We stop short of calling an LLM here on purpose: the goal in this phase
    // is a deterministic, staff-approvable brief scaffold with source tags.
    // A follow-up phase can plug the Lovable AI Gateway once the review UI
    // has proven itself. Every bullet must carry a `source` — no anonymous
    // AI claims are stored.
    const evidence: Array<{ source: string; value: unknown }> = [];
    if (bookingForm) evidence.push({ source: 'booking_form', value: bookingForm });
    if (pitchAnalysis) evidence.push({ source: 'pitch_deck', value: pitchAnalysis });
    if (comms && comms.length) evidence.push({ source: 'communication_log', value: comms });

    const factual: string[] = [];
    if (item.organization_name) factual.push(`Organização: ${item.organization_name} [source: funnel_items]`);
    if (item.contact_name) factual.push(`Contacto: ${item.contact_name} [source: funnel_items]`);
    if (item.contact_email) factual.push(`Email: ${item.contact_email} [source: funnel_items]`);
    if (bookingForm?.stage) factual.push(`Fase declarada: ${bookingForm.stage} [source: booking_form]`);
    if (bookingForm?.what_you_need) factual.push(`Necessidade: ${bookingForm.what_you_need} [source: booking_form]`);

    const missing: string[] = [];
    if (!bookingForm?.website) missing.push('Website não indicado [source: booking_form]');
    if (!item.phone) missing.push('Telefone em falta [source: funnel_items]');
    if (!pitchAnalysis) missing.push('Sem pitch deck analisado [source: pitch_deck]');

    const nextSteps: string[] = [
      'Confirmar dados essenciais na primeira chamada [source: staff_playbook]',
    ];
    if (!pitchAnalysis) nextSteps.push('Pedir pitch deck antes da reunião [source: staff_playbook]');
    if (!bookingForm?.website) nextSteps.push('Validar presença online no arranque [source: staff_playbook]');

    const brief = {
      generated_at: new Date().toISOString(),
      generated_by: uid,
      confidence: pitchAnalysis ? 'medium' : 'low',
      sections: {
        factual_summary: factual,
        confirmed_vs_claimed: { confirmed: factual, claimed: bookingForm ? Object.keys(bookingForm) : [] },
        missing_information: missing,
        fit_signals: bookingForm?.stage ? [`Stage declarado: ${bookingForm.stage}`] : [],
        risks: missing.length > 3 ? ['Muitos dados em falta — qualificação parcial'] : [],
        discovery_questions: [
          'Qual é a métrica principal que estão a otimizar este trimestre?',
          'Que decisão precisam de tomar após esta conversa?',
        ],
        recommended_next_step: nextSteps,
      },
      evidence,
    };

    // Merge into funnel_items.metadata_json.ai_brief (non-destructive)
    const nextMeta = { ...meta, ai_brief: brief };
    const { error: updErr } = await sbSvc
      .from('funnel_items')
      .update({ metadata_json: nextMeta })
      .eq('id', item.id);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ success: true, brief }), { headers: jsonHeaders });
  } catch (e: any) {
    console.error('generate-first-contact-brief error', e?.message ?? e);
    return new Response(JSON.stringify({ error: 'internal_error', message: e?.message ?? String(e) }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
