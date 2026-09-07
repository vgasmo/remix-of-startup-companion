# RC5 verification results

- Started: 2026-09-07T18:15:00.379Z
- Finished: 2026-09-07T18:17:06.699Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-c027cd7f-91de-4d40-91f9-15e603f3c455@b88cd9a196a85955cbb8c29ecb8698612152266f
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 78 |  |
| typecheck | pass | 0 | 11285 |  |
| lint | pass | 0 | 19644 |  |
| build | pass | 0 | 29103 |  |
| vitest:run:1 | pass | 0 | 22734 |  |
| vitest:run:2 | pass | 0 | 19535 |  |
| vitest:run:3 | pass | 0 | 21404 |  |
| i18n:parity | pass | 0 | 172 |  |
| i18n:lint | pass | 0 | 295 |  |
| i18n:quality | pass | 0 | 156 |  |
| secret:scan | pass | 0 | 619 |  |
| migration:scan | pass | 0 | 163 |  |
| size-limit | pass | 0 | 330 |  |
| deno:check-all | pass | 0 | 712 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
