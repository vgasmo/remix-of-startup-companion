import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireCronOrStaff, generateRequestId, createLogger } from '../_shared/security.ts';
import { resolveLocalesByEmails, type Locale } from '../_shared/i18n.ts';

const FUNCTION_NAME = 'send-announcement-email';
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || "https://startupleiria.com";

interface AnnouncementRequest { announcement_ids: string[]; }

interface AnnouncementData {
  id: string;
  workspace_id: string;
  category: string;
  title: string;
  message: string | null;
  workspace?: { startup?: { name: string } };
}

const CATEGORY_EMOJI: Record<string, string> = {
  mail: '📬', package: '📦', general: '📢', urgent: '🚨',
};

const CATEGORY_LABELS: Record<string, { pt: string; en: string }> = {
  mail: { pt: 'Correio', en: 'Mail' },
  package: { pt: 'Encomenda', en: 'Package' },
  general: { pt: 'Aviso Geral', en: 'General Notice' },
  urgent: { pt: 'Urgente', en: 'Urgent' },
};

const STRINGS = {
  pt: {
    header: 'Novo Aviso',
    brand: 'Startup Leiria',
    greeting: (n: string) => `Olá ${n},`,
    intro: (s: string) => `Tem um novo aviso para a <strong>${s}</strong>:`,
    cta: 'Ver na Plataforma',
    footer: 'Esta mensagem foi enviada pela equipa Startup Leiria.',
    managePrefs: 'Gerir preferências de notificação',
    fallbackName: 'Utilizador',
  },
  en: {
    header: 'New Notice',
    brand: 'Startup Leiria',
    greeting: (n: string) => `Hi ${n},`,
    intro: (s: string) => `You have a new notice for <strong>${s}</strong>:`,
    cta: 'Open Platform',
    footer: 'This message was sent by the Startup Leiria team.',
    managePrefs: 'Manage notification preferences',
    fallbackName: 'User',
  },
} as const;

function escapeHtml(text: string): string {
  const m: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (c) => m[c] || c);
}

function buildAnnouncementEmail(
  announcement: AnnouncementData,
  recipientName: string,
  startupName: string,
  locale: Locale,
): string {
  const s = STRINGS[locale];
  const emoji = CATEGORY_EMOJI[announcement.category] || '📢';
  const categoryLabel = CATEGORY_LABELS[announcement.category]?.[locale] || announcement.category;
  const safeTitle = escapeHtml(announcement.title);
  const safeMessage = announcement.message ? escapeHtml(announcement.message) : null;
  const safeName = escapeHtml(recipientName);
  const safeStartup = escapeHtml(startupName);
  const htmlLang = locale === 'pt' ? 'pt-PT' : 'en';

  const categoryColor = announcement.category === 'urgent' ? '#dc2626' :
                        announcement.category === 'mail' ? '#2563eb' :
                        announcement.category === 'package' ? '#d97706' : '#64748b';

  return `
    <!DOCTYPE html>
    <html lang="${htmlLang}">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #c8e53d 0%, #c03c3c 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">${emoji} ${s.header}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">${s.brand}</p>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 12px 12px;">
        <p style="margin-top: 0;">${s.greeting(safeName)}</p>
        <p>${s.intro(safeStartup)}</p>
        <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid ${categoryColor}; margin: 20px 0;">
          <div style="display: inline-block; background: ${categoryColor}15; color: ${categoryColor}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 12px;">
            ${emoji} ${categoryLabel}
          </div>
          <h2 style="margin: 0 0 10px 0; color: #1a1a1a; font-size: 18px;">${safeTitle}</h2>
          ${safeMessage ? `<p style="margin: 0; color: #666;">${safeMessage}</p>` : ''}
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${SITE_URL}/my-workspaces"
             style="display: inline-block; background: #c03c3c; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
            ${s.cta}
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #666; font-size: 12px; text-align: center; margin-bottom: 0;">
          ${s.footer}<br>
          <a href="${SITE_URL}/settings" style="color: #c03c3c;">${s.managePrefs}</a>
        </p>
      </div>
    </body>
    </html>
  `;
}

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);

  if (req.method === "OPTIONS") return handleCorsOptions(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } }
  });

  try {
    const authResult = await requireCronOrStaff(req, supabaseUser, supabaseAdmin);
    if ('error' in authResult) { log.warn('Unauthorized access attempt'); return authResult.error; }

    const { announcement_ids } = await req.json() as AnnouncementRequest;
    if (!announcement_ids || announcement_ids.length === 0) {
      return corsJsonResponse({ error: 'No announcement IDs provided' }, req, 400);
    }

    log.info('Sending announcement emails', { count: announcement_ids.length });

    const { data: announcements, error: annError } = await supabaseAdmin
      .from("admin_announcements")
      .select(`id, workspace_id, category, title, message,
        workspace:workspaces(id, startup:startups(id, name))`)
      .in("id", announcement_ids);

    if (annError) throw annError;
    if (!announcements || announcements.length === 0) {
      return corsJsonResponse({ success: true, emailsSent: 0 }, req);
    }

    let totalEmailsSent = 0;
    const errors: string[] = [];

    for (const announcement of announcements as unknown as AnnouncementData[]) {
      const workspaceId = announcement.workspace_id;
      const startupName = (announcement.workspace as any)?.startup?.name || 'Startup';

      const { data: workspaceUsers, error: usersError } = await supabaseAdmin
        .from("workspace_users").select(`user_id, role`)
        .eq("workspace_id", workspaceId).eq("active", true);

      if (usersError) {
        log.error('Error fetching workspace users', usersError, { workspaceId });
        errors.push(`Failed to get users for workspace ${workspaceId}`);
        continue;
      }

      const userIds = workspaceUsers?.map(wu => wu.user_id) || [];
      const { data: profiles } = userIds.length > 0
        ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", userIds)
        : { data: [] };

      const startupId = (announcement.workspace as any)?.startup?.id;
      const { data: startup } = startupId
        ? await supabaseAdmin.from("startups").select("founder_email, name").eq("id", startupId).single()
        : { data: null };

      const emailsToSend = new Map<string, { email: string; name: string }>();
      for (const profile of profiles || []) {
        if (profile?.email) {
          emailsToSend.set(profile.email.toLowerCase(), {
            email: profile.email,
            name: profile.full_name || '',
          });
        }
      }
      if (startup?.founder_email && !emailsToSend.has(startup.founder_email.toLowerCase())) {
        emailsToSend.set(startup.founder_email.toLowerCase(), {
          email: startup.founder_email,
          name: startup.name || '',
        });
      }

      // Resolve locales for all recipients in one batch
      const localeMap = await resolveLocalesByEmails(
        supabaseAdmin,
        Array.from(emailsToSend.values()).map(r => r.email),
      );

      log.info('Sending emails for announcement', {
        announcementId: announcement.id, recipientCount: emailsToSend.size
      });

      for (const [, recipient] of emailsToSend) {
        try {
          const locale = localeMap.get(recipient.email.toLowerCase()) ?? 'pt';
          const fallbackName = STRINGS[locale].fallbackName;
          const displayName = recipient.name || fallbackName;
          const emailHtml = buildAnnouncementEmail(announcement, displayName, startupName, locale);

          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Startup Leiria <noreply@startupleiria.com>",
              to: [recipient.email],
              subject: `${CATEGORY_EMOJI[announcement.category] || '📢'} ${announcement.title}`,
              html: emailHtml,
            }),
          });

          if (!emailResponse.ok) {
            const errorText = await emailResponse.text();
            log.error('Resend API error', { email: recipient.email, error: errorText });
            errors.push(`Failed to send to ${recipient.email}`);
            continue;
          }

          totalEmailsSent++;
          log.info('Email sent', { email: recipient.email, locale });
        } catch (emailError) {
          log.error('Email send error', emailError, { email: recipient.email });
          errors.push(`Error sending to ${recipient.email}`);
        }
      }
    }

    log.info('Announcement emails complete', { totalEmailsSent, errors: errors.length });
    return corsJsonResponse({
      success: true, emailsSent: totalEmailsSent,
      errors: errors.length > 0 ? errors : undefined,
    }, req);

  } catch (error) {
    log.error('Fatal error', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return corsJsonResponse({ error: message, code: 'INTERNAL_ERROR' }, req, 500);
  }
});
