# PHC Active Customer → Workspace Reconciliation

**Rule of engagement:** production is live. Phases 0–1 write **nothing** to `funnel_items`, `startups`, `workspaces`, `startup_contracts`, `user_roles`, or `auth.*`. Only Phase 3 mutates, one canary of 5 first, with rollback proven before scaling. The target count is *derived*, not forced to 180.

---

## Phase 0 — Read-only live census (no writes)

Deliverable: `docs/reconciliation/phase0-census.md` + CSVs under `/mnt/documents/reconciliation/`.

Queries run via `supabase--read_query` and `psql` (select-only). No inserts, no functions deployed.

1. **PHC active customers** — regenerate a canonical UTF-8 CSV from the original PHC export (not the malformed `phc_hubspot_crm_classified_ready_2026-07-14.csv`). Ask the user for the source-of-truth PHC file (XLSX/CSV/DB extract). Group by `service`, `crm_stage`, `programme_hint`. Expect ~202; reconcile against historical 187 incubation + 15 domiciliação.
2. **Funnel items**: counts split by (has startup_id, has workspace_id, has contract link, orphan).
3. **Workspaces**: by `status`, `program_id`, service classification, `needs_onboarding`, presence of members.
4. **Duplicate identities**: PHC ID, normalized NIF (digits only, len=9), HubSpot company id, `lower(trim(email))`.
5. **Batch `3dd77436-…`**: rows grouped by `status`, `selected`, `commit_authorized`, `committed`, `error_message`. Include the 5 canary rows previously flagged.
6. **Partial-failure debris**: workspaces / startups / contracts created inside the batch's time window with `metadata_json.provenance='bulk-import'` or matching `bulk_import_rows.id` — flag as suspect for cleanup review (no delete yet).
7. **Source reconciliation table**: 202 PHC → eligible for founder-journey workspace / service-only domiciliação / excluded (with reason).

Output: exact counts, exclusion CSV, duplicate CSV, and a *derived* target N (not 180).

---

## Phase 1 — Import architecture repair (code + migrations, no data writes)

### 1a. Feature-flag flip and legacy fence
- Enable `hubspot_importer_v2` globally for admins; keep per-workspace override.
- Legacy `AdminDataImport` mutation path becomes read-only (banner + disabled buttons); route continues to render via `AdminDataImportRouter` for rollback.

### 1b. New dedicated module: **Active Customer Workspace Reconciler**
Separate from `BulkContractImport` (which stays for signed PDFs only).
- New page `src/pages/AdminActiveCustomerReconciler.tsx` under `/admin/data-import` tab.
- New edge functions:
  - `reconciler-stage` — ingests canonical PHC CSV, validates schema strictly, resolves identity, produces per-row proposed action (create_workspace / update_workspace / link_only / service_only / manual_review / conflict). No writes.
  - `reconciler-dryrun` — recomputes diff against live, returns before/after per row.
  - `reconciler-commit` — calls the atomic RPC (Phase 2) per row with idempotency key.
  - `reconciler-rollback` — restores `before_snapshot`.

### 1c. Schema additions (migration, additive only)
- `workspaces.engagement_state` (`prospect | active | paused | churned | service_only`), default `NULL`; **do not overload `status`** — `imported_unclaimed` stays for founder claiming.
- `workspaces.service_classification` (`founder_journey | domiciliacao | mixed`).
- `startups.phc_customer_id text unique nullable`, `startups.nif_normalized text`.
- `funnel_items.phc_customer_id text` + partial unique index where not null.
- `reconciler_batches`, `reconciler_rows`, `reconciler_rollbacks` (mirroring the bulk_import shape but scoped and with `idempotency_key text unique`, `before_snapshot jsonb`, `after_snapshot jsonb`).
- GRANTs + RLS admin-only per project rules.
- Programme mapping stored per-batch as `service_program_map jsonb` (uuid resolved live from `programs` — never hardcoded in migration files).

### 1d. Identity resolution (locked order)
1. `phc_customer_id`
2. normalized NIF (9 digits)
3. HubSpot company id
4. exact `lower(trim(email))` on org email
5. else → `manual_review` (never fuzzy-name commit)

### 1e. Founder-journey vs service-only split
Service list mapping (confirmed by admin in UI before commit):
- Incubação Física / Virtual / Ideias → `founder_journey`
- Domiciliação → `service_only` unless explicitly promoted per-row
- Mixed → `mixed`

Only `founder_journey` and `mixed` get a workspace of `service_classification` matching; `service_only` gets a lightweight workspace row with `needs_onboarding=false`, no playbook materialization, no members.

### 1f. `BulkContractImport` UX fixes (separate from reconciler)
- `selected` and `commit_authorized` are two explicit columns/checkboxes.
- Dry-run mandatory before commit button enables.
- Partial failure → `completed_with_errors` status distinct from `completed`; toast/label reflects it; never "Import complete" when `error_count > 0`.

---

## Phase 2 — Atomic idempotent RPC

Postgres function `public.reconcile_active_customer(p_row jsonb, p_idempotency_key text)` — SECURITY DEFINER, single transaction:

1. Lookup existing by identity ladder → resolve `startup_id` (create if missing, PHC id set).
2. Resolve target workspace: must match `program_id`, `service_classification`, and not be archived. Never pick "oldest" blindly.
3. Create workspace when none matches (status `imported_unclaimed`, `engagement_state='active'` for founder_journey, `service_only` otherwise, no members, no consultant, no notifications).
4. Link funnel item → startup → workspace.
5. Preserve verified non-empty values (fill-only-empty).
6. Write `before_snapshot` + `after_snapshot` + `idempotency_key` into `reconciler_rows`.
7. Contracts without number → deterministic key `sha256(phc_id|service|start_date)`.
8. Any exception → full `ROLLBACK`, mark row `failed` with reason.
9. Idempotency: unique index on `(idempotency_key)` prevents duplicate re-runs — second call is a no-op returning `{action:'noop'}`.

Never touches `auth.users`, `user_roles`, `workspace_users`, `notifications`, `workflow_executions`.

---

## Phase 3 — Safe execution

1. **Canary 5** (from `1_READY` queue only, `commit_authorized=true`): dry-run → review diff → commit → verify in app (admin + founder role probe returns 0 rows for non-owner) → rollback → verify snapshot restored → recommit → prove zero-delta on third run.
2. **Canary 20** — same protocol.
3. **Full remaining eligible population** — batched in 25s, each row still requires `commit_authorized=true`.
4. Outputs: before/after count table, per-row action CSV, exclusion CSV, manual-review CSV.

Hard stop between each stage awaiting user GO.

---

## Phase 4 — Cross-app corrections (parallel PRs, not blocking canary)

- `ProgramSwitcher`: replace direct `UPDATE workspaces SET program_id=…` with RPC `transfer_workspace_program(workspace_id, new_program_id, options)` — archives generated milestones/actions with `source='program_template'`, preserves user-authored items, materializes new programme, updates CRM stage mapping, writes audit row.
- Mentor attribution: session/feedback counters read from `session_participants` and `mentor_bookings` only; drop any `mentor_connections.count` shortcuts.
- Fix 21 TS errors, 130 i18n-lint issues, `CommandPalette` failing test.
- Vite/PWA: pin to tested compat matrix (Vite 5.x + `vite-plugin-pwa` matching), verify build + preview, no `--force`.

---

## Mandatory verification gate before any GO

`bun run lint`, `tsgo --noEmit`, `bun run build`, `bunx vitest run`, `node scripts/i18n-check.cjs`, `node scripts/i18n-lint.mjs`, `node scripts/secret-scan.cjs`, migration replay on shadow, RLS regression SQL, Playwright smoke for admin/consultant/founder/mentor.

Final report: exact live counts, files changed, migrations applied, canary evidence (screenshots + row diffs), rollback evidence, residual manual-review rows, GO/NO-GO recommendation.

---

## Immediate asks before I start Phase 0

1. **Source-of-truth PHC file**: please re-upload the original PHC export (XLSX preferred) or confirm I should pull via the PHC connector. The `phc_hubspot_crm_classified_ready_2026-07-14.csv` is unusable.
2. **Domiciliação decision**: are the ~15 domiciliação clients `service_only` (no founder workspace) or should any be promoted to `founder_journey`? A per-row toggle will be exposed in the reconciler UI either way, but I need the default.
3. **Programme mapping confirmation** for the 4 service groups — I'll present a live dropdown in the UI; confirm you (admin) will pick them at dry-run time rather than me proposing UUIDs now.
4. Confirm approval to run Phase 0 read-only queries against production now.
