/**
 * Unified transactional dispatcher for event-driven notifications.
 * Handles: contract_signed, contract_activated, document_review_requested,
 * document_review_approved, consultant_assigned, mentor_request_accepted,
 * mentor_request_declined, activity_mention.
 *
 * Each call sends localized (PT/EN) email via Resend to a resolved recipient
 * set, and optionally pushes a Slack notification through the existing
 * send-slack-notification function (which reads notification_preferences).
 *
 * Auth: cron secret OR authenticated user (staff / server-side callers).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireCronOrStaff, generateRequestId, createLogger } from '../_shared/security.ts';
import { resolveLocalesByUserIds, type Locale } from '../_shared/i18n.ts';

const FUNCTION_NAME = 'send-notification-email';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const APP_URL = Deno.env.get('PUBLIC_APP_URL') || 'https://fb.startupleiria.com';
const FROM = 'Startup Leiria <noreply@startupleiria.com>';
const BRAND = 'Startup Leiria';

type NotificationType =
  | 'contract_signed'
  | 'contract_activated'
  | 'document_review_requested'
  | 'document_review_approved'
  | 'consultant_assigned'
  | 'mentor_request_accepted'
  | 'mentor_request_declined'
  | 'activity_mention';

interface NotificationRequest {
  type: NotificationType;
  workspace_id?: string | null;
  // event-specific payloads
  contract_id?: string;
  document_id?: string;
  review_id?: string;
  consultant_id?: string;
  mentor_request_id?: string;
  decline_reason?: string | null;
  mention?: {
    mentioned_user_id: string;
    author_id: string;
    text: string;
    context_url?: string;
  };
}

// ---------- copy ----------
const T = {
  pt: {
    footer: 'Gerir preferências',
    view: 'Abrir',
    greeting: (n: string) => `Olá ${n},`,
    contractSignedSubject: (s: string) => `[${s}] Contrato assinado`,
    contractSignedTitle: '✍️ Contrato assinado',
    contractSignedBody: (s: string) =>
      `O contrato da <strong>${s}</strong> foi assinado por todas as partes.`,
    contractActivatedSubject: (s: string) => `[${s}] Contrato ativado`,
    contractActivatedTitle: '🚀 Contrato ativado',
    contractActivatedBody: (s: string) =>
      `O contrato da <strong>${s}</strong> está agora ativo. A incubação foi iniciada.`,
    docReviewRequestedSubject: (s: string) => `[${s}] Novo pedido de revisão de documento`,
    docReviewRequestedTitle: '📄 Documento aguarda revisão',
    docReviewRequestedBody: (s: string, doc: string) =>
      `A startup <strong>${s}</strong> submeteu <strong>${doc}</strong> para revisão.`,
    docReviewApprovedSubject: (doc: string) => `[Startup Leiria] Documento aprovado: ${doc}`,
    docReviewApprovedTitle: '✅ Documento aprovado',
    docReviewApprovedBody: (doc: string) =>
      `O documento <strong>${doc}</strong> foi aprovado pela equipa.`,
    consultantAssignedSubject: (s: string) => `[${s}] Foste atribuído/a a esta startup`,
    consultantAssignedTitle: '👋 Nova atribuição',
    consultantAssignedBody: (s: string) =>
      `Passaste a ser o/a consultor/a responsável pela <strong>${s}</strong>.`,
    mentorAcceptedSubject: '🎯 Pedido de mentoria aceite',
    mentorAcceptedTitle: '🎯 Pedido de mentoria aceite',
    mentorAcceptedBody: (m: string) =>
      `O teu pedido de mentoria foi aceite. <strong>${m}</strong> vai apoiar-te.`,
    mentorDeclinedSubject: 'Pedido de mentoria — atualização',
    mentorDeclinedTitle: 'ℹ️ Pedido de mentoria não atribuído',
    mentorDeclinedBody:
      'O teu pedido de mentoria não foi atribuído desta vez. A equipa vai contactar-te.',
    mentionSubject: (a: string) => `${a} mencionou-te em Startup Leiria`,
    mentionTitle: '💬 Foste mencionado/a',
    mentionBody: (a: string) => `<strong>${a}</strong> mencionou-te num comentário.`,
    reasonLabel: 'Motivo',
    fallbackName: 'Utilizador',
    unknownStartup: 'a startup',
    unknownDoc: 'o documento',
    unknownMentor: 'O mentor',
    unknownAuthor: 'Alguém',
  },
  en: {
    footer: 'Manage preferences',
    view: 'Open',
    greeting: (n: string) => `Hi ${n},`,
    contractSignedSubject: (s: string) => `[${s}] Contract signed`,
    contractSignedTitle: '✍️ Contract signed',
    contractSignedBody: (s: string) =>
      `The <strong>${s}</strong> contract has been signed by all parties.`,
    contractActivatedSubject: (s: string) => `[${s}] Contract activated`,
    contractActivatedTitle: '🚀 Contract activated',
    contractActivatedBody: (s: string) =>
      `The <strong>${s}</strong> contract is now active. Incubation has started.`,
    docReviewRequestedSubject: (s: string) => `[${s}] New document review request`,
    docReviewRequestedTitle: '📄 Document awaits review',
    docReviewRequestedBody: (s: string, doc: string) =>
      `<strong>${s}</strong> submitted <strong>${doc}</strong> for review.`,
    docReviewApprovedSubject: (doc: string) => `[Startup Leiria] Document approved: ${doc}`,
    docReviewApprovedTitle: '✅ Document approved',
    docReviewApprovedBody: (doc: string) =>
      `The document <strong>${doc}</strong> was approved by the team.`,
    consultantAssignedSubject: (s: string) => `[${s}] You have been assigned`,
    consultantAssignedTitle: '👋 New assignment',
    consultantAssignedBody: (s: string) =>
      `You are now the consultant in charge of <strong>${s}</strong>.`,
    mentorAcceptedSubject: '🎯 Mentor request accepted',
    mentorAcceptedTitle: '🎯 Mentor request accepted',
    mentorAcceptedBody: (m: string) =>
      `Your mentor request has been accepted. <strong>${m}</strong> will support you.`,
    mentorDeclinedSubject: 'Mentor request — update',
    mentorDeclinedTitle: 'ℹ️ Mentor request not fulfilled',
    mentorDeclinedBody:
      "Your mentor request was not fulfilled this time. The team will reach out.",
    mentionSubject: (a: string) => `${a} mentioned you on Startup Leiria`,
    mentionTitle: '💬 You were mentioned',
    mentionBody: (a: string) => `<strong>${a}</strong> mentioned you in a comment.`,
    reasonLabel: 'Reason',
    fallbackName: 'User',
    unknownStartup: 'the startup',
    unknownDoc: 'the document',
    unknownMentor: 'The mentor',
    unknownAuthor: 'Someone',
  },
} as const;

// ---------- render ----------
function shell(locale: Locale, title: string, body: string, ctaUrl: string, ctaLabel: string, extra = ''): string {
  const s = T[locale];
  const htmlLang = locale === 'pt' ? 'pt-PT' : 'en';
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#c8e53d 0%,#c03c3c 100%);padding:30px;border-radius:12px 12px 0 0;">
    <h1 style="color:white;margin:0;font-size:22px;">${title}</h1>
    <p style="color:rgba(255,255,255,0.9);margin:5px 0 0 0;">${BRAND}</p>
  </div>
  <div style="background:#f9f9f9;padding:30px;border-radius:0 0 12px 12px;">
    ${body}
    ${extra}
    <div style="text-align:center;margin-top:30px;">
      <a href="${ctaUrl}" style="display:inline-block;background:#c03c3c;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;">${ctaLabel}</a>
    </div>
    <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">
    <p style="color:#666;font-size:12px;text-align:center;margin-bottom:0;">
      <a href="${APP_URL}/settings" style="color:#c03c3c;">${s.footer}</a>
    </p>
  </div>
</body>
</html>`;
}

// Resend allows ~2 requests/second. Serialize sends with a small gap and
// retry on 429 / 5xx with exponential backoff so recipients are not dropped.
const MIN_SEND_GAP_MS = 600;
const MAX_SEND_ATTEMPTS = 4;
let lastSendAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendEmail(supabase: any, log: any, args: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!RESEND_API_KEY) {
    log.warn('RESEND_API_KEY not set — email skipped', { to: args.to });
    return false;
  }

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    // Throttle: keep a minimum gap between outbound requests.
    const wait = MIN_SEND_GAP_MS - (Date.now() - lastSendAt);
    if (wait > 0) await sleep(wait);
    lastSendAt = Date.now();

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: FROM, to: [args.to], subject: args.subject, html: args.html }),
      });
      if (res.ok) return true;

      const text = await res.text();
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < MAX_SEND_ATTEMPTS) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        const backoff = retryAfter > 0 ? retryAfter * 1000 : 800 * Math.pow(2, attempt - 1);
        log.warn('resend_retry', { status: res.status, attempt, backoffMs: backoff });
        await sleep(backoff);
        continue;
      }
      log.warn('resend_error', { status: res.status, attempt, body: text.slice(0, 300) });
      return false;
    } catch (e) {
      if (attempt < MAX_SEND_ATTEMPTS) {
        log.warn('resend_fetch_retry', { attempt, error: String(e) });
        await sleep(800 * Math.pow(2, attempt - 1));
        continue;
      }
      log.warn('resend_fetch_failed', e);
      return false;
    }
  }
  return false;
}

async function pushSlack(supabase: any, log: any, args: {
  workspaceId: string | null | undefined;
  message: string;
  title: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link?: string;
}) {
  if (!args.workspaceId) return;
  try {
    await supabase.functions.invoke('send-slack-notification', {
      body: {
        workspace_id: args.workspaceId,
        message: args.message,
        title: args.title,
        type: args.type,
        link: args.link,
      },
    });
  } catch (e) {
    log.warn('slack_push_failed', e);
  }
}

// ---------- helpers ----------
async function resolveProfile(supabase: any, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('email, full_name, preferred_language')
    .eq('id', userId)
    .single();
  return data ?? null;
}

async function resolveStartupName(supabase: any, workspaceId: string | null | undefined): Promise<string | null> {
  if (!workspaceId) return null;
  const { data } = await supabase
    .from('workspaces')
    .select('startup:startups(name)')
    .eq('id', workspaceId)
    .single();
  return (data as any)?.startup?.name ?? null;
}

async function resolveFounderIds(supabase: any, workspaceId: string | null | undefined): Promise<string[]> {
  if (!workspaceId) return [];
  const { data } = await supabase
    .from('workspace_users')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .eq('role', 'founder');
  return (data ?? []).map((r: any) => r.user_id).filter(Boolean);
}

async function resolveAssignedConsultantId(supabase: any, workspaceId: string | null | undefined): Promise<string | null> {
  if (!workspaceId) return null;
  const { data } = await supabase
    .from('workspaces')
    .select('assigned_consultor_id')
    .eq('id', workspaceId)
    .single();
  return (data as any)?.assigned_consultor_id ?? null;
}

// ---------- handlers ----------
async function handle(supabase: any, log: any, body: NotificationRequest): Promise<{ sent: number }> {
  const type = body.type;
  const workspaceId = body.workspace_id ?? null;
  const startupName = (await resolveStartupName(supabase, workspaceId)) || null;

  let recipients: Array<{ userId: string; email: string; name: string | null; locale: Locale }> = [];
  let subject = '';
  let title = '';
  let bodyHtml = '';
  let ctaUrl = `${APP_URL}/my-workspaces`;
  let slackTitle = '';
  let slackType: 'info' | 'success' | 'warning' | 'error' = 'info';

  const enrich = async (ids: string[]): Promise<typeof recipients> => {
    const localeMap = await resolveLocalesByUserIds(supabase, ids);
    const results: typeof recipients = [];
    for (const id of ids) {
      const p = await resolveProfile(supabase, id);
      if (!p?.email) continue;
      results.push({ userId: id, email: p.email, name: p.full_name, locale: localeMap.get(id) ?? 'pt' });
    }
    return results;
  };

  if (type === 'contract_signed' || type === 'contract_activated') {
    const founders = await resolveFounderIds(supabase, workspaceId);
    const consultantId = await resolveAssignedConsultantId(supabase, workspaceId);
    const ids = [...founders, ...(consultantId ? [consultantId] : [])];
    recipients = await enrich(ids);
    const s = startupName || 'a startup';
    ctaUrl = `${APP_URL}/workspace/${workspaceId}?tab=contracts`;
    slackTitle = type === 'contract_signed' ? 'Contract signed' : 'Contract activated';
    slackType = 'success';

    for (const r of recipients) {
      const c = T[r.locale];
      subject = type === 'contract_signed' ? c.contractSignedSubject(s) : c.contractActivatedSubject(s);
      title = type === 'contract_signed' ? c.contractSignedTitle : c.contractActivatedTitle;
      bodyHtml = `<p>${c.greeting(r.name || c.fallbackName)}</p><p>${
        type === 'contract_signed' ? c.contractSignedBody(s) : c.contractActivatedBody(s)
      }</p>`;
      await sendEmail(supabase, log, { to: r.email, subject, html: shell(r.locale, title, bodyHtml, ctaUrl, c.view) });
    }
    await pushSlack(supabase, log, {
      workspaceId,
      title: slackTitle,
      message: type === 'contract_signed' ? `Contract signed for ${s}` : `Contract activated for ${s}`,
      type: slackType,
      link: ctaUrl,
    });
    return { sent: recipients.length };
  }

  if (type === 'document_review_requested' || type === 'document_review_approved') {
    let docName = 'documento';
    if (body.document_id) {
      const { data } = await supabase.from('documents').select('title, name').eq('id', body.document_id).single();
      docName = (data as any)?.title ?? (data as any)?.name ?? docName;
    }
    if (type === 'document_review_requested') {
      // Recipients: assigned consultant of workspace + admins? Keep it lean: assigned consultant.
      const consultantId = await resolveAssignedConsultantId(supabase, workspaceId);
      if (consultantId) recipients = await enrich([consultantId]);
      slackType = 'info';
      slackTitle = 'Document review requested';
    } else {
      // approved → founders
      const founders = await resolveFounderIds(supabase, workspaceId);
      recipients = await enrich(founders);
      slackType = 'success';
      slackTitle = 'Document approved';
    }
    ctaUrl = `${APP_URL}/workspace/${workspaceId}?tab=documents`;
    const s = startupName || 'a startup';
    for (const r of recipients) {
      const c = T[r.locale];
      subject = type === 'document_review_requested' ? c.docReviewRequestedSubject(s) : c.docReviewApprovedSubject(docName);
      title = type === 'document_review_requested' ? c.docReviewRequestedTitle : c.docReviewApprovedTitle;
      bodyHtml = `<p>${c.greeting(r.name || c.fallbackName)}</p><p>${
        type === 'document_review_requested' ? c.docReviewRequestedBody(s, docName) : c.docReviewApprovedBody(docName)
      }</p>`;
      await sendEmail(supabase, log, { to: r.email, subject, html: shell(r.locale, title, bodyHtml, ctaUrl, c.view) });
    }
    await pushSlack(supabase, log, {
      workspaceId,
      title: slackTitle,
      message: `${slackTitle}: ${docName}`,
      type: slackType,
      link: ctaUrl,
    });
    return { sent: recipients.length };
  }

  if (type === 'consultant_assigned') {
    if (!body.consultant_id) return { sent: 0 };
    recipients = await enrich([body.consultant_id]);
    const s = startupName || 'a startup';
    ctaUrl = `${APP_URL}/workspace/${workspaceId}`;
    for (const r of recipients) {
      const c = T[r.locale];
      await sendEmail(supabase, log, {
        to: r.email,
        subject: c.consultantAssignedSubject(s),
        html: shell(
          r.locale,
          c.consultantAssignedTitle,
          `<p>${c.greeting(r.name || c.fallbackName)}</p><p>${c.consultantAssignedBody(s)}</p>`,
          ctaUrl,
          c.view,
        ),
      });
    }
    return { sent: recipients.length };
  }

  if (type === 'mentor_request_accepted' || type === 'mentor_request_declined') {
    if (!body.mentor_request_id) return { sent: 0 };
    const { data: mr } = await supabase
      .from('mentor_requests')
      .select('requested_by, assigned_mentor_id, workspace_id')
      .eq('id', body.mentor_request_id)
      .single();
    if (!mr) return { sent: 0 };
    const founderId = (mr as any).requested_by;
    recipients = await enrich([founderId]);
    let mentorName: string | null = null;
    if ((mr as any).assigned_mentor_id) {
      const p = await resolveProfile(supabase, (mr as any).assigned_mentor_id);
      mentorName = p?.full_name ?? null;
    }
    ctaUrl = `${APP_URL}/workspace/${(mr as any).workspace_id}?tab=mentors`;
    for (const r of recipients) {
      const c = T[r.locale];
      if (type === 'mentor_request_accepted') {
        await sendEmail(supabase, log, {
          to: r.email,
          subject: c.mentorAcceptedSubject,
          html: shell(
            r.locale,
            c.mentorAcceptedTitle,
            `<p>${c.greeting(r.name || c.fallbackName)}</p><p>${c.mentorAcceptedBody(mentorName || c.unknownMentor)}</p>`,
            ctaUrl,
            c.view,
          ),
        });
      } else {
        const reasonBlock = body.decline_reason
          ? `<p style="color:#666;"><strong>${c.reasonLabel}:</strong> ${body.decline_reason}</p>`
          : '';
        await sendEmail(supabase, log, {
          to: r.email,
          subject: c.mentorDeclinedSubject,
          html: shell(
            r.locale,
            c.mentorDeclinedTitle,
            `<p>${c.greeting(r.name || c.fallbackName)}</p><p>${c.mentorDeclinedBody}</p>${reasonBlock}`,
            ctaUrl,
            c.view,
          ),
        });
      }
    }
    return { sent: recipients.length };
  }

  if (type === 'activity_mention') {
    if (!body.mention) return { sent: 0 };
    const { mentioned_user_id, author_id, text, context_url } = body.mention;
    recipients = await enrich([mentioned_user_id]);
    const author = await resolveProfile(supabase, author_id);
    const authorName = author?.full_name || 'Alguém';
    ctaUrl = context_url || `${APP_URL}/my-workspaces`;
    for (const r of recipients) {
      const c = T[r.locale];
      await sendEmail(supabase, log, {
        to: r.email,
        subject: c.mentionSubject(authorName),
        html: shell(
          r.locale,
          c.mentionTitle,
          `<p>${c.greeting(r.name || c.fallbackName)}</p><p>${c.mentionBody(authorName)}</p><blockquote style="border-left:3px solid #c8e53d;padding:8px 12px;margin:12px 0;color:#555;background:#fff;">${text.slice(0, 500)}</blockquote>`,
          ctaUrl,
          c.view,
        ),
      });
    }
    return { sent: recipients.length };
  }

  return { sent: 0 };
}

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } },
  );
  const auth = await requireCronOrStaff(req, supabaseUser, supabaseAdmin);
  if ('error' in auth) return auth.error;

  try {
    const body = (await req.json()) as NotificationRequest;
    if (!body?.type) return corsJsonResponse({ error: 'type required' }, req, 400);
    log.info('dispatch', { type: body.type, workspace_id: body.workspace_id });
    const result = await handle(supabaseAdmin, log, body);
    return corsJsonResponse({ success: true, ...result }, req);
  } catch (e) {
    log.error('fatal', e);
    const msg = e instanceof Error ? e.message : 'Unknown';
    return corsJsonResponse({ error: msg }, req, 500);
  }
});
