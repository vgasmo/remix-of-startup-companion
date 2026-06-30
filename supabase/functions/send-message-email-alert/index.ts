import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireUser, generateRequestId, createLogger } from '../_shared/security.ts';

const FUNCTION_NAME = 'send-message-email-alert';
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const APP_URL = Deno.env.get("APP_URL") || "https://fb.startupleiria.com";
// Don't re-alert if recipient already received a message-email in last N minutes
const COOLDOWN_MINUTES = 10;
// Don't alert if recipient was active in the last N minutes
const ACTIVE_THRESHOLD_MINUTES = 3;

interface MessageEmailRequest {
  messageId: string;
}

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  try {
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } },
    );
    const authResult = await requireUser(req, supabaseAuth);
    if ('error' in authResult) return authResult.error;
    const sender = authResult.user;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { messageId } = (await req.json()) as MessageEmailRequest;
    if (!messageId) return corsJsonResponse({ error: 'messageId required' }, req, 400);

    const { data: message } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .eq('id', messageId)
      .maybeSingle();

    if (!message) return corsJsonResponse({ error: 'Message not found' }, req, 404);
    if (message.sender_id !== sender.id) {
      return corsJsonResponse({ error: 'Forbidden' }, req, 403);
    }

    const { data: conv } = await supabase
      .from('conversations')
      .select('id, title, is_group, workspace_id')
      .eq('id', message.conversation_id)
      .maybeSingle();

    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('user_id, last_read_at')
      .eq('conversation_id', message.conversation_id);

    const recipientIds = (participants || [])
      .filter(p => p.user_id !== sender.id)
      .map(p => p.user_id as string);

    if (recipientIds.length === 0) {
      return corsJsonResponse({ sent: 0, skipped: 'no_recipients' }, req);
    }

    // Active threshold: skip recipients whose last_read_at is very recent
    const activeCutoff = new Date(Date.now() - ACTIVE_THRESHOLD_MINUTES * 60 * 1000).toISOString();
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString();

    const participantMap = new Map(
      (participants || []).map(p => [p.user_id as string, p.last_read_at as string | null]),
    );

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', recipientIds);

    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', sender.id)
      .maybeSingle();

    const senderName = senderProfile?.full_name || senderProfile?.email || 'Equipa';

    let sent = 0;
    let skipped = 0;

    for (const recipient of profiles || []) {
      if (!recipient.email) { skipped++; continue; }

      // Skip if recently active in this conversation
      const lastRead = participantMap.get(recipient.id);
      if (lastRead && lastRead > activeCutoff) { skipped++; continue; }

      // Cooldown: skip if we already sent them a message-email recently
      const { data: recentAlert } = await supabase
        .from('email_log')
        .select('id')
        .eq('user_id', recipient.id)
        .eq('email_type', 'message_alert')
        .gte('sent_at', cooldownCutoff)
        .limit(1)
        .maybeSingle();
      if (recentAlert) { skipped++; continue; }

      if (!RESEND_API_KEY) {
        log.warn('RESEND_API_KEY missing — skipping send', { recipientId: recipient.id });
        continue;
      }

      const convTitle = conv?.title || senderName;
      const linkUrl = `${APP_URL}/messages?conversation=${message.conversation_id}`;
      const safeContent = String(message.content || '')
        .slice(0, 500)
        .replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
          <div style="padding: 20px 24px; border-bottom: 1px solid #eee;">
            <strong style="font-size: 14px; color: #666;">Startup Leiria</strong>
          </div>
          <div style="padding: 24px;">
            <h2 style="margin: 0 0 12px; font-size: 18px;">Nova mensagem de ${senderName}</h2>
            <p style="margin: 0 0 8px; color: #666; font-size: 13px;">${convTitle}</p>
            <blockquote style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #d1d5db; background: #f9fafb; white-space: pre-wrap; font-size: 14px;">${safeContent}</blockquote>
            <a href="${linkUrl}" style="display: inline-block; margin-top: 12px; padding: 10px 18px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">Abrir conversa</a>
          </div>
          <div style="padding: 16px 24px; border-top: 1px solid #eee; font-size: 11px; color: #999;">
            Recebes este aviso porque tens mensagens não lidas. <a href="${APP_URL}/settings#notifications" style="color: #666;">Gerir preferências</a>
          </div>
        </div>`;

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Startup Leiria <noreply@startupleiria.com>',
          to: [recipient.email],
          subject: `Nova mensagem de ${senderName}`,
          html,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        log.warn('Resend failed', { status: resp.status, errText: errText.slice(0, 200) });
        continue;
      }

      await supabase.from('email_log').insert({
        user_id: recipient.id,
        email_type: 'message_alert',
        recipient_email: recipient.email,
        subject: `Nova mensagem de ${senderName}`,
        metadata: { conversation_id: message.conversation_id, message_id: message.id },
      });

      sent++;
    }

    return corsJsonResponse({ sent, skipped }, req);
  } catch (err) {
    log.error('send-message-email-alert failed', { err: String(err) });
    return corsJsonResponse({ error: 'Internal error' }, req, 500);
  }
});
