#!/usr/bin/env bash
# Exports the full backend state (schema, data, roles, inventories) to a folder.
#
# Usage:
#   export SUPABASE_DB_URL='postgresql://postgres:<pwd>@<host>:5432/postgres'
#   ./scripts/selfhost/export-backend.sh ./backend-export
set -euo pipefail

OUT="${1:-./backend-export}"
DB_URL="${SUPABASE_DB_URL:-}"

if [[ -z "$DB_URL" ]]; then
  echo "ERROR: set SUPABASE_DB_URL to the source Postgres connection string." >&2
  exit 1
fi
for bin in pg_dump psql; do
  command -v "$bin" >/dev/null || { echo "ERROR: $bin not found (install postgresql client)." >&2; exit 1; }
done

mkdir -p "$OUT"
echo "==> Exporting to $OUT"

echo "--> roles.sql"
psql "$DB_URL" -Atq -f "$(dirname "$0")/sql/dump-roles.sql" > "$OUT/roles.sql"

echo "--> schema.sql (public schema only; auth/storage are managed by Supabase)"
pg_dump "$DB_URL" --schema-only --no-owner --no-privileges --schema=public > "$OUT/schema.sql"

echo "--> data.sql"
pg_dump "$DB_URL" --data-only --no-owner --schema=public --disable-triggers > "$OUT/data.sql"

echo "--> inventories"
psql "$DB_URL" -Atq -c "\copy (select jobid, schedule, jobname, command from cron.job order by jobid) to stdout with csv header" > "$OUT/crons.csv" || echo "(cron schema unavailable)"
psql "$DB_URL" -Atq -c "\copy (select schemaname, tablename, policyname, roles::text, cmd from pg_policies where schemaname='public' order by tablename, policyname) to stdout with csv header" > "$OUT/rls-policies.csv"
psql "$DB_URL" -Atq -c "\copy (select id, name, public, file_size_limit from storage.buckets order by id) to stdout with csv header" > "$OUT/buckets.csv"
psql "$DB_URL" -Atq -c "\copy (select table_name from information_schema.tables where table_schema='public' order by table_name) to stdout with csv header" > "$OUT/tables.csv"

echo "--> functions.txt"
ls -1 supabase/functions | grep -vE '^(_shared|deno\.json)$' > "$OUT/functions.txt"

echo "==> Done. Files:"
ls -la "$OUT"
