# RC5 Failing Repros — Batches B through H

Persistent, honest state. One document per batch. Each captures the concrete
defect list, the source seams that must change, and the runtime proofs that
remain `NOT PROVEN` until an isolated non-production database exists.

No batch below has been shipped. Nothing here should be read as PASS.

| Batch | Doc | Verdict |
|-------|-----|---------|
| B — Contract signing integrity | `batch-b.md` | FAILING REPRO |
| C — DocuSign exactly-once | `batch-c.md` | FAILING REPRO |
| D — Founder Pulse (must stay OFF) | `batch-d.md` | FAILING REPRO |
| E — Privacy / peer profile boundary | `batch-e.md` | FAILING REPRO |
| F1 — Public first-contact booking | `batch-f1.md` | FAILING REPRO |
| F2 — Mentor lifecycle & reporting | `batch-f2.md` | FAILING REPRO |
| F3 — CRM import reconciliation | `batch-f3.md` | FAILING REPRO |
| F4 — Programme publication | `batch-f4.md` | FAILING REPRO |
| F5 — BP / FP assistants | `batch-f5.md` | FAILING REPRO |
| G1 — Automation truth manifest | `batch-g1.md` | FAILING REPRO |
| G2 — UX / a11y / clickability | `batch-g2.md` | FAILING REPRO |
| G3 — Measured performance | `batch-g3.md` | FAILING REPRO |
| H — Release engineering | `batch-h.md` | FAILING REPRO |

## Why this exists

The user asked for "all remaining batches" in one turn. Honestly shipping 10
production-hardening batches (each 5–15 sub-items with forward migrations,
edge rewrites, pgTAP suites, and persona Playwright proofs) is not physically
possible in a single context window. Faking it would violate the standing
rule: never report unexecuted work as PASS.

Instead this bundle preserves everything discovered so each subsequent
focused turn is a direct implementation, not a re-audit.
