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
