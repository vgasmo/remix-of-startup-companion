// Shared CSV + XLSX parser for import edge functions.
// deno-lint-ignore-file no-explicit-any

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',' || c === ';') { record.push(field); field = ''; }
      else if (c === '\n') { record.push(field); rows.push(record); record = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || record.length) { record.push(field); rows.push(record); }
  const headers = (rows.shift() ?? []).map(h => h.trim());
  const out: Record<string, string>[] = [];
  for (const r of rows) {
    if (r.every(v => !v || !v.trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    out.push(obj);
  }
  return { headers, rows: out };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&');
}

export async function parseXlsx(bytes: Uint8Array, sheetName?: string): Promise<{ headers: string[]; rows: Record<string, string>[]; sheets: string[] }> {
  const JSZipMod: any = await import('https://esm.sh/jszip@3.10.1');
  const JSZip = JSZipMod.default ?? JSZipMod;
  const zip = await JSZip.loadAsync(bytes);

  const sstFile = zip.file('xl/sharedStrings.xml');
  const shared: string[] = [];
  if (sstFile) {
    const xml = await sstFile.async('string');
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(xml))) {
      let combined = '';
      let tm: RegExpExecArray | null;
      const inner = m[1];
      while ((tm = tRe.exec(inner))) combined += tm[1];
      shared.push(decodeXmlEntities(combined));
    }
  }

  const wbFile = zip.file('xl/workbook.xml');
  const wbXml = wbFile ? await wbFile.async('string') : '';
  const sheetRe = /<sheet\b[^>]*name="([^"]+)"[^>]*(?:r:id|sheetId)="[^"]*"[^>]*\/>/g;
  const sheets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = sheetRe.exec(wbXml))) sheets.push(sm[1]);

  const idx = sheetName ? Math.max(0, sheets.indexOf(sheetName)) : 0;
  const sheetPath = `xl/worksheets/sheet${idx + 1}.xml`;
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) throw new Error(`sheet_not_found:${sheetPath}`);
  const sheetXml = await sheetFile.async('string');

  const cellRefColumn = (ref: string) => ref.replace(/\d+/g, '');
  const colIndex = (col: string) => {
    let n = 0;
    for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };

  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
  const attr = (s: string, k: string) => { const m = s.match(new RegExp(`\\b${k}="([^"]*)"`)); return m ? m[1] : null; };

  const rowsRaw: string[][] = [];
  let rm2: RegExpExecArray | null;
  while ((rm2 = rowRe.exec(sheetXml))) {
    const rowInner = rm2[1];
    const cells: string[] = [];
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowInner))) {
      const attrs = cm[1] ?? cm[3] ?? '';
      const body = cm[2] ?? '';
      const ref = attr(attrs, 'r') ?? '';
      const type = attr(attrs, 't');
      const col = ref ? colIndex(cellRefColumn(ref)) : cells.length;
      let value = '';
      if (type === 's') {
        const vm = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        if (vm) value = shared[parseInt(vm[1], 10)] ?? '';
      } else if (type === 'inlineStr' || type === 'str') {
        const tm2 = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        value = tm2 ? decodeXmlEntities(tm2[1]) : '';
      } else if (type === 'b') {
        const vm = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        value = vm ? (vm[1] === '1' ? 'TRUE' : 'FALSE') : '';
      } else {
        const vm = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        value = vm ? decodeXmlEntities(vm[1]) : '';
      }
      while (cells.length < col) cells.push('');
      cells[col] = value;
    }
    rowsRaw.push(cells);
  }

  const headers = (rowsRaw.shift() ?? []).map(h => (h ?? '').trim());
  const rows: Record<string, string>[] = [];
  for (const r of rowsRaw) {
    if (!r.some(v => v && v.trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    rows.push(obj);
  }
  return { headers, rows, sheets };
}
