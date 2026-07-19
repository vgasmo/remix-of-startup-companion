/**
 * Daily cron: warn mentors whose NDA acceptance is nearing expiry.
 * NDA validity is 365 days; warning window is 30 days before expiry.
 * Sends one email per mentor per acceptance (deduped by version).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireCronSecret, generateRequestId, createLogger } from '../_shared/security.ts';
import { resolveLocalesByUserIds, type Locale } from '../_shared/i18n.ts';
import { withCronRunLogging } from '../_shared/cronRun.ts';

const FUNCTION_NAME = 'check-mentor-nda-expiry';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const APP_URL = Deno.env.get('PUBLIC_APP_URL') || 'https://fb.startupleiria.com';
const FROM = 'Startup Leiria <noreply@startupleiria.com>';

const NDA_VALIDITY_DAYS = 365;
const WARNING_WINDOW_DAYS = 30;

const T = {
  pt: {
    subject: '⚠️ O teu NDA de mentor expira em breve',
    title: '⚠️ NDA de mentor a expirar',
    greeting: (n: string) => `Olá ${n},`,
    body: (days: number) =>
      `O teu Acordo de Confidencialidade (NDA) de mentor expira em <strong>${days} dias</strong>. Renova para continuares com acesso às startups.`,
    cta: 'Renovar NDA',
    footer: 'Gerir preferências',
  },
  en: {
    subject: '⚠️ Your mentor NDA is about to expire',
    title: '⚠️ Mentor NDA expiring soon',
    greeting: (n: string) => `Hi ${n},`,
    body: (days: number) =>
      `Your mentor Non-Disclosure Agreement (NDA) expires in <strong>${days} days</strong>. Renew to keep access to startups.`,
    cta: 'Renew NDA',
    footer: 'Manage preferences',
  },
} as const;

function render(locale: Locale, name: string, days: number): string {
  const s = T[locale];
  const htmlLang = locale === 'pt' ? 'pt-PT' : 'en';
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#f59e0b 0%,#c03c3c 100%);padding:30px;border-radius:12px 12px 0 0;">
    <h1 style="color:white;margin:0;font-size:22px;">${s.title}</h1>
    <p style="color:rgba(255,255,255,0.9);margin:5px 0 0 0;">Startup Leiria</p>
  </div>
  <div style="background:#f9f9f9;padding:30px;border-radius:0 0 12px 12px;">
    <p>${s.greeting(name)}</p>
    <p>${s.body(days)}</p>
    <div style="text-align:center;margin-top:30px;">
      <a href="${APP_URL}/mentors/nda" style="display:inline-block;background:#c03c3c;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;">${s.cta}</a>
    </div>
    <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">
    <p style="color:#666;font-size:12px;text-align:center;margin-bottom:0;">
      <a href="${APP_URL}/settings" style="color:#c03c3c;">${s.footer}</a>
    </p>
  </div>
</body>
</html>`;
}

Deno.serve(withCronRunLogging('check-mentor-nda-expiry', async (req) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  const auth = requireCronSecret(req);
  if ('error' in auth) return auth.error;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const now = Date.now();
    const lowerAge = NDA_VALIDITY_DAYS - WARNING_WINDOW_DAYS; // 335 days
    const upper = new Date(now - lowerAge * 86_400_000).toISOString();
    const lower = new Date(now - NDA_VALIDITY_DAYS * 86_400_000).toISOString();

    // Latest acceptance per mentor within the warning window
    const { data: acceptances, error } = await supabase
      .from('mentor_nda_acceptances')
      .select('user_id, accepted_at, nda_version')
      .lte('accepted_at', upper)
      .gte('accepted_at', lower);
    if (error) throw error;

    // Keep only mentors whose LATEST acceptance falls in the window (avoids
    // warning users who already renewed).
    const latestByUser = new Map<string, { accepted_at: string; nda_version: string }>();
    // fetch all recent acceptances to find latest per user
    const userIds = Array.from(new Set((acceptances ?? []).map((r: any) => r.user_id)));
    if (userIds.length === 0) {
      log.info('no_nda_warnings');
      return corsJsonResponse({ success: true, warned: 0 }, req);
    }
    const { data: allAcc } = await supabase
      .from('mentor_nda_acceptances')
      .select('user_id, accepted_at, nda_version')
      .in('user_id', userIds)
      .order('accepted_at', { ascending: false });
    for (const row of (allAcc ?? []) as any[]) {
      if (!latestByUser.has(row.user_id)) {
        latestByUser.set(row.user_id, { accepted_at: row.accepted_at, nda_version: row.nda_version });
      }
    }

    const targetIds: string[] = [];
    for (const [uid, latest] of latestByUser) {
      const ageDays = Math.floor((now - new Date(latest.accepted_at).getTime()) / 86_400_000);
      if (ageDays >= lowerAge && ageDays <= NDA_VALIDITY_DAYS) targetIds.push(uid);
    }

    if (targetIds.length === 0) {
      log.info('no_actionable_warnings');
      return corsJsonResponse({ success: true, warned: 0 }, req);
    }

    const localeMap = await resolveLocalesByUserIds(supabase, targetIds);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', targetIds);

    let warned = 0;
    for (const p of (profiles ?? []) as any[]) {
      if (!p.email) continue;
      const latest = latestByUser.get(p.id)!;
      const ageDays = Math.floor((now - new Date(latest.accepted_at).getTime()) / 86_400_000);
      const daysLeft = Math.max(0, NDA_VALIDITY_DAYS - ageDays);
      const locale = localeMap.get(p.id) ?? 'pt';
      const s = T[locale];
      if (!RESEND_API_KEY) {
        log.warn('resend_missing');
        continue;
      }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: [p.email],
          subject: s.subject,
          html: render(locale, p.full_name || (locale === 'pt' ? 'Mentor' : 'Mentor'), daysLeft),
        }),
      });
      if (res.ok) warned++;
      else log.warn('resend_fail', { status: res.status });
    }

    return corsJsonResponse({ success: true, warned }, req);
  } catch (e) {
    log.error('fatal', e);
    return corsJsonResponse({ error: e instanceof Error ? e.message : 'Unknown' }, req, 500);
  }
}));
