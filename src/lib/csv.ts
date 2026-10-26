/** Values that spreadsheets always read as plain numbers can never be formulas. */
const NUMERIC_ONLY = /^-?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

/** Quote every cell and neutralize spreadsheet formulas, including hidden prefixes. */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (!NUMERIC_ONLY.test(text) && /^[\s\u0000-\u001f\u007f\ufeff]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function serializeCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}