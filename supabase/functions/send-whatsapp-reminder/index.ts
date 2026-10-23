import { isAccountActive } from '../_shared/security.ts';
import { getCommunicationContacts, selectCommunicationPhone } from '../_shared/communicationRecipients.ts';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';



const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Só staff (admin/consultor); falha fechada
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: staffRoles, error: roleError } = await supabase.from('user_roles').select('role').eq('user_id', user.id).in('role', ['admin', 'consultor']);
    if (roleError || !staffRoles || staffRoles.length === 0 || !(await isAccountActive(supabase, user.id))) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { to, message, type = 'sms', workspace_id, startup_id, session_id, funnel_item_id } = await req.json();

    if (typeof to !== 'string' || !/^\+[1-9]\d{6,14}$/.test(to) || typeof message !== 'string' || !message.trim() || message.length > 4000 || !['sms', 'whatsapp'].includes(type) ||
      [workspace_id, startup_id, session_id, funnel_item_id].some(id => id != null && (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))) {
      return new Response(JSON.stringify({ error: 'Missing to or message' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      selectCommunicationPhone(to, await getCommunicationContacts(supabase, { workspace_id, startup_id, session_id, funnel_item_id }));
    } catch (error) {
      const code = error instanceof Error ? error.message : 'recipient_lookup_failed';
      return new Response(JSON.stringify({ error: code }), { status: code === 'recipient_lookup_failed' ? 503 : code === 'invalid_recipient_scope' ? 400 : 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
    const TWILIO_PHONE = Deno.env.get('TWILIO_PHONE_NUMBER');
    if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !TWILIO_PHONE) throw new Error('Messaging not configured');

    // Send via Twilio Gateway
    const body: Record<string, string> = {
      To: type === 'whatsapp' ? `whatsapp:${to}` : to,
      From: type === 'whatsapp' ? `whatsapp:${TWILIO_PHONE}` : TWILIO_PHONE,
      Body: message,
    };

    const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Twilio API error [${response.status}]`);
    }

    return new Response(JSON.stringify({ success: true, sid: data.sid }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('WhatsApp reminder failed');
    const errorMessage = 'Failed to send reminder';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});