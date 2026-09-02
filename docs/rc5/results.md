# RC5 verification results

- Started: 2026-09-02T14:36:48.972Z
- Finished: 2026-09-02T14:37:54.308Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-fabfecdb-fe80-4e8c-81e5-0c7bcbe54d94@f94d2394cb4d4f2472c954fa08c865d00d369524
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 51 |  |
| typecheck | pass | 0 | 6245 |  |
| lint | pass | 0 | 11034 |  |
| build | pass | 0 | 17586 |  |
| vitest:run:1 | pass | 0 | 9139 |  |
| vitest:run:2 | pass | 0 | 9218 |  |
| vitest:run:3 | pass | 0 | 10174 |  |
| i18n:parity | pass | 0 | 136 |  |
| i18n:lint | pass | 0 | 205 |  |
| i18n:quality | pass | 0 | 111 |  |
| secret:scan | pass | 0 | 452 |  |
| migration:scan | pass | 0 | 122 |  |
| size-limit | pass | 0 | 253 |  |
| deno:check-all | pass | 0 | 581 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
