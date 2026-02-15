-- Multi-dependencies for task templates (v-next)
-- Supports N prerequisites instead of a single depends_on_template_id.

-- 1) Add jsonb column to store an array of template ids
alter table public.task_templates
  add column if not exists depends_on_template_ids jsonb;

-- 2) Drop the old 0/1 dependency consistency constraint (if present)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'task_templates_dependency_consistency'
  ) then
    alter table public.task_templates
      drop constraint task_templates_dependency_consistency;
  end if;
end $$;

-- 3) Backfill: if old depends_on_template_id is set, copy it into the new array
update public.task_templates
set depends_on_template_ids = jsonb_build_array(depends_on_template_id)
where depends_on_template_ids is null
  and depends_on_template_id is not null;

-- 4) Normalize: empty array when nothing is set
update public.task_templates
set depends_on_template_ids = '[]'::jsonb
where depends_on_template_ids is null;
