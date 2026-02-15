-- 010_plan_contestant_meal_settings.sql
alter table public.plans
  add column if not exists contestant_meal_duration_minutes integer not null default 75;

alter table public.plans
  add column if not exists contestant_meal_max_simultaneous integer not null default 10;
