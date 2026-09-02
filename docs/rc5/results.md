# RC5 verification results

- Started: 2026-09-02T14:41:59.528Z
- Finished: 2026-09-02T14:43:48.236Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-ffe62eb1-ed5d-4cb3-8236-516871269105@8d7d813f70e5251cd6fa04437398467937777c7e
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 77 |  |
| typecheck | pass | 0 | 20024 |  |
| lint | pass | 0 | 17458 |  |
| build | pass | 0 | 21202 |  |
| vitest:run:1 | pass | 0 | 18760 |  |
| vitest:run:2 | pass | 0 | 17497 |  |
| vitest:run:3 | pass | 0 | 11861 |  |
| i18n:parity | pass | 0 | 123 |  |
| i18n:lint | pass | 0 | 212 |  |
| i18n:quality | pass | 0 | 120 |  |
| secret:scan | pass | 0 | 497 |  |
| migration:scan | pass | 0 | 116 |  |
| size-limit | pass | 0 | 249 |  |
| deno:check-all | pass | 0 | 470 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
