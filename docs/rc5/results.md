# RC5 verification results

- Started: 2026-09-14T10:44:50.154Z
- Finished: 2026-09-14T10:46:34.100Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-39f4f529-42e1-4544-89e0-aa990a2cc9df@c6da77183effc63128dd8a35a36071d86f16b25c
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 77 |  |
| typecheck | pass | 0 | 9262 |  |
| lint | pass | 0 | 15352 |  |
| build | pass | 0 | 24461 |  |
| vitest:run:1 | pass | 0 | 16362 |  |
| vitest:run:2 | pass | 0 | 13350 |  |
| vitest:run:3 | pass | 0 | 14131 |  |
| i18n:parity | pass | 0 | 106 |  |
| i18n:lint | pass | 0 | 209 |  |
| i18n:quality | pass | 0 | 126 |  |
| secret:scan | pass | 0 | 464 |  |
| migration:scan | pass | 0 | 106 |  |
| size-limit | pass | 0 | 208 |  |
| deno:check-all | pass | 0 | 9687 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
