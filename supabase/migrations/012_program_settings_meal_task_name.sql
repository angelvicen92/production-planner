-- 012_program_settings_meal_task_name.sql

alter table if exists public.program_settings
add column if not exists meal_task_template_name text not null default 'Comer';
