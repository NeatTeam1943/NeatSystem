#!/usr/bin/env bash
# Runs the SQL migrations + tests on a throwaway local Postgres.
# Usage: scripts/test-db.sh            (needs Postgres 15+ binaries on PATH or PG_BIN)
# In CI the workflow sets DATABASE_URL to a service container instead.
set -euo pipefail
cd "$(dirname "$0")/.."

run_all() {
  local url="$1"
  psql "$url" -v ON_ERROR_STOP=1 -q -f supabase/tests/00_stub_supabase.sql
  for f in supabase/migrations/*.sql; do
    echo "== $f"
    psql "$url" -v ON_ERROR_STOP=1 -q -t -f "$f" 2>&1 | sed -e "/^[[:space:]]*$/d" -e "s/^psql:[^ ]* NOTICE:  //"
  done
  # migrations must be re-runnable
  for f in supabase/migrations/*.sql; do psql "$url" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null; done
  psql "$url" -v ON_ERROR_STOP=1 -q -f supabase/tests/01_helpers.sql
  for f in supabase/tests/1*_test.sql; do
    echo "== $f"
    psql "$url" -v ON_ERROR_STOP=1 -q -t -f "$f" 2>&1 | sed -e "/^[[:space:]]*$/d" -e "s/^psql:[^ ]* NOTICE:  //"
  done
}

if [[ -n "${DATABASE_URL:-}" ]]; then
  run_all "$DATABASE_URL"
  exit 0
fi

PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d)"
trap '"$PG_BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$PG_BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DIR/data" -o "-k $DIR -p 54329 -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
run_all "postgresql://postgres@/postgres?host=$DIR&port=54329"
