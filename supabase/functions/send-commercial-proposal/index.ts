/**
 * Edge Function: send-commercial-proposal
 *
 * Sends a commercial proposal email to a CRM lead:
 *   • Custom subject + body (written by the consultant in the CRM drawer).
 *   • Signed download links (7 days) for each selected `support_materials` row
 *     tied to the chosen program — used to attach the minuta contratual /
 *     regulamento without needing real file attachments.
 *   • Advances the funnel item to stage `proposal_sent`.
 *   • Logs a funnel_event, a communication_log row, and a 7-day staff_tasks
 *     follow-up for the lead's owner consultant.
 *
 * Auth: staff-only (admin / consultor / backoffice) via requireCronOrStaff.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import { requireCronOrStaff } from '../_shared/security.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const SUPPORT_MATERIALS_BUCKET = 'support-materials';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const FOLLOWUP_DAYS = 7;

function escapeHtml(text: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (c) => entities[c] || c);
}

function paragraphsToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((chunk) => {
      const safe = escapeHtml(chunk).replace(/\n/g, '<br/>');
      return `<p style="margin:0 0 12px;line-height:1.55;">${safe}</p>`;
    })
    .join('');
}

interface Attachment {
  id: string;
  title: string;
  url: string;
  filename: string | null;
}

interface RequestBody {
  funnel_item_id: string;
  program_id: string | null;
  subject: string;
  body_text: string;
  support_material_ids: string[];
  cc_owner?: boolean;
  idempotency_key?: string;
}

function validateBody(raw: unknown): { valid: true; data: RequestBody } | { valid: false; error: string } {
  if (!raw || typeof raw !== 'object') return { valid: false, error: 'Invalid body' };
  const b = raw as Record<string, unknown>;
  if (typeof b.funnel_item_id !== 'string' || b.funnel_item_id.length < 8) {
    return { valid: false, error: 'funnel_item_id required' };
  }
  const programId =
    typeof b.program_id === 'string' && b.program_id.length > 8 ? b.program_id : null;
  const subject = typeof b.subject === 'string' ? b.subject.trim() : '';
  if (subject.length < 3 || subject.length > 300) {
    return { valid: false, error: 'subject must be between 3 and 300 characters' };
  }
  const bodyText = typeof b.body_text === 'string' ? b.body_text.trim() : '';
  if (bodyText.length < 10 || bodyText.length > 10_000) {
    return { valid: false, error: 'body_text must be between 10 and 10000 characters' };
  }
  const ids = Array.isArray(b.support_material_ids)
    ? b.support_material_ids.filter((x): x is string => typeof x === 'string')
    : [];
  const idempotencyKey =
    typeof b.idempotency_key === 'string' &&
    /^[a-zA-Z0-9-]{8,64}$/.test(b.idempotency_key)
      ? b.idempotency_key
      : undefined;
  return {
    valid: true,
    data: {
      funnel_item_id: b.funnel_item_id,
      program_id: programId,
      subject,
      body_text: bodyText,
      support_material_ids: ids.slice(0, 20),
      cc_owner: b.cc_owner === true,
      idempotency_key: idempotencyKey,
    },
  };
}

function renderEmailHtml(opts: {
  contactName: string;
  bodyHtml: string;
  attachments: Attachment[];
  senderName: string;
  senderEmail: string;
  programName: string | null;
}): string {
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://fb.startupleiria.com';
  const greeting = opts.contactName
    ? `Olá ${escapeHtml(opts.contactName)},`
    : 'Olá,';

  const attachmentsBlock =
    opts.attachments.length === 0
      ? ''
      : `
        <div style="margin:24px 0 8px;padding:16px 18px;border:1px solid #eaeaea;border-radius:8px;background:#fafafa">
          <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#333;text-transform:uppercase;letter-spacing:.03em">
            Documentos anexos
          </p>
          <ul style="list-style:none;padding:0;margin:0;">
            ${opts.attachments
              .map(
                (a) => `
              <li style="margin:6px 0;">
                <a href="${a.url}" style="color:#c82333;text-decoration:none;font-weight:500;">
                  📎 ${escapeHtml(a.title)}
                </a>
                <span style="color:#888;font-size:12px;margin-left:6px;">
                  (link válido 7 dias)
                </span>
              </li>`,
              )
              .join('')}
          </ul>
        </div>`;

  const programLine = opts.programName
    ? `<p style="margin:0 0 8px;font-size:13px;color:#666;">Programa: <strong>${escapeHtml(opts.programName)}</strong></p>`
    : '';

  return `
    <div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1a1a2e;background:#ffffff">
      <div style="border-bottom:3px solid #c82333;padding-bottom:16px;margin-bottom:20px;">
        <h1 style="margin:0;font-size:22px;color:#1a1a2e">Proposta Comercial</h1>
        ${programLine}
      </div>

      <p style="margin:0 0 16px;font-size:15px;">${greeting}</p>

      ${opts.bodyHtml}

      ${attachmentsBlock}

      <div style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;font-size:13px;color:#555;">
        <p style="margin:0 0 4px;"><strong>${escapeHtml(opts.senderName)}</strong></p>
        <p style="margin:0 0 4px;">Startup Leiria</p>
        <p style="margin:0;"><a href="mailto:${escapeHtml(opts.senderEmail)}" style="color:#c82333">${escapeHtml(opts.senderEmail)}</a></p>
      </div>

      <p style="margin-top:24px;font-size:11px;color:#aaa;text-align:center;">
        Enviado por <a href="${appUrl}" style="color:#aaa;text-decoration:none;">Startup Leiria</a>
      </p>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const supabaseUserClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const authCheck = await requireCronOrStaff(req, supabaseUserClient, admin);
    if ('error' in authCheck) return authCheck.error;
    const senderUserId = authCheck.userId || null;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = validateBody(raw);
    if (!parsed.valid) {
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = parsed.data;

    // Load the funnel item.
    const { data: item, error: itemErr } = await admin
      .from('funnel_items')
      .select(
        'id, contact_name, contact_email, organization_name, owner_consultant_id, program_id, stage, metadata_json',
      )
      .eq('id', body.funnel_item_id)
      .maybeSingle();

    if (itemErr || !item) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!item.contact_email) {
      return new Response(JSON.stringify({ error: 'Lead has no contact email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const programId = body.program_id || item.program_id || null;
    let programName: string | null = null;
    if (programId) {
      const { data: prog } = await admin
        .from('programs')
        .select('name')
        .eq('id', programId)
        .maybeSingle();
      programName = prog?.name ?? null;
    }

    // Load requested support materials and generate signed URLs.
    const attachments: Attachment[] = [];
    if (body.support_material_ids.length > 0) {
      const { data: materials } = await admin
        .from('support_materials')
        .select('id, title, file_path, program_id, status')
        .in('id', body.support_material_ids);

      for (const m of materials ?? []) {
        if (!m.file_path) continue;
        if (m.status !== 'approved') continue;
        // Enforce scope: material must be global or belong to selected program.
        if (m.program_id && programId && m.program_id !== programId) continue;
        const { data: signed, error: signErr } = await admin.storage
          .from(SUPPORT_MATERIALS_BUCKET)
          .createSignedUrl(m.file_path, SIGNED_URL_TTL_SECONDS);
        if (signErr || !signed?.signedUrl) {
          console.warn('[send-commercial-proposal] Failed to sign', m.id, signErr);
          continue;
        }
        const filename = m.file_path.split('/').pop() ?? null;
        attachments.push({ id: m.id, title: m.title, url: signed.signedUrl, filename });
      }
    }

    // Resolve sender identity (fallback to Startup Leiria).
    let senderName = 'Equipa Startup Leiria';
    let senderEmail = 'contacto@startupleiria.com';
    if (senderUserId) {
      const { data: profile } = await admin
        .from('profiles')
        .select('full_name, email')
        .eq('id', senderUserId)
        .maybeSingle();
      if (profile?.full_name) senderName = profile.full_name;
      if (profile?.email) senderEmail = profile.email;
    }

    const html = renderEmailHtml({
      contactName: item.contact_name ?? '',
      bodyHtml: paragraphsToHtml(body.body_text),
      attachments,
      senderName,
      senderEmail,
      programName,
    });

    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    const toList = [item.contact_email];
    const cc = body.cc_owner && senderEmail ? [senderEmail] : undefined;

    const { data: emailResult, error: emailErr } = await resend.emails.send({
      from: 'Startup Leiria <noreply@startupleiria.com>',
      reply_to: senderEmail,
      to: toList,
      cc,
      subject: body.subject,
      html,
    });

    if (emailErr) {
      console.error('[send-commercial-proposal] Resend error', emailErr);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: emailErr }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const nowIso = new Date().toISOString();

    // Merge existing metadata with proposal record.
    const existingMeta =
      (item.metadata_json && typeof item.metadata_json === 'object'
        ? (item.metadata_json as Record<string, unknown>)
        : {}) ?? {};
    const proposalMeta = {
      subject: body.subject,
      program_id: programId,
      program_name: programName,
      body_text: body.body_text,
      attachment_ids: attachments.map((a) => a.id),
      attachment_titles: attachments.map((a) => a.title),
      sent_at: nowIso,
      sent_by: senderUserId,
      sender_name: senderName,
      message_id: emailResult?.id ?? null,
    };

    // Advance to proposal_sent only from earlier stages.
    const EARLY = ['new', 'first_contact_booked', 'met', 'qualified'];
    const nextStage = EARLY.includes(item.stage as string)
      ? 'proposal_sent'
      : item.stage;

    await admin
      .from('funnel_items')
      .update({
        stage: nextStage,
        last_activity_at: nowIso,
        metadata_json: {
          ...existingMeta,
          proposal: proposalMeta,
          last_proposal_sent_at: nowIso,
        },
      })
      .eq('id', item.id);

    await admin.from('funnel_events').insert({
      funnel_item_id: item.id,
      event_type: 'proposal_sent',
      to_stage: nextStage,
      metadata: {
        subject: body.subject,
        program_id: programId,
        attachment_count: attachments.length,
        cc_owner: !!body.cc_owner,
      },
    });

    // Communication log (best-effort).
    try {
      await admin.from('communication_log').insert({
        funnel_item_id: item.id,
        direction: 'outbound',
        channel: 'email',
        activity_type: 'commercial_proposal_sent',
        subject: body.subject,
        body: body.body_text,
        preview: body.body_text.slice(0, 200),
        from_address: senderEmail,
        occurred_at: nowIso,
        metadata_json: {
          kind: 'commercial_proposal',
          recipient_email: item.contact_email,
          sender_user_id: senderUserId,
          attachments: attachments.map((a) => ({ id: a.id, title: a.title })),
          message_id: emailResult?.id ?? null,
        },
      });
    } catch (e) {
      console.warn('[send-commercial-proposal] communication_log insert failed', e);
    }

    // Follow-up staff_task (7 days).
    const followupOwner = item.owner_consultant_id || senderUserId;
    if (followupOwner) {
      const dueDate = new Date(Date.now() + FOLLOWUP_DAYS * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      try {
        await admin.from('staff_tasks').insert({
          title: `Follow-up proposta — ${item.contact_name ?? item.contact_email}`,
          description: `Confirmar receção e responder a dúvidas sobre a proposta enviada em ${nowIso.slice(0, 10)}.`,
          task_type: 'crm_followup',
          assignee_id: followupOwner,
          due_date: dueDate,
          priority: 'medium',
          status: 'open',
          created_by: senderUserId,
          metadata: {
            funnel_item_id: item.id,
            kind: 'proposal_followup',
          },
        });
      } catch (e) {
        console.warn('[send-commercial-proposal] staff_tasks insert failed', e);
      }
    }

    // Non-blocking email_log entry for observability.
    try {
      await admin.from('email_log').insert({
        email_type: 'commercial_proposal',
        subject: body.subject,
        recipients: JSON.stringify([item.contact_email]),
        status: 'sent',
        sent_at: nowIso,
        created_by: senderUserId,
      });
    } catch {
      /* non-blocking */
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId: emailResult?.id ?? null,
        stage: nextStage,
        attachments: attachments.map((a) => ({ id: a.id, title: a.title })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[send-commercial-proposal] error', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
