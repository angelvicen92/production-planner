alter table public.task_templates
  add column if not exists has_dependency boolean not null default false;

alter table public.task_templates
  add column if not exists depends_on_template_id integer null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_templates_depends_on_fkey'
  ) then
    alter table public.task_templates
      add constraint task_templates_depends_on_fkey
      foreign key (depends_on_template_id)
      references public.task_templates(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_templates_dependency_consistency'
  ) then
    alter table public.task_templates
      add constraint task_templates_dependency_consistency
      check (
        (has_dependency = false and depends_on_template_id is null)
        or
        (has_dependency = true and depends_on_template_id is not null)
      );
  end if;
end $$;
