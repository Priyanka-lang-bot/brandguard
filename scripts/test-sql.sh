#!/usr/bin/env bash
# Applies both migrations to a scratch database on a local Postgres (15+) and runs the RLS tests.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres bash scripts/test-sql.sh
set -euo pipefail
DB="${TEST_DB:-brandguard_test}"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/sql/supabase_stub.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -1 -f supabase/migrations/0001_init.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -1 -f supabase/migrations/0002_final_round.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/sql/rls_test.sql
