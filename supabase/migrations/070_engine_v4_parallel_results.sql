-- 1.0.70 Engine V4 parallel results (DB Safe Merge)
-- Idempotent, additive and compatible with existing V3 planning state.
create table if not exists public.engine_plan_results (
  id bigserial primary key,
  plan_id integer not null references public.plans(id) on delete cascade,
  planning_run_id bigint references public.planning_runs(id) on delete set null,
  engine_version text not null check (engine_version in ('v3', 'v4')),
  status text not null default 'success',
  planned_tasks jsonb not null default '[]'::jsonb,
  unplanned_tasks jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists engine_plan_results_plan_engine_created_idx
  on public.engine_plan_results(plan_id, engine_version, created_at desc);

create index if not exists engine_plan_results_planning_run_idx
  on public.engine_plan_results(planning_run_id);
