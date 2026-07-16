
# Operating journey overhaul — implementation plan

This is a large, high-risk change on a live production system. It will land as a sequence of **corrective migrations and code changes**, each independently deployable, in the order below. Nothing renames or destroys existing tables; every DB change is additive or a safe RPC-level fix.

Scope reminder: improve the canonical CRM + Ecosystem, do not create parallel systems.

---

## Phase 0 — Verify current truth (before-state matrix)

Deliverable: a short markdown matrix committed at `.lovable/journey-audit.md` covering, for each surface, the tables/RPCs/functions/routes/permissions in play and the observed defect. Sources: reading code + `supabase--read_query` on live schema (read-only). No writes in this phase.

Focus:

- `public-get-availability`, `public-book-first-contact`, `intake_routing`, `public_booking_links`, `funnel_items`, `funnel_events`, `communication_log`, `email_log`, `notifications`.
- `list_ecosystem_items_v2` RPC + `src/hooks/useEcosystemItems*.ts` + `Ecosystem.tsx`.
- `startup_contracts.incubation_type_id`, `buildings`, `office_spaces`, `space_allocations`, `startups.startup_category`.
- Programme transfer paths (client-only writes to `funnel_items.program_id` / workspace).
- `CommunityFeed` mock arrays.
- HubSpot import functions.

---

## Phase 1 — Reliable first-contact booking

### 1.1 Canonical routing resolver (shared)
New file `supabase/functions/_shared/first-contact-routing.ts` exporting `resolveFirstContactRoute({ linkToken, programId })`. Both `public-get-availability` and `public-book-first-contact` import it. It:

1. Loads and validates `public_booking_links` (active, not deleted, feature flag on).
2. Loads `intake_routing` rules scoped to the link (or global fallback rule if the link explicitly opts-in).
3. Filters candidates to: `profiles.status='active'`, has `user_roles.role IN ('admin','consultant')`, has a non-null `calendar_email` (or fallback to `email` only if the routing rule allows), and is authorized on the selected programme.
4. Applies mode: `global`, `programme_specific`, `fixed_owner`, `round_robin`.
5. Round-robin: uses an advisory lock (`pg_advisory_xact_lock` on hash of routing_id) inside a SECURITY DEFINER RPC `pick_round_robin_consultant(routing_id, program_id)` that reads+increments a counter in a new `intake_routing_state` row (upsert).
6. Returns `{ consultantId, programId, routingId, decisionTrace }` or throws `NO_ROUTE` — never `.limit(1)` silently.

Migration adds:
- `intake_routing_state(routing_id uuid pk, program_id uuid, last_index int, updated_at timestamptz)` + GRANTs + RLS (service_role only).
- `pick_round_robin_consultant` SECURITY DEFINER.

### 1.2 Availability + commit alignment
`public-get-availability` and `public-book-first-contact` both call the resolver with the same inputs. Slot list is filtered against the resolved consultant's `graph_availability` only.

### 1.3 Booking commit hardening
Rewrite `public-book-first-contact` to:

- Re-run resolver.
- Re-check availability against Graph for the exact slot immediately before insert.
- Wrap all DB writes in a single Postgres transaction via RPC `commit_first_contact_booking(payload jsonb)` returning the new/updated funnel item id + correlation id.
- Idempotency: `payload.idempotency_key` (uuid v4 from client, else derived from `sha256(email + slot_start + link_token)`). Store on `funnel_items.metadata_json.booking.idempotency_key` with a unique partial index.
- Lead upsert: match by (email, program_id) OR existing `funnel_item_id` from link. If found and stage is later than `first_contact_booked`, do NOT overwrite core fields — only append a `funnel_events` row and merge non-destructive metadata.
- Persist structured `metadata_json.booking = { calendar_event_id, teams_url, routing_decision, consultant_id, slot_start, slot_end, form: {...} }`.
- Create Graph event on resolved consultant's calendar with founder as attendee. On Graph failure, store event as `pending` and return HTTP 502 with the funnel item id so the retry path can complete it.
- Create `notifications` rows for consultant + configurable staff watchers (new setting `system_settings.first_contact_watchers uuid[]`).
- Insert `email_log` row with `status ∈ {queued, sent, failed}`, `provider_message_id`, `retry_count`, `last_error`.
- Response payload accurately reports `calendar_status`, `email_status`, `notification_status`. Frontend `PublicBooking.tsx` shows a partial-success UI when any is not `ok`.

### 1.4 Retry action
New edge function `retry-first-contact-delivery` (staff-only, verify_jwt=false + in-code role check). Idempotent: skips steps already `ok`. Cannot duplicate calendar events (uses stored `calendar_event_id`) or emails (uses `idempotency_key`).

### 1.5 CRM subview `Primeiros contactos`
New tab inside existing CRM page (`src/pages/CRM.tsx`) — not a new page. Component `src/components/crm/FirstContactsAgenda.tsx`:

- Views: day / week / list.
- Segments: upcoming, completed, unassigned, delivery-failed, no-show.
- Data source: `funnel_items` filtered by `metadata_json.booking.slot_start` + join to `email_log` / `notifications` for delivery state.
- RLS: consultants see only rows where `owner_id = auth.uid()`; admin/backoffice see all.
- Row click opens existing CRM drawer for that funnel item — no duplicate record view.

---

## Phase 2 — Public discovery

- Ensure a single canonical `public_booking_links` row flagged `is_canonical=true` (new column), never expiring, used by the public landing CTA.
- SEO: add per-route Helmet on `PublicBooking.tsx` (title, description, canonical, og:*). Sitewide title already OK.
- New staff tool inside `IntakeRoutingManager`: "Gerar link de campanha" — appends UTM params to the canonical URL, does NOT create a new `public_booking_links` row.
- Return a checklist string in the final report; do not attempt to touch LinkedIn/Instagram.

---

## Phase 3 — Ecosystem / active portfolio

### 3.1 Fix `list_ecosystem_items_v2`
Migration rewrites the RPC (CREATE OR REPLACE) so the SELECT actually joins and returns:

- `program_id`, `program_type` (from `programs`)
- `incubation_type_id`, `incubation_type_name` (from active `startup_contracts` — the one with `status='active'` and no `terminated_at`)
- `modality` (`physical` | `virtual`) derived from `incubation_types.modality` column (add column if missing, default null; migration seeds known values). Never derived from name.
- `building_id`, `building_name`, `space_id`, `space_name` from current `space_allocations`
- `startup_category` (A/B/C tier)
- `owner_id` (assigned consultant) from `funnel_items` or `workspace_assignments`
- health / last_interaction_at / next_meeting_at / attention_state already present — verify

All declared filters wired through the RPC signature: `p_program_ids`, `p_incubation_type_ids`, `p_modality`, `p_building_ids`, `p_tiers`, `p_consultant_ids`, `p_stage`, `p_health`, `p_attention`, `p_search`, `p_limit`, `p_cursor`.

Client `Ecosystem.tsx` + hooks: remove any filter control that isn't sent to the RPC. Every visible chip must map 1:1.

### 3.2 Aggregates over full filtered dataset
New RPC `ecosystem_aggregates_v2(<same filters minus limit/cursor>)` returning a single jsonb with:
- by_incubation_type, by_tier, by_consultant, unassigned_count, by_modality, by_program, by_attention.

Rendered in a new `EcosystemMetrics` panel. Each aggregate card is a button that applies the corresponding filter and drills into the list.

### 3.3 Leads vs active workspaces
Ecosystem list header shows a hard-labeled toggle: **Portfólio ativo** (workspaces) / **Leads em pipeline** (funnel_items pre-conversion). Never mixed rows.

---

## Phase 4 — Safe programme transfer

Migration + new RPC `staff_transfer_workspace_program(p_workspace_id, p_target_program_id, p_dry_run boolean)`:

- Auth: `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'consultant')`.
- Locks workspace row (`SELECT ... FOR UPDATE`).
- Validates source/target programmes.
- Dry-run returns a preview jsonb: affected sessions, milestones (kept/archived), gates, deliverables, enrollments, KPIs.
- Commit path:
  - Updates `workspaces.program_id`, `stage` / `current_week` to target-programme defaults.
  - Archives (soft) programme-specific milestones/gates/deliverables not present in target, remaps by canonical key when present.
  - Preserves generic sessions/notes/documents/actions.
  - Writes `activity_log` before/after entry with full diff.
- Idempotent by `(workspace_id, target_program_id, transfer_id uuid)`.

UI: new staff-only action `Mover de programa` in `EcosystemItem` drawer + workspace detail — behind an admin-visible menu, hidden from founders. Diagnostic tool for "wrongly-stuck-in-Experience-Lab" scans workspaces whose current program mismatches their active contract's programme and flags them; no hardcoded startup names.

---

## Phase 5 — HubSpot history import

New edge function `prepare-hubspot-history-import` + `commit-hubspot-history-import` (mirrors existing bulk-import pattern):

- Accepts CSV/JSON exports for notes, calls, meetings, emails.
- Preview stage inserts into `bulk_import_rows` with mapping proposals.
- Match order: (1) `external_entity_refs.external_id`, (2) email exact, (3) domain + name exact — never fuzzy auto-match.
- Commit inserts into `communication_log` with `external_source='hubspot'`, `external_id`, `original_timestamp`. New unique index `communication_log(external_source, external_id)`.
- Links `funnel_item_id` and/or `workspace_id` when a canonical relationship exists.
- Default visibility for imported internal notes: `staff_only=true`.
- Rollback by `bulk_import_batches.id` reuses existing rollback pattern.
- Integration card in Settings: change HubSpot section to two distinct states — "Import histórico (disponível)" and "Sync bidirecional (em breve)".

---

## Phase 6 — Assistive AI for first contact

New edge function `generate-first-contact-brief` (staff-only) taking `funnel_item_id`. Inputs:
- booking questionnaire (`metadata_json.booking.form`)
- pitch deck (already extracted by `analyze-pitch-deck`, reuse cache)
- communication_log timeline
- verified company signals (existing external enrichment if present, else skipped)

Output stored in `funnel_items.metadata_json.ai_brief = { generated_at, sections: {...}, confidence, evidence }`. Sections: factual summary, confirmed vs claimed, missing info, fit signals, risks, discovery questions, recommended next step. Every bullet carries a `source` tag.

Guardrails:
- Never writes `stage`, `startup_category`, `program_id`, `owner_id`, or contract fields.
- Any suggestion appears as a staff-approvable card in the CRM drawer.
- Rename existing lead_score to `engagement_readiness_score` in UI labels + i18n keys (DB column keeps its name; add a comment). Show AI analysis in a separate panel.

---

## Phase 7 — Real community value

- Delete `MOCK_ANNOUNCEMENTS`, `MOCK_CHALLENGES`, `MOCK_EVENTS` from `CommunityFeed`. Wire to existing `admin_announcements` (extend with `audience`, `programme_id`, `building_id`, `starts_at`, `ends_at`, `location`, `url`, `status ∈ draft|published|expired`, `owner_id`).
- New table `community_offers(id, workspace_id, kind need|offer, title, body, contact_consent bool, status draft|pending|published|rejected|expired, moderated_by, moderated_at, ...)` + GRANTs + RLS: workspace members insert; only staff transition to `published`.
- Founder view filters `status='published' AND now() BETWEEN starts_at AND ends_at` (or null bounds) and audience match.
- "Conectar" opens the existing messaging drawer to the offer owner (real action). "Ver calendário completo" links to `/comunidade/calendario`; if not implemented, button removed.
- Empty states everywhere — no fake companies/dates.

---

## Phase 8 — Tests & acceptance

- Vitest unit: routing resolver (all 4 modes + no-route), idempotency key derivation, ecosystem aggregate math, transfer dry-run diff, HubSpot matcher levels, AI brief input assembly (mocked model).
- Edge integration via `supabase--test_edge_functions` for `public-get-availability`, `public-book-first-contact`, `retry-first-contact-delivery`, `commit-hubspot-history-import` — all against isolated fixtures (test link tokens, `test-e2e@` emails; teardown after).
- Playwright (headless via shell) against `http://localhost:8080`: public booking happy path + partial-failure UI; CRM "Primeiros contactos" tab; ecosystem filters + aggregate drill-down; staff programme transfer dry-run dialog; community feed empty + published state; 375px viewport pass.
- Canonical checks: `bunx tsgo`, `bun run build`, lint, i18n parity script, secret scan, migration replay (fresh DB).

---

## Execution order

Phases 0 → 1 → 3 → 4 → 7 (mock removal is urgent) → 2 → 5 → 6 → 8. Phase 7 mock removal ships as its own migration-less patch first so production stops showing fake data ASAP.

## Technical notes

- All new/changed edge functions: `verify_jwt=false` with in-code auth; use `_shared/first-contact-routing.ts` helpers.
- Every new public-schema table: `CREATE TABLE` → `GRANT` → `ENABLE RLS` → `CREATE POLICY`.
- All migrations are additive or `CREATE OR REPLACE` for functions/RPCs; no destructive DDL. Existing legacy code paths keep working until callers migrate.
- Feature flags: `first_contact_v2`, `ecosystem_aggregates_v2`, `hubspot_history_import`, `ai_first_contact_brief`, `community_real_data` — default off, flipped on per environment after smoke tests.
- Any integration lacking a working credential in this environment (Graph, Resend, HubSpot) is reported UNVERIFIED in the final response; the code path remains fail-closed rather than simulating success.

## Out of scope (explicit)

- Live bidirectional HubSpot sync.
- Auto-classification of startups by AI.
- Reworking Data Import V2 or Reconciler Canary safety gates.
- Renaming DB columns (only UI/i18n rename for `lead_score`).
- Changes to external social profiles.

Ready to proceed on approval.
