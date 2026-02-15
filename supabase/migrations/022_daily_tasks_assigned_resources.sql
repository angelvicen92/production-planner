alter table public.daily_tasks
add column if not exists assigned_resource_ids jsonb null;
