import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { handleCorsOptions, corsJsonResponse } from "../_shared/cors.ts";

/**
 * generate-mentor-impact-report
 * Returns an HTML lifetime impact report for the calling mentor (or specified mentorId if admin).
 * Client prints to PDF (same pattern as generate-progress-report-pdf).
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsOptions(req);
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return corsJsonResponse({ error: 'Unauthorized' }, req, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !user) return corsJsonResponse({ error: 'Unauthorized' }, req, 401);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    let mentorId: string = body?.mentorId || user.id;

    if (mentorId !== user.id) {
      const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      if (!isAdmin) return corsJsonResponse({ error: 'Forbidden' }, req, 403);
    }

    // Mentor profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .eq('id', mentorId)
      .maybeSingle();

    // Workspaces the mentor is active in
    const { data: ws } = await supabase
      .from('workspace_users')
      .select('workspace_id')
      .eq('user_id', mentorId)
      .eq('active', true);
    const workspaceIds = (ws ?? []).map((w: any) => w.workspace_id);

    // Sessions led by mentor
    const { data: sessions } = workspaceIds.length
      ? await supabase
          .from('sessions')
          .select('id, title, scheduled_at, duration_minutes, workspace_id, status')
          .in('workspace_id', workspaceIds)
          .order('scheduled_at', { ascending: false })
          .limit(500)
      : { data: [] as any[] };

    const completedSessions = (sessions ?? []).filter((s: any) => s.status === 'completed' || new Date(s.scheduled_at) < new Date());
    const totalMinutes = completedSessions.reduce((sum: number, s: any) => sum + (s.duration_minutes ?? 60), 0);
    const totalHours = Math.round(totalMinutes / 60);

    // Workspace names
    const { data: workspaces } = workspaceIds.length
      ? await supabase.from('workspaces').select('id, startups(name)').in('id', workspaceIds)
      : { data: [] as any[] };

    // Feedback
    const sessionIds = (sessions ?? []).map((s: any) => s.id);
    const { data: feedback } = sessionIds.length
      ? await supabase
          .from('session_feedback')
          .select('rating, feedback, created_at, session_id, is_public')
          .in('session_id', sessionIds)
      : { data: [] as any[] };

    const ratings = (feedback ?? []).map((f: any) => f.rating).filter((r: any) => typeof r === 'number');
    const avgRating = ratings.length ? (ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) : null;
    const publicTestimonials = (feedback ?? []).filter((f: any) => f.is_public && f.feedback).slice(0, 5);

    const startupList = (workspaces ?? [])
      .map((w: any) => (w.startups?.name) || w.id)
      .filter(Boolean);

    const reportDate = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });

    const html = `<!DOCTYPE html>
<html lang="pt"><head><meta charset="utf-8"><title>Impacto do Mentor — ${profile?.full_name || ''}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
  .header { text-align: center; padding: 32px 0; border-bottom: 2px solid #6366f1; margin-bottom: 32px; }
  .header h1 { margin: 0; font-size: 28px; color: #1e1b4b; }
  .subtitle { color: #6b7280; margin-top: 8px; }
  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 24px 0; }
  .stat { background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%); border-radius: 12px; padding: 20px; text-align: center; }
  .stat-value { font-size: 36px; font-weight: 700; color: #4f46e5; }
  .stat-label { font-size: 12px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 6px; }
  h2 { color: #1e1b4b; border-left: 4px solid #6366f1; padding-left: 12px; margin-top: 36px; }
  .testimonial { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 12px 0; border-left: 3px solid #a5b4fc; }
  .testimonial-text { font-style: italic; color: #374151; }
  .testimonial-rating { color: #f59e0b; margin-top: 6px; font-size: 14px; }
  .startup-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { background: #e0e7ff; color: #3730a3; padding: 6px 12px; border-radius: 999px; font-size: 13px; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; text-align: center; }
</style></head><body>
  <div class="header">
    <h1>Impacto Vitalício</h1>
    <p class="subtitle">${profile?.full_name || 'Mentor'} · Startup Leiria</p>
  </div>

  <div class="stat-grid">
    <div class="stat"><div class="stat-value">${totalHours}</div><div class="stat-label">Horas de Mentoria</div></div>
    <div class="stat"><div class="stat-value">${completedSessions.length}</div><div class="stat-label">Sessões</div></div>
    <div class="stat"><div class="stat-value">${startupList.length}</div><div class="stat-label">Startups Apoiadas</div></div>
  </div>

  <h2>Startups que apoiaste</h2>
  <div class="startup-list">
    ${startupList.length ? startupList.map((n: string) => `<span class="chip">${n}</span>`).join('') : '<p style="color:#9ca3af">Sem startups ainda.</p>'}
  </div>

  <h2>Avaliação média</h2>
  <p style="font-size: 24px; color: #f59e0b; margin: 0;">${avgRating != null ? `★ ${avgRating.toFixed(1)} / 5` : '—'} <span style="font-size:14px;color:#6b7280;">(${ratings.length} avaliações)</span></p>

  ${publicTestimonials.length ? `
  <h2>Testemunhos públicos</h2>
  ${publicTestimonials.map((f: any) => `
    <div class="testimonial">
      <p class="testimonial-text">"${(f.feedback || '').replace(/</g, '&lt;')}"</p>
      ${f.rating ? `<div class="testimonial-rating">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</div>` : ''}
    </div>
  `).join('')}
  ` : ''}

  <div class="footer">Gerado por Startup Leiria · ${reportDate}</div>
</body></html>`;

    return corsJsonResponse({
      html,
      metadata: {
        mentorName: profile?.full_name,
        totalHours,
        sessions: completedSessions.length,
        startupsHelped: startupList.length,
        avgRating,
      },
    }, req);
  } catch (err: any) {
    console.error('[generate-mentor-impact-report]', err);
    return corsJsonResponse({ error: err?.message || 'Failed' }, req, 500);
  }
});
