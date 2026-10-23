import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Caller-selected subsets must stay inside server-recorded session contacts. */
export function selectSessionRecipients(requested: unknown, allowed: string[]): string[] {
  const normalize = (value: string) => value.trim().toLowerCase();
  const known = new Set(allowed.map(normalize).filter(Boolean));
  if (requested == null) return [...known];
  if (!Array.isArray(requested) || requested.length > 50 || requested.some(value =>
    typeof value !== 'string' || value.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))) {
    throw new Error('invalid_recipients');
  }
  const recipients = [...new Set(requested.map(normalize))];
  if (recipients.some(email => !known.has(email))) throw new Error('recipient_not_authorized');
  return recipients;
}

export async function getSessionRecipientEmails(admin: SupabaseClient, sessionId: string, workspaceId: string): Promise<string[]> {
  const [members, participants, session, workspace] = await Promise.all([
    admin.from('workspace_users').select('user_id').eq('workspace_id', workspaceId).eq('active', true),
    admin.from('session_participants').select('user_id').eq('session_id', sessionId),
    admin.from('sessions').select('primary_consultant_id,primary_mentor_id').eq('id', sessionId).eq('workspace_id', workspaceId).single(),
    admin.from('workspaces').select('startup:startups(main_contact_email)').eq('id', workspaceId).single(),
  ]);
  if (members.error || participants.error || session.error || workspace.error) throw new Error('recipient_lookup_failed');
  const ids = [...new Set([
    ...(members.data ?? []).map(row => row.user_id),
    ...(participants.data ?? []).map(row => row.user_id),
    session.data?.primary_consultant_id, session.data?.primary_mentor_id,
  ].filter((id): id is string => typeof id === 'string'))];
  const startup = workspace.data?.startup as unknown as { main_contact_email?: unknown } | { main_contact_email?: unknown }[] | null;
  const contact = Array.isArray(startup) ? startup[0]?.main_contact_email : startup?.main_contact_email;
  const emails: string[] = typeof contact === 'string' && contact.trim() ? [contact] : [];
  if (ids.length) {
    const profiles = await admin.from('profiles').select('email').in('id', ids).eq('account_status', 'approved');
    if (profiles.error) throw new Error('recipient_lookup_failed');
    for (const profile of profiles.data ?? []) if (typeof profile.email === 'string' && profile.email.trim()) emails.push(profile.email);
  }
  return emails;
}