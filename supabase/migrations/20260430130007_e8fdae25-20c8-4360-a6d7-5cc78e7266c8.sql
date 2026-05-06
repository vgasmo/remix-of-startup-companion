-- NEUTRALIZED MIGRATION
-- Previous content destructively deleted program_weeks/program_gates rows
-- by hardcoded UUID (70b25196-5e9c-4890-a1d9-9968c94f9760), wiping programme
-- data on every fresh DB replay. Replaced with a no-op so historical migration
-- chain stays intact while preventing data loss.
-- Republish recovery is now handled by a later, idempotent migration.
SELECT 1;
