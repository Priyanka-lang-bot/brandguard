-- BrandGuard final round: images, palette/logos, confidential terms, insights, result cache.
-- Additive only. Safe to run once in the Supabase SQL editor after 0001_init.sql.
-- Requires Postgres 15+ (security_invoker views), which every current Supabase project uses.

-- ---------------------------------------------------------------------------
-- Workspace settings (insights dispute threshold)
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  dispute_threshold numeric(4, 3) not null default 0.300 check (dispute_threshold > 0 and dispute_threshold <= 1),
  dispute_min_findings int not null default 3 check (dispute_min_findings >= 1),
  updated_at timestamptz not null default now()
);
alter table public.workspace_settings enable row level security;
create policy "read settings" on public.workspace_settings for select using (workspace_id = public.my_workspace());
create policy "admin writes settings" on public.workspace_settings for all
  using (workspace_id = public.my_workspace() and public.my_role() = 'admin')
  with check (workspace_id = public.my_workspace() and public.my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Confidential Terms (masked before any AI request)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.confidential_kind as enum ('term', 'unreleased_product', 'pattern');
exception when duplicate_object then null; end $$;

create table if not exists public.confidential_terms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  term text not null check (char_length(term) between 2 and 200),
  kind public.confidential_kind not null default 'term',
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.confidential_terms enable row level security;
-- Members need to read them: masking runs server-side with the member's own session.
create policy "read confidential" on public.confidential_terms for select using (workspace_id = public.my_workspace());
create policy "admin writes confidential" on public.confidential_terms for all
  using (workspace_id = public.my_workspace() and public.my_role() = 'admin')
  with check (workspace_id = public.my_workspace() and public.my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Visual identity: palette and logo assets
-- ---------------------------------------------------------------------------
create table if not exists public.brand_colors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.brand_logos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  version text not null default 'current',
  storage_path text not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.brand_colors enable row level security;
alter table public.brand_logos enable row level security;
create policy "read colors" on public.brand_colors for select using (workspace_id = public.my_workspace());
create policy "admin writes colors" on public.brand_colors for all
  using (workspace_id = public.my_workspace() and public.my_role() = 'admin')
  with check (workspace_id = public.my_workspace() and public.my_role() = 'admin');
create policy "read logos" on public.brand_logos for select using (workspace_id = public.my_workspace());
create policy "admin writes logos" on public.brand_logos for all
  using (workspace_id = public.my_workspace() and public.my_role() = 'admin')
  with check (workspace_id = public.my_workspace() and public.my_role() = 'admin');

-- Rules that drive the built-in image checks are marked with a check_key.
alter table public.guideline_rules add column if not exists check_key text
  check (check_key is null or check_key in ('palette', 'contrast', 'alt_text', 'logo'));
create unique index if not exists guideline_rules_check_key on public.guideline_rules (workspace_id, check_key) where check_key is not null;

-- ---------------------------------------------------------------------------
-- Draft images and image findings
-- ---------------------------------------------------------------------------
alter table public.drafts add column if not exists demo_seed boolean not null default false;

create table if not exists public.draft_images (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime text not null check (mime in ('image/png', 'image/jpeg')),
  width int,
  height int,
  bytes int,
  alt_text text not null default '',
  analysis jsonb,                -- measured palette, contrast regions, extracted text, logo result
  analysed_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists draft_images_draft on public.draft_images (draft_id);
alter table public.draft_images enable row level security;
create policy "read images" on public.draft_images for select
  using (workspace_id = public.my_workspace());
create policy "author adds images" on public.draft_images for insert
  with check (workspace_id = public.my_workspace() and created_by = auth.uid() and exists (
    select 1 from public.drafts d where d.id = draft_id and d.author_id = auth.uid() and d.status in ('draft', 'changes_requested')));
create policy "author updates images" on public.draft_images for update
  using (exists (select 1 from public.drafts d where d.id = draft_id and d.author_id = auth.uid() and d.status in ('draft', 'changes_requested')))
  with check (workspace_id = public.my_workspace());
create policy "author deletes images" on public.draft_images for delete
  using (exists (select 1 from public.drafts d where d.id = draft_id and d.author_id = auth.uid() and d.status in ('draft', 'changes_requested')));

alter table public.findings add column if not exists image_id uuid references public.draft_images (id) on delete cascade;
create index if not exists findings_image on public.findings (image_id) where image_id is not null;
-- Image checks with no matching Brand Kit rule cite the Brand Kit palette/logo itself.
alter type public.source_type add value if not exists 'image';

-- ---------------------------------------------------------------------------
-- Result cache (AI output keyed by content + metadata + Brand Kit version + date)
-- ---------------------------------------------------------------------------
create table if not exists public.check_cache (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  cache_key text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, cache_key)
);
alter table public.check_cache enable row level security;
create policy "read cache" on public.check_cache for select using (workspace_id = public.my_workspace());
create policy "write cache" on public.check_cache for insert with check (workspace_id = public.my_workspace());
create policy "refresh cache" on public.check_cache for update
  using (workspace_id = public.my_workspace()) with check (workspace_id = public.my_workspace());

-- ---------------------------------------------------------------------------
-- Storage: private buckets, one folder per workspace (<workspace_id>/...)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('draft-images', 'draft-images', false), ('brand-assets', 'brand-assets', false)
on conflict (id) do nothing;

create policy "workspace reads draft images" on storage.objects for select to authenticated
  using (bucket_id = 'draft-images' and (storage.foldername(name))[1] = public.my_workspace()::text);
create policy "members upload draft images" on storage.objects for insert to authenticated
  with check (bucket_id = 'draft-images' and (storage.foldername(name))[1] = public.my_workspace()::text);
create policy "uploader deletes draft images" on storage.objects for delete to authenticated
  using (bucket_id = 'draft-images' and owner = auth.uid());
create policy "workspace reads brand assets" on storage.objects for select to authenticated
  using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = public.my_workspace()::text);
create policy "admins manage brand assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = public.my_workspace()::text and public.my_role() = 'admin');
create policy "admins delete brand assets" on storage.objects for delete to authenticated
  using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = public.my_workspace()::text and public.my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Insights views. security_invoker = on means the caller's RLS applies,
-- so a member only ever aggregates their own workspace.
-- ---------------------------------------------------------------------------

-- One row per distinct issue: the same source flagging the same words in the same draft is counted once
-- (re-checks create new finding rows), keeping the status from the latest version.
create or replace view public.insight_findings with (security_invoker = on) as
select distinct on (f.draft_id, coalesce(f.rule_id, f.term_id, f.fact_id, f.image_id), f.source_label, lower(f.quote))
  f.id,
  f.draft_id,
  d.workspace_id,
  d.author_id,
  d.channel,
  d.title as draft_title,
  d.status as draft_status,
  d.demo_seed,
  f.version_id,
  v.version_no,
  v.created_at as checked_at,
  date_trunc('week', v.created_at)::date as week,
  f.category,
  f.severity,
  f.source_type,
  f.rule_id,
  f.term_id,
  f.fact_id,
  f.image_id,
  f.source_label,
  f.quote,
  f.status,
  f.engine,
  f.dispute_reason
from public.findings f
join public.drafts d on d.id = f.draft_id
join public.draft_versions v on v.id = f.version_id
order by f.draft_id, coalesce(f.rule_id, f.term_id, f.fact_id, f.image_id), f.source_label, lower(f.quote), v.version_no desc;

create or replace view public.insight_drafts with (security_invoker = on) as
select
  d.id,
  d.workspace_id,
  d.author_id,
  d.channel,
  d.title,
  d.status,
  d.demo_seed,
  d.created_at,
  sub.first_submitted_at,
  appr.approved_at,
  case when sub.first_submitted_at is not null and appr.approved_at is not null
       then extract(epoch from (appr.approved_at - sub.first_submitted_at)) / 3600.0 end as hours_to_approval
from public.drafts d
left join lateral (
  select min(e.created_at) as first_submitted_at from public.draft_events e where e.draft_id = d.id and e.action = 'submitted'
) sub on true
left join lateral (
  select max(e.created_at) as approved_at from public.draft_events e where e.draft_id = d.id and e.action = 'approved'
) appr on true;

-- Dispute statistics per Brand Kit source, with the "possibly unclear" flag.
create or replace view public.insight_source_stats with (security_invoker = on) as
with s as (
  select
    workspace_id,
    source_type,
    coalesce(rule_id, term_id, fact_id) as source_id,
    min(source_label) as source_label,
    count(*) as findings,
    count(*) filter (where status = 'disputed') as disputed,
    count(*) filter (where status in ('accepted', 'edited')) as fixed,
    count(distinct draft_id) as drafts
  from public.insight_findings
  where coalesce(rule_id, term_id, fact_id) is not null
  group by workspace_id, source_type, coalesce(rule_id, term_id, fact_id)
)
select
  s.*,
  round(s.disputed::numeric / nullif(s.findings, 0), 3) as dispute_rate,
  coalesce(ws.dispute_threshold, 0.300) as threshold,
  coalesce(ws.dispute_min_findings, 3) as min_findings,
  (s.findings >= coalesce(ws.dispute_min_findings, 3)
     and s.disputed::numeric / nullif(s.findings, 0) >= coalesce(ws.dispute_threshold, 0.300)) as possibly_unclear
from s
left join public.workspace_settings ws on ws.workspace_id = s.workspace_id;

grant select on public.insight_findings, public.insight_drafts, public.insight_source_stats to authenticated;
