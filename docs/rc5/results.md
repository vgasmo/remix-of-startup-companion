# RC5 verification results

- Started: 2026-07-23T10:14:59.696Z
- Finished: 2026-07-23T10:16:42.889Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-04686d64-47bb-46c7-ae7f-0dce9d239eb2@7251814e56588536deba4fd5001bc27c9c6d5c27
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 77 |  |
| typecheck | pass | 0 | 7562 |  |
| lint | pass | 0 | 17225 |  |
| build | pass | 0 | 28519 |  |
| vitest:run:1 | pass | 0 | 16823 |  |
| vitest:run:2 | pass | 0 | 16409 |  |
| vitest:run:3 | pass | 0 | 15365 |  |
| i18n:parity | pass | 0 | 152 |  |
| i18n:lint | pass | 0 | 267 |  |
| secret:scan | pass | 0 | 592 |  |
| deno:check-changed | pass | 0 | 154 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
