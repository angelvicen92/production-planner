alter table if exists public.optimizer_settings
  add column if not exists grouping_zone_ids jsonb not null default '[]'::jsonb;
