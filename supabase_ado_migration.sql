-- Run this in Supabase SQL Editor to add Azure DevOps columns
alter table public.projects
  add column if not exists ado_work_item_id  integer     default null,
  add column if not exists ado_title         text        not null default '',
  add column if not exists ado_state         text        not null default '',
  add column if not exists ado_iteration     text        not null default '',
  add column if not exists ado_url           text        not null default '';

create index if not exists idx_projects_ado_id on public.projects (ado_work_item_id);
