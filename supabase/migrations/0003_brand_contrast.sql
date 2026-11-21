-- Brand minimum contrast for text in images (Round 2 commitment: "flag anything below the brand's minimum
-- (default 4.5:1)"). The app uses 4.5:1 until this has been run.
--
-- Safety:
--  * Additive only: one new column with a constant default. No rows are deleted or rewritten; existing
--    workspace_settings rows read 4.5 (Postgres 11+ stores a constant default without rewriting the table).
--  * Idempotent: running it again changes nothing ("if not exists" covers the column and its check).
--  * Needs migration 0002 (it creates workspace_settings). Without it, this stops with a clear message and
--    changes nothing.
--  * RLS: the existing workspace_settings policies (members read, admins write, own workspace only) already
--    cover the new column. The insight views name their columns explicitly, so they are unaffected.
do $$
begin
  if to_regclass('public.workspace_settings') is null then
    raise exception 'Run supabase/migrations/0002_final_round.sql first: table public.workspace_settings does not exist.';
  end if;
end $$;

alter table public.workspace_settings
  add column if not exists min_contrast numeric(4, 2) not null default 4.5
  check (min_contrast >= 3 and min_contrast <= 21);
