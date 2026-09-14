# RC5 verification results

- Started: 2026-09-14T10:46:40.020Z
- Finished: 2026-09-14T10:48:01.991Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-39f4f529-42e1-4544-89e0-aa990a2cc9df@5b175c832de604815b76873ab62812a60afb8aa7
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 66 |  |
| typecheck | pass | 0 | 8216 |  |
| lint | pass | 0 | 14318 |  |
| build | pass | 0 | 21781 |  |
| vitest:run:1 | pass | 0 | 11339 |  |
| vitest:run:2 | pass | 0 | 12780 |  |
| vitest:run:3 | pass | 0 | 11803 |  |
| i18n:parity | pass | 0 | 103 |  |
| i18n:lint | pass | 0 | 172 |  |
| i18n:quality | pass | 0 | 96 |  |
| secret:scan | pass | 0 | 428 |  |
| migration:scan | pass | 0 | 112 |  |
| size-limit | pass | 0 | 217 |  |
| deno:check-all | pass | 0 | 505 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
