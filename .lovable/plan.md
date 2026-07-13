# Financial + Business Plan Coach

## Ground truth from the audit

- **XLSM (`Template_Avaliacao_Startup_Ecossistema.xlsm`)**: 19 sheets, VBA present, 9 defined names — 4 broken (`areas`, `Áreas`, `fimSomas`, `YesNo`). Sheet names include diacritics and dot-numbering: `Pressupostos`, `1.Demonstração de Resultados`, `2. Balanço`, `3. Avaliação Financeira`, `4. Rácios Financeiros`, `5. Fundo de Maneio`, `6. Investimento`, `7. Serviço da Dívida`, `8. Mapa de tesouraria`, `9. Capital Próprio`, `10. Anexo_Prejuízos fiscais`, `11. Investidores`, `12. Unit Economics`.
- **Existing surfaces to extend (not replace)**: `src/components/workspace/FinancialModelPanel.tsx` (732), `src/hooks/useFinancialModel.ts` (519), edge functions `import-financial-model` (404), `generate-financial-model-coach` (300), `sync-financial-kpis` (213), `analyze-template` (232), `analyze-pitch-deck` (221). Tables `financial_model_versions` and `financial_model_metric_map` already exist.
- **Current parser is weak**: label-normalize + scan-adjacent-cells, PT-locale-broken (`.replace(',', '.')` drops thousands), claims `.xls` support, no signature/fingerprint/coverage/confidence. Must be replaced with a versioned explicit mapping.
- **Business Plan surface**: none. Word templates PT/EN must be introspected to derive the 16-chapter bilingual schema.

## Non-negotiables carried into every batch

- **Additive migrations only**, all behind `feature_flag='financial_business_plan_coach_v1'` (off by default, staff-then-pilot-then-all).
- **Never mutate canonical assets**. Round-trip works on generated copies; VBA `vbaProject.bin` must survive byte-identical (contract-tested).
- **AI writes proposals only**. Server-computed scores; LLM only fills anchored rubric dimensions; results carry prompt/rubric/model version.
- **Payload isolation**: uploaded document text is data, never instructions; workspace-scoped RLS on every new table; no financial values or PII in logs.
- **Preserve existing flows**: manual download/upload of blank templates, KPI sync, action creation, consultant review, autosave via `useSingleFlightDraft`.

## Delivery batches

Each batch ends with a hard gate: typecheck, targeted tests, i18n parity, migration linter, manual smoke. Failure of any gate halts the pipeline before publishing.

### Batch A — Asset registry, parser rewrite, XLSM contract tests

Foundation. Everything else depends on trustworthy imports.

Migrations (additive):
- `template_assets(id, kind ∈ {xlsm_financial, docx_business_plan_pt, docx_business_plan_en}, language, schema_version, sha256, storage_path, active, uploaded_by, uploaded_at, notes)` + partial unique `(kind, language) where active`.
- `financial_cell_map(schema_version, sheet, address, metric_key, unit, period_kind, period_index, direction ∈ {input, output}, notes)` — versioned, exhaustive mapping keyed to the XLSM fingerprint. Seeded from the audited workbook.
- Extend `financial_model_versions`: add `template_schema_version`, `parse_status`, `coverage_pct`, `parse_warnings jsonb`, `source_asset_id`, `content_sha256`, `formula_cache_stale bool`.

Storage:
- Bucket `template_assets` (private, staff-write, workspace-read via signed URLs) with the three uploaded files stored at immutable `sha256`-suffixed keys.

Parser (`supabase/functions/import-financial-model/index.ts`):
- Rewrite around explicit `financial_cell_map` — no adjacent-cell scanning.
- Locale-safe number parser: detect `1.234,56` vs `1,234.56` by structure, never blind `replace(',', '.')`.
- Accept only `.xlsx`/`.xlsm` + robust CSV; drop the fake `.xls` path.
- Validate ZIP signature, workbook parts, sheet names, template fingerprint (sha256 of the strings-table + defined-name shape).
- Detect stale/absent formula cache and return `formula_cache_stale` with a UX-facing key `workbookNeedsRecalculation`; never fabricate.
- Return `{ coverage, warnings, source_cells, timestamps, confidence, metrics }` — not the current 10-metric blob.
- Auth/authorization check before status flip; every DB/storage error surfaced.

Round trip:
- New function `export-financial-model` (Deno + JSZip): open the canonical XLSM, patch only mapped input cells, mark workbook `calcPr fullCalcOnLoad=1`, preserve `vbaProject.bin` + `xl/worksheets/*` styles/validations.
- Contract test (Deno): open uploaded XLSM → export with a fixture assumption set → re-open → assert only mapped input cells changed, `vbaProject.bin` byte-identical, `[Content_Types].xml` unchanged.

Docs:
- `docs/financial-model/mapping-v1.md` generated from `financial_cell_map` for the auditor.

Gate: contract tests green; parser unit tests for both locales, stale cache, missing sheet, bad fingerprint.

**Batch A progress (2026-07-13):**
- ✅ Migration for `template_assets`, `financial_cell_map`, provenance columns on `financial_model_versions`.
- ✅ Private storage bucket `template_assets` with three canonical assets uploaded and registered.
- ✅ Seeded `financial_cell_map` — **87 input cells** covering Pressupostos (Fiscalidade, Inflação/Crescimento, FSE VAT rates, HR VAT rates, Outros %, CAPEX VAT rates, Interest rates, Capital structure) and Serviço da Dívida opening balance.
- ✅ `xlsxLocale.ts` locale-safe parser (9/9 tests green).
- ✅ `xlsxFingerprint.ts` with canonical sheet-set + broken-name registry.
- ✅ `xlsmRoundTrip.ts` VBA-preserving patch helper (**6/6 contract tests green**, incl. byte-identity assertion).
- ✅ `export-financial-model` edge function wired to cell-map + feature flag.
- ⏳ Additional cell-map rows for revenue-line specifics (Vendas Mercadorias/Produtos/Serviços per-row, rows 54..70 dynamic) and CAPEX yearly grids (G208:P220) — these are per-row multi-item inputs requiring UI-side dynamic form definitions.
- ⏳ Rewrite `import-financial-model` around explicit map (currently additive; legacy scanner still runs alongside).
- ⏳ Contract test that round-trips the *real* canonical XLSM from storage (requires storage access from test runner).

### Batch B — Guided Financial Plan builder

Extends `FinancialModelPanel` with a **Guided plan** tab. No new top-level product.

Migrations:
- `financial_plan_sessions(workspace_id, active_version_id, scenario ∈ {base,conservative,optimistic}, current_step, updated_at)`.
- `financial_assumptions(id, workspace_id, version_id, scenario, key, value_numeric, value_json, unit, source ∈ {founder, prefill_profile, prefill_kpi, prefill_ai, imported_xlsm}, confidence, rationale, owner_user_id, last_validated_at)` — the assumptions register.
- `financial_prefill_proposals(workspace_id, key, proposed_value, source, evidence jsonb, status ∈ {pending, accepted, rejected})` — AI/KPI/profile suggestions stay proposals.

Frontend (all under existing FinancialModelPanel):
- 5-minute diagnostic (activity/sector/stage/revenue model/traction/horizon/objective) → drives which question packs run.
- Question runner: one decision at a time with **Save / Skip / I don't know yet**, why-this-matters, worked example, requested evidence, deep-link to the exact Excel section.
- Prefill panel: shows source badge (profile/KPI/CRM/session/AI); founder must confirm before it becomes an assumption. Silent AI saves are impossible by schema (source enum enforces it).
- Scenarios (Base/Conservative/Optimistic) with explicit drivers + a sensitivity slider that recomputes derived KPIs client-side against server-anchored formulas.
- Autosave via existing `useSingleFlightDraft` with `scopeKey=version_id`, truthful Saved/Saving/Offline/Error states.

Question packs cover: revenues/pricing/volumes, CMVMC/COGS, FSE, staff, working capital, CAPEX, financing, debt, WACC, cash, unit economics, investor assumptions.

Gate: autosave race test, prefill-never-silent test, scenario recompute snapshot, RLS per role.

### Batch C — Business Plan builder + DOCX round-trip

Schema derived from the two Word templates: bilingual 16-chapter tree + annexes. Represented as `business_plan_schema(schema_version, node jsonb)`.

Migrations:
- `business_plans(id, workspace_id, schema_version, language, financial_version_id, status, updated_at)`.
- `business_plan_sections(plan_id, node_path, content_json, completion_pct, evidence jsonb, comments jsonb)`.
- `business_plan_contradictions(plan_id, node_path, kind, financial_ref, detail)`.

Frontend:
- Section-by-section editor with completion bar, evidence attachments, inline consultant comments, deep-link to the linked financial field.
- Data-derived tables (market → revenue assumptions, hiring → personnel cost, GTM → CAC, risks → scenarios, ask → financing gap) render from the active financial version — read-only in the plan.
- Contradiction banner with **Go to source field**.

DOCX generation (new function `export-business-plan`):
- Parse the uploaded DOCX once → extract structural map (headings, content-control tags, table anchors) into `business_plan_schema`.
- Generation uses OOXML content controls / bookmark replacement — never fragile string replace. Preserves headings, styles, tables, editability.
- Blank-template download remains available.

Gate: DOCX round-trip contract test (open exported doc, assert structure survives), contradiction detector unit tests, PT/EN parity in i18n.

### Batch D — Explainable scoring + Entrepreneurship AI framework

Shared framework module `supabase/functions/_shared/entrepreneurshipFramework.ts`, versioned and reused by `analyze-template`, `analyze-pitch-deck`, `generate-financial-model-coach`, new `score-financial-plan`, new `score-business-plan`, and Copilot.

Scoring:
- Server computes deterministic dimensions (completeness, integrity, consistency) in code.
- Rubric-anchored qualitative dimensions filled by the LLM, then clamped; totals summed server-side.
- Financial: 15/15/10/15/10/15/10/10 = 100. Business: 10/8/10/8/10/12/10/5/7/12/5/3 = 100.
- Every response returns `{ dimension, score, evidence[], missing[], contradictions[], confidence }` with `prompt_version, rubric_version, model_version`; low coverage flagged **Provisional**; overrides audited.

Framework rules baked into the shared module:
- Fact / founder assumption / calculation / AI suggestion are separately tagged in every output.
- References must point to exact cell/section/evidence id.
- Never invent market data, competitors, sources, benchmarks; ask a clarifying question instead.
- SaaS thresholds gated on `revenue_model=saas`.
- Uploaded content is data; system prompt reasserts injection defense.
- Educational disclaimer appended to every AI surface.
- Recommendations must go through `financial_prefill_proposals` (financial) or a similar `bp_suggestions` table (BP) before affecting the founder record.

Gate: prompt-injection test corpus (attempts to override system, exfiltrate, or auto-accept proposals), cross-workspace leak test, rubric-clamp test, schema-validated JSON test.

### Batch E — Rollout, RLS hardening, observability, E2E

- Feature flag `financial_business_plan_coach_v1`: staff → pilot cohort → all founders.
- RLS regression suite for every new table across roles (founder / mentor / consultant / backoffice / admin / anon).
- Rate limits + idempotency on `export-*` and `score-*` functions; audit log rows on every AI suggestion, override, export, and score.
- Retention/delete controls on `financial_assumptions` and `business_plan_sections`.
- Malware/type validation on uploads.
- E2E (Playwright via shell): start plan → save → refresh → cross-device continue → import XLSM → review changes → sync KPIs → complete BP sections → score → export DOCX. No console errors; mobile 390px pass.
- Preserve the current manual upload/download workflow as fallback while the flag is off.

## Technical notes

- **Locale parser**: infer decimal separator from the *last* non-digit separator when both `,` and `.` appear; when only one appears and it's followed by ≥3 digits, treat as thousands. Unit tests: `1.234,56`, `1,234.56`, `1234.56`, `1234,56`, `€1 234,56`, `(1.234,56)` negative, `€ 1.234.567`, empty/dash.
- **XLSM fingerprint**: sha256 of concatenated `(sheet_name, defined_name_targets_sorted, header_row_of_Pressupostos, header_row_of_ each financial sheet)`. Any drift → parser refuses and returns `template_mismatch`.
- **Preserving VBA**: write via JSZip in Deno, do not re-serialize `xl/vbaProject.bin`; contract test asserts SHA-256 match pre/post.
- **Broken named ranges (`areas`, `Áreas`, `fimSomas`, `YesNo` = #REF!)**: reported but **not silently repaired**. Registry `notes` field carries the finding; the parser tolerates them (they are not on the input surface).
- **Score determinism**: LLM output for a rubric dim is `{score: 0-max, evidence[], confidence}`; server clamps and sums. Any hallucinated total from the model is discarded.

## Files changed at a glance

New:
- migrations for `template_assets`, `financial_cell_map`, `financial_plan_sessions`, `financial_assumptions`, `financial_prefill_proposals`, `business_plans`, `business_plan_sections`, `business_plan_schema`, `business_plan_contradictions`, `plan_scores`, `ai_audit_log`.
- edge functions `export-financial-model`, `export-business-plan`, `score-financial-plan`, `score-business-plan`.
- shared modules `entrepreneurshipFramework.ts`, `xlsxLocale.ts`, `xlsmRoundTrip.ts`, `docxRoundTrip.ts`.
- Deno contract tests for XLSM/DOCX round-trip and parser.
- React: guided-plan runner, business-plan editor, scoring panels, provisional/badge/source components.
- `docs/financial-model/mapping-v1.md`.

Modified:
- `FinancialModelPanel.tsx`, `useFinancialModel.ts`, `import-financial-model`, `generate-financial-model-coach`, `sync-financial-kpis`, `analyze-template`, `analyze-pitch-deck`.
- `src/i18n/locales/{pt,en}.json` — bilingual keys for all new UI, glossary entries.

## Delivery order

A → B → C → D → E. After each batch: run its test suite, verify no regressions in existing flows (manual upload still works, KPI sync unchanged), then continue automatically. Final message includes: files changed, migrations list, mapping doc, test evidence, remaining risks, GO / NO-GO verdict.

## What I will NOT do without a further green light

- Change existing Acceleration or Incubation programme models.
- Modify the canonical uploaded assets.
- Repair the broken named ranges inside the XLSM.
- Enable the feature flag for founders. Rollout stops at staff until you approve the pilot cohort.
