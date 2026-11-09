#!/usr/bin/env bash
# Explicit local-only replay of the baseline + approved additive migration chain.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [ "${RC5_REUSE:-0}" != "0" ]; then echo 'RC12 fresh verification refuses RC5_REUSE' >&2; exit 1; fi
if [ "${RC5_ALLOW_REPLAY_FAILURES:-0}" != "0" ]; then echo 'RC12 fresh verification refuses ignored replay failures' >&2; exit 1; fi
case "$(postgres --version)" in *' 17.'*) ;; *) echo 'PostgreSQL 17 required' >&2; exit 1;; esac
unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSSLMODE STAGING_DATABASE_URL RC5_DISPOSABLE_DATABASE_URL
extras="$ROOT/scripts/rc5/audit-local-fixtures.sql"
for file in "$ROOT"/drizzle/migrations/*.sql; do
  [ -s "$file" ] || { echo 'missing/empty additive migration' >&2; exit 1; }
  extras="$extras:$file"
done
export RC5_EXTRA_MIGRATIONS="$extras"
export RC5_PG_RUN_DIR="${RC5_PG_RUN_DIR:-/tmp/rc12-fresh-pg}"
bash "$ROOT/scripts/rc5/local-pg-harness.sh" "$@"
