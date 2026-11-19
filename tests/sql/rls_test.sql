-- RLS and insights-view tests for migrations 0001 + 0002.
-- Run against a database prepared with supabase_stub.sql, 0001_init.sql and 0002_final_round.sql:
--   psql -v ON_ERROR_STOP=1 -d <db> -f tests/sql/rls_test.sql
-- Every check raises an exception on failure, so the script stops at the first broken expectation.

\set QUIET on
begin;

-- ---------------------------------------------------------------- fixtures (as superuser, RLS bypassed)
insert into public.workspaces (id, name, created_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'Lumio', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000b2', 'Other brand', now());

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-0000-0000-0000-000000000001', 'admin@w1.test', '{"full_name":"A"}'),
  ('11111111-0000-0000-0000-000000000002', 'creator@w1.test', '{"full_name":"C"}'),
  ('11111111-0000-0000-0000-000000000003', 'reviewer@w1.test', '{"full_name":"R"}'),
  ('22222222-0000-0000-0000-000000000001', 'x@w2.test', '{"full_name":"X"}');

-- The sign-up trigger put everyone in the first workspace as a creator; fix roles / workspace.
update public.profiles set role = 'admin' where id = '11111111-0000-0000-0000-000000000001';
update public.profiles set role = 'reviewer' where id = '11111111-0000-0000-0000-000000000003';
update public.profiles set workspace_id = '00000000-0000-0000-0000-0000000000b2', role = 'admin' where id = '22222222-0000-0000-0000-000000000001';

do $$ begin
  if (select count(*) from public.profiles where role = 'creator') <> 1 then raise exception 'sign-up trigger: expected one creator'; end if;
end $$;

insert into public.guideline_rules (id, workspace_id, code, category, title, description, check_key) values
  ('33333333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'CLAIM-1', 'claims', 'No superlatives', 'x', null),
  ('33333333-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'TONE-2', 'tone', 'Calm', 'x', null),
  ('33333333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'VIS-1', 'visual', 'Palette', 'x', 'palette'),
  ('33333333-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000b2', 'CLAIM-1', 'claims', 'Other', 'x', null);

insert into public.drafts (id, workspace_id, author_id, title, channel, status, current_version) values
  ('44444444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '11111111-0000-0000-0000-000000000002', 'D1', 'Instagram', 'approved', 2),
  ('44444444-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '11111111-0000-0000-0000-000000000002', 'D2', 'Email', 'draft', 1),
  ('44444444-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000b2', '22222222-0000-0000-0000-000000000001', 'X1', 'Blog', 'draft', 1);

insert into public.draft_versions (id, draft_id, version_no, content, checked, created_by, created_at) values
  ('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 1, 'v1', true, '11111111-0000-0000-0000-000000000002', now() - interval '3 days'),
  ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', 2, 'v2', true, '11111111-0000-0000-0000-000000000002', now() - interval '2 days'),
  ('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 1, 'v1', true, '11111111-0000-0000-0000-000000000002', now() - interval '1 day'),
  ('55555555-0000-0000-0000-000000000009', '44444444-0000-0000-0000-000000000009', 1, 'v1', true, '22222222-0000-0000-0000-000000000001', now());

-- D1: CLAIM-1 found in v1 (open) and again in v2 (accepted) -> one distinct issue, status accepted.
-- D1 and D2: TONE-2 disputed both times -> dispute rate 100% on 2 issues.
insert into public.findings (version_id, draft_id, category, quote, start_idx, end_idx, source_type, rule_id, source_label, explanation, suggestion, status) values
  ('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'claims', 'the best', 0, 8, 'rule', '33333333-0000-0000-0000-000000000001', 'CLAIM-1 · No superlatives', 'x', 'a', 'open'),
  ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', 'claims', 'the best', 0, 8, 'rule', '33333333-0000-0000-0000-000000000001', 'CLAIM-1 · No superlatives', 'x', 'a', 'accepted'),
  ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', 'tone', '!!', 9, 11, 'rule', '33333333-0000-0000-0000-000000000002', 'TONE-2 · Calm', 'x', '!', 'disputed'),
  ('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'tone', '!!!', 0, 3, 'rule', '33333333-0000-0000-0000-000000000002', 'TONE-2 · Calm', 'x', '!', 'disputed'),
  ('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'claims', 'number one', 5, 15, 'rule', '33333333-0000-0000-0000-000000000001', 'CLAIM-1 · No superlatives', 'x', '', 'open'),
  ('55555555-0000-0000-0000-000000000009', '44444444-0000-0000-0000-000000000009', 'claims', 'best', 0, 4, 'rule', '33333333-0000-0000-0000-000000000009', 'CLAIM-1 · Other', 'x', '', 'disputed');

insert into public.draft_events (draft_id, actor_id, action, created_at) values
  ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'submitted', now() - interval '30 hours'),
  ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', 'approved', now() - interval '24 hours');

insert into public.confidential_terms (workspace_id, term, kind) values
  ('00000000-0000-0000-0000-0000000000a1', 'Lumio Live', 'unreleased_product'),
  ('00000000-0000-0000-0000-0000000000b2', 'Secret X', 'term');

-- ---------------------------------------------------------------- as the W1 creator
set local role authenticated;
set local request.jwt.claim.sub = '11111111-0000-0000-0000-000000000002';

do $$ begin
  if (select count(*) from public.drafts) <> 2 then raise exception 'creator should see exactly the 2 drafts of their workspace'; end if;
  if exists (select 1 from public.guideline_rules where workspace_id <> public.my_workspace()) then raise exception 'rules from another workspace are visible'; end if;
  if (select count(*) from public.confidential_terms) <> 1 then raise exception 'confidential terms not isolated'; end if;
  if (select count(*) from public.insight_findings) <> 4 then
    raise exception 'insight_findings should de-duplicate to 4 issues in W1, got %', (select count(*) from public.insight_findings); end if;
  if (select status from public.insight_findings where draft_id = '44444444-0000-0000-0000-000000000001' and quote = 'the best') <> 'accepted' then
    raise exception 'insight_findings must keep the latest status'; end if;
  if exists (select 1 from public.insight_findings where workspace_id <> public.my_workspace()) then raise exception 'view leaks another workspace'; end if;
end $$;

-- Creators cannot change the Brand Kit or the confidential list.
do $$ begin
  begin
    insert into public.confidential_terms (workspace_id, term) values (public.my_workspace(), 'nope');
    raise exception 'creator inserted a confidential term';
  exception when insufficient_privilege then null; end;
  begin
    update public.guideline_rules set title = 'hacked' where code = 'CLAIM-1';
    if found then raise exception 'creator updated a rule'; end if;
  end;
  begin
    insert into public.workspace_settings (workspace_id, dispute_threshold) values (public.my_workspace(), 0.5);
    raise exception 'creator wrote workspace settings';
  exception when insufficient_privilege then null; end;
end $$;

-- Images: the author can attach to an editable own draft, not to approved drafts or another workspace's draft.
do $$ begin
  insert into public.draft_images (draft_id, workspace_id, storage_path, file_name, mime, created_by)
  values ('44444444-0000-0000-0000-000000000002', public.my_workspace(), '00000000-0000-0000-0000-0000000000a1/d2/p.png', 'p.png', 'image/png', auth.uid());
  begin
    insert into public.draft_images (draft_id, workspace_id, storage_path, file_name, mime, created_by)
    values ('44444444-0000-0000-0000-000000000001', public.my_workspace(), 'x', 'p.png', 'image/png', auth.uid());
    raise exception 'image attached to an approved draft';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.draft_images (draft_id, workspace_id, storage_path, file_name, mime, created_by)
    values ('44444444-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000b2', 'x', 'p.png', 'image/png', auth.uid());
    raise exception 'image attached to another workspace';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.draft_images (draft_id, workspace_id, storage_path, file_name, mime, created_by)
    values ('44444444-0000-0000-0000-000000000002', public.my_workspace(), 'x', 'p.gif', 'image/gif', auth.uid());
    raise exception 'unsupported mime accepted';
  exception when check_violation then null; end;
end $$;

-- Storage: own workspace folder only; brand assets admin-only.
do $$ begin
  insert into storage.objects (bucket_id, name) values ('draft-images', '00000000-0000-0000-0000-0000000000a1/d2/p.png');
  begin
    insert into storage.objects (bucket_id, name) values ('draft-images', '00000000-0000-0000-0000-0000000000b2/x.png');
    raise exception 'uploaded into another workspace folder';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('brand-assets', '00000000-0000-0000-0000-0000000000a1/logo.png');
    raise exception 'creator uploaded a brand asset';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------- as the W1 admin
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-0000-0000-0000-000000000001';

do $$
declare r record;
begin
  insert into public.workspace_settings (workspace_id, dispute_threshold, dispute_min_findings) values (public.my_workspace(), 0.5, 2);
  insert into storage.objects (bucket_id, name) values ('brand-assets', '00000000-0000-0000-0000-0000000000a1/logo.png');

  select * into r from public.insight_source_stats where source_label like 'TONE-2%';
  if r.findings <> 2 or r.disputed <> 2 or r.dispute_rate <> 1.000 or not r.possibly_unclear then
    raise exception 'TONE-2 stats wrong: %', row_to_json(r); end if;
  select * into r from public.insight_source_stats where source_label like 'CLAIM-1%';
  if r.findings <> 2 or r.disputed <> 0 or r.possibly_unclear then raise exception 'CLAIM-1 stats wrong: %', row_to_json(r); end if;
  if (select count(*) from public.insight_source_stats) <> 2 then raise exception 'stats leak or missing rows'; end if;

  select * into r from public.insight_drafts where id = '44444444-0000-0000-0000-000000000001';
  if abs(r.hours_to_approval - 6) > 0.01 then raise exception 'hours_to_approval wrong: %', r.hours_to_approval; end if;
end $$;

-- ---------------------------------------------------------------- as the admin of the other workspace
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-0000-0000-0000-000000000001';

do $$ begin
  if (select count(*) from public.drafts) <> 1 then raise exception 'W2 admin sees W1 drafts'; end if;
  if (select count(*) from public.insight_findings) <> 1 then raise exception 'W2 sees W1 insights'; end if;
  if exists (select 1 from public.insight_source_stats where source_label like 'TONE-2%') then raise exception 'W2 sees W1 stats'; end if;
  if (select count(*) from public.draft_images) <> 0 then raise exception 'W2 sees W1 images'; end if;
  if (select count(*) from storage.objects) <> 0 then raise exception 'W2 sees W1 storage objects'; end if;
  -- Admin of W2 cannot edit W1 rules.
  update public.guideline_rules set title = 'x' where workspace_id = '00000000-0000-0000-0000-0000000000a1';
  if found then raise exception 'cross-workspace rule update'; end if;
end $$;

-- ---------------------------------------------------------------- anonymous
reset role;
set local role anon;
do $$ begin
  begin
    if (select count(*) from public.drafts) <> 0 then raise exception 'anon sees drafts'; end if;
  exception when insufficient_privilege then null; end;
end $$;

reset role;
rollback;
\echo 'RLS tests passed'
