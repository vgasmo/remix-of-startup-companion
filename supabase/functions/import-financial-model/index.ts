// Financial model importer.
//
// Two-track parser:
//   (A) Canonical XLSM path — when the uploaded file's sheet inventory matches
//       the Startup Leiria template, cells are read by explicit
//       (sheet, address) from `financial_cell_map`. Values are grouped by
//       `metric_key` and stored on `financial_model_versions.key_metrics_json`
//       under `.assumptions`. Locale-safe parsing (parseLocalizedNumber).
//   (B) Legacy label-scan fallback — free-form workbooks / CSVs use the older
//       adjacent-label heuristic and still produce the KPI object.
//
// The parser NEVER silently invents metrics: if the canonical fingerprint is
// present but a mapped cell is missing/blank, we record it in `missing_cells`
// rather than back-filling. Feature-flagged endpoints in the UI treat the two
// tracks differently (guided plan requires track A).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { openXlsmReader } from "../_shared/xlsmCellReader.ts";
import { parseLocalizedNumber } from "../_shared/xlsxLocale.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface KeyMetrics {
  runway_months: number | null;
  burn_rate_monthly: number | null;
  gross_margin_pct: number | null;
  cac: number | null;
  churn_monthly_pct: number | null;
  ltv: number | null;
  ltv_cac: number | null;
  payback_months: number | null;
  cash_end: number | null;
  treasury_need: number | null;
}

// ---------- Legacy label-scan (kept for CSV / non-canonical XLSX) ----------

function extractNumber(value: string | number | null | undefined): number | null {
  return parseLocalizedNumber(value ?? null);
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const METRIC_PATTERNS: Record<keyof KeyMetrics, string[]> = {
  runway_months: ["runway", "monthsrunway", "cashrunway", "runwaymonths", "mesesrunway"],
  burn_rate_monthly: ["burn", "burnrate", "monthlyburn", "cashburn", "taxaqueima", "burnmensal"],
  gross_margin_pct: ["grossmargin", "gm", "margembruta", "margem"],
  cac: ["cac", "customeracquisition", "acquisitioncost", "custoacquisicao"],
  churn_monthly_pct: ["churn", "monthlychurn", "churnrate", "taxachurn"],
  ltv: ["ltv", "lifetimevalue", "customerlifetime", "valorvida"],
  ltv_cac: ["ltvcac", "ltvcacratio"],
  payback_months: ["payback", "cacpayback", "paybackperiod", "periodopayback"],
  cash_end: ["cashend", "endingcash", "cashbalance", "treasury", "tesouraria", "caixa", "saldocaixa"],
  treasury_need: ["treasuryneed", "fundingneed", "capitalrequired", "necessidadecapital"],
};

function findMetricFromPairs(pairs: [string, string | number][], metricKey: keyof KeyMetrics): number | null {
  const patterns = METRIC_PATTERNS[metricKey];
  for (const [label, value] of pairs) {
    const normalizedLabel = normalizeLabel(label);
    for (const pattern of patterns) {
      if (normalizedLabel.includes(pattern)) return extractNumber(value);
    }
  }
  return null;
}

function parseCSV(content: string): [string, string | number][] {
  const pairs: [string, string | number][] = [];
  for (const line of content.trim().split(/\r?\n/)) {
    const separator = line.includes(";") ? ";" : ",";
    const cells = line.split(separator).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    for (let i = 0; i < cells.length - 1; i++) {
      const label = cells[i], value = cells[i + 1];
      if (label && value) {
        const numValue = extractNumber(value);
        pairs.push([label, numValue !== null ? numValue : value]);
      }
    }
  }
  return pairs;
}

async function parseExcelPairs(arrayBuffer: ArrayBuffer): Promise<[string, string | number][]> {
  const pairs: [string, string | number][] = [];
  const colToIndex = (col: string) => {
    let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n;
  };
  const getAttr = (attrs: string, name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;
  const extractTexts = (xml: string) => {
    const out: string[] = [];
    for (const m of xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) out.push(m[1]);
    return out.join("");
  };
  const zip = await new JSZip().loadAsync(arrayBuffer);
  const sharedStrings: string[] = [];
  const ss = zip.file("xl/sharedStrings.xml");
  if (ss) {
    const ssXml = await ss.async("string");
    for (const si of ssXml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)) sharedStrings.push(extractTexts(si[1]));
  }
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith("xl/worksheets/") || !name.endsWith(".xml")) continue;
    const xml = await zip.file(name)!.async("string");
    for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: { idx: number; value: string | number }[] = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cellMatch[1], inner = cellMatch[2];
        const r = getAttr(attrs, "r"); if (!r) continue;
        const colLetters = r.match(/^([A-Z]+)/)?.[1]; if (!colLetters) continue;
        const t = getAttr(attrs, "t");
        let raw: string | null = null;
        if (t === "inlineStr") raw = extractTexts(inner.match(/<is[^>]*>([\s\S]*?)<\/is>/)?.[1] ?? "");
        else raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? null;
        if (raw === null) continue;
        let value: string | number = raw;
        if (t === "s") value = sharedStrings[parseInt(raw, 10)] ?? "";
        else { const num = extractNumber(raw); value = num !== null ? num : String(raw); }
        if (typeof value === "string" && !value.trim()) continue;
        cells.push({ idx: colToIndex(colLetters), value });
      }
      cells.sort((a, b) => a.idx - b.idx);
      for (let i = 0; i < cells.length - 1; i++) {
        const left = cells[i].value;
        if (typeof left === "string" && left.trim()) pairs.push([left.trim(), cells[i + 1].value]);
      }
    }
  }
  return pairs;
}

function calculateDerivedMetrics(m: KeyMetrics): KeyMetrics {
  const r = { ...m };
  if (r.ltv_cac === null && r.ltv !== null && r.cac !== null && r.cac > 0) {
    r.ltv_cac = Math.round((r.ltv / r.cac) * 100) / 100;
  }
  if (r.runway_months === null && r.cash_end !== null && r.burn_rate_monthly !== null && r.burn_rate_monthly > 0) {
    r.runway_months = Math.round(r.cash_end / r.burn_rate_monthly);
  }
  if (r.payback_months === null && r.cac !== null && r.ltv !== null && r.churn_monthly_pct !== null) {
    const avgLifetimeMonths = r.churn_monthly_pct > 0 ? 1 / (r.churn_monthly_pct / 100) : 12;
    const monthlyRevenue = r.ltv / avgLifetimeMonths;
    if (monthlyRevenue > 0) r.payback_months = Math.round(r.cac / monthlyRevenue);
  }
  return r;
}

// ---------- Canonical map path ----------

interface CellMapRow {
  sheet: string;
  address: string;
  metric_key: string;
  unit: string | null;
  period_kind: string | null;
  period_index: number | null;
  direction: string | null;
}

interface AssumptionEntry {
  value: number | string | null;
  unit: string | null;
  sheet: string;
  address: string;
  period_kind: string | null;
  period_index: number | null;
}

async function extractCanonicalAssumptions(
  bytes: Uint8Array,
  map: CellMapRow[],
): Promise<{
  matched: boolean;
  reader_sheets: string[];
  assumptions: Record<string, AssumptionEntry | AssumptionEntry[]>;
  missing_cells: Array<{ sheet: string; address: string; metric_key: string }>;
  read_count: number;
}> {
  const reader = await openXlsmReader(bytes);
  const wantedSheets = new Set(map.map((m) => m.sheet));
  const availableSheets = new Set(reader.sheetNames);
  const missingSheets = [...wantedSheets].filter((s) => !availableSheets.has(s));
  const matched = missingSheets.length === 0;

  const assumptions: Record<string, AssumptionEntry | AssumptionEntry[]> = {};
  const missing_cells: Array<{ sheet: string; address: string; metric_key: string }> = [];
  let readCount = 0;

  for (const row of map) {
    if (!availableSheets.has(row.sheet)) continue;
    const cell = await reader.readCell(row.sheet, row.address);
    const isNumeric = row.unit !== "text";
    let value: number | string | null = null;
    if (cell.raw !== null) {
      if (isNumeric) value = parseLocalizedNumber(cell.raw);
      else value = cell.raw;
    }
    if (value === null || value === "") {
      missing_cells.push({ sheet: row.sheet, address: row.address, metric_key: row.metric_key });
      continue;
    }
    readCount++;
    const entry: AssumptionEntry = {
      value,
      unit: row.unit,
      sheet: row.sheet,
      address: row.address,
      period_kind: row.period_kind,
      period_index: row.period_index,
    };
    // Group time-indexed metrics into arrays, keyed by metric_key.
    if (row.period_kind && row.period_kind !== "point") {
      const existing = assumptions[row.metric_key];
      if (Array.isArray(existing)) existing.push(entry);
      else if (existing) assumptions[row.metric_key] = [existing, entry];
      else assumptions[row.metric_key] = [entry];
    } else {
      assumptions[row.metric_key] = entry;
    }
  }

  return {
    matched,
    reader_sheets: reader.sheetNames,
    assumptions,
    missing_cells,
    read_count: readCount,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { version_id?: unknown };
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { version_id } = body;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!version_id || typeof version_id !== "string" || !uuidRegex.test(version_id)) {
      return new Response(JSON.stringify({ error: "Invalid version_id format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[import-financial-model] user=${user.id} version=${version_id}`);

    await supabase.from("financial_model_versions").update({ status: "parsing" }).eq("id", version_id);

    const { data: version, error: versionError } = await supabase
      .from("financial_model_versions").select("*, documents(*)").eq("id", version_id).single();
    if (versionError || !version) throw new Error(`Version not found: ${versionError?.message}`);

    const { data: hasAccess } = await supabase.rpc("has_workspace_access", {
      _user_id: user.id, _workspace_id: version.workspace_id,
    });
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const document = version.documents;
    if (!document?.file_path) throw new Error("Document has no file path");

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("workspace-documents").download(document.file_path);
    if (downloadError || !fileData) throw new Error(`Failed to download file: ${downloadError?.message}`);

    const fileName = String(document.name || "").toLowerCase();
    const arrayBuffer = await fileData.arrayBuffer();

    let importSource: "canonical_map" | "legacy_label_scan" = "legacy_label_scan";
    let assumptions: Record<string, AssumptionEntry | AssumptionEntry[]> = {};
    let missingCells: Array<{ sheet: string; address: string; metric_key: string }> = [];
    let mappedCellsCount = 0;
    let readerSheets: string[] = [];
    let pairs: [string, string | number][] = [];

    // Try canonical map first for XLSX/XLSM
    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xlsm") || fileName.endsWith(".xls")) {
      try {
        const { data: mapRows } = await supabase
          .from("financial_cell_map")
          .select("sheet,address,metric_key,unit,period_kind,period_index,direction")
          .eq("direction", "input");

        if (mapRows && mapRows.length > 0) {
          const result = await extractCanonicalAssumptions(new Uint8Array(arrayBuffer), mapRows as CellMapRow[]);
          readerSheets = result.reader_sheets;
          if (result.matched && result.read_count > 0) {
            importSource = "canonical_map";
            assumptions = result.assumptions;
            missingCells = result.missing_cells;
            mappedCellsCount = result.read_count;
          }
        }
      } catch (err) {
        console.warn("[import-financial-model] canonical extract failed, falling back:", err instanceof Error ? err.message : err);
      }

      // Always compute label-scan pairs for KPI backfill
      pairs = await parseExcelPairs(arrayBuffer);
    } else if (fileName.endsWith(".csv")) {
      pairs = parseCSV(new TextDecoder().decode(new Uint8Array(arrayBuffer)));
    } else {
      throw new Error(`Unsupported file type: ${fileName}`);
    }

    // KPI object (from label scan; kept for backwards compat / non-canonical files)
    let keyMetrics: KeyMetrics = {
      runway_months: findMetricFromPairs(pairs, "runway_months"),
      burn_rate_monthly: findMetricFromPairs(pairs, "burn_rate_monthly"),
      gross_margin_pct: findMetricFromPairs(pairs, "gross_margin_pct"),
      cac: findMetricFromPairs(pairs, "cac"),
      churn_monthly_pct: findMetricFromPairs(pairs, "churn_monthly_pct"),
      ltv: findMetricFromPairs(pairs, "ltv"),
      ltv_cac: findMetricFromPairs(pairs, "ltv_cac"),
      payback_months: findMetricFromPairs(pairs, "payback_months"),
      cash_end: findMetricFromPairs(pairs, "cash_end"),
      treasury_need: findMetricFromPairs(pairs, "treasury_need"),
    };
    keyMetrics = calculateDerivedMetrics(keyMetrics);

    const hasCanonical = importSource === "canonical_map";
    const hasKpi = Object.values(keyMetrics).some((v) => v !== null);

    if (!hasCanonical && !hasKpi) {
      await supabase.from("financial_model_versions").update({
        status: "failed",
        parse_error: "Could not extract any metrics or mapped input cells from the file. Please ensure you are uploading the canonical Startup Leiria XLSM or a labeled CSV.",
      }).eq("id", version_id);
      return new Response(JSON.stringify({
        success: false,
        error: "No metrics could be extracted.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = {
      ...keyMetrics,
      import_source: importSource,
      mapped_cells_count: mappedCellsCount,
      assumptions,
      missing_cells: missingCells,
      reader_sheets: readerSheets,
    };

    const { error: updateError } = await supabase.from("financial_model_versions").update({
      status: "parsed",
      key_metrics_json: payload,
      parse_error: null,
    }).eq("id", version_id);
    if (updateError) throw updateError;

    console.log(`[import-financial-model] OK version=${version_id} source=${importSource} cells=${mappedCellsCount} missing=${missingCells.length}`);

    return new Response(JSON.stringify({
      success: true,
      metrics: keyMetrics,
      import_source: importSource,
      mapped_cells_count: mappedCellsCount,
      missing_cells_count: missingCells.length,
      message: "Financial model parsed successfully",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    console.error("[import-financial-model] Error:", error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ success: false, error: "Failed to parse financial model" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
