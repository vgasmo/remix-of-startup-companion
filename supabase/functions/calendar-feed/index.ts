/**
 * Calendar Feed Edge Function
 * Returns an ICS feed for sessions (authenticated or token-based)
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { createLogger, generateRequestId, ErrorCode, isAccountActive } from '../_shared/security.ts';

const FUNCTION_NAME = 'calendar-feed';

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// RFC 5545 §3.1: linhas com no máximo 75 octetos; continuação começa por um espaço.
function foldICSLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 75) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

function safeICSUrl(value: string | null): string | null {
  return value && /^https?:\/\/[^\s]+$/i.test(value) ? value : null;
}

interface Session {
  id: string;
  title: string;
  scheduled_at: string;
  duration: number | null;
  location: string | null;
  notes: string | null;
  join_url: string | null;
  teams_meeting_url: string | null;
  workspaces?: {
    startups?: {
      name: string;
    };
  };
}

Deno.serve(async (req: Request) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const workspaceId = url.searchParams.get('workspace_id');
    
    log.info('Calendar feed request', { hasToken: !!token, workspaceId: !!workspaceId });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authentication: Either JWT from header OR a secure calendar token
    let authenticatedUserId: string | null = null;
    
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const jwtToken = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(jwtToken);
      if (!error && user) {
        authenticatedUserId = user.id;
      }
    }
    
    // If no JWT auth, check for calendar feed token (stored as SHA-256 hash)
    if (!authenticatedUserId && token) {
      // Hash the provided token to compare with stored hash
      const tokenHash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(token)
      );
      const tokenHashHex = Array.from(new Uint8Array(tokenHash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Validate token hash and check expiration (owner-only table; service role bypasses RLS)
      const { data: tokenRow, error } = await supabase
        .from('user_calendar_tokens')
        .select('user_id, expires_at')
        .eq('token_hash', tokenHashHex)
        .maybeSingle();

      if (tokenRow && !error) {
        if (tokenRow.expires_at) {
          const expiresAt = new Date(tokenRow.expires_at);
          if (expiresAt < new Date()) {
            log.warn('Calendar token expired');
            return new Response('Token expired. Please generate a new calendar token.', {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
            });
          }
        }

        authenticatedUserId = tokenRow.user_id;
        log.info('Token validated for user', { userId: tokenRow.user_id });
      } else {
        log.warn('Invalid calendar token');
        return new Response('Invalid or expired token', {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
        });
      }
    }
    
    // Authentication is ALWAYS required — no anonymous access
    if (!authenticatedUserId) {
      return new Response('Unauthorized - provide token parameter or Authorization header', {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      });
    }

    // AGENTS.md: conta suspensa/pendente não usa operações com service role (token de calendário incluído)
    if (!(await isAccountActive(supabase, authenticatedUserId))) {
      return new Response('Forbidden - account not active', {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      });
    }

    // Build query based on scope
    let sessions: Session[] = [];
    
    if (workspaceId) {
      // Verify the authenticated user has access to this workspace
      const { data: membership } = await supabase
        .from('workspace_users')
        .select('workspace_id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', authenticatedUserId)
        .eq('active', true)
        .maybeSingle();

      // Also allow staff (admin/consultor) to access any workspace
      const { data: staffRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', authenticatedUserId)
        .in('role', ['admin', 'consultor'])
        .limit(1);

      if (!membership && !(staffRoles && staffRoles.length > 0)) {
        return new Response('Forbidden - no access to this workspace', {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
        });
      }

      // Fetch sessions for a specific workspace
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id, title, scheduled_at, duration, location, notes, join_url, teams_meeting_url,
          workspaces!inner(startups(name))
        `)
        .eq('workspace_id', workspaceId)
        .neq('status', 'cancelled')
        .gte('scheduled_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
        .lte('scheduled_at', new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()) // Next 90 days
        .order('scheduled_at', { ascending: true })
        .limit(200);
      
      if (error) {
        log.error('Error fetching workspace sessions', error);
        throw error;
      }
      sessions = (data || []) as unknown as Session[];
    } else if (authenticatedUserId) {
      // Fetch sessions for all workspaces the user has access to
      const { data: userWorkspaces } = await supabase
        .from('workspace_users')
        .select('workspace_id')
        .eq('user_id', authenticatedUserId)
        .eq('active', true);
      
      if (userWorkspaces && userWorkspaces.length > 0) {
        const workspaceIds = userWorkspaces.map(w => w.workspace_id);
        
        const { data, error } = await supabase
          .from('sessions')
          .select(`
            id, title, scheduled_at, duration, location, notes, join_url, teams_meeting_url,
            workspaces!inner(startups(name))
          `)
          .in('workspace_id', workspaceIds)
          .neq('status', 'cancelled')
          .gte('scheduled_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .lte('scheduled_at', new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(500);
        
        if (error) {
          log.error('Error fetching user sessions', error);
          throw error;
        }
        sessions = (data || []) as unknown as Session[];
      }
    }

    log.info('Found sessions', { count: sessions.length });

    // Generate ICS content
    const appUrl = Deno.env.get('PUBLIC_APP_URL') || Deno.env.get('APP_URL') || 'https://fb.startupleiria.com';
    
    const dtstamp = formatICSDate(new Date());
    const icsEvents = sessions.flatMap(session => {
      const startDate = new Date(session.scheduled_at);
      const endDate = new Date(startDate.getTime() + (session.duration || 60) * 60 * 1000);
      const startupName = session.workspaces?.startups?.name || 'Session';
      const joinUrl = safeICSUrl(session.join_url);
      const teamsUrl = safeICSUrl(session.teams_meeting_url);

      const description = [
        session.notes,
        joinUrl ? `Join: ${joinUrl}` : null,
        teamsUrl ? `Teams: ${teamsUrl}` : null,
      ].filter(Boolean).join('\n');

      const lines = [
        'BEGIN:VEVENT',
        `UID:session-${session.id}@startupleiria.app`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${formatICSDate(startDate)}`,
        `DTEND:${formatICSDate(endDate)}`,
        `SUMMARY:${escapeICSText(`${session.title} - ${startupName}`)}`,
      ];
      if (description) lines.push(`DESCRIPTION:${escapeICSText(description)}`);
      if (session.location) lines.push(`LOCATION:${escapeICSText(session.location)}`);
      if (teamsUrl || joinUrl) lines.push(`URL:${teamsUrl || joinUrl}`);
      lines.push('END:VEVENT');
      return lines.map(foldICSLine);
    });

    // RFC 5545: separador CRLF, sem linhas em branco
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Startup Leiria//Session Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Startup Leiria Sessions',
      'X-WR-TIMEZONE:Europe/Lisbon',
      'X-PUBLISHED-TTL:PT15M',
      'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
      ...icsEvents,
      'END:VCALENDAR',
    ].join('\r\n') + '\r\n';

    log.info('Generated ICS feed successfully');

    return new Response(icsContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="sessions.ics"',
        'Cache-Control': 'private, max-age=300', // Cache for 5 minutes
      },
    });

  } catch (error: unknown) {
    log.error('Calendar feed error', error);
    return new Response('Internal error', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });
  }
});
