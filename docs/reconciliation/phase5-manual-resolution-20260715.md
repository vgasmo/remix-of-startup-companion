# Phase 5 Reconciliation Report — 2026-07-15

**Status:** All 5 data-integrity outliers require **human judgement**. Reconciler writes remain **DISABLED** by dual kill-switch.

## Executive summary

The live prod dataset has **zero legitimate PHC-reconciler targets**:

- All 202 funnel_items carrying `phc_customer_id`/`nif_normalized` are already linked to workspaces.
- The 12 unlinked funnel_items carry no PHC anchor, no NIF, no HubSpot id.
- Therefore the reconciler cannot exercise its match paths against production data.
- The 5 real integrity outliers (2 unlinked contracted funnel items + 3 orphan contracts) all fail the "must have an authoritative identity anchor" rule and are surfaced in the new `admin_manual_resolution_queue`.

Verdict: keep `reconciler_writes_enabled=false`, keep the env-var kill-switch off, and revisit only when a new PHC/HubSpot import lands.

## 1. Read-only census (SQL, live)

| metric | value |
|---|---|
| funnel_items | 214 |
| unlinked funnel (no linked_workspace_id) | 12 |
| funnel with `phc_customer_id` | 202 (all linked) |
| funnel with `nif_normalized` | 202 (all linked) |
| workspaces total | 234 |
| workspaces non-archived | 232 |
| workspaces with `status='active'` | 31 |
| workspaces `imported_unclaimed` | 200 |
| workspaces `claimed` | 1 |
| workspaces `archived` | 2 |
| startups | 235 |
| startup_contracts total | 4 |
| startup_contracts with `status='active'` | 0 |

Funnel stages: `incubating 187, contracted 17, archived 5, intake_requested 3, sent_for_signature 1, rejected 1`.

## 2. Two unlinked contracted funnel items (Workstream 1)

### Airmonkey — `bdbe3572-5940-4a28-98a7-71499b63cc0f`
- `stage=contracted`, `linked_contract_id=NULL`, `linked_startup_id=NULL`
- `phc_customer_id=NULL`, `nif_normalized=NULL`, `hubspot_*=NULL`
- `program_id=70b25196…` (LEIRIA EXPERIENCE LAB, acceleration)
- Source: `public_booking`
- No matching startup, no matching workspace, no contract, no intake.

**Verdict:** stage inconsistency (marked "contracted" but no contract ever existed). Cannot be auto-linked without inventing identity. Surfaced in manual queue. Recommended human action: revert funnel stage to `intake_requested` OR delete if the lead never proceeded.

### Startup do Fonsi — `2d857813-f6d5-49fb-ad29-8c529f1b0829`
- `stage=contracted`, `linked_contract_id=0f18bc68…` (INC-2026-004, `pending_signature`)
- `phc_customer_id=NULL`, `nif_normalized=NULL`
- Contract intake `2a5fd797…` exists, status `activated`
- Contract `company_nif='999999999'` — **test/dev NIF value**, matches no real Portuguese company
- Legal representative: Luis Fonseca <luiscoutf@gmail.com>
- Same NIF `999999999` and same legal representative appear on INC-2026-003 for "Startup Incrivel" — both are non-production data.

**Verdict:** test data, no real startup/workspace to link. Surfaced in manual queue. Recommended human action: mark as test / archive.

## 3. Three orphan contracts (Workstream 2)

| contract_number | company_nif | funnel_item | intake status | verdict |
|---|---|---|---|---|
| INC-2026-001 | 220925539 | `revistmat` (funnel stage `archived`) | none | abandoned — funnel already archived; no matching startup by NIF |
| INC-2026-003 | 999999999 | `Startup Incrivel` (`sent_for_signature`) | `signature_sent` | test NIF, no matching startup |
| INC-2026-004 | 999999999 | `Startup do Fonsi` (`contracted`) | `activated` | test NIF, no matching startup (same as W1) |

SQL confirms **zero startups** exist with NIF `220925539` or `999999999`. No candidate workspaces.

**Verdict:** none can be linked to a workspace without human judgement. All three surfaced in `admin_manual_resolution_queue`.

## 4. Domiciliation merge (Workstream 3)

Verified via SQL:

```
programs
  df868ac6…  Domiciliação           incubation   settings={service_only:true, hidden_from_cohorts:true}  → 14 workspaces, all service_classification='domiciliacao'
  55cb559a…  Programa Base          incubation   → 204 workspaces (0 domiciliacao, 187 founder_journey)
  70b25196…  LEIRIA EXPERIENCE LAB  acceleration → 16 workspaces
```

- Exactly **one** active service-only program ✅
- All **14** domiciliation workspaces reference it ✅
- No duplicate program remains anywhere in `programs`, `workspaces`, or `funnel_items` ✅
- All 14 workspaces are `service_classification='domiciliacao'` (not founder_journey/mixed) ✅
- Program is flagged `hidden_from_cohorts=true` — excluded from acceleration/incubation cohort reports ✅

**Guard added (this phase):** partial unique index `uniq_active_service_only_program` on `programs ((settings_json->>'service_only'))` — prevents accidental creation of a second active service-only program.

## 5. Workspace count reconciliation (Workstream 5)

The correct, unambiguous count vocabulary (no more "234 active workspaces"):

| metric | count | definition |
|---|---|---|
| total_workspaces | 234 | all rows in `workspaces` |
| non_archived_workspaces | 232 | `archived_at IS NULL` |
| operational_customers | 31 | `status='active'` |
| onboarding_customers | 1 | `status='claimed'` |
| imported_unclaimed_customers | 200 | `status='imported_unclaimed'` |
| archived_workspaces | 2 | `status='archived'` |
| service_only_customers | 14 | `service_classification='domiciliacao'` |
| founder_journey_customers | 187 | `service_classification='founder_journey'` |

204 (Programa Base) + 16 (LEIRIA EXPERIENCE LAB) + 14 (Domiciliação) = 234 total. ✅

The `234 active workspaces` label from earlier chat commentary was a summary shortcut and does not appear in the running app; census/CRM/ecosystem dashboards already break out by `status` and `service_classification`.

## 6. What was changed this pass

- **Migration**: `uniq_active_service_only_program` partial unique index (domiciliation guard).
- **Migration**: `admin_manual_resolution_queue` view (unified staff visibility of the 5 outliers).
- **UI**: `ManualResolutionQueuePanel` mounted in `AdminDataImportV2` above the reconciler panel.
- **Session instrumentation**: `SessionCompletionDialog` wired into `SessionDetailDialog`. Staff with write access see a "Marcar como concluída" button on past, not-yet-completed sessions; completed sessions display a badge. Completion requires `actual_duration_minutes` and `primary_consultant_id` and persists via the canonical `useCompleteSession` mutation, which invalidates `impact-aggregates`.
- **Doc**: this file.

## 7. What was NOT changed

- No reconciler commits performed. Kill-switches remain OFF.
- No auto-linking of the 3 orphan contracts or the 2 contracted funnel items — all require human decision.
- No mutation to the 14 domiciliation workspaces.

## 8. Residual manual work for a human operator

1. Decide fate of INC-2026-001 (`revistmat`, funnel already archived) → likely terminate.
2. Decide fate of INC-2026-003 / INC-2026-004 (test NIF `999999999`) → likely delete or clearly mark as staging.
3. Decide fate of Airmonkey funnel row (contracted stage but no contract) → revert stage or archive.

All four are one click away from the resolution queue panel.

## 9. Verdict

**Reconciliation & impact reporting: NO-GO to enable reconciler writes.** Reason: production has zero legitimate reconciler targets. The path is code-complete and kill-switched; no live commit is warranted.

**Manual resolution queue + domiciliation guard + session completion instrumentation: GO.**
