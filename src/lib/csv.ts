/** Quote every cell and neutralize spreadsheet formulas, including hidden prefixes. */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f\u007f\ufeff]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function serializeCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}