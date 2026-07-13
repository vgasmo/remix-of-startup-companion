// deno test -A supabase/functions/_shared/xlsmCellReader_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { openXlsmReader } from "./xlsmCellReader.ts";

async function buildFixture(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Pressupostos" sheetId="1" r:id="rId1"/><sheet name="Serviço da Dívida" sheetId="2" r:id="rId2"/></sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="ws" Target="worksheets/sheet2.xml"/></Relationships>`,
  );
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si><t>EUR</t></si></sst>`,
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="11"><c r="D11" t="s"><v>0</v></c></row><row r="18"><c r="D18" t="n"><v>0.21</v></c></row><row r="19"><c r="D19"><f>D18/10</f><v>0.021</v></c></row></sheetData></worksheet>`,
  );
  zip.file(
    "xl/worksheets/sheet2.xml",
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="18"><c r="E18" t="n"><v>50000</v></c></row></sheetData></worksheet>`,
  );
  return await zip.generateAsync({ type: "uint8array" });
}

Deno.test("openXlsmReader lists sheet names including diacritics", async () => {
  const reader = await openXlsmReader(await buildFixture());
  assertEquals(reader.sheetNames.sort(), ["Pressupostos", "Serviço da Dívida"]);
});

Deno.test("readCell resolves shared string", async () => {
  const reader = await openXlsmReader(await buildFixture());
  const cell = await reader.readCell("Pressupostos", "D11");
  assertEquals(cell, { raw: "EUR", type: "s" });
});

Deno.test("readCell resolves numeric and cached formula values", async () => {
  const reader = await openXlsmReader(await buildFixture());
  assertEquals((await reader.readCell("Pressupostos", "D18")).raw, "0.21");
  assertEquals((await reader.readCell("Pressupostos", "D19")).raw, "0.021");
});

Deno.test("readCell finds cells on sheets with diacritics", async () => {
  const reader = await openXlsmReader(await buildFixture());
  const cell = await reader.readCell("Serviço da Dívida", "E18");
  assertEquals(cell.raw, "50000");
});

Deno.test("missing cells return null", async () => {
  const reader = await openXlsmReader(await buildFixture());
  assertEquals(await reader.readCell("Pressupostos", "Z99"), { raw: null, type: null });
  assertEquals(await reader.readCell("Nope", "A1"), { raw: null, type: null });
});
