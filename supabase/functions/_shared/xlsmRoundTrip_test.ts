// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { patchXlsm } from "./xlsmRoundTrip.ts";

// Build a minimal XLSM-shaped archive with a fake vbaProject.bin so we can
// assert byte-identity without requiring the real canonical asset in CI.
async function buildFixture(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/>` +
    `</Types>`);
  zip.file("_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`);
  zip.file("xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/>` +
    `</Relationships>`);
  zip.file("xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Pressupostos" sheetId="1" r:id="rId1"/></sheets>` +
    `<calcPr calcId="0"/></workbook>`);
  zip.file("xl/worksheets/sheet1.xml",
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>` +
    `<row r="10"><c r="C10" t="n"><v>0.21</v></c></row>` +
    `</sheetData></worksheet>`);
  // Deterministic fake VBA blob — must survive byte-identical.
  const vba = new Uint8Array(64);
  for (let i = 0; i < vba.length; i++) vba[i] = (i * 7 + 3) & 0xff;
  zip.file("xl/vbaProject.bin", vba);
  return await zip.generateAsync({ type: "uint8array" });
}

Deno.test("patchXlsm preserves vbaProject.bin byte-identical", async () => {
  const original = await buildFixture();
  const result = await patchXlsm(original, [
    { sheet: "Pressupostos", address: "C10", value: 0.25 },
  ]);
  assert(result.vbaPreserved, "vbaProject.bin was modified");
  assertEquals(result.patchedSheets, ["Pressupostos"]);
  assertEquals(result.skipped.length, 0);
});

Deno.test("patchXlsm updates cell value", async () => {
  const original = await buildFixture();
  const result = await patchXlsm(original, [
    { sheet: "Pressupostos", address: "C10", value: 0.25 },
  ]);
  const zip = await JSZip.loadAsync(result.bytes);
  const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  assert(xml.includes("<v>0.25</v>"), `expected updated value, got: ${xml}`);
  assert(!xml.includes("<v>0.21</v>"), "old value still present");
});

Deno.test("patchXlsm inserts missing cell into existing row", async () => {
  const original = await buildFixture();
  const result = await patchXlsm(original, [
    { sheet: "Pressupostos", address: "D10", value: 42 },
  ]);
  const zip = await JSZip.loadAsync(result.bytes);
  const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  assert(xml.includes(`r="D10"`), "D10 not inserted");
});

Deno.test("patchXlsm marks fullCalcOnLoad", async () => {
  const original = await buildFixture();
  const result = await patchXlsm(original, [
    { sheet: "Pressupostos", address: "C10", value: 1 },
  ]);
  const zip = await JSZip.loadAsync(result.bytes);
  const wb = await zip.file("xl/workbook.xml")!.async("string");
  assert(wb.includes(`fullCalcOnLoad="1"`), "workbook not marked for recalc");
});

Deno.test("patchXlsm skips unknown sheet", async () => {
  const original = await buildFixture();
  const result = await patchXlsm(original, [
    { sheet: "DoesNotExist", address: "A1", value: 1 },
  ]);
  assertEquals(result.patchedSheets, []);
  assertEquals(result.skipped[0].reason, "unknown_sheet");
});

Deno.test("patchXlsm rejects invalid address", async () => {
  const original = await buildFixture();
  const result = await patchXlsm(original, [
    { sheet: "Pressupostos", address: "not-a-cell", value: 1 },
  ]);
  assertEquals(result.skipped[0].reason, "invalid_address");
});
