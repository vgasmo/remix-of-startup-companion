#!/usr/bin/env bash
# Builds the SPA locally and deploys it to your own server over rsync/ssh.
#
# Usage:
#   ./scripts/selfhost/deploy-frontend.sh root@server /var/www/startup-leiria
#
# Requires: a .env.production with VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
# (copy .env.selfhost.example), plus ssh access to the target host.
set -euo pipefail

TARGET="${1:-}"
REMOTE_DIR="${2:-/var/www/startup-leiria}"
RELOAD_NGINX="${RELOAD_NGINX:-1}"

[[ -n "$TARGET" ]] || { echo "Usage: $0 user@host [/remote/dir]" >&2; exit 1; }
[[ -f .env.production ]] || { echo "ERROR: .env.production missing (see .env.selfhost.example)." >&2; exit 1; }

grep -q '^VITE_SUPABASE_URL=' .env.production || { echo "ERROR: VITE_SUPABASE_URL missing in .env.production." >&2; exit 1; }
grep -q '^VITE_SUPABASE_PUBLISHABLE_KEY=' .env.production || { echo "ERROR: VITE_SUPABASE_PUBLISHABLE_KEY missing in .env.production." >&2; exit 1; }

echo "==> Build"
bun install --frozen-lockfile
bun run build

echo "==> Stamp version.json (drives the client cache refresh)"
printf '{"version":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > dist/version.json

echo "==> Upload to $TARGET:$REMOTE_DIR"
ssh "$TARGET" "mkdir -p '$REMOTE_DIR'"
rsync -az --delete --checksum dist/ "$TARGET:$REMOTE_DIR/"

if [[ "$RELOAD_NGINX" == "1" ]]; then
  echo "==> Reload nginx"
  ssh "$TARGET" "nginx -t && systemctl reload nginx"
fi

echo "==> Deployed."
