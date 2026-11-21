#!/usr/bin/env bash
# Demo seed safety test, against a real Postgres with the migrations and RLS applied (through the local Supabase
# stand-in). Checks that the seed:
#   1. populates every role's data on an empty database,
#   2. adds nothing on a second and third run (idempotent: identical row counts),
#   3. never deletes or edits existing records (a genuine draft, a custom rule and an edited demo fact survive),
#   4. marks every sample draft demo_seed = true and leaves genuine drafts unmarked.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres bash tests/e2e/seed_idempotency.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${SEED_DB:-brandguard_seedtest}
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/sql/supabase_stub.sql
for m in supabase/migrations/000*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -1 -f "$m"; done

cleanup() { kill ${MOCK_PID:-} 2>/dev/null || true; }
trap cleanup EXIT
export STORAGE_DIR=/tmp/bg-seed-storage
rm -rf "$STORAGE_DIR"
PGURL="postgres://${PGUSER:-postgres}@localhost/$DB?host=${PGHOST:-/tmp}&port=${PGPORT:-5432}" PORT=54331 node tests/e2e/mock-supabase.mjs > /tmp/mock-seed.log 2>&1 &
MOCK_PID=$!
sleep 1.5
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331
export SUPABASE_SERVICE_ROLE_KEY=$(grep SERVICE_KEY /tmp/mock-seed.log | cut -d= -f2)

q() { psql -qtA -d "$DB" -c "$1"; }
snapshot() {
  q "select 'drafts', count(*) from drafts union all select 'versions', count(*) from draft_versions
     union all select 'findings', count(*) from findings union all select 'events', count(*) from draft_events
     union all select 'images', count(*) from draft_images union all select 'rules', count(*) from guideline_rules
     union all select 'terms', count(*) from terms union all select 'facts', count(*) from facts
     union all select 'colors', count(*) from brand_colors union all select 'logos', count(*) from brand_logos
     union all select 'confidential', count(*) from confidential_terms union all select 'settings', count(*) from workspace_settings
     union all select 'users', count(*) from auth.users union all select 'profiles', count(*) from profiles order by 1"
}
fail=0
check() { if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 (got '$2', want '$3')"; fail=1; fi; }

echo "· stand-in matches PostgREST for batch inserts (production bug 21 Nov: findings.status NULL)"
# supabase-js sends the union of all rows' keys as ?columns=; PostgREST stores NULL for a key a row lacks unless the
# request says Prefer: missing=default. terms.note is NOT NULL DEFAULT '' like findings.status.
WS0=$(q "insert into workspaces (name) values ('fidelity') returning id")
AUTHZ="Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
BODY="[{\"workspace_id\":\"$WS0\",\"preferred\":\"A\",\"note\":\"x\"},{\"workspace_id\":\"$WS0\",\"preferred\":\"B\"}]"
OUT=$(curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/terms?columns=%22workspace_id%22,%22preferred%22,%22note%22" -H "$AUTHZ" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d "$BODY")
check "mixed-key batch without missing=default is rejected by NOT NULL" "$(echo "$OUT" | grep -c 'note.*violates not-null constraint')" "1"
OUT=$(curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/terms?columns=%22workspace_id%22,%22preferred%22,%22note%22" -H "$AUTHZ" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -H "Prefer: missing=default" -d "$BODY")
check "same batch with missing=default uses the column default" "$(q "select count(*) from terms where workspace_id = '$WS0' and note = ''")" "1"
q "delete from terms where workspace_id = '$WS0'; delete from workspaces where id = '$WS0'" >/dev/null

echo "· run 1 (empty database)"
npm run -s seed > /tmp/seed-run1.log
FIRST=$(snapshot)
echo "$FIRST" | tr '\n' ' '; echo

echo "· per-role data"
check "creator (Kabir) has drafts in every status" \
  "$(q "select string_agg(distinct d.status::text, ',' order by d.status::text) from drafts d join profiles p on p.id=d.author_id where p.full_name='Kabir Creator'")" \
  "approved,changes_requested,draft,in_review"
check "creator has an unchecked draft and an analysed one" \
  "$(q "select count(distinct v.checked) from drafts d join draft_versions v on v.draft_id=d.id and v.version_no=1 join profiles p on p.id=d.author_id where p.full_name='Kabir Creator' and d.status='draft'")" "2"
check "reviewer queue (in review, not by the reviewer) has 6 sample drafts" \
  "$(q "select count(*) from drafts d join profiles p on p.id=d.author_id where d.status='in_review' and p.role<>'reviewer'")" "6"
check "reviewer has decisions on record" \
  "$(q "select count(*) > 10 from draft_events e join profiles p on p.id=e.actor_id where p.role='reviewer' and e.action in ('approved','changes_requested')")" "t"
check "disputed and accepted findings exist" \
  "$(q "select count(distinct status) from findings where status in ('accepted','edited','disputed','open')")" "4"
check "every sample draft is marked demo_seed" "$(q "select count(*) from drafts where not demo_seed")" "0"
check "Brand Kit: palette, logos, confidential terms present" \
  "$(q "select (select count(*) from brand_colors)>=4 and (select count(*) from brand_logos)>=2 and (select count(*) from confidential_terms)>=3")" "t"
check "sample fact findings cite a real fact" \
  "$(q "select count(*) from findings f join facts x on x.id=f.fact_id where f.engine='demo'")" \
  "$(q "select count(*) from findings where engine='demo'")"
check "no finding stored without a status" "$(q "select count(*) from findings where status is null")" "0"
check "single sample drafts mix open and resolved findings (the batch that failed in production)" \
  "$(q "select count(*) > 0 from (select draft_id from findings group by draft_id having bool_or(status = 'open') and bool_or(status <> 'open')) x")" "t"
check "image drafts have measured images" "$(q "select count(*) from draft_images where analysis is not null")" "2"

echo "· run 2 and 3 (must add nothing)"
npm run -s seed > /tmp/seed-run2.log
npm run -s seed > /tmp/seed-run3.log
check "row counts identical after re-runs" "$(snapshot)" "$FIRST"

echo "· existing data is preserved"
KABIR=$(q "select id from profiles where full_name='Kabir Creator'")
WS=$(q "select id from workspaces order by created_at limit 1")
q "insert into drafts (id, workspace_id, author_id, title, channel) values ('11111111-1111-4111-8111-111111111111', '$WS', '$KABIR', 'My real draft', 'Email')" >/dev/null
q "insert into draft_versions (draft_id, version_no, content, created_by) values ('11111111-1111-4111-8111-111111111111', 1, 'Genuine text', '$KABIR')" >/dev/null
q "insert into guideline_rules (workspace_id, code, category, title, description) values ('$WS', 'CUSTOM-1', 'tone', 'Custom rule', 'Added by an admin')" >/dev/null
q "update facts set statement='Edited by the admin' where code='FACT-1'" >/dev/null
BEFORE=$(snapshot)
npm run -s seed > /tmp/seed-run4.log
check "counts unchanged with genuine data present" "$(snapshot)" "$BEFORE"
check "genuine draft kept and not marked as sample" "$(q "select demo_seed from drafts where title='My real draft'")" "f"
check "custom rule kept" "$(q "select count(*) from guideline_rules where code='CUSTOM-1'")" "1"
check "admin's edit to a demo fact not overwritten" "$(q "select statement from facts where code='FACT-1'")" "Edited by the admin"

echo "· RLS and workspace isolation"
q "insert into workspaces (id, name) values ('22222222-2222-4222-8222-222222222222', 'Other company')" >/dev/null
q "insert into auth.users (id, email) values ('33333333-3333-4333-8333-333333333333', 'outsider@x.test')" >/dev/null
q "insert into profiles (id, workspace_id, full_name, role) values ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'Outsider', 'admin') on conflict (id) do update set workspace_id = excluded.workspace_id, role = 'admin'" >/dev/null
as_user() { psql -qtA -d "$DB" -c "begin; set local role authenticated; set local request.jwt.claim.sub = '$1'; $2; rollback;" | grep -v '^$' | head -1; }
check "outsider admin sees no sample drafts" "$(as_user 33333333-3333-4333-8333-333333333333 "select count(*) from drafts")" "0"
check "outsider sees no sample findings, rules or facts" "$(as_user 33333333-3333-4333-8333-333333333333 "select (select count(*) from findings)+(select count(*) from guideline_rules)+(select count(*) from facts)")" "0"
check "outsider sees no insight rows" "$(as_user 33333333-3333-4333-8333-333333333333 "select count(*) from insight_drafts")" "0"
check "Kabir (creator) sees the workspace drafts" "$(as_user "$KABIR" "select count(*) > 30 from drafts")" "t"
check "Kabir cannot edit another author's draft" "$(as_user "$KABIR" "with u as (update drafts set title = 'x' where author_id <> '$KABIR' returning 1) select count(*) from u")" "0"
q "delete from profiles where id = '33333333-3333-4333-8333-333333333333'; delete from auth.users where id = '33333333-3333-4333-8333-333333333333'; delete from workspaces where id = '22222222-2222-4222-8222-222222222222'" >/dev/null

echo "· a run interrupted at the findings insert (exact production state) is completed in place"
# Recreate what the failed production run left: a sample draft and its version 1, but no findings and no events.
HERO=$(q "select id from drafts where title='Homepage hero refresh'")
HERO_CREATED=$(q "select created_at from drafts where id='$HERO'")
q "delete from draft_events where draft_id='$HERO'; delete from findings where draft_id='$HERO'" >/dev/null
npm run -s seed > /tmp/seed-run5.log
check "seed reports one sample completed after an interrupted run" "$(grep -c 'sample drafts: 0 added, 1 completed after an interrupted run' /tmp/seed-run5.log)" "1"
check "same draft row kept (id and created_at unchanged)" "$(q "select created_at from drafts where id='$HERO'")" "$HERO_CREATED"
check "its findings were added, open and resolved together" "$(q "select string_agg(distinct status::text, ',' order by status::text) from findings where draft_id='$HERO'")" "accepted,edited,open"
check "its events were added" "$(q "select count(*) > 0 from draft_events where draft_id='$HERO'")" "t"
check "still exactly one copy" "$(q "select count(*) from drafts where title='Homepage hero refresh'")" "1"

echo "· a run interrupted after the draft row (no versions yet) is completed in place"
VICTIM=$(q "select id from drafts where title='Referral programme post'")
q "delete from draft_events where draft_id='$VICTIM'; delete from draft_versions where draft_id='$VICTIM'" >/dev/null
npm run -s seed > /tmp/seed-run6.log
check "versions restored" "$(q "select count(*) from draft_versions where draft_id='$VICTIM'")" "2"
check "still exactly one copy" "$(q "select count(*) from drafts where title='Referral programme post'")" "1"
check "counts back to the full set" "$(snapshot)" "$BEFORE"

[ $fail = 0 ] && echo "seed idempotency: all checks passed" || { echo "seed idempotency: FAILED"; exit 1; }
