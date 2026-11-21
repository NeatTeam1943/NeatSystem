#!/usr/bin/env bash
# Runs every sub-system's own tests (systems/*/package.json "test").
set -euo pipefail
cd "$(dirname "$0")/.."
shopt -s nullglob
for d in systems/*/; do
  if [[ -f "$d/package.json" ]] && grep -q '"test"' "$d/package.json"; then
    echo "== $d"
    (cd "$d" && npm test --silent)
  fi
done
