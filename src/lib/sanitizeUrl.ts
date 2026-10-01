/**
 * Sanitize external URLs to prevent XSS via javascript: protocol etc.
 * Returns the URL if safe (http, https, mailto, or relative path), undefined otherwise.
 */
export function sanitizeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return trimmed;
    return undefined;
  } catch {
    // Allow relative paths
    if (trimmed.startsWith('/')) return trimmed;
    return undefined;
  }
}

export const safeExternalHref = (u?: string | null) => {
  const v = (u ?? '').trim();
  return v ? sanitizeUrl(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`) : undefined;
};
