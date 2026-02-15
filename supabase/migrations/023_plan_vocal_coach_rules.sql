-- 023_plan_vocal_coach_rules.sql
-- Reglas por plan: qué tareas auto-crear según el vocal coach asignado al concursante

create table if not exists public.plan_vocal_coach_rules (
  id serial primary key,
  plan_id integer not null references public.plans(id) on delete cascade,

  -- Referencia al snapshot del coach en este plan (plan_resource_items.id)
  vocal_coach_plan_resource_item_id integer not null references public.plan_resource_items(id) on delete cascade,

  -- Qué tarea hay que crear
  task_template_id integer not null references public.task_templates(id) on delete cascade,

  -- Dónde se hace por defecto (puede ser null si quieres que lo elija el usuario)
  default_space_id integer null references public.spaces(id) on delete set null,

  sort_order integer not null default 0,
  is_required boolean not null default true,

  created_at timestamptz not null default now()
);

create index if not exists idx_pvcr_plan_id
  on public.plan_vocal_coach_rules(plan_id);

create index if not exists idx_pvcr_coach_item
  on public.plan_vocal_coach_rules(vocal_coach_plan_resource_item_id);

create unique index if not exists uq_pvcr_unique
  on public.plan_vocal_coach_rules(plan_id, vocal_coach_plan_resource_item_id, task_template_id);
