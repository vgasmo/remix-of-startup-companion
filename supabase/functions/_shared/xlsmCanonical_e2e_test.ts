// End-to-end round-trip against the LIVE canonical Startup Leiria XLSM.
// Requires /tmp/tpl.xlsm (SHA 1a843d03…), which mirrors the active
// template_assets row for kind='xlsm_financial'.
//
// Verifies:
//   1. openXlsmReader discovers the diacritic sheet names.
//   2. Every mapped Pressupostos input cell we sampled resolves to a value.
//   3. xlsmRoundTrip patches a numeric input, vbaProject.bin is byte-identical,
//      and the reader sees the new value after re-open.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { openXlsmReader } from "./xlsmCellReader.ts";
import { patchXlsm } from "./xlsmRoundTrip.ts";
import { parseLocalizedNumber } from "./xlsxLocale.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";

const TEMPLATE_PATH = "/tmp/tpl.xlsm";
const EXPECTED_SHA = "1a843d03fdef830b8129e76689563eee7622f04073a47bfbff9a985a60ebec4e";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readTemplate(): Promise<Uint8Array> {
  const bytes = await Deno.readFile(TEMPLATE_PATH);
  const hash = await sha256Hex(bytes);
  assertEquals(hash, EXPECTED_SHA, "canonical XLSM sha256 must match template_assets row");
  return bytes;
}

Deno.test("canonical XLSM: sheet inventory matches map expectations", async () => {
  const reader = await openXlsmReader(await readTemplate());
  const wanted = ["Pressupostos", "7. Serviço da Dívida"];
  for (const s of wanted) assert(reader.sheetNames.includes(s), `missing sheet: ${s} (have ${reader.sheetNames.join("|")})`);
});

Deno.test("canonical XLSM: sampled input cells resolve to values", async () => {
  const reader = await openXlsmReader(await readTemplate());
  const samples: Array<{ sheet: string; address: string; kind: "num" | "text" }> = [
    { sheet: "Pressupostos", address: "D11", kind: "text" },   // currency
    { sheet: "Pressupostos", address: "D12", kind: "num" },    // investment start year
    { sheet: "Pressupostos", address: "D18", kind: "num" },    // IRC
    { sheet: "Pressupostos", address: "D27", kind: "num" },    // IVA normal
    { sheet: "Pressupostos", address: "G14", kind: "num" },    // months of operation Y0
    { sheet: "Pressupostos", address: "G36", kind: "num" },    // inflation Y0
    { sheet: "7. Serviço da Dívida", address: "E18", kind: "num" }, // debt opening
  ];
  for (const s of samples) {
    const cell = await reader.readCell(s.sheet, s.address);
    assert(cell.raw !== null, `${s.sheet}!${s.address} must not be blank`);
    if (s.kind === "num") {
      const n = parseLocalizedNumber(cell.raw);
      assert(n !== null && Number.isFinite(n), `${s.sheet}!${s.address} = ${cell.raw} must parse to a finite number`);
    }
  }
});

Deno.test("canonical XLSM: round-trip preserves vbaProject.bin byte-identity", async () => {
  const original = await readTemplate();

  // Snapshot original vbaProject.bin
  const origZip = await new JSZip().loadAsync(original);
  const origVba = await origZip.file("xl/vbaProject.bin")?.async("uint8array");
  assert(origVba && origVba.length > 0, "canonical template must contain vbaProject.bin");

  const patched = await patchXlsmCells(original, [
    { sheet: "Pressupostos", address: "D18", value: 0.25 },   // change IRC 21% → 25%
  ]);

  assert(patched.vbaPreserved, "vbaPreserved flag must be true");
  assertEquals(patched.patchedSheets, ["Pressupostos"]);

  // Verify byte-level identity of vbaProject.bin
  const roundZip = await new JSZip().loadAsync(patched.bytes);
  const roundVba = await roundZip.file("xl/vbaProject.bin")?.async("uint8array");
  assert(roundVba, "round-trip lost vbaProject.bin");
  assertEquals(roundVba.length, origVba.length, "vbaProject.bin length changed");
  for (let i = 0; i < origVba.length; i++) {
    if (origVba[i] !== roundVba[i]) throw new Error(`vbaProject.bin byte diff @${i}`);
  }

  // Read the patched cell back and confirm the new value
  const reader2 = await openXlsmReader(patched.bytes);
  const cell = await reader2.readCell("Pressupostos", "D18");
  assertEquals(parseLocalizedNumber(cell.raw), 0.25);
});
