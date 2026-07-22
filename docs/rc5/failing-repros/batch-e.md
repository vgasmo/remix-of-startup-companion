# Batch E — Privacy / Peer Profile Boundary (FAILING REPRO)

Source: every `from('profiles')` call across the app,
`public.profiles_safe` view (already hardened via
SECURITY DEFINER + security_barrier), workspace chat sender/participant
reads.

## Defects

1. Chat sender/participant reads still hit `profiles` directly in
   several call sites — must route through `profiles_safe`.
2. No canonical safe peer-profile contract; each caller picks columns
   ad-hoc.
3. Workspace onboarding completion writes are not restricted to
   founder/owner or authorized staff.

## Required outcome

- Full `rg "from\\('profiles'\\)"` audit with per-file classification:
  self-only (keep), staff-only (keep), peer (must switch to
  `profiles_safe`).
- Test: peer can read `full_name, avatar_url`; peer cannot read `email,
  phone, linkedin_url, private_notes`.
- Workspace `complete_onboarding` RPC gated on founder/owner role.

## Non-goals

Blind global replace. Self-reads and staff-scoped reads keep using
`profiles`.

## Next action

Produce audit table `docs/rc5/batch-e-profiles-audit.md`, then apply
targeted diffs. No migration required unless RLS gap found.
