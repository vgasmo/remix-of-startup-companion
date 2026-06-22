import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireCronSecret, generateRequestId, createLogger } from '../_shared/security.ts';
import { resolveLocalesByUserIds, type Locale } from '../_shared/i18n.ts';

const FUNCTION_NAME = 'send-task-notification';
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

interface TaskNotificationRequest {
  type: "assigned" | "overdue";
  taskId?: string;
  taskIds?: string[];
}

const STRINGS = {
  pt: {
    assignedHeader: '📋 Nova Tarefa Atribuída',
    overdueHeader: '⚠️ Tarefas em Atraso',
    brand: 'Startup Leiria',
    greeting: (n: string) => `Olá ${n},`,
    assignedIntro: (c: string) => `${c} atribuiu-te uma nova tarefa:`,
    overdueIntro: (n: number) => `Tens <strong>${n}</strong> tarefa(s) em atraso que precisam de atenção:`,
    startupLabel: 'Startup',
    dueLabel: 'Data limite',
    daysOverdue: (n: number) => `${n} dia(s) em atraso`,
    viewTask: 'Ver Tarefa',
    viewDashboard: 'Ver Dashboard',
    managePrefs: 'Gerir preferências',
    fallbackName: 'Utilizador',
    fallbackCreator: 'Um membro da equipa',
    high: 'Alta Prioridade',
    medium: 'Média Prioridade',
    subjectAssigned: (s: string, t: string) => `[${s}] Nova tarefa: ${t}`,
    subjectOverdue: (n: number) => `⚠️ [Startup Leiria] ${n} tarefa(s) em atraso`,
    locale: 'pt-PT',
  },
  en: {
    assignedHeader: '📋 New Task Assigned',
    overdueHeader: '⚠️ Overdue Tasks',
    brand: 'Startup Leiria',
    greeting: (n: string) => `Hi ${n},`,
    assignedIntro: (c: string) => `${c} assigned you a new task:`,
    overdueIntro: (n: number) => `You have <strong>${n}</strong> overdue task(s) that need attention:`,
    startupLabel: 'Startup',
    dueLabel: 'Due date',
    daysOverdue: (n: number) => `${n} day(s) overdue`,
    viewTask: 'View Task',
    viewDashboard: 'View Dashboard',
    managePrefs: 'Manage preferences',
    fallbackName: 'User',
    fallbackCreator: 'A team member',
    high: 'High Priority',
    medium: 'Medium Priority',
    subjectAssigned: (s: string, t: string) => `[${s}] New task: ${t}`,
    subjectOverdue: (n: number) => `⚠️ [Startup Leiria] ${n} overdue task(s)`,
    locale: 'en-GB',
  },
} as const;

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);

  if (req.method === "OPTIONS") return handleCorsOptions(req);

  try {
    const authResult = requireCronSecret(req);
    if ('error' in authResult) { log.warn('Unauthorized'); return authResult.error; }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body: TaskNotificationRequest = await req.json();
    log.info('Task notification request', { type: body.type, taskId: body.taskId });

    if (body.type === "assigned" && body.taskId) {
      return corsJsonResponse(await sendAssignedNotification(supabase, body.taskId, log), req);
    } else if (body.type === "overdue") {
      return corsJsonResponse(await sendOverdueNotifications(supabase, log), req);
    }
    return corsJsonResponse({ error: "Invalid request type", code: "BAD_REQUEST" }, req, 400);

  } catch (error) {
    log.error('Fatal error', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return corsJsonResponse({ error: message, code: 'INTERNAL_ERROR' }, req, 500);
  }
});

async function sendAssignedNotification(supabase: any, taskId: string, log: any) {
  const { data: task, error: taskError } = await supabase
    .from("staff_tasks")
    .select(`*, workspace:workspaces(id, startup:startups(name))`)
    .eq("id", taskId).single();

  if (taskError || !task) {
    log.error('Task not found', taskError, { taskId });
    return { success: false, error: "Task not found" };
  }

  const { data: assignee, error: assigneeError } = await supabase
    .from("profiles").select("email, full_name, preferred_language")
    .eq("id", task.assignee_id).single();

  if (assigneeError || !assignee?.email) {
    log.error('Assignee not found', assigneeError, { assigneeId: task.assignee_id });
    return { success: false, error: "Assignee not found" };
  }

  const locale: Locale = (assignee.preferred_language === 'en' ? 'en' : 'pt');
  const s = STRINGS[locale];

  let creatorName = s.fallbackCreator;
  if (task.created_by) {
    const { data: creator } = await supabase
      .from("profiles").select("full_name").eq("id", task.created_by).single();
    if (creator?.full_name) creatorName = creator.full_name;
  }

  const startupName = task.workspace?.startup?.name || (locale === 'pt' ? 'uma startup' : 'a startup');
  const dueDate = task.due_date
    ? new Date(task.due_date).toLocaleDateString(s.locale, {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
      })
    : null;

  const emailHtml = buildAssignedEmail({
    assigneeName: assignee.full_name || s.fallbackName,
    taskTitle: task.title,
    taskDescription: task.description,
    startupName,
    creatorName,
    dueDate,
    priority: task.priority,
    workspaceId: task.workspace_id,
  }, locale);

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Startup Leiria <noreply@startupleiria.com>",
      to: [assignee.email],
      subject: s.subjectAssigned(startupName, task.title),
      html: emailHtml,
    }),
  });

  if (!emailResponse.ok) {
    const errorText = await emailResponse.text();
    log.error('Resend API error', new Error(errorText));
    return { success: false, error: errorText };
  }

  const result = await emailResponse.json();
  log.info('Assignment email sent', { emailId: result.id, locale });
  return { success: true, emailId: result.id };
}

async function sendOverdueNotifications(supabase: any, log: any) {
  const today = new Date().toISOString().split("T")[0];

  const { data: overdueTasks, error } = await supabase
    .from("staff_tasks")
    .select(`*, workspace:workspaces(id, startup:startups(name))`)
    .in("status", ["pending", "in_progress"]).lt("due_date", today);

  if (error) { log.error('Error fetching overdue tasks', error); return { success: false, error: error.message }; }
  if (!overdueTasks || overdueTasks.length === 0) {
    log.info('No overdue tasks found');
    return { success: true, emailsSent: 0 };
  }

  const tasksByAssignee = new Map<string, typeof overdueTasks>();
  for (const task of overdueTasks) {
    const existing = tasksByAssignee.get(task.assignee_id) || [];
    existing.push(task);
    tasksByAssignee.set(task.assignee_id, existing);
  }

  const localeMap = await resolveLocalesByUserIds(supabase, Array.from(tasksByAssignee.keys()));
  let emailsSent = 0;

  for (const [assigneeId, tasks] of tasksByAssignee) {
    const { data: assignee } = await supabase
      .from("profiles").select("email, full_name").eq("id", assigneeId).single();
    if (!assignee?.email) continue;

    const locale = localeMap.get(assigneeId) ?? 'pt';
    const s = STRINGS[locale];

    const emailHtml = buildOverdueEmail({
      assigneeName: assignee.full_name || s.fallbackName,
      tasks: tasks.map((t: any) => ({
        title: t.title,
        startupName: t.workspace?.startup?.name || (locale === 'pt' ? 'Desconhecido' : 'Unknown'),
        dueDate: t.due_date,
        workspaceId: t.workspace_id,
      })),
    }, locale);

    try {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Startup Leiria <noreply@startupleiria.com>",
          to: [assignee.email],
          subject: s.subjectOverdue(tasks.length),
          html: emailHtml,
        }),
      });
      if (emailResponse.ok) { emailsSent++; log.info('Overdue email sent', { email: assignee.email, locale }); }
    } catch (e) {
      log.error('Failed to send overdue email', e, { email: assignee.email });
    }
  }

  return { success: true, emailsSent, totalOverdue: overdueTasks.length };
}

interface AssignedEmailData {
  assigneeName: string;
  taskTitle: string;
  taskDescription: string | null;
  startupName: string;
  creatorName: string;
  dueDate: string | null;
  priority: string | null;
  workspaceId: string | null;
}

function buildAssignedEmail(data: AssignedEmailData, locale: Locale): string {
  const s = STRINGS[locale];
  const htmlLang = locale === 'pt' ? 'pt-PT' : 'en';
  const priorityBadge = data.priority === "high"
    ? `<span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${s.high}</span>`
    : data.priority === "medium"
    ? `<span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${s.medium}</span>`
    : '';

  const appUrl = Deno.env.get("PUBLIC_APP_URL") || "https://fb.startupleiria.com";
  const workspaceUrl = data.workspaceId
    ? `${appUrl}/workspace/${data.workspaceId}?tab=notes`
    : `${appUrl}/my-workspaces`;

  return `
    <!DOCTYPE html>
    <html lang="${htmlLang}">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #c8e53d 0%, #c03c3c 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">${s.assignedHeader}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">${s.brand}</p>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 12px 12px;">
        <p style="margin-top: 0;">${s.greeting(data.assigneeName)}</p>
        <p>${s.assignedIntro(data.creatorName)}</p>
        <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #c03c3c; margin: 20px 0;">
          <h2 style="margin: 0 0 10px 0; font-size: 18px;">${data.taskTitle} ${priorityBadge}</h2>
          ${data.taskDescription ? `<p style="color: #666; margin: 10px 0;">${data.taskDescription}</p>` : ''}
          <p style="color: #888; font-size: 14px; margin: 10px 0 0 0;">
            <strong>${s.startupLabel}:</strong> ${data.startupName}
            ${data.dueDate ? `<br><strong>${s.dueLabel}:</strong> ${data.dueDate}` : ''}
          </p>
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${workspaceUrl}"
             style="display: inline-block; background: #c03c3c; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
            ${s.viewTask}
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #666; font-size: 12px; text-align: center; margin-bottom: 0;">
          <a href="${appUrl}/settings" style="color: #c03c3c;">${s.managePrefs}</a>
        </p>
      </div>
    </body>
    </html>
  `;
}

interface OverdueEmailData {
  assigneeName: string;
  tasks: Array<{ title: string; startupName: string; dueDate: string; workspaceId: string | null }>;
}

function buildOverdueEmail(data: OverdueEmailData, locale: Locale): string {
  const s = STRINGS[locale];
  const htmlLang = locale === 'pt' ? 'pt-PT' : 'en';
  const taskAppUrl = Deno.env.get("PUBLIC_APP_URL") || "https://fb.startupleiria.com";

  const tasksList = data.tasks.map(t => {
    const daysOverdue = Math.floor((new Date().getTime() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24));
    const workspaceUrl = t.workspaceId ? `${taskAppUrl}/workspace/${t.workspaceId}?tab=notes` : "#";
    return `
      <li style="margin-bottom: 12px;">
        <a href="${workspaceUrl}" style="color: #c03c3c; text-decoration: none; font-weight: 500;">${t.title}</a>
        <br><span style="color: #888; font-size: 13px;">${t.startupName} • ${s.daysOverdue(daysOverdue)}</span>
      </li>
    `;
  }).join("");

  return `
    <!DOCTYPE html>
    <html lang="${htmlLang}">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #ef4444 0%, #c03c3c 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">${s.overdueHeader}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">${s.brand}</p>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 12px 12px;">
        <p style="margin-top: 0;">${s.greeting(data.assigneeName)}</p>
        <p>${s.overdueIntro(data.tasks.length)}</p>
        <ul style="background: white; padding: 20px 20px 20px 40px; border-radius: 8px; border-left: 4px solid #ef4444;">
          ${tasksList}
        </ul>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${taskAppUrl}/my-workspaces"
             style="display: inline-block; background: #c03c3c; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
            ${s.viewDashboard}
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #666; font-size: 12px; text-align: center; margin-bottom: 0;">
          <a href="${taskAppUrl}/settings" style="color: #c03c3c;">${s.managePrefs}</a>
        </p>
      </div>
    </body>
    </html>
  `;
}
