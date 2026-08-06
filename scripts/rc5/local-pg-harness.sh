#!/usr/bin/env bash
# RC5 disposable-Postgres harness.
#
# Boots a throwaway local PostgreSQL, installs a minimal Supabase-compatible
# shim (auth/storage/cron/net/vault schemas + auth.uid()/auth.jwt()), replays
# every forward migration from an empty database, loads pgTAP and executes
# supabase/tests/*.test.sql.
#
# It NEVER touches staging or production: it only ever talks to the local
# socket it created.
#
# Usage:
#   bash scripts/rc5/local-pg-harness.sh                # replay + run all suites
#   bash scripts/rc5/local-pg-harness.sh <test-file>    # run one suite
#
# Requirements: postgres/initdb/psql on PATH, pgTAP extension SQL available at
# $RC5_PGTAP_SQL (defaults to the pgtap--*.sql shipped by postgresqlPackages.pgtap).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_DIR="${RC5_PG_RUN_DIR:-/tmp/rc5-pg}"
SOCK="$RUN_DIR/sock"
DATA="$RUN_DIR/data"
PORT="${RC5_PG_PORT:-55432}"
DB="rc5"
PSQL=(psql -h "$SOCK" -p "$PORT" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q)

log() { echo "[rc5:local-pg] $*"; }
die() { echo "[rc5:local-pg] FAIL — $*" >&2; exit 1; }

command -v initdb >/dev/null || die "initdb not on PATH"
PGTAP_SQL="${RC5_PGTAP_SQL:-}"
[ -n "$PGTAP_SQL" ] && [ -f "$PGTAP_SQL" ] || die "Set RC5_PGTAP_SQL to a pgtap--<version>.sql file"

# ---- boot -----------------------------------------------------------------
rm -rf "$RUN_DIR"; mkdir -p "$DATA" "$SOCK"
if [ "$(id -u)" = "0" ]; then
  # postgres refuses to run as root; drop to an unprivileged uid.
  grep -q '^rc5pg:' /etc/passwd || echo "rc5pg:x:1000:1000::$RUN_DIR/home:/bin/bash" >> /etc/passwd
  mkdir -p "$RUN_DIR/home"; chown -R 1000:1000 "$RUN_DIR"
  AS_PG=(setpriv --reuid=1000 --regid=1000 --clear-groups env "HOME=$RUN_DIR/home")
else
  AS_PG=(env)
fi
"${AS_PG[@]}" initdb -D "$DATA" -U postgres --auth=trust >"$RUN_DIR/initdb.log" 2>&1 \
  || die "initdb failed (see $RUN_DIR/initdb.log)"
"${AS_PG[@]}" pg_ctl -D "$DATA" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$RUN_DIR/pg.log" start >/dev/null
trap '"${AS_PG[@]}" pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 30); do psql -h "$SOCK" -p "$PORT" -U postgres -tc 'select 1' >/dev/null 2>&1 && break; sleep 1; done

createdb -h "$SOCK" -p "$PORT" -U postgres "$DB"
"${PSQL[@]}" -c "CREATE SCHEMA extensions;
  CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  CREATE EXTENSION \"uuid-ossp\" WITH SCHEMA extensions;
  CREATE EXTENSION pg_trgm;
  CREATE EXTENSION pg_stat_statements WITH SCHEMA extensions;
  CREATE PUBLICATION supabase_realtime;" >/dev/null
"${PSQL[@]}" -f "$ROOT/scripts/rc5/supabase-shim.sql" >/dev/null
"${PSQL[@]}" -f "$PGTAP_SQL" >/dev/null
log "base + shim + pgTAP ready"

# ---- forward replay -------------------------------------------------------
export PGOPTIONS='-c search_path=public,extensions'
STRIP=$(mktemp -d)
for f in "$ROOT"/supabase/migrations/*.sql; do
  # Managed extensions are provisioned by the platform, not by the harness.
  perl -0pe 's/create\s+extension[^;]*;/-- [rc5 harness] extension stripped;/gis' "$f" > "$STRIP/$(basename "$f")"
done
failed=0
for f in "$STRIP"/*.sql; do
  if ! out=$(psql -h "$SOCK" -p "$PORT" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1); then
    failed=$((failed+1))
    echo "[rc5:local-pg] replay FAIL $(basename "$f")"
    echo "$out" | grep 'ERROR:' | head -2
  fi
done
log "forward replay finished ($failed failing migration file(s))"

# ---- pgTAP --------------------------------------------------------------
files=("$@")
[ ${#files[@]} -eq 0 ] && files=("$ROOT"/supabase/tests/*.test.sql)
rc=0
for t in "${files[@]}"; do
  out=$(psql -h "$SOCK" -p "$PORT" -U postgres -d "$DB" -f "$t" 2>&1) || true
  ok=$(printf '%s' "$out" | grep -cE '^ ok [0-9]+' || true)
  nok=$(printf '%s' "$out" | grep -cE '^ not ok [0-9]+' || true)
  err=$(printf '%s' "$out" | grep -c 'ERROR:' || true)
  echo "[rc5:local-pg] $(basename "$t"): ok=$ok fail=$nok errors=$err"
  if [ "$nok" != "0" ] || [ "$err" != "0" ]; then
    rc=1
    printf '%s\n' "$out" | grep -E '^ not ok|# Failed test|caught:|wanted:|ERROR:' | head -12
  fi
done
exit $rc
