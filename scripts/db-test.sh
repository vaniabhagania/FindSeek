#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres database and runs the SQL tests in supabase/tests.
#
#   PGADMIN_URL=postgres://postgres@127.0.0.1:5432/postgres scripts/db-test.sh
#
# Needs psql and a Postgres 15+ server you may create databases on. Supabase's auth/storage schemas
# and roles are stubbed (supabase/tests/stub-supabase.sql); the database is dropped afterwards.
set -euo pipefail

ADMIN_URL="${PGADMIN_URL:?set PGADMIN_URL to a superuser connection string, e.g. postgres://postgres@127.0.0.1:5432/postgres}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="findseek_test_$$"
# Same server, different database: swap the last path segment of the URL.
DB_URL="${ADMIN_URL%/*}/$DB"

psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "create database $DB"
trap 'psql "$ADMIN_URL" -q -c "drop database if exists $DB" >/dev/null' EXIT

run() { psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$1"; }

run "$ROOT/supabase/tests/stub-supabase.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migration $(basename "$f")"
  run "$f"
done
for f in "$ROOT"/supabase/tests/*_*.sql; do
  [ "$(basename "$f")" = "stub-supabase.sql" ] && continue
  echo "test $(basename "$f")"
  psql "$DB_URL" -q -t -A -v ON_ERROR_STOP=1 -f "$f"
done
echo "database tests passed"
