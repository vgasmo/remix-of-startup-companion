/**
 * Edge Function: send-crm-stage-transition-email
 * 
 * Sends automated email when a CRM funnel item transitions between stages.
 * Uses idempotency via crm_stage_email_log to prevent duplicate sends.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from "npm:resend@4.0.0";
import { requireCronOrStaff } from "../_shared/security.ts";
import { handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface StageTransitionRequest {
  funnel_item_id: string;
  from_stage: string;
  to_stage: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
  const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });

  // Security guard: require cron secret OR authenticated staff user
  const authResult = await requireCronOrStaff(req, supabaseUser, supabaseAdmin);
  if ("error" in authResult) {
    return authResult.error;
  }

  try {
    const { funnel_item_id, from_stage, to_stage }: StageTransitionRequest = await req.json();

    if (!funnel_item_id || !from_stage || !to_stage) {
      return corsJsonResponse(
        { error: 'funnel_item_id, from_stage, and to_stage are required' },
        req, 400
      );
    }

    console.log(`Processing stage transition email: ${from_stage} → ${to_stage} for item ${funnel_item_id}`);

    // 1. Find active rule for this transition
    const { data: rule, error: ruleError } = await supabaseAdmin
      .from('crm_stage_email_rules')
      .select('*')
      .eq('from_stage', from_stage)
      .eq('to_stage', to_stage)
      .eq('enabled', true)
      .maybeSingle();

    if (ruleError) {
      console.error('Error fetching rule:', ruleError);
      throw ruleError;
    }

    if (!rule) {
      console.log(`No active email rule for transition ${from_stage} → ${to_stage}`);
      return corsJsonResponse({ success: true, action: 'no_rule', sent: false }, req);
    }

    // 2. Try to insert log entry (idempotency check via UNIQUE constraint)
    const { data: logEntry, error: logError } = await supabaseAdmin
      .from('crm_stage_email_log')
      .insert({
        funnel_item_id,
        from_stage,
        to_stage,
        rule_id: rule.id,
        status: 'queued',
      })
      .select()
      .single();

    if (logError) {
      // If UNIQUE constraint violation, email was already sent
      if (logError.code === '23505') {
        console.log(`Email already sent for this transition (idempotency check)`);
        return corsJsonResponse({ success: true, action: 'already_sent', sent: false }, req);
      }
      throw logError;
    }

    // 3. Get funnel item details
    const { data: funnelItem, error: itemError } = await supabaseAdmin
      .from('funnel_items')
      .select('id, contact_name, contact_email, organization_name')
      .eq('id', funnel_item_id)
      .single();

    if (itemError || !funnelItem) {
      console.error('Funnel item not found:', itemError);
      await supabaseAdmin
        .from('crm_stage_email_log')
        .update({ status: 'failed', error_message: 'Funnel item not found' })
        .eq('id', logEntry.id);
      throw new Error(`Funnel item not found: ${funnel_item_id}`);
    }

    if (!funnelItem.contact_email) {
      console.log('No contact email for funnel item, skipping');
      await supabaseAdmin
        .from('crm_stage_email_log')
        .update({ status: 'skipped', error_message: 'No contact email' })
        .eq('id', logEntry.id);
      return corsJsonResponse({ success: true, action: 'no_email', sent: false }, req);
    }

    // 4. Prepare email with variable substitution
    const recipientName = funnelItem.contact_name || funnelItem.organization_name || 'there';
    const subject = rule.subject
      .replace('{{name}}', recipientName)
      .replace('{{organization}}', funnelItem.organization_name || '')
      .replace('{{from_stage}}', from_stage)
      .replace('{{to_stage}}', to_stage);

    const bodyHtml = rule.body_html
      .replace(/\{\{name\}\}/g, recipientName)
      .replace(/\{\{organization\}\}/g, funnelItem.organization_name || '')
      .replace(/\{\{from_stage\}\}/g, from_stage)
      .replace(/\{\{to_stage\}\}/g, to_stage);

    // 5. Send email via Resend
    try {
      const emailResult = await resend.emails.send({
        from: rule.from_email || "Startup Leiria <noreply@startupleiria.com>",
        to: [funnelItem.contact_email],
        replyTo: rule.reply_to || undefined,
        subject,
        html: bodyHtml,
      });

      console.log(`Email sent successfully to ${funnelItem.contact_email}`);

      // Update log entry with success
      await supabaseAdmin
        .from('crm_stage_email_log')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider_message_id: emailResult.data?.id || null,
        })
        .eq('id', logEntry.id);

      return corsJsonResponse(
        { success: true, action: 'sent', sent: true, messageId: emailResult.data?.id },
        req
      );
    } catch (emailError: unknown) {
      const errorMessage = emailError instanceof Error ? emailError.message : 'Unknown email error';
      console.error('Failed to send email:', errorMessage);

      await supabaseAdmin
        .from('crm_stage_email_log')
        .update({ status: 'failed', error_message: errorMessage })
        .eq('id', logEntry.id);

      return corsJsonResponse({ success: false, error: errorMessage }, req, 500);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in send-crm-stage-transition-email:', error);
    return corsJsonResponse({ error: message }, req, 500);
  }
});
