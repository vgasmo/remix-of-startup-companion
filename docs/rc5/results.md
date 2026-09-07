# RC5 verification results

- Started: 2026-09-07T18:12:42.870Z
- Finished: 2026-09-07T18:14:54.833Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-c027cd7f-91de-4d40-91f9-15e603f3c455@38699b04f60680e200d808a2a5d1ba6a6726e0fb
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 73 |  |
| typecheck | pass | 0 | 11572 |  |
| lint | pass | 0 | 20865 |  |
| build | pass | 0 | 30549 |  |
| vitest:run:1 | pass | 0 | 23862 |  |
| vitest:run:2 | pass | 0 | 22816 |  |
| vitest:run:3 | pass | 0 | 19903 |  |
| i18n:parity | pass | 0 | 144 |  |
| i18n:lint | pass | 0 | 264 |  |
| i18n:quality | pass | 0 | 145 |  |
| secret:scan | pass | 0 | 725 |  |
| migration:scan | pass | 0 | 157 |  |
| size-limit | pass | 0 | 279 |  |
| deno:check-all | pass | 0 | 580 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
