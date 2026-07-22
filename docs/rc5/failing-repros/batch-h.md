# Batch H — Release Engineering (FAILING REPRO)

## Gates

- [ ] CI pinned to `packageManager` Bun version (currently untied).
- [ ] Deno check on every changed edge function.
- [ ] Zero ESLint errors (currently: warnings only).
- [ ] Zero strict i18n findings, real PT-PT and EN (currently: 5 open
      PT/EN gaps documented in previous checkpoint).
- [ ] Zero unapproved migration-scan findings.
- [ ] Test harness functions removed / dropped via forward cleanup.
- [ ] Fixtures never live in numbered production migrations.
- [ ] All canonical tests wired into `rc5:verify` and CI.
- [ ] Single truthful evidence ledger; contradictory RC5 docs marked
      SUPERSEDED.

## Next action

Fix i18n gaps enumerated in the last checkpoint. Pin
`packageManager` in `package.json` to a specific Bun version and
mirror in CI. Add `deno check` step per changed function to
`rc5:verify`.
