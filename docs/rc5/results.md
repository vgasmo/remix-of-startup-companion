# RC5 verification results

- Started: 2026-09-08T12:45:33.747Z
- Finished: 2026-09-08T12:48:35.846Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-8916f158-7cb6-4128-aa2b-463863c79506@15a1bddf66bed49e66ab6a6af77c0fc9ae4f8971
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 85 |  |
| typecheck | pass | 0 | 19881 |  |
| lint | pass | 0 | 24376 |  |
| build | pass | 0 | 32298 |  |
| vitest:run:1 | pass | 0 | 28641 |  |
| vitest:run:2 | pass | 0 | 36021 |  |
| vitest:run:3 | pass | 0 | 38480 |  |
| i18n:parity | pass | 0 | 136 |  |
| i18n:lint | pass | 0 | 228 |  |
| i18n:quality | pass | 0 | 142 |  |
| secret:scan | pass | 0 | 612 |  |
| migration:scan | pass | 0 | 179 |  |
| size-limit | pass | 0 | 345 |  |
| deno:check-all | pass | 0 | 626 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
