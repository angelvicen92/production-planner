-- 021_task_template_resource_requirements.sql
alter table public.task_templates
add column if not exists resource_requirements jsonb;
