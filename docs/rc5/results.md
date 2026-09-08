# RC5 verification results

- Started: 2026-09-08T12:37:58.709Z
- Finished: 2026-09-08T12:41:17.325Z
- Overall: **fail**
- Reason: Staging gates were not executed. RC5_ALLOW_STAGING_TESTS must be 'true' to prove behavioral invariants. Local gates PASS but overall is NO-GO.
- Git: edit/edt-001b31d9-b6f0-4608-bd55-c9df9dedd132@8b9eb537511a3fcdc5bc9f0f535331539d3b1e53
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 118 |  |
| typecheck | pass | 0 | 40428 |  |
| lint | pass | 0 | 25381 |  |
| build | pass | 0 | 35700 |  |
| vitest:run:1 | pass | 0 | 32030 |  |
| vitest:run:2 | pass | 0 | 33774 |  |
| vitest:run:3 | pass | 0 | 28616 |  |
| i18n:parity | pass | 0 | 161 |  |
| i18n:lint | pass | 0 | 294 |  |
| i18n:quality | pass | 0 | 158 |  |
| secret:scan | pass | 0 | 641 |  |
| migration:scan | pass | 0 | 141 |  |
| size-limit | pass | 0 | 300 |  |
| deno:check-all | pass | 0 | 820 |  |
| staging:gate | fail | 2 | 0 | RC5_ALLOW_STAGING_TESTS != 'true' — staging gates not executed |
