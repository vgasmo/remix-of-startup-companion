-- Neutralized during release polish: original contained record-specific
-- mutations referencing hardcoded UUIDs or test mailbox accounts. The
-- intended runtime effects are preserved by later generic migrations
-- (e.g. 20260429192821 dedupes contracts and removes test mailbox rows
-- by email/provider). No-op on fresh database replays.
SELECT 1;
