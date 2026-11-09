// Utilitários puros do importador CSV de leads (bulk-import-leads): separador e valores monetários em formato PT.

/** O Excel em português guarda CSV com ';' (e valores como 1.500,50): detetar o separador pela linha de cabeçalho. */
export function detectDelimiter(text: string): string {
  let commas = 0, semis = 0, tabs = 0, inQuote = false;
  for (const c of text.replace(/^\uFEFF/, "")) {
    if (c === '"') { inQuote = !inQuote; continue; }
    if (inQuote) continue;
    if (c === "\n" || c === "\r") break;
    if (c === ",") commas++; else if (c === ";") semis++; else if (c === "\t") tabs++;
  }
  return semis > commas && semis >= tabs ? ";" : tabs > commas ? "\t" : ",";
}

/** '5.000' -> 5000, '1.500,50' -> 1500.5, '1,500.50' -> 1500.5, '12,5' -> 12.5; ilegível -> null */
export function parseMoney(raw: string): number | null {
  let s = raw.replace(/[€$\s]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
