#!/usr/bin/env bash
# Migration 0003 safety test: fresh database, re-run, a database with existing records, and a database without 0002.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres bash tests/sql/migration_0003_test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
q() { psql -qtA -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
fresh() { psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $1" -c "create database $1" >/dev/null; psql -q -v ON_ERROR_STOP=1 -d "$1" -f tests/sql/supabase_stub.sql >/dev/null; }
fail=0
check() { if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 (got '$2', want '$3')"; fail=1; fi; }
M=supabase/migrations

echo "· fresh database: 0001 → 0002 → 0003, then 0003 again"
fresh m3_fresh
for f in 0001_init 0002_final_round 0003_brand_contrast 0003_brand_contrast; do psql -q -v ON_ERROR_STOP=1 -d m3_fresh -1 -f $M/$f.sql >/dev/null 2>&1; done
check "column exists with default 4.5" "$(q m3_fresh "select column_default from information_schema.columns where table_name='workspace_settings' and column_name='min_contrast'")" "4.5"
check "exactly one check constraint for it after two runs" "$(q m3_fresh "select count(*) from pg_constraint where conrelid='public.workspace_settings'::regclass and pg_get_constraintdef(oid) like '%min_contrast%'")" "1"

echo "· existing database with records: 0001 → 0002 → data → 0003"
fresh m3_live
for f in 0001_init 0002_final_round; do psql -q -v ON_ERROR_STOP=1 -d m3_live -1 -f $M/$f.sql >/dev/null; done
psql -q -v ON_ERROR_STOP=1 -d m3_live >/dev/null <<'SQL'
insert into public.workspaces (id, name) values ('10000000-0000-4000-8000-000000000001', 'Existing');
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000001', 'a@x.test');
insert into public.profiles (id, workspace_id, full_name, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Existing admin', 'admin')
  on conflict (id) do update set workspace_id = excluded.workspace_id, role = 'admin';
insert into public.workspace_settings (workspace_id, dispute_threshold, dispute_min_findings) values ('10000000-0000-4000-8000-000000000001', 0.25, 5);
insert into public.guideline_rules (workspace_id, code, category, title, description) values ('10000000-0000-4000-8000-000000000001', 'R-1', 'tone', 'Existing rule', 'x');
insert into public.drafts (workspace_id, author_id, title, channel) values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Existing draft', 'Email');
SQL
BEFORE=$(q m3_live "select (select count(*) from drafts)||'/'||(select count(*) from guideline_rules)||'/'||(select dispute_threshold||','||dispute_min_findings from workspace_settings)")
psql -q -v ON_ERROR_STOP=1 -d m3_live -1 -f $M/0003_brand_contrast.sql >/dev/null 2>&1
check "existing rows and settings unchanged" "$(q m3_live "select (select count(*) from drafts)||'/'||(select count(*) from guideline_rules)||'/'||(select dispute_threshold||','||dispute_min_findings from workspace_settings)")" "$BEFORE"
check "existing settings row reads the 4.5 default" "$(q m3_live "select min_contrast from workspace_settings")" "4.50"
check "out-of-range value is rejected" "$(psql -qtA -d m3_live -c "update workspace_settings set min_contrast = 2" 2>&1 | grep -c 'violates check constraint')" "1"
check "insight views still work" "$(q m3_live "select count(*) >= 0 from insight_source_stats")" "t"

echo "· database without 0002: 0003 must stop and change nothing"
fresh m3_old
psql -q -v ON_ERROR_STOP=1 -d m3_old -1 -f $M/0001_init.sql >/dev/null
OUT=$(psql -q -v ON_ERROR_STOP=1 -d m3_old -1 -f $M/0003_brand_contrast.sql 2>&1 || true)
check "clear error message" "$(echo "$OUT" | grep -c 'Run supabase/migrations/0002_final_round.sql first')" "1"
check "no table created" "$(q m3_old "select to_regclass('public.workspace_settings') is null")" "t"

for d in m3_fresh m3_live m3_old; do psql -q -d postgres -c "drop database $d" >/dev/null; done
[ $fail = 0 ] && echo "migration 0003: all checks passed" || { echo "migration 0003: FAILED"; exit 1; }
