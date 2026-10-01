// Admin kill-switch for founder notifications (system_settings 'notifications.founders_disabled').
// Fail-closed: if the check itself fails, the email is NOT sent.
// deno-lint-ignore no-explicit-any
type Client = any;

export async function isFounderEmailBlocked(client: Client, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return foundersGloballyDisabled(client);
  const { data, error } = await client.rpc('founder_notifications_blocked', { _user_id: userId });
  if (error) {
    console.warn('[founderKillSwitch] check failed', error.message);
    return true;
  }
  return data === true;
}

/** For recipients without an account (e.g. survey invites to contact emails). */
export async function foundersGloballyDisabled(client: Client): Promise<boolean> {
  const { data, error } = await client
    .from('system_settings').select('value').eq('key', 'notifications.founders_disabled').maybeSingle();
  if (error) {
    console.warn('[founderKillSwitch] settings read failed', error.message);
    return true;
  }
  const v = data?.value;
  return v === true || v === 'true';
}
