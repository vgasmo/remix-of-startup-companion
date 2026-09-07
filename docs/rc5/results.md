# RC5 verification results

- Started: 2026-09-07T18:07:36.788Z
- Finished: 2026-09-07T18:10:04.096Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-c027cd7f-91de-4d40-91f9-15e603f3c455@bb46864f8822d82e60589d690a85dc26a71f3c80
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 127 |  |
| typecheck | pass | 0 | 12187 |  |
| lint | pass | 0 | 20409 |  |
| build | pass | 0 | 29111 |  |
| vitest:run:1 | pass | 0 | 21953 |  |
| vitest:run:2 | pass | 0 | 21756 |  |
| vitest:run:3 | pass | 0 | 22598 |  |
| i18n:parity | pass | 0 | 169 |  |
| i18n:lint | pass | 0 | 248 |  |
| i18n:quality | pass | 0 | 131 |  |
| secret:scan | pass | 0 | 702 |  |
| migration:scan | pass | 0 | 177 |  |
| size-limit | pass | 0 | 364 |  |
| deno:check-all | pass | 0 | 17312 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
