# RC ZIP4 Audit — 2026-07-22

Archive SHA-256: `15055418472926AD1D7A59D2D7D64251E27341B3D0519EED4AD3823DF2D79CC7`
Environment: production DB is the only reachable database from this sandbox.
Bun version actually available: **1.3.3** (contract is 1.2.0 — see Phase 0 note).

This document reproduces the verified findings from the external RC ZIP4 audit
so they live inside the Lovable repository as the current source of truth.
Older RC5 status files are SUPERSEDED where they contradict this file.

## P0 findings (release-blocking)

1. `PublicContractSigning.tsx` posts `signatureData` **without a required
   `consent` object**; the server rejects the normal UI request. The UI
   afterwards **hardcodes consent to `true`** instead of forwarding the
   actual checkbox state. Legal validity is unproven.
2. Simple digital signing has **no complete counter-signer path**: the
   attempted `counter_sign_contract` insert violates the deployed
   `work_queue_items_type_check` and its error is swallowed. Bilateral
   completion cannot be trusted.
3. Signature evidence uses **unsafe deletion / access semantics**: cascade
   deletes remove legal proof; peer consultants can read evidence outside
   their assignment scope.
4. `docusign-send-envelope/index.ts:349` references an **undefined
   `envelopeBody`**; the claim protocol permits duplicate dispatch under a
   provider-timeout window. (Fixed in source this turn; still kill-switched
   until provider sandbox proof.)
5. `log_completed_session_atomic` grants active founders / ordinary team
   members completed-session authority via self-attribution.
6. Past-meeting idempotency is bound only to `command_id`, not to actor,
   workspace, and the full normalized payload; replay across actors or
   payloads is not deterministically resolved.
7. Base `profiles` RLS still exposes peer PII (email, phone, linkedin,
   private notes) despite some components using `profiles_safe`.
8. RC5 test evidence historically contained invalid / skipped /
   unconditional `pass(...)` assertions and pgTAP plan mismatches.

## P1 findings

9.  Public first-contact booking calls outbox functions that exist only in
    `docs/rc5/drafts/*.sql` and ignores several Supabase `data/error`
    results.
10. CRM import can assign leads to the uploader by default and mark
    partially failed batches as fully committed.
11. Mentor booking does not keep canonical participants, sessions,
    cancellation, completion, and availability consistent across
    transitions.
12. Founder Pulse is correctly OFF but lacks safe RLS, worker, cron, DPO
    approval, and canary proof.
13. Financial scenario cloning is non-atomic; the transactional RPC
    (`save_financial_scenario_atomic`) is not wired into the Save-As
    UI.
14. Programme publication preserves both modes (Acceleration weeks/gates,
    Incubation playbooks) but metadata / KPI writes still occur outside the
    main transaction boundary.
15. `complete_workspace_onboarding` is authorized too broadly (any active
    workspace member instead of founder/owner or authorized staff).
16. Transcript confidentiality restoration remains NOT PROVEN — a
    read-only production reconciliation and manual review queue have not
    been produced.
17. The complete Edge Function fleet has **24 files failing `deno check`**
    at the start of this turn (30 before the shared `deno.json` was added).
    Full evidence: `docs/rc5/evidence/phase-0/deno-full-check.log`.

## Explicit non-closure

Recording these findings in this document **does not close any of them.**
Closure requires: (a) a failing automated reproduction, (b) the code fix,
(c) the same test passing in a canonical runner, (d) evidence archived
under `docs/rc5/evidence/`. Behavioral gates that require a disposable
staging DB remain NOT PROVEN until such a database is provided; source
implementation can proceed without it, but GO cannot be declared.
