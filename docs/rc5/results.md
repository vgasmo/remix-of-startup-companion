# RC5 verification results

- Started: 2026-09-08T12:18:05.971Z
- Finished: 2026-09-08T12:20:44.965Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-d543a9de-2154-48c8-ab4e-876dc5f74f64@35f6dc18d750e57ab49280178d127a6f850f0c83
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 151 |  |
| typecheck | pass | 0 | 13170 |  |
| lint | pass | 0 | 24032 |  |
| build | pass | 0 | 29829 |  |
| vitest:run:1 | pass | 0 | 25076 |  |
| vitest:run:2 | pass | 0 | 22738 |  |
| vitest:run:3 | pass | 0 | 24170 |  |
| i18n:parity | pass | 0 | 137 |  |
| i18n:lint | pass | 0 | 277 |  |
| i18n:quality | pass | 0 | 143 |  |
| secret:scan | pass | 0 | 567 |  |
| migration:scan | pass | 0 | 146 |  |
| size-limit | pass | 0 | 309 |  |
| deno:check-all | pass | 0 | 18190 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
