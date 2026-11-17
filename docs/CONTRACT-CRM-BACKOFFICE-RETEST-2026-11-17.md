# Contracts, backoffice and CRM — verification, 17 November 2026

## Scope and safety

Repeated application regressions, selected function tests, a fresh disposable PostgreSQL 17 replay, authenticated browser navigation and a public native-signature wizard with intercepted requests. Hosted data was queried read-only. No real contract, email, signature, invitation or workspace was created or changed. P05 backup remains present and blocked. No frontend publication or function deployment was performed.

## Results

| Verification | Result |
| --- | --- |
| Application suite (`bun run test`) | 355 tests, 54 files passed |
| Selected Deno suites | 67 tests passed |
| Fresh PostgreSQL 17 replay, all `supabase/tests/*.test.sql` | 419 assertions, 40 suites passed; zero replay failures |
| ESLint (`bun run lint`) | Passed |
| i18n lint | 714 files; zero problems |
| Deno check | Native onboarding, its test, activation reconciler, historical DocuSign webhook and PandaDoc sending function passed |
| Automatic preview build telemetry | Latest observed entry: `build OK` |

No manual TypeScript build/typecheck was invoked; the environment delegates it to the automatic harness. This report does not claim a literal `tsc` run.

### Business-flow coverage

- Pricing and largest-single-discount calculations, CRM conversion and lifecycle replay are covered by the application tests.
- Disposable SQL exercises CRM conversion with preserved metadata/history, required program, non-activation without verified signature and idempotent workspace linking.
- Disposable SQL exercises signing grants, single-use/expired grants, document-hash mismatch, bilateral signature completion, idempotent evidence and refusal of state regression; contract-security tests exercise immutability and authorization.
- Function tests exercise sending a native link, email-provider failure, absent email configuration, rejected external providers, explicit consent, regulation acceptance, expired links, atomic proof payload and failure of signature recording.
- Added five native-signature regressions. A simulated successful signature followed by an unmatched activation update returns `signed` with `activation_pending: true`, saves the proof snapshot and does not send an email. The lifecycle helper tests independently cover integration outcomes.

## Browser observations

Authenticated requesting-admin session opened `/crm`, `/admin/contracts`, backoffice contracts, spaces and system settings. The contract drawer for INC-2026-004 exposed only native digital and presencial fallback options. External provider settings were absent. Desktop (1280×1800) and mobile (390×844) captures were inspected. No JavaScript page errors or failed database reads were observed in these steps.

The public wizard used fictitious INC-TEST-001 and intercepted every `public-contract-onboarding` request. Its actual rendered UI advanced through company data, contract/Regulamento acceptance, typed signature and consent, and showed the truthful deferred-activation message. This proves the UI path with simulated responses, **not** a single hosted end-to-end transaction. The mocked PDF was a placeholder; PDF content/layout was not certified.

Temporary screenshots and scripts are under `/tmp/browser/contract-retest/`; they are not permanent deliverables.

## Hosted read-only findings

- 20 leads at `contracted` have no linked workspace. None of the `incubating`/`accelerating` leads matched that condition.
- INC-2026-005 is `active` with `signature_status = pending`, no provider and no nonempty pricing snapshot. Historical evidence must be reviewed before any correction; do not infer a signature or invent prices.
- Zero activated intakes lacking a completed contract signature.
- Zero broken referenced contract IDs in the checked CRM/intake relations.
- Backoffice visibly reports lifecycle inconsistencies; these are not cleared by passing regression tests.
- `template_instances_dedup_backup_20260516` still exists.

## Limits and transient verification errors

This is not certification of every role or every production branch. Real mailbox delivery, uploads/storage, actual PDF generation, founder account creation, staff countersignature, activation recovery and notifications were not exercised as one continuous hosted flow. Existing automated checks provide separate coverage, but do not replace that acceptance test in an isolated environment. No additional security scan was run.

An initial Deno check included a nonexistent `contract-activation/index.ts`; corrected to the existing `reconcile-contract-activation/index.ts`, then passed. New fixtures initially inferred nullable provider/status as null-only; widened the fixture fields and reran successfully. Browser automation initially expected different button labels; selectors were corrected to the observed `Continuar` and `Enviar via provedor`, then the wizard completed. No product behavior was changed to accommodate these errors.