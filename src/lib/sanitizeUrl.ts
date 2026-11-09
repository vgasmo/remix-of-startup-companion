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
    // Allow in-app relative paths. `//host` and `/\host` are protocol-relative (external) and
    // browsers strip tab/newline from URLs (`/\t/host`), so refuse those and any control character.
    if (/^\/(?![\/\\])/.test(trimmed) && !/[\u0000-\u001f\u007f]/.test(trimmed)) return trimmed;
    return undefined;
  }
}

export const safeExternalHref = (u?: string | null) => {
  const v = (u ?? '').trim();
  return v ? sanitizeUrl(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`) : undefined;
};
