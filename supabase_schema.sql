-- ═══════════════════════════════════════════════════════════════
--  Automation Hub — Project Tracker
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- 1. Create the projects table
create table if not exists public.projects (
  id             bigserial primary key,
  project        text        not null,
  category       text        not null,
  status         text        not null default 'In Progress',
  priority       text        not null default '',
  rag            text        not null default 'G'       check (rag in ('G','A','R')),
  owner          text        not null default '',
  spoc           text        not null default '',
  tech           text        not null default '',
  blocker        text        not null default '',
  eta            text        not null default '',
  mc             text        not null default 'No'      check (mc in ('Yes','Partial','No')),
  mc_reason      text        not null default '',
  current_status text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 2. Auto-update updated_at on every row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- 3. Indexes for common filter columns
create index if not exists idx_projects_status   on public.projects (status);
create index if not exists idx_projects_rag      on public.projects (rag);
create index if not exists idx_projects_mc       on public.projects (mc);
create index if not exists idx_projects_category on public.projects (category);
create index if not exists idx_projects_owner    on public.projects (owner);

-- 4. Row-Level Security (RLS)
--    The API uses the SERVICE_ROLE key which bypasses RLS.
--    Enable RLS anyway so the anon key cannot read/write the table.
alter table public.projects enable row level security;

-- Allow only service_role (bypasses RLS automatically — no policy needed).
-- If you want to expose the table to authenticated users via the anon key,
-- add a policy here, e.g.:
--
-- create policy "authenticated users can read"
--   on public.projects for select
--   to authenticated using (true);

-- 5. Done — now run the seed endpoint to populate data:
--    curl -X GET https://<your-vercel-url>/api/seed \
--         -H "x-seed-token: <your-SEED_SECRET>"
