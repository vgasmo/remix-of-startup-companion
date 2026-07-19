#!/usr/bin/env bash
# RC5 canonical verification command.
# Exits non-zero on the first failure. Writes docs/rc5/results.json + results.md.
# Requires RC5_ALLOW_STAGING_TESTS=true.

set -u
STARTED_AT="$(date -u +%FT%TZ)"
RESULTS_JSON="docs/rc5/results.json"
RESULTS_MD="docs/rc5/results.md"
mkdir -p docs/rc5

declare -a STEP_NAMES=()
declare -a STEP_STATUSES=()
declare -a STEP_DURATIONS=()

record() {
  STEP_NAMES+=("$1")
  STEP_STATUSES+=("$2")
  STEP_DURATIONS+=("$3")
}

run_step() {
  local name="$1"; shift
  echo ""
  echo "▶ $name"
  local t0=$SECONDS
  if "$@"; then
    local dt=$((SECONDS - t0))
    record "$name" "pass" "$dt"
    echo "✔ $name (${dt}s)"
  else
    local dt=$((SECONDS - t0))
    record "$name" "fail" "$dt"
    echo "✖ $name (${dt}s)"
    finalise 1
    exit 1
  fi
}

finalise() {
  local exit_code="$1"
  local status="pass"
  [[ "$exit_code" -ne 0 ]] && status="fail"
  {
    echo "{"
    echo "  \"started_at\": \"$STARTED_AT\","
    echo "  \"finished_at\": \"$(date -u +%FT%TZ)\","
    echo "  \"overall\": \"$status\","
    echo "  \"steps\": ["
    local n=${#STEP_NAMES[@]}
    for i in "${!STEP_NAMES[@]}"; do
      local comma=","
      [[ "$i" -eq $((n-1)) ]] && comma=""
      echo "    {\"name\": \"${STEP_NAMES[$i]}\", \"status\": \"${STEP_STATUSES[$i]}\", \"duration_s\": ${STEP_DURATIONS[$i]}}$comma"
    done
    echo "  ]"
    echo "}"
  } > "$RESULTS_JSON"

  {
    echo "# RC5 verification results"
    echo ""
    echo "- Started: $STARTED_AT"
    echo "- Finished: $(date -u +%FT%TZ)"
    echo "- Overall: **$status**"
    echo ""
    echo "| Step | Status | Duration (s) |"
    echo "|---|---|---|"
    for i in "${!STEP_NAMES[@]}"; do
      echo "| ${STEP_NAMES[$i]} | ${STEP_STATUSES[$i]} | ${STEP_DURATIONS[$i]} |"
    done
  } > "$RESULTS_MD"
}

# Local quality gates run regardless of staging availability.
run_step "install"           bun install --frozen-lockfile
run_step "typecheck"         bunx tsgo -p tsconfig.typecheck.json --noEmit
run_step "lint"              bun run lint
run_step "build"             bun run build
run_step "vitest:run:1"      bunx vitest run
run_step "vitest:run:2"      bunx vitest run
run_step "vitest:run:3"      bunx vitest run
run_step "i18n:parity"       node scripts/i18n-check.cjs
run_step "i18n:lint"         node scripts/i18n-lint.mjs
run_step "secret:scan"       node scripts/secret-scan.cjs

if [[ "${RC5_ALLOW_STAGING_TESTS:-}" != "true" ]]; then
  echo ""
  echo "⚠ RC5_ALLOW_STAGING_TESTS is not 'true' — skipping staging steps."
  echo "  Local gates PASS; overall verdict remains NO-GO until staging steps run."
  finalise 0
  exit 0
fi

run_step "preflight"         node scripts/rc5/preflight.mjs
run_step "migrate:forward"   node scripts/rc5/migrate-forward.mjs
run_step "seed"              node scripts/rc5/seed.mjs
run_step "pgtap:rls"         bash scripts/rc5/run-pgtap.sh
run_step "e2e:personas"      bunx playwright test --project=staging
run_step "e2e:failure-inj"   bunx playwright test --project=failure-injection
run_step "cleanup"           node scripts/rc5/cleanup.mjs

finalise 0
echo ""
echo "✅ RC5 verification PASS."
