#!/usr/bin/env bash
# Full local end-to-end run: fresh Postgres database with both migrations, local Supabase and Gemini
# stand-ins, demo seed, production build, then the Playwright judge journey.
# Requires: a running Postgres 15+ (PGHOST/PGPORT/PGUSER), Node 20+, Python 3 with playwright, Chrome.
#   PGHOST=/tmp PGPORT=54329 PGUSER=postgres bash tests/e2e/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${E2E_DB:-brandguard_e2e}
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/sql/supabase_stub.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -1 -f supabase/migrations/0001_init.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -1 -f supabase/migrations/0002_final_round.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -1 -f supabase/migrations/0003_brand_contrast.sql

cleanup() { kill ${MOCK_PID:-} ${GEM_PID:-} ${NEXT_PID:-} 2>/dev/null || true; }
trap cleanup EXIT
rm -rf /tmp/bg-storage
PGURL="postgres://${PGUSER:-postgres}@localhost/$DB?host=${PGHOST:-/tmp}&port=${PGPORT:-5432}" PORT=54321 node tests/e2e/mock-supabase.mjs > /tmp/mock-supabase.log 2>&1 &
MOCK_PID=$!
PORT=54400 LOG=/tmp/gemini-requests.jsonl node tests/e2e/mock-gemini.mjs > /tmp/mock-gemini.log 2>&1 &
GEM_PID=$!
sleep 1.5
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$(grep ANON_KEY /tmp/mock-supabase.log | cut -d= -f2)
export SUPABASE_SERVICE_ROLE_KEY=$(grep SERVICE_KEY /tmp/mock-supabase.log | cut -d= -f2)
export GEMINI_API_KEY=local-stub-key GEMINI_API_BASE=http://127.0.0.1:54400 SETUP_TOKEN=local-e2e-token
npm run seed
npm run seed   # second run must add nothing (tests/e2e/seed_idempotency.sh checks this in detail)
npm run build > /tmp/next-build.log
npx next start -p 3100 > /tmp/next.log 2>&1 &
NEXT_PID=$!
sleep 4
GEMINI_LOG=/tmp/gemini-requests.jsonl BASE=http://localhost:3100 python3 tests/e2e/journey.py
BASE=http://localhost:3100 python3 tests/e2e/scroll_demo.py
BASE=http://localhost:3100 python3 tests/e2e/robustness.py
BASE=http://localhost:3100 python3 tests/e2e/theme.py
kill $MOCK_PID 2>/dev/null || true
bash tests/e2e/seed_idempotency.sh
