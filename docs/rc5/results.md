# RC5 verification results

- Started: 2026-09-02T14:38:18.121Z
- Finished: 2026-09-02T14:39:57.504Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-ffe62eb1-ed5d-4cb3-8236-516871269105@4e3933aa227c3ad76bbe54ca83c428e613afdc53
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 55 |  |
| typecheck | pass | 0 | 6981 |  |
| lint | pass | 0 | 17432 |  |
| build | pass | 0 | 20067 |  |
| vitest:run:1 | pass | 0 | 17428 |  |
| vitest:run:2 | pass | 0 | 16835 |  |
| vitest:run:3 | pass | 0 | 18656 |  |
| i18n:parity | pass | 0 | 135 |  |
| i18n:lint | pass | 0 | 212 |  |
| i18n:quality | pass | 0 | 120 |  |
| secret:scan | pass | 0 | 473 |  |
| migration:scan | pass | 0 | 111 |  |
| size-limit | pass | 0 | 247 |  |
| deno:check-all | pass | 0 | 606 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
