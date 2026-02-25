alter table public.plans
  add column if not exists planning_warnings jsonb not null default '[]'::jsonb,
  add column if not exists planning_stats jsonb not null default '{}'::jsonb;
