-- ID258: nullable per-zone meal break override. NULL inherits plan/program settings; 0 disables mandatory space meal break for the zone.
alter table if exists public.zones
  add column if not exists space_meal_break_minutes integer;

alter table if exists public.program_settings
  alter column space_meal_break_minutes set default 75;
