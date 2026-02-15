-- 024_vocal_coach_rules.sql
-- Reglas globales: qué tareas auto-crear según el vocal coach (resource_items)

create table if not exists public.vocal_coach_rules (
  id serial primary key,

  -- Coach global (resource_items.id)
  vocal_coach_resource_item_id integer not null references public.resource_items(id) on delete cascade,

  -- Qué tarea hay que crear
  task_template_id integer not null references public.task_templates(id) on delete cascade,

  -- Dónde se hace por defecto (opcional)
  default_space_id integer null references public.spaces(id) on delete set null,

  sort_order integer not null default 0,
  is_required boolean not null default true,

  created_at timestamptz not null default now()
);

create index if not exists idx_vcr_coach_item
  on public.vocal_coach_rules(vocal_coach_resource_item_id);

create unique index if not exists uq_vcr_unique
  on public.vocal_coach_rules(vocal_coach_resource_item_id, task_template_id);
