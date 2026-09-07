# RC5 verification results

- Started: 2026-09-07T18:10:25.072Z
- Finished: 2026-09-07T18:12:37.109Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-c027cd7f-91de-4d40-91f9-15e603f3c455@714498d372df8891be92cea4fd73aa4182991aa1
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 89 |  |
| typecheck | pass | 0 | 17945 |  |
| lint | pass | 0 | 20053 |  |
| build | pass | 0 | 28897 |  |
| vitest:run:1 | pass | 0 | 20489 |  |
| vitest:run:2 | pass | 0 | 21172 |  |
| vitest:run:3 | pass | 0 | 21075 |  |
| i18n:parity | pass | 0 | 134 |  |
| i18n:lint | pass | 0 | 290 |  |
| i18n:quality | pass | 0 | 168 |  |
| secret:scan | pass | 0 | 592 |  |
| migration:scan | pass | 0 | 179 |  |
| size-limit | pass | 0 | 282 |  |
| deno:check-all | pass | 0 | 615 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
