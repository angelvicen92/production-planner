alter table if exists public.plans
  add column if not exists optimizer_engine text not null default 'v2';

update public.plans
set optimizer_engine = 'v2'
where optimizer_engine is null or optimizer_engine not in ('v2', 'v3');

alter table if exists public.plans
  drop constraint if exists plans_optimizer_engine_check;

alter table if exists public.plans
  add constraint plans_optimizer_engine_check
  check (optimizer_engine in ('v2', 'v3'));

alter table if exists public.planning_runs
  add column if not exists engine text;

alter table if exists public.planning_runs
  add column if not exists requested_time_limit_ms integer;

alter table if exists public.planning_runs
  add column if not exists finished_at timestamp with time zone;

alter table if exists public.planning_runs
  add column if not exists phase_progress_pct integer not null default 0;

update public.planning_runs
set phase_progress_pct = 0
where phase_progress_pct is null;
