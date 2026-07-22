# Batch F4 — Programme Publication (FAILING REPRO)

Preserve both modes:
- Acceleration → weeks + gates
- Incubation → playbooks

Source: `programs`, `program_weeks`, `program_gates`, `stages`,
`stage_gate_criteria`, `playbooks`, `playbook_items`, admin publish
flow.

## Defects

1. Publish is a sequence of mutations, not a transaction; a mid-flight
   failure can leave orphan weeks/gates/playbook items.
2. Snapshot/version creation does not precede mutation — no clean
   rollback target.
3. Active-switch is not paired with previous-active integrity check.
4. Failure injection after each step is not covered by any test.

## Required outcome

- One atomic publish RPC OR immutable-versioned publish + pointer swap.
- Snapshot BEFORE any mutation; abort if snapshot fails.
- Post-publish assertion: previous-active programme's tree is still
  complete + internally consistent.

## Next action

Draft `docs/rc5/drafts/2026-07-22_batch-f4_publish_atomic.sql`.
