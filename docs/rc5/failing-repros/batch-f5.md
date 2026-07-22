# Batch F5 — Business Plan & Financial Plan Assistants (FAILING REPRO)

Source: `financial_plan_sessions`, `financial_model_versions`,
`financial_assumptions`, `financial_prefill_proposals`, business plan
assistant components, "Save As Scenario" flow.

## Defects

1. Save As Scenario is not wired to the atomic financial-scenario RPC;
   assumptions, metrics, scoring, and session metadata save via
   multiple awaits.
2. No versioned autosave; a tab crash loses in-flight work.
3. Duplicate-click can create sibling scenarios.
4. Scenario clone is not exact — recomputes some derived fields on
   read.
5. Assistant partial progress does not survive tab/window changes for
   BP + FP.
6. Generated advice sometimes states derived numbers as facts; must
   label assumptions vs facts.
7. Scoring surfaces a single number with no dimensions, evidence,
   missing-data, risks, or remediation.
8. Excel upload/download + KPI ingestion reconcile probabilistically,
   not deterministically.
9. Long templates + dialogs don't scroll correctly on mobile.

## Required outcome

- Atomic RPC `save_financial_scenario_atomic(session_id, version,
  assumptions, metrics, scoring, metadata, command_id)` with
  fingerprinting.
- localStorage draft keyed on `(workspace_id, session_id, user_id)`
  with server-side reconcile on reconnect.
- Scoring UI: dimensions + evidence + missing + risks + remediation.
- Excel round-trip: deterministic cell map already exists
  (`financial_cell_map`); assert idempotent apply.

## Next action

Draft the RPC + Vitest for autosave + persona Playwright at 390/1440
in the Batch F5 turn.
