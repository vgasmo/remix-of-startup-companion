# Batch F5 — source landed 2026-07-22

Draft: `docs/rc5/drafts/2026-07-22_batch-f5_financial_scenario.sql`.
pgTAP: `supabase/tests/financial_scenario_atomic.test.sql`.

- `financial_model_versions.command_fingerprint` (nullable) + partial unique
  index `(session_id, command_fingerprint) WHERE command_fingerprint IS NOT NULL`
  — a double-click that reuses the same fingerprint returns the existing
  version instead of creating a sibling.
- `save_financial_scenario_atomic(session, label, assumptions, metrics,
  scoring, metadata, command_id, fingerprint)` SECURITY DEFINER:
  workspace access check, FOR UPDATE session lock, idempotent replay
  short-circuit (`mode='idempotent_reuse'`), snapshot of assumption KV
  rows so clones read the exact state instead of recomputing.

Not landed this turn (deferred, tracked separately):
- localStorage autosave keyed on `(workspace_id, session_id, user_id)`.
- Scoring UI dimensions + evidence + missing + risks + remediation.
- Excel round-trip determinism assertion via `financial_cell_map`.
- Mobile scroll fixes for long templates + dialogs.
- Assistant "facts vs assumptions" labelling.

Runtime proof gate: double-click concurrency probe + long assistant session
survival — `NOT PROVEN`.
