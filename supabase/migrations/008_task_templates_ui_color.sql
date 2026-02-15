-- 008_task_templates_ui_color.sql
alter table public.task_templates
  add column if not exists ui_color text;

-- Opcional pero recomendado: validar formato #RRGGBB o #RRGGBBAA
alter table public.task_templates
  add constraint task_templates_ui_color_format
  check (
    ui_color is null
    or ui_color ~ '^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$'
  );
