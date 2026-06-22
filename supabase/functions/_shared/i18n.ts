/**
 * Shared i18n helper for edge functions.
 * Resolves recipient locale ('pt' | 'en') from profiles.preferred_language.
 * Default locale is 'pt'.
 */

export type Locale = 'pt' | 'en';

export function normalizeLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : 'pt';
}

/**
 * Batch-resolve locales for a set of recipient emails (case-insensitive).
 * Returns a Map<lowercaseEmail, Locale>. Missing emails default to 'pt'.
 */
export async function resolveLocalesByEmails(
  supabaseAdmin: any,
  emails: string[],
): Promise<Map<string, Locale>> {
  const result = new Map<string, Locale>();
  if (!emails || emails.length === 0) return result;

  const lower = Array.from(new Set(emails.map((e) => e.toLowerCase())));
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('email, preferred_language')
    .in('email', lower);

  for (const e of lower) result.set(e, 'pt');
  for (const row of (data ?? []) as Array<{ email: string; preferred_language: string | null }>) {
    if (row.email) result.set(row.email.toLowerCase(), normalizeLocale(row.preferred_language));
  }
  return result;
}

/**
 * Resolve locales by user IDs. Returns Map<userId, Locale>.
 */
export async function resolveLocalesByUserIds(
  supabaseAdmin: any,
  userIds: string[],
): Promise<Map<string, Locale>> {
  const result = new Map<string, Locale>();
  if (!userIds || userIds.length === 0) return result;
  const unique = Array.from(new Set(userIds));
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, preferred_language')
    .in('id', unique);
  for (const id of unique) result.set(id, 'pt');
  for (const row of (data ?? []) as Array<{ id: string; preferred_language: string | null }>) {
    result.set(row.id, normalizeLocale(row.preferred_language));
  }
  return result;
}

export function pickLang<T>(locale: Locale, values: { pt: T; en: T }): T {
  return locale === 'en' ? values.en : values.pt;
}
