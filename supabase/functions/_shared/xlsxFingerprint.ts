// Compute a stable fingerprint for an uploaded XLSM against the canonical
// template stored in template_assets. The parser refuses to run when the
// fingerprint drifts (returns parse_status='template_mismatch') instead of
// silently mis-mapping cells.
//
// Fingerprint inputs (in order):
//   - Sorted sheet names (exact, with diacritics)
//   - Sorted defined-name targets (broken #REF! ones included)
//   - Header row of `Pressupostos` (row 8..14, columns C..M) — the input surface
//     signature; if the layout shifts, we bail.
//
// Byte identity is NOT required (users may resave from Excel), only structural
// identity of the anchoring layout.

import * as sha256 from "https://deno.land/std@0.224.0/hash/sha256.ts";

export interface XlsxFingerprintInput {
  sheetNames: string[];
  definedNameTargets: string[];      // "SheetX!$A$1" or "#REF!$A$1"
  pressupostosAnchor: string;         // concatenated anchor cells, TAB-separated
}

export async function computeFingerprint(f: XlsxFingerprintInput): Promise<string> {
  const buf = new TextEncoder().encode(
    [
      f.sheetNames.slice().sort().join("|"),
      f.definedNameTargets.slice().sort().join("|"),
      f.pressupostosAnchor,
    ].join("\u001F"),
  );
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Canonical fingerprint for schema_version=1, keyed to the audited
// user-uploaded workbook (sha256 1a843d03…4e). This constant is validated by a
// contract test (xlsmRoundTrip_test.ts) against the file in storage.
export const CANONICAL_FINGERPRINT_V1_ANCHOR_ROWS = [
  // (sheet 'Pressupostos', rows we anchor on)
  { sheet: "Pressupostos", row: 8,  cols: ["C"] },  // "Pressupostos Gerais"
  { sheet: "Pressupostos", row: 17, cols: ["C"] },  // "Fiscalidade"
  { sheet: "Pressupostos", row: 32, cols: ["C"] },  // "Prejuízos Fiscais"
  { sheet: "Pressupostos", row: 35, cols: ["C"] },  // "Inflação"
  { sheet: "Pressupostos", row: 39, cols: ["C"] },  // "2. Vendas e Serviços…"
];

// Canonical sheet names for schema_version=1 (order-sensitive when displayed).
export const CANONICAL_SHEETS_V1 = [
  "Capa",
  "Instruções de Preenchimento",
  "Pressupostos",
  "1.Demonstração de Resultados",
  "2. Balanço",
  "3. Avaliação Financeira",
  "4. Rácios Financeiros",
  "5. Fundo de Maneio",
  "6. Investimento",
  "CAE",
  "7. Serviço da Dívida",
  "8. Mapa de tesouraria",
  "9. Capital Próprio",
  "10. Anexo_Prejuízos fiscais",
  "11. Investidores",
  "12. Unit Economics",
  "A. Aux_Mat Prima % Vendas",
  "B. Aux_Var Produção % Vendas",
  "Calc auxiliar livre",
] as const;

// The broken named ranges observed in the canonical workbook. Reported by the
// parser as warnings but never silently repaired.
export const KNOWN_BROKEN_NAMED_RANGES_V1 = [
  "areas",
  "Áreas",
  "fimSomas",
  "YesNo",
] as const;
