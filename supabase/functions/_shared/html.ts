/**
 * RC11: escape de HTML para relatorios gerados nas edge functions.
 * Qualquer valor vindo da BD (nomes de startups, titulos, notas, nomes de pessoas) passa por escapeHtml
 * antes de ser interpolado. REPORT_CSP_META impede a execucao de scripts no documento gerado.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const REPORT_CSP_META =
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:">`;

/** Notification links must stay within the configured application origin. */
export function safeAppUrl(value: unknown, appUrl: string): string {
  const base = new URL(appUrl);
  try {
    const url = new URL(typeof value === 'string' ? value : '', base);
    if (url.protocol === 'https:' && url.origin === base.origin && !url.username && !url.password) return url.href;
  } catch { /* malformed URLs use the application home */ }
  return base.origin;
}

/** Preserve trusted template markup; inserted CRM values are text, never markup. */
export function interpolateHtml(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? escapeHtml(values[key]) : match);
}
