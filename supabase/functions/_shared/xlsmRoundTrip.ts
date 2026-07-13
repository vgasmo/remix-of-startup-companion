// XLSM round-trip helpers. Preserves VBA (vbaProject.bin), macros, styles,
// data validations, and defined names by patching cell values in-place via
// JSZip WITHOUT re-serialising unrelated parts of the archive.
//
// Rules:
//   1. Only worksheet XML parts corresponding to sheets we touch are rewritten.
//   2. vbaProject.bin, [Content_Types].xml, xl/styles.xml, xl/theme/*, and
//      xl/_rels/* are copied byte-for-byte.
//   3. Formula cache is invalidated by setting workbook calcPr fullCalcOnLoad=1;
//      cell formulas are left intact.
//   4. Input cells with a shared-string type are converted to inline numeric
//      cells (t="n") when a numeric value is written.
//
// Contract-tested: given the canonical XLSM, exporting with no changes returns
// a byte-identical vbaProject.bin and [Content_Types].xml. See
// _shared/xlsmRoundTrip_test.ts.

import JSZip from "https://esm.sh/jszip@3.10.1";

export interface CellPatch {
  sheet: string;      // exact sheet name including diacritics
  address: string;    // "C10"
  value: number | string | null;
}

export interface RoundTripResult {
  bytes: Uint8Array;
  patchedSheets: string[];
  skipped: Array<{ patch: CellPatch; reason: string }>;
  vbaPreserved: boolean;
}

const XLNS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

async function readWorkbookSheetMap(
  zip: JSZip,
): Promise<Map<string, string>> {
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbookXml || !relsXml) {
    throw new Error("Not a valid XLSX/XLSM: missing workbook.xml");
  }
  const relIdToTarget = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b([^/>]*)\/?>/g)) {
    const attrs = m[1];
    const id = attrs.match(/\bId="([^"]+)"/)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) relIdToTarget.set(id, target);
  }
  const map = new Map<string, string>();
  for (const m of workbookXml.matchAll(/<sheet\b([^/>]*)\/?>/g)) {
    const attrs = m[1];
    const name = attrs.match(/\bname="([^"]+)"/)?.[1];
    const rid = attrs.match(/\br:id="([^"]+)"/)?.[1];
    if (!name || !rid) continue;
    const target = relIdToTarget.get(rid);
    if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    map.set(name, path);
  }
  return map;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Replace or insert <c r="ADDR" ...>...</c> inside a worksheet's <sheetData>.
// Removes existing type/shared-string; injects numeric or inline-string value.
function patchWorksheetXml(xml: string, patches: CellPatch[]): { xml: string; touched: number } {
  let out = xml;
  let touched = 0;
  for (const p of patches) {
    const addr = p.address.toUpperCase();
    const cellRe = new RegExp(`<c(\\s[^>]*?)?\\br="${addr}"([^>]*)(/>|>[\\s\\S]*?</c>)`, "");
    const match = out.match(cellRe);
    let newCell: string;
    if (p.value === null || p.value === undefined || p.value === "") {
      // Blank the cell (keep style if present)
      const styleAttr = match ? (match[0].match(/\bs="\d+"/)?.[0] ?? "") : "";
      newCell = `<c r="${addr}"${styleAttr ? " " + styleAttr : ""}/>`;
    } else if (typeof p.value === "number" && Number.isFinite(p.value)) {
      const styleAttr = match ? (match[0].match(/\bs="\d+"/)?.[0] ?? "") : "";
      newCell = `<c r="${addr}"${styleAttr ? " " + styleAttr : ""} t="n"><v>${p.value}</v></c>`;
    } else {
      const styleAttr = match ? (match[0].match(/\bs="\d+"/)?.[0] ?? "") : "";
      newCell = `<c r="${addr}"${styleAttr ? " " + styleAttr : ""} t="inlineStr"><is><t>${escapeXml(String(p.value))}</t></is></c>`;
    }
    if (match) {
      out = out.slice(0, match.index!) + newCell + out.slice(match.index! + match[0].length);
      touched++;
    } else {
      // Insert into the correct row; fall back to appending a new row block.
      const rowNum = parseInt(addr.replace(/^[A-Z]+/, ""), 10);
      const rowRe = new RegExp(`<row\\s+[^>]*\\br="${rowNum}"[^>]*>([\\s\\S]*?)</row>`);
      const rowMatch = out.match(rowRe);
      if (rowMatch) {
        const inner = rowMatch[1] + newCell;
        const replaced = rowMatch[0].replace(rowMatch[1], inner);
        out = out.slice(0, rowMatch.index!) + replaced + out.slice(rowMatch.index! + rowMatch[0].length);
        touched++;
      } else {
        const sheetDataClose = out.lastIndexOf("</sheetData>");
        if (sheetDataClose === -1) continue;
        const rowBlock = `<row r="${rowNum}">${newCell}</row>`;
        out = out.slice(0, sheetDataClose) + rowBlock + out.slice(sheetDataClose);
        touched++;
      }
    }
  }
  return { xml: out, touched };
}

function markFullCalcOnLoad(workbookXml: string): string {
  if (/<calcPr\b[^>]*\bfullCalcOnLoad="1"/.test(workbookXml)) return workbookXml;
  if (/<calcPr\b[^/>]*\/>/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr\b([^/>]*)\/>/, `<calcPr$1 fullCalcOnLoad="1"/>`);
  }
  if (/<calcPr\b/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr\b([^>]*)>/, `<calcPr$1 fullCalcOnLoad="1">`);
  }
  return workbookXml.replace(
    /<\/workbook>/,
    `<calcPr fullCalcOnLoad="1"/></workbook>`,
  );
}

export async function patchXlsm(
  originalBytes: Uint8Array,
  patches: CellPatch[],
): Promise<RoundTripResult> {
  const zip = await JSZip.loadAsync(originalBytes);
  const vbaBefore = await zip.file("xl/vbaProject.bin")?.async("uint8array");
  const sheetMap = await readWorkbookSheetMap(zip);

  const bySheet = new Map<string, CellPatch[]>();
  const skipped: RoundTripResult["skipped"] = [];
  for (const p of patches) {
    if (!sheetMap.has(p.sheet)) {
      skipped.push({ patch: p, reason: "unknown_sheet" });
      continue;
    }
    if (!/^[A-Z]+\d+$/i.test(p.address)) {
      skipped.push({ patch: p, reason: "invalid_address" });
      continue;
    }
    const arr = bySheet.get(p.sheet) ?? [];
    arr.push(p);
    bySheet.set(p.sheet, arr);
  }

  const patchedSheets: string[] = [];
  for (const [sheet, sheetPatches] of bySheet) {
    const path = sheetMap.get(sheet)!;
    const xml = await zip.file(path)?.async("string");
    if (!xml) continue;
    const { xml: newXml, touched } = patchWorksheetXml(xml, sheetPatches);
    if (touched > 0) {
      zip.file(path, newXml);
      patchedSheets.push(sheet);
    }
  }

  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  if (workbookXml) zip.file("xl/workbook.xml", markFullCalcOnLoad(workbookXml));

  const outBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  // Verify VBA byte-identity.
  const outZip = await JSZip.loadAsync(outBytes);
  const vbaAfter = await outZip.file("xl/vbaProject.bin")?.async("uint8array");
  let vbaPreserved = true;
  if (vbaBefore && vbaAfter) {
    if (vbaBefore.length !== vbaAfter.length) vbaPreserved = false;
    else {
      for (let i = 0; i < vbaBefore.length; i++) {
        if (vbaBefore[i] !== vbaAfter[i]) { vbaPreserved = false; break; }
      }
    }
  } else if (vbaBefore && !vbaAfter) {
    vbaPreserved = false;
  }

  return { bytes: outBytes, patchedSheets, skipped, vbaPreserved };
}
