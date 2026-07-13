// Read specific cells from an XLSX/XLSM archive by (sheet, address).
// Uses the shared-strings table and resolves cached formula values (<v>).
// This is the READ counterpart to xlsmRoundTrip.patchWorksheetXml.
//
// Contract:
//   - Sheet lookup is by exact display name (including diacritics), via
//     xl/workbook.xml + xl/_rels/workbook.xml.rels.
//   - For each requested address, returns the cached <v> value (Excel writes
//     it alongside formulas), decoded through sharedStrings when t="s".
//   - Returns { raw: string|null, type: cellType } — caller decides how to
//     coerce (use parseLocalizedNumber for numeric metrics).
//   - Cells that are absent from the sheet XML return { raw: null }.

import JSZip from "https://esm.sh/jszip@3.10.1";

export type CellType = "n" | "s" | "str" | "b" | "e" | "inlineStr" | "d" | null;

export interface CellRead {
  raw: string | null;
  type: CellType;
}

export interface XlsmReader {
  sheetNames: string[];
  readCell(sheet: string, address: string): Promise<CellRead>;
  readCells(requests: Array<{ sheet: string; address: string }>): Promise<Map<string, CellRead>>;
}

async function loadSheetMap(zip: JSZip): Promise<Map<string, string>> {
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbookXml || !relsXml) throw new Error("Invalid XLSX: missing workbook.xml");
  const rels = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b([^/>]*)\/?>/g)) {
    const attrs = m[1];
    const id = attrs.match(/\bId="([^"]+)"/)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) rels.set(id, target);
  }
  const map = new Map<string, string>();
  for (const m of workbookXml.matchAll(/<sheet\b([^/>]*)\/?>/g)) {
    const attrs = m[1];
    const name = attrs.match(/\bname="([^"]+)"/)?.[1];
    const rid = attrs.match(/\br:id="([^"]+)"/)?.[1];
    if (!name || !rid) continue;
    const target = rels.get(rid);
    if (!target) continue;
    map.set(decodeXml(name), target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  return map;
}

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

async function loadSharedStrings(zip: JSZip): Promise<string[]> {
  const file = zip.file("xl/sharedStrings.xml");
  if (!file) return [];
  const xml = await file.async("string");
  const out: string[] = [];
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts: string[] = [];
    for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) parts.push(decodeXml(t[1]));
    out.push(parts.join(""));
  }
  return out;
}

function extractCell(sheetXml: string, address: string): { attrs: string; inner: string } | null {
  const addr = address.toUpperCase();
  const re = new RegExp(`<c\\s[^>]*\\br="${addr}"([^>]*)(/>|>([\\s\\S]*?)</c>)`);
  const m = sheetXml.match(re);
  if (!m) return null;
  return { attrs: m[1] ?? "", inner: m[3] ?? "" };
}

function getType(attrs: string): CellType {
  const m = attrs.match(/\bt="([^"]+)"/);
  return (m?.[1] as CellType) ?? "n";
}

export async function openXlsmReader(bytes: Uint8Array | ArrayBuffer): Promise<XlsmReader> {
  const zip = await new JSZip().loadAsync(bytes);
  const sheetMap = await loadSheetMap(zip);
  const shared = await loadSharedStrings(zip);
  const sheetXmlCache = new Map<string, string>();

  async function getSheetXml(sheet: string): Promise<string | null> {
    const path = sheetMap.get(sheet);
    if (!path) return null;
    let xml = sheetXmlCache.get(path);
    if (xml === undefined) {
      xml = (await zip.file(path)?.async("string")) ?? "";
      sheetXmlCache.set(path, xml);
    }
    return xml;
  }

  async function readCell(sheet: string, address: string): Promise<CellRead> {
    const xml = await getSheetXml(sheet);
    if (!xml) return { raw: null, type: null };
    const cell = extractCell(xml, address);
    if (!cell) return { raw: null, type: null };
    const type = getType(cell.attrs);
    let raw: string | null = null;
    if (type === "inlineStr") {
      const isMatch = cell.inner.match(/<is[^>]*>([\s\S]*?)<\/is>/);
      const parts: string[] = [];
      if (isMatch) {
        for (const t of isMatch[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) parts.push(decodeXml(t[1]));
      }
      raw = parts.join("");
    } else {
      const v = cell.inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      raw = v ?? null;
    }
    if (raw === null) return { raw: null, type };
    if (type === "s") {
      const idx = parseInt(raw, 10);
      return { raw: shared[idx] ?? "", type };
    }
    return { raw, type };
  }

  async function readCells(requests: Array<{ sheet: string; address: string }>): Promise<Map<string, CellRead>> {
    const out = new Map<string, CellRead>();
    for (const r of requests) {
      const key = `${r.sheet}!${r.address.toUpperCase()}`;
      out.set(key, await readCell(r.sheet, r.address));
    }
    return out;
  }

  return {
    sheetNames: [...sheetMap.keys()],
    readCell,
    readCells,
  };
}
