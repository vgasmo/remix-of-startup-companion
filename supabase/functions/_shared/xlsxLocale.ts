// Locale-safe number parsing for XLSX imports.
// Handles: "1.234,56" (pt-PT), "1,234.56" (en-US), "1234.56", "1234,56",
//          "€1 234,56", "(1.234,56)" negatives, "€ 1.234.567", "-", "".
// Rules:
//   1. Strip currency symbols, spaces, non-breaking spaces.
//   2. Parenthesised => negative.
//   3. If both "," and "." appear, the *last* one is the decimal separator.
//   4. If only one separator appears:
//        - "," with ≥3 digits after it => thousands separator (drop it).
//        - "." with ≥3 digits after it => thousands separator (drop it).
//        - otherwise it is the decimal separator.
//   5. Repeated separators (e.g. "1.234.567") always thousands.

export function parseLocalizedNumber(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  let s = String(input).trim();
  if (!s || s === "-" || s === "—" || s === "N/A" || s === "n/a") return null;

  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  // Strip currency, letters, spaces, NBSP, narrow NBSP.
  s = s.replace(/[\u00A0\u202F\s]/g, "").replace(/[€$£¥₹]/g, "");
  // Trailing minus (accounting): "1.234,56-"
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  let normalized: string;
  if (hasComma && hasDot) {
    // Last one wins as decimal.
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // pt-PT: '.' thousands, ',' decimal
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      // en-US: ',' thousands, '.' decimal
      normalized = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Only comma present.
    const parts = s.split(",");
    if (parts.length > 2) {
      // Multiple commas => thousands.
      normalized = s.replace(/,/g, "");
    } else {
      const [, frac] = parts;
      if (frac.length === 3 && parts[0].length > 0 && parts[0].length <= 3) {
        // Ambiguous "1,234" — treat as thousands (common in en-US bare integers).
        normalized = s.replace(/,/g, "");
      } else {
        normalized = s.replace(",", ".");
      }
    }
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 2) {
      normalized = s.replace(/\./g, "");
    } else {
      const [, frac] = parts;
      if (frac.length === 3 && parts[0].length > 0 && parts[0].length <= 3) {
        // "1.234" — thousands.
        normalized = s.replace(/\./g, "");
      } else {
        normalized = s; // already dot-decimal
      }
    }
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// Convenience: percent-aware. Accepts "23%" or "0.23" and always returns the
// decimal fraction (0.23). Returns null on garbage.
export function parseLocalizedPercent(input: unknown): number | null {
  if (typeof input === "string" && input.trim().endsWith("%")) {
    const raw = parseLocalizedNumber(input.trim().slice(0, -1));
    return raw === null ? null : raw / 100;
  }
  return parseLocalizedNumber(input);
}
