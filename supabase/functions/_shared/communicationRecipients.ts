import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { selectSessionRecipients } from './sessionRecipients.ts';

export interface CommunicationContacts { emails: string[]; phones: string[]; userIds: string[] }
export interface CommunicationScope { workspace_id?: string; startup_id?: string; session_id?: string; funnel_item_id?: string }
export const normalizeContactPhone = (phone: string): string => phone.trim().replace(/^00/, '+').replace(/[\s().-]/g, '');

/** Persisted parent relationships, never request-provided contact details, establish eligibility. */
export async function getCommunicationContacts(admin: SupabaseClient, scope: CommunicationScope): Promise<CommunicationContacts> {
  let workspaceId = scope.workspace_id;
  let startupId = scope.startup_id;
  const emails: string[] = [];
  const phones: string[] = [];
  const userIds: string[] = [];
  const check = (result: { error: unknown }) => { if (result.error) throw new Error('recipient_lookup_failed'); };
  if (scope.funnel_item_id) {
    // CRM contacts exist before a startup/workspace is created.
    if (workspaceId || startupId || scope.session_id) throw new Error('invalid_recipient_scope');
    const lead = await admin.from('funnel_items').select('contact_email,contact_phone').eq('id', scope.funnel_item_id).single();
    check(lead);
    if (!lead.data) throw new Error('recipient_not_authorized');
    if (lead.data.contact_email) emails.push(lead.data.contact_email);
    if (lead.data.contact_phone) phones.push(lead.data.contact_phone);
    return { emails, phones, userIds };
  }
  if (scope.session_id) {
    const session = await admin.from('sessions').select('workspace_id,primary_consultant_id,primary_mentor_id').eq('id', scope.session_id).single();
    check(session);
    if (!session.data?.workspace_id || workspaceId && workspaceId !== session.data.workspace_id) throw new Error('recipient_not_authorized');
    workspaceId = session.data.workspace_id;
    for (const id of [session.data.primary_consultant_id, session.data.primary_mentor_id]) if (id) userIds.push(id);
    const participants = await admin.from('session_participants').select('user_id').eq('session_id', scope.session_id);
    check(participants);
    for (const row of participants.data ?? []) userIds.push(row.user_id);
  }
  if (workspaceId) {
    const workspace = await admin.from('workspaces').select('startup_id,assigned_consultor_id').eq('id', workspaceId).single();
    check(workspace);
    if (!workspace.data || startupId && startupId !== workspace.data.startup_id) throw new Error('recipient_not_authorized');
    startupId = workspace.data.startup_id ?? undefined;
    if (workspace.data.assigned_consultor_id) userIds.push(workspace.data.assigned_consultor_id);
    const members = await admin.from('workspace_users').select('user_id').eq('workspace_id', workspaceId).eq('active', true);
    check(members);
    for (const member of members.data ?? []) userIds.push(member.user_id);
  }
  if (!startupId && !workspaceId) throw new Error('invalid_recipient_scope');
  if (startupId) {
    const [startup, team] = await Promise.all([
      admin.from('startups').select('main_contact_email,main_contact_phone,phone').eq('id', startupId).single(),
      admin.from('team_members').select('email,phone,user_id').eq('startup_id', startupId).is('left_at', null),
    ]);
    check(startup); check(team);
    if (!startup.data) throw new Error('recipient_not_authorized');
    if (startup.data.main_contact_email) emails.push(startup.data.main_contact_email);
    for (const phone of [startup.data.main_contact_phone, startup.data.phone]) if (phone) phones.push(phone);
    for (const member of team.data ?? []) {
      if (member.email) emails.push(member.email);
      if (member.phone) phones.push(member.phone);
      if (member.user_id) userIds.push(member.user_id);
    }
  }
  if (userIds.length) {
    const profiles = await admin.from('profiles').select('id,email,phone').in('id', [...new Set(userIds)]).eq('account_status', 'approved');
    check(profiles);
    for (const profile of profiles.data ?? []) {
      if (profile.email) emails.push(profile.email);
      if (profile.phone) phones.push(profile.phone);
    }
  }
  return { emails: [...new Set(emails)], phones: [...new Set(phones)], userIds: [...new Set(userIds)] };
}

export function selectCommunicationEmails(requested: unknown, contacts: CommunicationContacts): string[] {
  return selectSessionRecipients(requested, contacts.emails);
}

export function selectCommunicationPhone(requested: string, contacts: CommunicationContacts): string {
  if (!/^\+[1-9]\d{6,14}$/.test(requested)) throw new Error('invalid_recipients');
  if (!contacts.phones.some(phone => normalizeContactPhone(phone) === requested)) throw new Error('recipient_not_authorized');
  return requested;
}