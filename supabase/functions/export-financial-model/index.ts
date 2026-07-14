// Export a financial model as a filled XLSM using the canonical template asset.
// Uses xlsmRoundTrip.patchXlsm to preserve VBA (vbaProject.bin byte-identical),
// styles, data validations, and defined names. Cell targets are looked up from
// financial_cell_map (schema-versioned) so we never scan adjacent cells.
//
// Contract:
//   POST { version_id, scenario? } -> { download_url, expires_in, warnings[] }
// Never mutates the canonical asset in storage.
//
// Guarded by feature flag `financial_business_plan_coach_v1` (staff first).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from "../_shared/cors.ts";
import { patchXlsm, type CellPatch } from "../_shared/xlsmRoundTrip.ts";

const FEATURE_FLAG = "financial_business_plan_coach_v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return corsJsonResponse({ error: "No authorization header" }, req, 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return corsJsonResponse({ error: "Invalid token" }, req, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Feature flag check — enabled roles only.
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("enabled, enabled_for_roles")
      .eq("key", FEATURE_FLAG)
      .maybeSingle();
    if (!flag?.enabled) {
      return corsJsonResponse({ error: "Feature not enabled" }, req, 403);
    }

    const body = await req.json().catch(() => ({}));
    const versionId: string | undefined = body?.version_id;
    const bodyWorkspaceId: string | undefined = body?.workspace_id;
    const bodyScenario: string = (body?.scenario as string) ?? "base";

    // Two entrypoints:
    //  A) version_id -> pull values from financial_model_versions.assumptions_json
    //  B) workspace_id + scenario -> pull values from financial_assumptions
    //     (Guided Plan path — no persisted version yet).
    if (!versionId && !bodyWorkspaceId) {
      return corsJsonResponse({ error: "version_id or workspace_id is required" }, req, 400);
    }

    let workspaceIdResolved: string;
    let schemaVersion: number = 1;
    let assumptionsLookup: (key: string) => unknown;
    let exportRefId: string; // used for signed url path + activity log

    if (versionId) {
      const { data: version, error: versionErr } = await supabase
        .from("financial_model_versions")
        .select("id, workspace_id, template_schema_version, key_metrics_json, assumptions_json")
        .eq("id", versionId)
        .single();
      if (versionErr || !version) {
        return corsJsonResponse({ error: `Version not found: ${versionErr?.message ?? "missing"}` }, req, 404);
      }
      workspaceIdResolved = version.workspace_id;
      schemaVersion = version.template_schema_version ?? 1;
      exportRefId = versionId;

      const { data: hasAccess } = await supabase.rpc("has_workspace_access", {
        _user_id: user.id, _workspace_id: workspaceIdResolved,
      });
      if (!hasAccess) return corsJsonResponse({ error: "Access denied" }, req, 403);

      const assumptions = (version.assumptions_json ?? {}) as Record<string, unknown>;
      const metrics = (version.key_metrics_json ?? {}) as Record<string, unknown>;
      assumptionsLookup = (key: string) => assumptions[key] ?? metrics[key];
    } else {
      workspaceIdResolved = bodyWorkspaceId!;
      exportRefId = `guided-${workspaceIdResolved}-${bodyScenario}`;

      const { data: hasAccess } = await supabase.rpc("has_workspace_access", {
        _user_id: user.id, _workspace_id: workspaceIdResolved,
      });
      if (!hasAccess) return corsJsonResponse({ error: "Access denied" }, req, 403);

      const { data: rows, error: aErr } = await supabase
        .from("financial_assumptions")
        .select("key, value_numeric, value_json")
        .eq("workspace_id", workspaceIdResolved)
        .eq("scenario", bodyScenario);
      if (aErr) return corsJsonResponse({ error: `Assumptions load failed: ${aErr.message}` }, req, 500);

      const map = new Map<string, unknown>();
      for (const r of rows ?? []) {
        map.set(r.key as string, (r.value_numeric ?? r.value_json) as unknown);
      }
      assumptionsLookup = (key: string) => map.get(key);
    }


    // Locate active canonical XLSM asset for this schema version.
    const { data: asset, error: assetErr } = await supabase
      .from("template_assets")
      .select("id, storage_path, sha256")
      .eq("kind", "xlsm_financial")
      .eq("schema_version", schemaVersion)
      .eq("active", true)
      .maybeSingle();
    if (assetErr || !asset) {
      return corsJsonResponse({ error: "Canonical template asset unavailable" }, req, 500);
    }

    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from("template_assets")
      .download(asset.storage_path);
    if (dlErr || !fileBlob) {
      return corsJsonResponse({ error: `Template download failed: ${dlErr?.message}` }, req, 500);
    }
    const templateBytes = new Uint8Array(await fileBlob.arrayBuffer());

    // Load the versioned cell map (input cells only).
    const { data: cellMap, error: mapErr } = await supabase
      .from("financial_cell_map")
      .select("sheet, address, metric_key, direction")
      .eq("schema_version", schemaVersion)
      .eq("direction", "input");
    if (mapErr || !cellMap) {
      return corsJsonResponse({ error: `Cell map unavailable: ${mapErr?.message}` }, req, 500);
    }

    // Prefer explicit assumptions; fall back to key_metrics_json.
    const assumptions = (version.assumptions_json ?? {}) as Record<string, unknown>;
    const metrics = (version.key_metrics_json ?? {}) as Record<string, unknown>;
    const lookup = (key: string): unknown =>
      assumptions[key] ?? metrics[key];

    const patches: CellPatch[] = [];
    const warnings: string[] = [];
    for (const row of cellMap) {
      const val = lookup(row.metric_key);
      if (val === undefined || val === null) continue;
      const num = typeof val === "number" ? val : Number(val);
      if (!Number.isFinite(num) && typeof val !== "string") {
        warnings.push(`Skipped ${row.metric_key}: not numeric`);
        continue;
      }
      patches.push({
        sheet: row.sheet,
        address: row.address,
        value: Number.isFinite(num) ? num : String(val),
      });
    }

    const result = await patchXlsm(templateBytes, patches);
    if (!result.vbaPreserved) {
      // Fatal: refuses to emit if VBA byte-identity broke.
      return corsJsonResponse({ error: "VBA preservation failed", warnings }, req, 500);
    }
    for (const s of result.skipped) {
      warnings.push(`Skipped ${s.patch.sheet}!${s.patch.address}: ${s.reason}`);
    }

    const outPath = `exports/${version.workspace_id}/${versionId}-${Date.now()}.xlsm`;
    const { error: upErr } = await supabase.storage
      .from("template_assets")
      .upload(outPath, result.bytes, {
        contentType: "application/vnd.ms-excel.sheet.macroEnabled.12",
        upsert: false,
      });
    if (upErr) return corsJsonResponse({ error: `Upload failed: ${upErr.message}` }, req, 500);

    const { data: signed, error: signErr } = await supabase.storage
      .from("template_assets")
      .createSignedUrl(outPath, 900);
    if (signErr || !signed) {
      return corsJsonResponse({ error: `Sign URL failed: ${signErr?.message}` }, req, 500);
    }

    await supabase.from("activity_log").insert({
      workspace_id: version.workspace_id,
      user_id: user.id,
      entity_type: "financial_model",
      entity_id: versionId,
      action: "financial_model_exported",
      metadata: {
        source_asset_id: asset.id,
        patched_sheets: result.patchedSheets,
        patch_count: patches.length,
        warnings_count: warnings.length,
      },
    });

    return corsJsonResponse(
      {
        success: true,
        download_url: signed.signedUrl,
        expires_in: 900,
        patched_sheets: result.patchedSheets,
        patch_count: patches.length,
        warnings,
      },
      req,
      200,
    );
  } catch (err) {
    console.error("[export-financial-model]", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return corsJsonResponse({ error: message }, req, 500);
  }
});
