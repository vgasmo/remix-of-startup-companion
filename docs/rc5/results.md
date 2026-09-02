# RC5 verification results

- Started: 2026-09-02T14:43:53.607Z
- Finished: 2026-09-02T14:45:35.408Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-ffe62eb1-ed5d-4cb3-8236-516871269105@32c26b9611283ff39923c99a7d87353e8a560a74
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 68 |  |
| typecheck | pass | 0 | 15564 |  |
| lint | pass | 0 | 14423 |  |
| build | pass | 0 | 23365 |  |
| vitest:run:1 | pass | 0 | 17244 |  |
| vitest:run:2 | pass | 0 | 16511 |  |
| vitest:run:3 | pass | 0 | 12789 |  |
| i18n:parity | pass | 0 | 134 |  |
| i18n:lint | pass | 0 | 227 |  |
| i18n:quality | pass | 0 | 128 |  |
| secret:scan | pass | 0 | 443 |  |
| migration:scan | pass | 0 | 93 |  |
| size-limit | pass | 0 | 197 |  |
| deno:check-all | pass | 0 | 581 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
