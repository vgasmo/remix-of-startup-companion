
# Production Hardening Plan

This is a large, multi-surface hardening pass on a live app. It touches ~10 domains and requires corrective SQL migrations, RPC rewrites, hook refactors, UI fixes, i18n additions, tests, and gate runs. I will implement in **10 sequenced phases** without pausing for reconfirmation between safe phases, verifying against the actual source each time.

## Guardrails (apply to every phase)

- No sweeping redesign; keep FounderDashboard, OneThingToday, FounderHelpNudge, WorkspaceDetail lazy tabs, dual programme model, URLs, role boundaries.
- No `as any` to hide errors; use exact `Insert`/`Update` types from `src/types/database.ts` and explicit field pickers.
- No RLS widening; use SECURITY DEFINER RPCs with in-body permission checks.
- Only additive/corrective migrations; never rewrite already-applied ones.
- Read the actual current source before edits (`.lovable/plan.md` and prior "implemented" claims are not trusted).

## Phase 0 — Reconnaissance (verify baseline)

1. Read canonical files: `src/hooks/useSurveys.ts`, `src/components/surveys/SurveyForm.tsx`, `src/components/admin/SurveyTemplateEditor.tsx`, `src/hooks/useContractDraftAutosave.ts`, `src/hooks/useTemplateDraftAutosave.ts`, `src/hooks/useEcosystemItems.ts`, `src/components/mentors/MentorImpactDashboard.tsx`, `src/hooks/useMessaging.ts`, `src/hooks/useCrmPipeline.ts`, `src/components/admin/SmartImportDialog.tsx`, program publish edge function, `scripts/i18n-lint.mjs`, `scripts/i18n-check.cjs`.
2. Run `bun run typecheck` and record the exact 20 errors and 54 i18n-lint failures.
3. `supabase--read_query` the schema for `survey_definitions`, `survey_campaigns`, `survey_instances`, `survey_responses`, `mentor_bookings`, `sessions`, `session_feedback`, `time_entries`, `conversations`, `conversation_participants`, `funnel_items`, `workspaces`, `startups`, `programs`, `program_weeks`, `stages`, `playbooks`, `playbook_items` so migrations are exact.

## Phase 1 — Survey history protection (§1)

Migration `survey_history_protection`:
- `ALTER TABLE survey_campaigns` change FK `survey_definition_id` from `ON DELETE CASCADE` to `ON DELETE RESTRICT`.
- Add `survey_definitions.status` enum `active|archived` (default active) + `parent_definition_id uuid` for versioned copy-on-write + `version int`.
- RPC `archive_survey_definition(p_id uuid)` → sets `status='archived'` (admin only). No hard delete when campaigns exist.
- RPC `fork_survey_definition(p_id uuid)` → clones definition (new questions rows if any) so edits after first campaign use copy-on-write.
- Frontend: replace `useDeleteSurveyDefinition` with `useArchiveSurveyDefinition`; on edit of a referenced definition, offer "fork new version" (auto-fork if `has_campaigns`). Campaigns keep pointing to their historical version.
- List UI filters to active by default with "Show archived" toggle.

## Phase 2 — Survey UX & saving (§2)

- `SurveyForm`:
  - Local dirty state ref; TanStack Query `refetchOnWindowFocus:false` on the response query; hydrate only when `isDirty === false`.
  - Debounced local (immediate) + server (1200 ms) autosave via serialized queue (Phase 3 hook).
  - Atomic submit via new RPC `submit_survey_instance(p_instance_id, p_answers jsonb, p_status)` — permission check inside; sets status + upserts responses in one txn; explicit `null` for cleared answers.
  - Progress: `requiredCount === 0 ? 100 : ...`.
- `SurveyTemplateEditor`:
  - `beforeunload` + react-router `blocker` when dirty.
  - Validate unique question `id` (Set-based) with inline errors.
  - Required non-empty `options[]` when `type ∈ {select,multiselect,radio}`.
  - Rating: enforce `min < max`, `min>=0`, `max<=10`.
  - Non-empty template name.
  - Layout: `grid-cols-1 lg:grid-cols-3`; `DialogContent max-h-[90dvh] overflow-y-auto` + sticky footer.

## Phase 3 — Autosave concurrency & privacy (§3)

Rewrite `useContractDraftAutosave` and `useTemplateDraftAutosave` around a shared `createSaveQueue<T>()` utility:
- Single-flight: if a save is inflight, queue the next payload; coalesce successive dirty payloads so only the newest runs after the current.
- `flush()` awaits the actual save promise and returns its outcome, not React state.
- Hydration: never overwrite a `dirtyRef` local draft on first server response.
- Optimistic concurrency: include `updated_at`/`revision` in save; on 409, expose `serverNewerThanLocal` conflict UI (already present) — keep behaviour, add revision.
- Privacy: `scopeKey` (tokens) is hashed via `sha256Hex()` before use as localStorage key and before any log/analytics field; strip token prefixes in analytics; add `expiresAt` (from JWT `exp` or 7-day fallback) and purge stale drafts on read.
- New action `intake_save_draft_by_token` in the public intake edge function (Phase 8 also needs it): validates token, writes draft to `contract_intakes` without changing `status`. Client falls back to it when authenticated user is absent.

## Phase 4 — Smart Import atomic RPC (§4)

Migration adds `staff_smart_import_workspace(p_payload jsonb, p_mode text, p_idempotency_key text)`:
- SECURITY DEFINER, staff-only guard via `has_role(auth.uid(),'admin'|'consultor'|'backoffice')`.
- Validates payload shape with jsonb schema; validates program_id/stage_id existence and program type compatibility.
- Single transaction: upsert startup → upsert workspace → upsert workspace_users/team_members → optional funding_rounds/kpi_values → provenance in `activity_log` with `p_idempotency_key`.
- Idempotency table `smart_import_idempotency (key pk, result jsonb, created_at)` — returns prior result if key repeats.
- Typed error return `{code, message, hint}`; any child failure → `RAISE EXCEPTION` rolls back.
- `SmartImportDialog` replaces its multi-writes with a single `supabase.rpc('staff_smart_import_workspace', ...)`.

## Phase 5 — Programme publishing transactional (§5)

Migration `program_publish_transactional`:
- Add `programs.published_version int`, `program_version_snapshots` table holding last successful published JSON (used to guarantee byte-identical live version if republish fails — actually failure just rolls back, so the live row is untouched).
- `publish_program_transactional(p_program_id uuid, p_payload jsonb)`:
  - `SELECT … FOR UPDATE` on program row.
  - Validates `program_type ∈ {incubation,acceleration}` and payload shape per type.
  - Rejects duplicate `week_number` and orphan gate references.
  - Deletes/reinserts stages OR weeks/gates atomically depending on type (supports transitions).
  - Reapplies playbooks/items, kpi defaults, core kpis, alert rules, health model.
  - Only at the end flips `programs.status='active'`, `programs.published_version += 1`, writes snapshot.
- Edge function `publish-program` becomes a thin wrapper: auth → zod validate envelope → `rpc('publish_program_transactional', ...)` → return typed error.

## Phase 6 — Ecosystem data truth (§6)

Rewrite `get_ecosystem_items` RPC + `useEcosystemItems`:
- Keyset ordering: `ORDER BY COALESCE(last_activity_at,'-infinity') DESC, id DESC`.
- Cursor is `(last_activity_at_or_null, id)`; fetch `page_size + 1` rows; if extra row present, next cursor = last returned row's key.
- Implement filters in SQL: `program_id`, `stage`, `health_score` (workspaces only; excluded for leads via CASE), `owner_id` (workspaces AND leads via `funnel_items.owner_id`), `building_id`, `incubation_type_id`, `category_id`, `tag_id`, `needs_attention`, `has_startup_portugal`.
- Envelope `{ rows, next_cursor, total_count }`; total_count via `count(*) OVER ()` on first page only.
- Client dedupes by `(item_type,id)`; shows error+retry via TanStack `isError`.
- New RPC `get_ecosystem_by_consultant(filters)` aggregates across the full filtered set (not just loaded pages) for "By consultant" tab.

## Phase 7 — Mentor Impact factuality (§7)

Migration + RPC rewrite:
- New table `session_participants (session_id, user_id, role, attended bool, PRIMARY KEY (session_id,user_id))`; RLS: participants + admins.
- Backfill: for `mentor_bookings` with confirmed status → seed row `(session_id, mentor_id, 'mentor', attended=null)`. Do not fabricate attendance.
- Update action status enum canonicalisation migration if action_items.status uses ad-hoc strings; add CHECK constraint.
- Rewrite `get_mentor_impact(p_mentor_id, p_from, p_to)`:
  - hours = SUM(`time_entries.hours`) where `mentor_id = p_mentor_id` in Lisbon-local window.
  - sessions_attended = COUNT DISTINCT `session_participants` where `attended=true`.
  - startups_supported = COUNT DISTINCT `workspace_id` from time_entries + session_participants (via sessions).
  - avg_rating/rating_count from `session_feedback` joined ONLY to sessions where mentor was an explicit participant.
  - open_followups = `action_items` assigned to mentor with canonical `status IN ('open','in_progress')`.
  - Includes `by_workspace jsonb` breakdown; permission check: mentor themselves or admin.
- Frontend:
  - `MentorImpactDashboard` uses returned `by_workspace` (removes duplicate `useTimeEntrySummary` fetch).
  - Lisbon-local month bounds via `Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon'})`.
  - Error/retry UI instead of silent zeros.
  - Monthly target: if `mentor_monthly_target_hours` null, hide progress; show "Configure goal" link.
  - `QuickNoteDialog`: zod `hours: number().min(0.25).max(24)`; time-entry insert first, then analytics `session_time_logged`; a separate `mentor_note_created` event regardless.

## Phase 8 — Chat & CRM edge cases (§8)

Migration:
- Unique partial index `conversations (workspace_id) WHERE workspace_id IS NOT NULL AND type='workspace'`.
- `get_or_create_workspace_conversation(p_workspace_id)` RPC: `INSERT … ON CONFLICT DO UPDATE SET id=id RETURNING id`; if legacy duplicates exist, merge messages+participants into oldest and delete the newer.
- Participant sync trigger: on `workspace_users` insert/delete, adjust `conversation_participants`. Prevent non-admin participants from deleting shared history via RLS.
- `list_workspace_conversation(p_conv_id, p_before timestamptz)` — returns newest 200 on first call, older on subsequent with cursor.

CRM conversion RPC hardening:
- Server enforces idempotency (existing key); on retry returns same workspace_id.
- Adds `lead.owner_id` to `workspace_users` as `consultor` role; adds converter only if their `user_roles` include `consultor` (admin never inserted as consultor).
- Backoffice UI: hide/disable consultor labels for admins; align with server truth.
- After document metadata insert failure, storage file is removed (`storage.remove([path])` in the catch branch).

## Phase 9 — Release integrity (§9)

- Fix the 20 tsc errors using narrow `Insert`/`Update` types + explicit column pickers; remove any `as any` introduced by prior autosave commits.
- i18n: add all 27 missing keys in `src/i18n/locales/{pt,en}/*.json` for `admin.surveys.*`, mentor time/impact, survey deletion, ecosystem pagination. Re-run i18n-lint to reach 0 failures.
- Public language switcher: `aria-label={t('common.changeLanguage')}`.
- Bundle: after correctness, split heavy admin surfaces (SurveyTemplateEditor, SmartImportDialog, Program publish wizard, backoffice pricing tables) via `lazyWithRetry`. Only ship if visual behaviour unchanged.

## Phase 10 — Prove the fixes (§10)

- Unit tests: `useContractDraftAutosave.test.ts` (out-of-order, flush return value, hydration preserves dirty, visibility/pagehide flush, network failure `local_only`, multi-tab conflict, `scopeKey` redaction).
- SQL tests in `supabase/tests/`:
  - `smart_import.test.sql` — atomic rollback + idempotency.
  - `program_publish.test.sql` — failure leaves prior version intact.
  - `survey_history.test.sql` — cannot delete referenced definition; fork works.
  - `mentor_impact.test.sql` — cross-mentor isolation, backfill honesty.
  - `crm_conversion.test.sql` — idempotency, role-correct membership.
  - Role matrix RLS regression for anon/founder/consultant/mentor/backoffice/admin.
- Ecosystem fixture: `scripts/fixtures/ecosystem-1500.sql` seeding 1500 rows with null activity and combined filters; test cursor boundaries.
- Playwright: `e2e/hardening-smoke.spec.ts` running the 5 roles at 320/390/768/1280, asserting no console errors and no horizontal overflow.

### Canonical gates (final)

Run in order and record outputs verbatim in the completion report:

```
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
node scripts/i18n-check.cjs
node scripts/i18n-lint.mjs
node scripts/secret-scan.cjs
bun run build
psql -f supabase/tests/*.sql   # against local db
bunx playwright test e2e/hardening-smoke.spec.ts
```

Any red gate → NO-GO with specific remediation; nothing is claimed green without the log.

## Deliverables at the end

- Exhaustive list of files/migrations changed and tests added.
- Verbatim gate outputs.
- Role matrix (feature × role) confirming preserved behaviour.
- Features preserved list.
- Residual risks + rollback notes (each migration has a documented reverse: FK swap, drop new RPCs, restore CASCADE — snapshot before).
- Honest GO / NO-GO verdict.

---

## Technical notes

- All new RPCs are `SECURITY DEFINER SET search_path = public` with explicit `has_role` guards and `GRANT EXECUTE … TO authenticated` (never anon unless the token-based intake action).
- Every new public table follows the CREATE → GRANT → ENABLE RLS → POLICY order.
- No changes to `src/integrations/supabase/client.ts`, `.env`, `supabase/config.toml` beyond function registration.
- No hardcoded UUID data migrations; all backfills are driven by joins on existing data with explicit "unknown attendance" markers.

### Estimated scope

~14 migrations, ~9 new/rewritten RPCs, ~1 rewritten edge function, ~2 new hooks utilities, ~8 component refactors, ~30 i18n keys × 2 locales, ~8 test files. Multi-hour execution; I will not pause between safe phases but will halt and report if any gate cannot be made green without violating a non-negotiable.

Approve to proceed and I will begin at Phase 0 immediately.
