#!/usr/bin/env bash
# Thin wrapper — delegate to the cross-platform Node orchestrator so behavior is identical on Linux, macOS, and Git Bash.
set -eu
exec node scripts/rc5/verify.mjs "$@"
