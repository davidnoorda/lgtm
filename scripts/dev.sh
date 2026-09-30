#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -d web/node_modules ]; then (cd web && npm ci); fi
if [ ! -d web/dist ]; then (cd web && npm run build); fi
LGTM_PORT=3001 LGTM_NO_OPEN=1 cargo run --manifest-path server/Cargo.toml -- "${1:-.}" &
backend=$!
(cd web && npm run dev) &
frontend=$!
trap 'kill "$backend" "$frontend" 2>/dev/null || true; wait 2>/dev/null || true' EXIT INT TERM
printf 'Open http://127.0.0.1:5173 (repo: %s)\n' "${1:-.}"
wait -n "$backend" "$frontend"
