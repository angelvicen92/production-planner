alter table if exists optimizer_settings
  add column if not exists arrival_task_template_name text,
  add column if not exists departure_task_template_name text,
  add column if not exists arrival_grouping_target integer not null default 0,
  add column if not exists departure_grouping_target integer not null default 0,
  add column if not exists van_capacity integer not null default 0,
  add column if not exists weight_arrival_departure_grouping integer not null default 0;

alter table if exists plan_breaks
  add column if not exists planned_start text,
  add column if not exists planned_end text;

alter table if exists zones
  add column if not exists meal_start_preferred text,
  add column if not exists meal_end_preferred text;
