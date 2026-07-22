# Batch F4 — source landed 2026-07-22

Draft: `docs/rc5/drafts/2026-07-22_batch-f4_publish_atomic.sql`.
pgTAP: `supabase/tests/program_publish_atomic.test.sql`.

- `program_publish_snapshots` records the deterministic tree
  (`serialize_program_tree`) BEFORE any mutation. Snapshot failure aborts
  publish before the pointer swap.
- `publish_program_atomic(program, reason)` SECURITY DEFINER:
  1. staff role guard,
  2. row lock on the target program,
  3. serialize + insert snapshot,
  4. row lock on the current active peer of the same `program_type`,
  5. pointer swap,
  6. post-swap re-serialize of the previous-active tree — raises
     `23514 previous_active_tree_broken` if it fails.
- Preserves both modes: acceleration (weeks + gates + stages) and
  incubation (playbooks + items) are both included in the snapshot.

Runtime proof gate: failure-injection between steps 3 and 5 — `NOT PROVEN`.
