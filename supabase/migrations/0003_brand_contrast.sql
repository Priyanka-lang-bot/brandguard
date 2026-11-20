-- Brand minimum contrast for text in images (Round 2 commitment: "flag anything below the brand's minimum
-- (default 4.5:1)"). Additive; the app uses 4.5:1 until this has been run.
alter table public.workspace_settings
  add column if not exists min_contrast numeric(4, 2) not null default 4.5
  check (min_contrast >= 3 and min_contrast <= 21);
