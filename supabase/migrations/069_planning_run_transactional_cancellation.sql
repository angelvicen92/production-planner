-- ID 050: transactional cancellation metadata. Nullable columns preserve existing runs.
alter table public.planning_runs
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

create index if not exists planning_runs_plan_active_idx
  on public.planning_runs (plan_id, updated_at desc)
  where status in ('queued', 'running', 'cancelling');
