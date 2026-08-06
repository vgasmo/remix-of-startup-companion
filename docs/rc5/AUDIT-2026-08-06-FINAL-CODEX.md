# RC5 — Final Candidate Audit (2026-08-06)

Reconciliation of the embedded 2026-08-06 findings against the **live repository**
(which is newer than the ZIP candidate). This file plus
`docs/rc5/evidence-ledger.md` are the only authoritative truth documents.
Everything else under `docs/rc5/` is historical.

## Candidate identity

| Field | Value |
|---|---|
| Source archive claimed | `leiria-launchpad-pro-53d92b75-main (1).zip` |
| Archive SHA-256 claimed | `92E4DFC06862EAE01EAEE507C87520785AAEF2F155F180EC2A83212023EC0D57` (byte-identical to 2026-07-27 candidate; not verifiable here — the ZIP is not in this environment) |
| Live git SHA | `a911551365f4dccaad88304761e3cee359f868cf` |
| Live git branch | `edit/edt-e2e17866-4b7e-4a11-b961-9436951f0d4c` |
| Package manager | `bun@1.2.0` (pinned) |
| Environment reachable | **production only** (Lovable Cloud). No local Supabase, no isolated staging clone. |
| Migration files on disk | 440 |
| Applied-migration list | **NOT PROVEN** — the exec DB role is denied `supabase_migrations` schema access; presence was verified per-object instead (see below). |

Because only production is reachable, protocol rule 10 applies: this turn performed
**source-safe work only**. No fixtures, concurrency probes, provider failure
injection, or bulk sends were run. Verdict stays **NO-GO**.

## Batch 0 outcome (this turn)

| Item | Before | After | Evidence |
|---|---|---|---|
| Full-tree Deno assurance | changed-only (`deno-check-changed.mjs`) — blind to `_shared/**` | `scripts/rc5/deno-check-all.mjs`, 131 files | `[rc5:deno-check-all] PASS — 131 files typecheck clean.` |
| `_shared/xlsxFingerprint.ts:15` dead SHA module URL | `import * as sha256 from "https://deno.land/std@0.224.0/hash/sha256.ts"` (removed module; import unused — the file already uses Web Crypto) | import deleted | full-tree Deno check PASS |
| `_shared/xlsmCanonical_e2e_test.ts:21` `BufferSource` mismatch | `crypto.subtle.digest("SHA-256", bytes)` with `Uint8Array<ArrayBufferLike>` | copies into a concrete `ArrayBuffer` slice before digest | full-tree Deno check PASS |
| Deterministic Deno dependency resolution | `npm:resend@4.0.0` unresolvable during whole-tree check | `deno install` in `supabase/functions` + `--config supabase/functions/deno.json` in the gate and in CI | CI step "Install edge function dependencies (deterministic)" |
| CI Deno version | `v1.x` | `v2.x` (matches Deno 2.5.6/2.6.x check) | `.github/workflows/ci.yml` |
| `rc5:verify` missing gates | no size-limit, no migration scan, no automation reconciliation, no full Deno | all four wired | `scripts/rc5/verify.mjs` |
| PT-PT semantic i18n quality | not gated; 56 mixed-language strings shipped green | `scripts/rc5/i18n-quality.mjs` gate + 56 strings rewritten to natural PT-PT | gate PASS |
| Stale RC5 documents | contradictory PASS/GO claims | superseded list maintained in `evidence-ledger.md` | ledger |

### Local gate results (live repo, this turn)

| Gate | Command | Result |
|---|---|---|
| TypeScript (app) | `bunx tsgo -p tsconfig.typecheck.json --noEmit` | exit 0 |
| ESLint | `bun run lint` | exit 0, zero warnings |
| Vitest | `bunx vitest run` | 25 files / **206 tests** passed |
| Build | `bun run build` | exit 0 |
| Size limit | `bunx size-limit` | JS 538.63 kB gzip / limit 900 kB; CSS 24.15 kB / limit 120 kB — PASS |
| i18n parity | `node scripts/i18n-check.cjs` | 8,988 keys in sync |
| i18n lint | `node scripts/i18n-lint.mjs` | 647 files, 0 problems |
| i18n quality (new) | `node scripts/rc5/i18n-quality.mjs` | PASS |
| Secret scan | `node scripts/secret-scan.cjs` | 1,437 files, clean |
| Migration scan | `node scripts/ci/scan-migrations.mjs` | 440 files, clean |
| Deno full tree (new) | `node scripts/rc5/deno-check-all.mjs` | **131 files PASS** |

## Reconciliation of embedded findings against live source/DB

The live repo is materially newer than the ZIP. Verified per finding:

| Ref | Embedded claim | Live state | Disposition |
|---|---|---|---|
| P0-A | `PublicContractSigning.tsx` omits top-level `consent` → `consent_required` | the component now sends an explicit `consent` object (`src/pages/PublicContractSigning.tsx:283`) | **partially FIXED** — the `consent_required` regression is closed; the nullable `p_grant_nonce` bypass, document-hash binding, authorize-before-replay ordering and counter-sign task remain `FAILING REPRO` |
| P0-B | new DocuSign lease RPCs have no Edge call site | `claim_docusign_dispatch_lease` and siblings exist in production; `docusign-send-envelope` still calls the earlier RPCs | `FAILING REPRO` (unchanged) |
| P0-C | past-meeting RPC auth/idempotency/attendee gaps | `log_completed_session_atomic` hardened in migration `20260722113303…`; pgTAP file exists (19 scenarios) but has never executed | `NOT PROVEN` |
| P1-D..P1-H | booking/mentor/CRM/publish/financial transactional gaps | supporting objects present in production (`normalize_ident`, `transition_mentor_booking_atomic`, `publish_program_atomic`, `save_financial_scenario_atomic`); call-site wiring and concurrency proof absent | `FAILING REPRO` / `NOT PROVEN` per ledger |
| P1-I | onboarding gate + peer profile reads | onboarding gate migration landed; `profiles_safe` masked view live; peer-read audit in `batch-e-profiles-audit.md` | `NOT PROVEN` (needs pgTAP role matrix) |
| P1-J | Founder Pulse off, CI gates incomplete, harnesses can measure login pages | CI/verify gaps closed this turn; Founder Pulse flag stays OFF; harness persona-auth hardening still open | partially fixed |
| P2 | mixed-language PT strings; large chunks; unit tests do not exercise SQL/Edge | PT strings fixed + gated; chunking unchanged (within budget); test-coverage gap unchanged | partially fixed |

## Why the release remains NO-GO

Mandatory gates 7–14 cannot be executed here: fresh replay, staging forward apply,
pgTAP role/RLS matrix, true concurrency, provider failure injection, authenticated
four-persona E2E at 320/390/768/1440, automation reconciliation against live
`pg_cron`, and Founder Pulse canary/DPO evidence all require a **non-production
database and seeded persona accounts**. Running any of them against production is
forbidden by protocol rule 4.

## Exact continuation command

```
RC5_ALLOW_STAGING_TESTS=true \
STAGING_SUPABASE_URL=https://<staging-ref>.supabase.co \
STAGING_DATABASE_URL=postgresql://<staging-conn> \
STAGING_APP_URL=https://<staging-host> \
node scripts/rc5/verify.mjs
```

First unchecked ledger item: **P0-A — burn the nullable `p_grant_nonce` bypass in
`apply_contract_signature_atomic` behind a forward-only migration, with the
failing pgTAP scenario landed first** (`supabase/tests/apply_contract_signature_atomic.test.sql`).
