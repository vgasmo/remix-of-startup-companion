import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';

interface ReportRequest {
  workspaceId: string;
  month?: string; // YYYY-MM format
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return corsJsonResponse({ error: 'Unauthorized' }, req, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return corsJsonResponse({ error: 'Unauthorized' }, req, 401);
    }

    const { workspaceId, month }: ReportRequest = await req.json();
    console.log(`Generating progress report for workspace ${workspaceId}, month: ${month || 'current'}`);

    // Check user has access to workspace
    const { data: access } = await supabase.rpc('has_workspace_access', {
      _user_id: user.id,
      _workspace_id: workspaceId,
    });

    if (!access) {
      return corsJsonResponse({ error: 'Access denied' }, req, 403);
    }

    // Calculate date range
    const targetMonth = month ? new Date(month + '-01') : new Date();
    const currentMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1).toISOString().slice(0, 10);
    const previousMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() - 1, 1).toISOString().slice(0, 10);
    const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).toISOString();
    const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1).toISOString();

    // Fetch all data in parallel
    const [
      workspaceResult,
      sessionsResult,
      kpisResult,
      previousKpisResult,
      actionsResult,
      milestonesResult,
    ] = await Promise.all([
      supabase
        .from('workspaces')
        .select('id, stage, health_score, health_score_override, startup:startups(name, description, logo_url), program:programs(name)')
        .eq('id', workspaceId)
        .single(),
      
      supabase
        .from('sessions')
        .select('id, title, scheduled_at, notes, decisions, ai_summary')
        .eq('workspace_id', workspaceId)
        .gte('scheduled_at', monthStart)
        .lte('scheduled_at', monthEnd)
        .order('scheduled_at', { ascending: false })
        .limit(10),
      
      supabase
        .from('kpi_values')
        .select('value, target_value, kpi_definition:kpi_definitions(name, unit)')
        .eq('workspace_id', workspaceId)
        .eq('period_month', currentMonth),
      
      supabase
        .from('kpi_values')
        .select('value, kpi_definition:kpi_definitions(name)')
        .eq('workspace_id', workspaceId)
        .eq('period_month', previousMonth),
      
      supabase
        .from('action_items')
        .select('id, title, status, due_date, completed_at')
        .eq('workspace_id', workspaceId)
        .limit(50),
      
      supabase
        .from('milestones')
        .select('id, title, status, target_date, completed_at')
        .eq('workspace_id', workspaceId)
        .limit(20),
    ]);

    if (workspaceResult.error || !workspaceResult.data) {
      console.error('Workspace not found:', workspaceResult.error);
      return corsJsonResponse({ error: 'Workspace not found' }, req, 404);
    }

    const workspace = workspaceResult.data;
    const startupData = workspace.startup;
    const startup = Array.isArray(startupData) ? startupData[0] : startupData;
    const programData = workspace.program;
    const program = Array.isArray(programData) ? programData[0] : programData;

    // Process KPIs with previous month comparison
    const prevKpiMap = new Map<string, number>();
    (previousKpisResult.data || []).forEach((kpi: any) => {
      if (kpi.kpi_definition?.name) {
        prevKpiMap.set(kpi.kpi_definition.name, kpi.value);
      }
    });

    const kpis = (kpisResult.data || []).map((kpi: any) => {
      const prevValue = prevKpiMap.get(kpi.kpi_definition?.name);
      let trend = null;
      if (prevValue !== undefined && kpi.value !== null) {
        if (kpi.value > prevValue) trend = 'up';
        else if (kpi.value < prevValue) trend = 'down';
        else trend = 'stable';
      }
      return {
        name: kpi.kpi_definition?.name || 'Unknown',
        value: kpi.value,
        target: kpi.target_value,
        unit: kpi.kpi_definition?.unit,
        previousValue: prevValue,
        trend,
      };
    });

    // Process actions
    const actions = actionsResult.data || [];
    const completedActions = actions.filter((a: any) => a.status === 'completed');
    const pendingActions = actions.filter((a: any) => a.status !== 'completed');
    const overdueActions = pendingActions.filter((a: any) => a.due_date && new Date(a.due_date) < new Date());

    // Process milestones
    const milestones = milestonesResult.data || [];
    const completedMilestones = milestones.filter((m: any) => m.status === 'completed');

    // Get AI summary from most recent session if available
    const sessions = sessionsResult.data || [];
    const aiSummary = sessions.find((s: any) => s.ai_summary)?.ai_summary || null;

    // Calculate health score
    const effectiveHealth = workspace.health_score_override || workspace.health_score;

    // Format date
    const reportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const reportMonth = targetMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

    // Generate HTML report
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Progress Report - ${startup?.name || 'Startup'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    h2 { font-size: 18px; font-weight: 600; margin: 24px 0 12px; color: #333; border-bottom: 2px solid #e5e5e5; padding-bottom: 8px; }
    .header { text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #e5e5e5; }
    .subtitle { color: #666; font-size: 14px; }
    .date { color: #999; font-size: 12px; margin-top: 8px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .stat-card { background: #f9f9f9; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; color: #1a1a1a; }
    .stat-label { font-size: 12px; color: #666; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 16px; font-size: 12px; font-weight: 500; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-yellow { background: #fef9c3; color: #854d0e; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .kpi-card { background: #f5f5f5; border-radius: 8px; padding: 12px; }
    .kpi-name { font-size: 12px; color: #666; margin-bottom: 4px; }
    .kpi-value { font-size: 18px; font-weight: 600; }
    .kpi-meta { font-size: 11px; color: #999; }
    .trend-up { color: #16a34a; }
    .trend-down { color: #dc2626; }
    .list-item { padding: 8px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; }
    .list-item:last-child { border-bottom: none; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 8px; }
    .dot-green { background: #22c55e; }
    .dot-blue { background: #3b82f6; }
    .dot-gray { background: #9ca3af; }
    .dot-red { background: #ef4444; }
    .session-item { margin-bottom: 12px; padding: 12px; background: #f9f9f9; border-radius: 8px; }
    .session-title { font-weight: 600; font-size: 14px; }
    .session-date { font-size: 12px; color: #999; }
    .session-notes { font-size: 13px; color: #666; margin-top: 8px; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; color: #999; font-size: 12px; }
    .summary-box { background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    .summary-title { font-size: 14px; font-weight: 600; color: #0369a1; margin-bottom: 8px; }
    .summary-text { font-size: 14px; color: #334155; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${startup?.name || 'Startup Progress Report'}</h1>
    <p class="subtitle">${program?.name || ''}</p>
    <p class="date">Report for ${reportMonth} • Generated ${reportDate}</p>
  </div>

  <div class="grid">
    <div class="stat-card">
      <div class="stat-label">Stage</div>
      <div class="stat-value" style="font-size: 16px; text-transform: capitalize;">${workspace.stage}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Health</div>
      <div class="stat-value" style="font-size: 16px; text-transform: capitalize;">${effectiveHealth || 'N/A'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Milestones</div>
      <div class="stat-value">${completedMilestones.length}/${milestones.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Actions</div>
      <div class="stat-value">${completedActions.length}/${actions.length}</div>
    </div>
  </div>

  ${aiSummary ? `
  <div class="summary-box">
    <div class="summary-title">✨ AI Summary</div>
    <p class="summary-text">${aiSummary}</p>
  </div>
  ` : ''}

  <h2>📊 Key Metrics</h2>
  ${kpis.length > 0 ? `
  <div class="kpi-grid">
    ${kpis.slice(0, 6).map((kpi: any) => `
    <div class="kpi-card">
      <div class="kpi-name">${kpi.name}</div>
      <div class="kpi-value">
        ${kpi.value?.toLocaleString() ?? '—'}${kpi.unit ? ` <span style="font-size: 12px; color: #999;">${kpi.unit}</span>` : ''}
        ${kpi.trend === 'up' ? '<span class="trend-up"> ↑</span>' : kpi.trend === 'down' ? '<span class="trend-down"> ↓</span>' : ''}
      </div>
      ${kpi.target ? `<div class="kpi-meta">Target: ${kpi.target.toLocaleString()}</div>` : ''}
      ${kpi.previousValue !== undefined ? `<div class="kpi-meta">Previous: ${kpi.previousValue.toLocaleString()}</div>` : ''}
    </div>
    `).join('')}
  </div>
  ` : '<p style="color: #999;">No KPIs recorded this period</p>'}

  <h2>🎯 Milestones</h2>
  ${milestones.length > 0 ? `
  <div>
    ${milestones.slice(0, 8).map((m: any) => `
    <div class="list-item">
      <span>
        <span class="status-dot ${m.status === 'completed' ? 'dot-green' : m.status === 'in_progress' ? 'dot-blue' : m.status === 'delayed' ? 'dot-red' : 'dot-gray'}"></span>
        ${m.title}
      </span>
      <span class="badge ${m.status === 'completed' ? 'badge-green' : m.status === 'in_progress' ? 'badge-blue' : m.status === 'delayed' ? 'badge-red' : 'badge-yellow'}" style="text-transform: capitalize;">
        ${m.status.replace('_', ' ')}
      </span>
    </div>
    `).join('')}
  </div>
  ` : '<p style="color: #999;">No milestones defined</p>'}

  <h2>✅ Actions Summary</h2>
  <div class="grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="stat-card">
      <div class="stat-value" style="color: #22c55e;">${completedActions.length}</div>
      <div class="stat-label">Completed</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: #3b82f6;">${pendingActions.length - overdueActions.length}</div>
      <div class="stat-label">In Progress</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: #ef4444;">${overdueActions.length}</div>
      <div class="stat-label">Overdue</div>
    </div>
  </div>

  <h2>📅 Sessions This Month</h2>
  ${sessions.length > 0 ? `
  <div>
    ${sessions.slice(0, 5).map((s: any) => `
    <div class="session-item">
      <div class="session-title">${s.title}</div>
      <div class="session-date">${new Date(s.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      ${s.notes ? `<div class="session-notes">${s.notes.slice(0, 200)}${s.notes.length > 200 ? '...' : ''}</div>` : ''}
    </div>
    `).join('')}
  </div>
  ` : '<p style="color: #999;">No sessions this month</p>'}

  <div class="footer">
    <p>Generated by Startup Leiria • ${reportDate}</p>
  </div>
</body>
</html>
    `.trim();

    // Log activity
    await supabase.from('activity_log').insert({
      workspace_id: workspaceId,
      user_id: user.id,
      entity_type: 'progress_report',
      entity_id: workspaceId,
      action: 'generated',
      metadata: { month: reportMonth },
    });

    console.log('Progress report generated successfully');

    return corsJsonResponse({ 
      html,
      metadata: {
        startupName: startup?.name,
        month: reportMonth,
        generatedAt: new Date().toISOString(),
      }
    }, req);

  } catch (err) {
    console.error('Error generating progress report:', err);
    return corsJsonResponse({ error: 'An unexpected error occurred. Please try again.' }, req, 500);
  }
});
