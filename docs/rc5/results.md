# RC5 verification results

- Started: 2026-09-07T18:04:46.087Z
- Finished: 2026-09-07T18:07:13.243Z
- Overall: **fail**
- Reason: Step "migration:scan" exited 1.
- Git: edit/edt-397b11a4-78bd-40a4-bdf3-586939098004@0e55ba7e6c8e6a28f48d811c5735fb85d393971f
- Staging ref: -

| Step | Status | Exit | Duration (ms) | Note |
|---|---|---|---|---|
| install | pass | 0 | 94 |  |
| typecheck | pass | 0 | 25528 |  |
| lint | pass | 0 | 21995 |  |
| build | pass | 0 | 31016 |  |
| vitest:run:1 | pass | 0 | 23083 |  |
| vitest:run:2 | pass | 0 | 22831 |  |
| vitest:run:3 | pass | 0 | 21242 |  |
| i18n:parity | pass | 0 | 134 |  |
| i18n:lint | pass | 0 | 317 |  |
| i18n:quality | pass | 0 | 123 |  |
| secret:scan | pass | 0 | 595 |  |
| migration:scan | fail | 1 | 155 |  |
