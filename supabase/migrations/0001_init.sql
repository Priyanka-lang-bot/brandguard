-- BrandGuard schema: workspaces, roles, Brand Kit, drafts, versions, findings, audit trail.
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Workspaces and people
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create type public.app_role as enum ('admin', 'reviewer', 'creator');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'creator',
  created_at timestamptz not null default now()
);

-- Helpers used by RLS policies. SECURITY DEFINER so they can read profiles
-- without recursing through the profiles policy.
create or replace function public.my_workspace() returns uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from public.profiles where id = auth.uid()
$$;

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Brand Kit
-- ---------------------------------------------------------------------------
create type public.rule_category as enum ('tone', 'terminology', 'claims', 'messaging', 'accessibility', 'visual');
create type public.severity as enum ('high', 'medium', 'low');
create type public.rule_status as enum ('active', 'pending', 'rejected');

create table public.guideline_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  code text not null,                       -- short human id shown in citations, e.g. TONE-2
  category public.rule_category not null,
  title text not null,
  description text not null,
  severity public.severity not null default 'medium',
  -- optional regex patterns for deterministic checks (case-insensitive)
  patterns text[] not null default '{}',
  status public.rule_status not null default 'active',
  source text not null default 'manual',    -- 'manual' or 'pdf:<file name>'
  source_excerpt text,                      -- text the rule was extracted from (PDF import)
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (workspace_id, code)
);

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  preferred text not null,                  -- the approved spelling / name
  banned text[] not null default '{}',      -- variants that must be replaced
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  code text not null,                       -- e.g. FACT-3
  topic text not null,                      -- e.g. "Pro plan price"
  statement text not null,                  -- the approved, current fact
  valid_until date,                         -- null = no expiry
  created_at timestamptz not null default now(),
  unique (workspace_id, code)
);

-- ---------------------------------------------------------------------------
-- Drafts, versions, findings
-- ---------------------------------------------------------------------------
create type public.draft_status as enum ('draft', 'in_review', 'changes_requested', 'approved');

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  title text not null,
  purpose text not null default '',
  channel text not null default 'Blog',
  status public.draft_status not null default 'draft',
  current_version int not null default 1,
  reviewer_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.draft_versions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  version_no int not null,
  content text not null,
  source_file text,                         -- original upload name, if any
  note text not null default '',
  checked boolean not null default false,     -- true when the engine ran on this version
  ai_checked boolean not null default false,  -- false when the AI pass was unavailable
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (draft_id, version_no)
);

create type public.finding_status as enum ('open', 'accepted', 'edited', 'disputed');
create type public.source_type as enum ('rule', 'term', 'fact');

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.draft_versions (id) on delete cascade,
  draft_id uuid not null references public.drafts (id) on delete cascade,
  category public.rule_category not null,
  severity public.severity not null default 'medium',
  quote text not null,                      -- exact text from the version content
  start_idx int not null,
  end_idx int not null,
  source_type public.source_type not null,
  rule_id uuid references public.guideline_rules (id) on delete set null,
  term_id uuid references public.terms (id) on delete set null,
  fact_id uuid references public.facts (id) on delete set null,
  source_label text not null,               -- citation as shown to the user, e.g. "CLAIM-1 · No superlatives"
  explanation text not null,
  suggestion text not null,                 -- minimal replacement for `quote`
  engine text not null default 'rules',     -- 'rules' (deterministic) or 'ai'
  status public.finding_status not null default 'open',
  resolution_text text,                     -- final replacement when accepted/edited
  dispute_reason text,
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.draft_events (
  id bigint generated always as identity primary key,
  draft_id uuid not null references public.drafts (id) on delete cascade,
  actor_id uuid references auth.users (id),
  action text not null,                     -- created, checked, finding_accepted, submitted, approved, changes_requested, comment ...
  detail text not null default '',
  version_no int,
  created_at timestamptz not null default now()
);

create index on public.findings (version_id);
create index on public.findings (draft_id);
create index on public.draft_versions (draft_id);
create index on public.draft_events (draft_id);
create index on public.drafts (workspace_id, status);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.guideline_rules enable row level security;
alter table public.terms enable row level security;
alter table public.facts enable row level security;
alter table public.drafts enable row level security;
alter table public.draft_versions enable row level security;
alter table public.findings enable row level security;
alter table public.draft_events enable row level security;

create policy "members read workspace" on public.workspaces
  for select using (id = public.my_workspace());

create policy "members read profiles" on public.profiles
  for select using (workspace_id = public.my_workspace());

-- Brand Kit: everyone in the workspace reads; only admins write.
create policy "read rules" on public.guideline_rules for select using (workspace_id = public.my_workspace());
create policy "admin writes rules" on public.guideline_rules for all
  using (workspace_id = public.my_workspace() and public.my_role() = 'admin')
  with check (workspace_id = public.my_workspace() and public.my_role() = 'admin');

create policy "read terms" on public.terms for select using (workspace_id = public.my_workspace());
create policy "admin writes terms" on public.terms for all
  using (workspace_id = public.my_workspace() and public.my_role() = 'admin')
  with check (workspace_id = public.my_workspace() and public.my_role() = 'admin');

create policy "read facts" on public.facts for select using (workspace_id = public.my_workspace());
create policy "admin writes facts" on public.facts for all
  using (workspace_id = public.my_workspace() and public.my_role() = 'admin')
  with check (workspace_id = public.my_workspace() and public.my_role() = 'admin');

-- Drafts: everyone in the workspace can read (reviewers need the queue).
create policy "read drafts" on public.drafts for select using (workspace_id = public.my_workspace());
create policy "create own drafts" on public.drafts for insert
  with check (workspace_id = public.my_workspace() and author_id = auth.uid());
-- Authors edit their drafts while not under review / approved; reviewers and admins can update status.
create policy "author updates draft" on public.drafts for update
  using (author_id = auth.uid() and status in ('draft', 'changes_requested'))
  with check (author_id = auth.uid() and status in ('draft', 'changes_requested', 'in_review'));
create policy "reviewer updates draft" on public.drafts for update
  using (workspace_id = public.my_workspace() and public.my_role() in ('reviewer', 'admin') and author_id <> auth.uid())
  with check (workspace_id = public.my_workspace());

create policy "read versions" on public.draft_versions for select
  using (exists (select 1 from public.drafts d where d.id = draft_id and d.workspace_id = public.my_workspace()));
create policy "author adds versions" on public.draft_versions for insert
  with check (created_by = auth.uid() and exists (
    select 1 from public.drafts d where d.id = draft_id and d.author_id = auth.uid()));

create policy "read findings" on public.findings for select
  using (exists (select 1 from public.drafts d where d.id = draft_id and d.workspace_id = public.my_workspace()));
create policy "author adds findings" on public.findings for insert
  with check (exists (select 1 from public.drafts d where d.id = draft_id and d.author_id = auth.uid()));
create policy "author resolves findings" on public.findings for update
  using (exists (select 1 from public.drafts d where d.id = draft_id and d.author_id = auth.uid()
                 and d.status in ('draft', 'changes_requested')));

create policy "read events" on public.draft_events for select
  using (exists (select 1 from public.drafts d where d.id = draft_id and d.workspace_id = public.my_workspace()));
create policy "members add events" on public.draft_events for insert
  with check (actor_id = auth.uid() and exists (
    select 1 from public.drafts d where d.id = draft_id and d.workspace_id = public.my_workspace()));

-- ---------------------------------------------------------------------------
-- New sign-ups join the demo workspace as creators.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  select id into ws from public.workspaces order by created_at limit 1;
  if ws is null then
    insert into public.workspaces (name) values ('Demo workspace') returning id into ws;
  end if;
  insert into public.profiles (id, workspace_id, full_name, role)
  values (
    new.id, ws,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'creator'  -- roles are never taken from sign-up metadata; the seed script promotes demo users
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
