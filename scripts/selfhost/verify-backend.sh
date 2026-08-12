#!/usr/bin/env bash
# Compares a destination backend against the exported inventories.
#
# Usage:
#   export DEST_DB_URL='postgresql://postgres:<pwd>@<host>:5432/postgres'
#   ./scripts/selfhost/verify-backend.sh ./backend-export
set -euo pipefail

EXPORT_DIR="${1:-./backend-export}"
DB_URL="${DEST_DB_URL:-}"

[[ -n "$DB_URL" ]] || { echo "ERROR: set DEST_DB_URL." >&2; exit 1; }
[[ -d "$EXPORT_DIR" ]] || { echo "ERROR: $EXPORT_DIR not found (run export-backend.sh first)." >&2; exit 1; }

fail=0
compare() { # label, expected_file, query
  local label="$1" expected="$2" query="$3"
  [[ -f "$expected" ]] || { echo "SKIP  $label (no $expected)"; return; }
  local tmp; tmp="$(mktemp)"
  psql "$DB_URL" -Atq -c "\copy ($query) to stdout with csv header" > "$tmp" 2>/dev/null || true
  if diff -q <(sort "$expected") <(sort "$tmp") >/dev/null; then
    echo "OK    $label"
  else
    echo "DIFF  $label"
    diff <(sort "$expected") <(sort "$tmp") | head -30 || true
    fail=1
  fi
  rm -f "$tmp"
}

compare "tables"      "$EXPORT_DIR/tables.csv"       "select table_name from information_schema.tables where table_schema='public' order by table_name"
compare "rls policies" "$EXPORT_DIR/rls-policies.csv" "select schemaname, tablename, policyname, roles::text, cmd from pg_policies where schemaname='public' order by tablename, policyname"
compare "buckets"     "$EXPORT_DIR/buckets.csv"      "select id, name, public, file_size_limit from storage.buckets order by id"

echo
echo "--> cron jobs on destination"
psql "$DB_URL" -Atq -c "select count(*) from cron.job" 2>/dev/null | sed 's/^/    jobs: /' || echo "    (cron unavailable)"

echo "--> tables with RLS disabled (should be empty)"
psql "$DB_URL" -Atq -c "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1" | sed 's/^/    /'

echo "--> edge functions expected: $(wc -l < "$EXPORT_DIR/functions.txt" 2>/dev/null || echo '?')"
echo "    verify with: supabase functions list"

exit "$fail"
