/**
 * send-survey-invites
 *
 * Sends the baseline ecosystem survey invitation, in Vítor Ferreira's name, to
 * every startup enrolled in a campaign that has not submitted yet.
 *
 * Two flavours of the same email:
 *  - recipient already has an account -> "answer the survey"
 *  - recipient has no account yet     -> "create your account, claim your
 *    startup and answer the survey" (the address is added to the signup
 *    allowlist so registration is possible).
 *
 * Staff-only. Resend returns { data, error } and never throws, so every send is
 * checked explicitly.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireCronOrStaff, generateRequestId, createLogger } from '../_shared/security.ts';

const FUNCTION_NAME = 'send-survey-invites';
const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

const SENDER_NAME = 'Vítor Ferreira | Startup Leiria';
const SENDER_EMAIL = 'noreply@startupleiria.com';
const REPLY_TO = 'vitor.ferreira@startupleiria.com';
const SIGNATURE_NAME = 'Vítor Ferreira';
const SIGNATURE_ROLE = 'Startup Leiria';

interface Body {
  campaign_id: string;
  dry_run?: boolean;
}

interface Recipient {
  email: string;
  name: string | null;
  registered: boolean;
  startups: string[];
  instanceIds: string[];
}

function escapeHtml(text: string): string {
  const m: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (c) => m[c] || c);
}

function buildEmail(
  recipient: Recipient,
  campaignName: string,
  deadline: string | null,
  appUrl: string,
): { subject: string; html: string } {
  const greetingName = recipient.name ? ` ${escapeHtml(recipient.name.split(' ')[0])}` : '';
  const startupLabel = recipient.startups.length === 1
    ? escapeHtml(recipient.startups[0])
    : escapeHtml(recipient.startups.join(', '));
  const ctaUrl = recipient.registered
    ? `${appUrl}/my-workspaces`
    : `${appUrl}/login?mode=signup&email=${encodeURIComponent(recipient.email)}`;
  const ctaLabel = recipient.registered ? 'Responder ao inquérito' : 'Criar conta e responder';

  const steps = recipient.registered
    ? `<ol style="margin:0;padding-left:20px;color:#333">
         <li>Entre na plataforma com a sua conta.</li>
         <li>No painel da sua startup, abra o inquérito <strong>${escapeHtml(campaignName)}</strong>.</li>
         <li>Confirme ou atualize os dados e submeta.</li>
       </ol>`
    : `<ol style="margin:0;padding-left:20px;color:#333">
         <li>Crie a sua conta com este endereço de email (${escapeHtml(recipient.email)}).</li>
         <li>Associe-se à sua startup (${startupLabel}).</li>
         <li>Preencha o inquérito <strong>${escapeHtml(campaignName)}</strong> — leva poucos minutos.</li>
       </ol>`;

  const subject = recipient.registered
    ? `${campaignName} — precisamos dos dados da ${recipient.startups[0] ?? 'sua startup'}`
    : `Registo na plataforma Startup Leiria + dados da ${recipient.startups[0] ?? 'sua startup'}`;

  const html = `
  <!DOCTYPE html>
  <html lang="pt-PT">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
    <div style="background:linear-gradient(135deg,#c8e53d 0%,#c03c3c 100%);padding:28px;border-radius:12px 12px 0 0">
      <h1 style="color:#fff;margin:0;font-size:22px">Startup Leiria</h1>
      <p style="color:rgba(255,255,255,.9);margin:6px 0 0">${escapeHtml(campaignName)}</p>
    </div>
    <div style="background:#f9f9f9;padding:28px;border-radius:0 0 12px 12px">
      <p style="margin-top:0">Olá${greetingName},</p>
      <p>Estamos a consolidar numa única plataforma os dados do ecossistema Startup Leiria, para conseguirmos
         acompanhar melhor cada startup e reportar o impacto do ecossistema com números fiáveis.</p>
      <p>Peço-lhe alguns minutos para ${recipient.registered ? 'responder' : 'se registar e responder'} ao inquérito de dados base
         relativo a <strong>${startupLabel}</strong>.</p>
      <div style="background:#fff;padding:18px;border-radius:8px;border-left:4px solid #c03c3c;margin:20px 0">
        ${steps}
      </div>
      ${deadline ? `<p style="color:#666;font-size:14px">Data limite para resposta: <strong>${escapeHtml(deadline)}</strong>.</p>` : ''}
      <div style="text-align:center;margin:28px 0 8px">
        <a href="${ctaUrl}" style="display:inline-block;background:#c03c3c;color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:600">
          ${ctaLabel}
        </a>
      </div>
      <p style="font-size:13px;color:#666">Se já respondeu ou se este email não lhe diz respeito, pode ignorá-lo.
         Qualquer dúvida, responda diretamente a esta mensagem.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:26px 0">
      <p style="margin:0;color:#333">Com os melhores cumprimentos,<br>
        <strong>${SIGNATURE_NAME}</strong><br>
        <span style="color:#666;font-size:13px">${SIGNATURE_ROLE}</span>
      </p>
    </div>
  </body>
  </html>`;

  return { subject, html };
}

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  if (req.method === 'OPTIONS') return handleCorsOptions(req);
  const cors = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    const authCheck = await requireCronOrStaff(req, userClient, admin);
    if ('error' in authCheck) return authCheck.error;

    if (!Deno.env.get('RESEND_API_KEY')) {
      return corsJsonResponse({ error: 'email_not_configured' }, req, 500);
    }

    const body = (await req.json()) as Body;
    if (!body?.campaign_id) {
      return corsJsonResponse({ error: 'campaign_id_required' }, req, 400);
    }
    const dryRun = body.dry_run === true;

    const { data: campaign, error: campaignError } = await admin
      .from('survey_campaigns')
      .select('id, name, status, ends_at')
      .eq('id', body.campaign_id)
      .maybeSingle();
    if (campaignError) throw campaignError;
    if (!campaign) return corsJsonResponse({ error: 'campaign_not_found' }, req, 404);

    const { data: instances, error: instancesError } = await admin
      .from('survey_instances')
      .select('id, workspace_id, status')
      .eq('campaign_id', campaign.id)
      .neq('status', 'submitted');
    if (instancesError) throw instancesError;
    if (!instances || instances.length === 0) {
      return corsJsonResponse({ sent: 0, recipients: 0, skipped: 0, failures: [] }, req, 200);
    }

    const workspaceIds = instances.map((i) => i.workspace_id);

    const { data: workspaces, error: wsError } = await admin
      .from('workspaces')
      .select('id, startup_id')
      .in('id', workspaceIds);
    if (wsError) throw wsError;

    const startupIds = [...new Set((workspaces || []).map((w) => w.startup_id).filter(Boolean))] as string[];
    const { data: startups, error: startupsError } = await admin
      .from('startups')
      .select('id, name, main_contact_name, main_contact_email')
      .in('id', startupIds);
    if (startupsError) throw startupsError;

    const { data: members, error: membersError } = await admin
      .from('workspace_users')
      .select('workspace_id, user_id, role, active')
      .in('workspace_id', workspaceIds)
      .eq('active', true)
      .in('role', ['founder', 'team_member']);
    if (membersError) throw membersError;

    const memberIds = [...new Set((members || []).map((m) => m.user_id))];
    let profilesById = new Map<string, { email: string | null; full_name: string | null }>();
    if (memberIds.length > 0) {
      const { data: profiles, error: profilesError } = await admin
        .from('profiles')
        .select('id, email, full_name')
        .in('id', memberIds);
      if (profilesError) throw profilesError;
      profilesById = new Map((profiles || []).map((p) => [p.id, { email: p.email, full_name: p.full_name }]));
    }

    const startupById = new Map((startups || []).map((s) => [s.id, s]));
    const startupByWorkspace = new Map(
      (workspaces || []).map((w) => [w.id, w.startup_id ? startupById.get(w.startup_id) : undefined]),
    );
    const membersByWorkspace = new Map<string, string[]>();
    for (const m of members || []) {
      const list = membersByWorkspace.get(m.workspace_id) ?? [];
      list.push(m.user_id);
      membersByWorkspace.set(m.workspace_id, list);
    }

    // Build the recipient list, deduplicated by email address.
    const recipients = new Map<string, Recipient>();
    let skipped = 0;

    const add = (email: string | null, name: string | null, startupName: string, instanceId: string) => {
      const clean = (email || '').trim().toLowerCase();
      if (!clean || !clean.includes('@')) return false;
      const existing = recipients.get(clean);
      if (existing) {
        if (!existing.startups.includes(startupName)) existing.startups.push(startupName);
        existing.instanceIds.push(instanceId);
        if (!existing.name && name) existing.name = name;
        return true;
      }
      recipients.set(clean, {
        email: clean,
        name,
        registered: false,
        startups: [startupName],
        instanceIds: [instanceId],
      });
      return true;
    };

    for (const instance of instances) {
      const startup = startupByWorkspace.get(instance.workspace_id);
      const startupName = startup?.name || 'a sua startup';
      let added = false;

      for (const userId of membersByWorkspace.get(instance.workspace_id) ?? []) {
        const profile = profilesById.get(userId);
        if (add(profile?.email ?? null, profile?.full_name ?? null, startupName, instance.id)) added = true;
      }
      if (add(startup?.main_contact_email ?? null, startup?.main_contact_name ?? null, startupName, instance.id)) {
        added = true;
      }
      if (!added) skipped += 1;
    }

    const emails = [...recipients.keys()];
    if (emails.length === 0) {
      return corsJsonResponse({ sent: 0, recipients: 0, skipped, failures: [] }, req, 200);
    }

    // Which addresses already have an account?
    const { data: knownProfiles, error: knownError } = await admin
      .from('profiles')
      .select('email')
      .in('email', emails);
    if (knownError) throw knownError;
    const registeredEmails = new Set(
      (knownProfiles || []).map((p) => (p.email || '').trim().toLowerCase()).filter(Boolean),
    );
    for (const r of recipients.values()) r.registered = registeredEmails.has(r.email);

    const unregistered = [...recipients.values()].filter((r) => !r.registered).map((r) => r.email);

    if (dryRun) {
      return corsJsonResponse(
        {
          dry_run: true,
          recipients: recipients.size,
          registered: recipients.size - unregistered.length,
          unregistered: unregistered.length,
          skipped,
        },
        req,
        200,

      );
    }

    // Registration is allowlist-gated: make sure invited founders can sign up.
    if (unregistered.length > 0) {
      const { data: allowed, error: allowedError } = await admin
        .from('signup_allowlist')
        .select('email')
        .in('email', unregistered);
      if (allowedError) {
        log.warn('allowlist_read_failed', { message: allowedError.message });
      } else {
        const already = new Set((allowed || []).map((a) => (a.email || '').toLowerCase()));
        const toAllow = unregistered.filter((e) => !already.has(e)).map((email) => ({ email }));
        if (toAllow.length > 0) {
          const { error: insertError } = await admin.from('signup_allowlist').insert(toAllow);
          if (insertError) log.warn('allowlist_insert_failed', { message: insertError.message });
        }
      }
    }

    const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://fb.startupleiria.com';
    const deadline = campaign.ends_at
      ? new Date(campaign.ends_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
      : null;

    let sent = 0;
    const failures: { email: string; error: string }[] = [];
    const sentInstanceIds = new Set<string>();

    for (const recipient of recipients.values()) {
      const { subject, html } = buildEmail(recipient, campaign.name, deadline, appUrl);
      let attempt = 0;
      let ok = false;
      let lastError = 'unknown_error';

      while (attempt < 3 && !ok) {
        attempt += 1;
        const { error } = await resend.emails.send({
          from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
          to: recipient.email,
          replyTo: REPLY_TO,
          subject,
          html,
        });
        if (!error) {
          ok = true;
          break;
        }
        lastError = error.message || 'resend_send_failed';
        const rateLimited = /rate|429|too many/i.test(lastError);
        if (!rateLimited) break;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }

      if (ok) {
        sent += 1;
        recipient.instanceIds.forEach((id) => sentInstanceIds.add(id));
      } else {
        failures.push({ email: recipient.email, error: lastError });
        log.warn('survey_invite_failed', { error: lastError });
      }

      // Stay well below the provider rate limit.
      await new Promise((r) => setTimeout(r, 120));
    }

    if (sentInstanceIds.size > 0) {
      const { error: touchError } = await admin
        .from('survey_instances')
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .in('id', [...sentInstanceIds]);
      if (touchError) log.warn('instance_touch_failed', { message: touchError.message });
    }

    const { error: logError } = await admin.from('email_log').insert({
      email_type: 'survey_invite',
      subject: `${campaign.name} — convite de resposta`,
      recipients: JSON.stringify([...recipients.keys()]),
      status: failures.length === 0 ? 'sent' : 'partial',
      sent_at: new Date().toISOString(),
      created_by: null,
    });
    if (logError) log.warn('email_log_failed', { message: logError.message });

    log.info('survey_invites_done', { sent, failed: failures.length, skipped });

    return corsJsonResponse(
      { sent, recipients: recipients.size, unregistered: unregistered.length, skipped, failures },
      req,
      200,
    );
  } catch (err) {

    log.error('survey_invites_error', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
