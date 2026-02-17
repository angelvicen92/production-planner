-- 040_abbrev_and_task_comments.sql

ALTER TABLE public.task_templates
  ADD COLUMN IF NOT EXISTS abbrev text,
  ADD COLUMN IF NOT EXISTS default_comment1_color text,
  ADD COLUMN IF NOT EXISTS default_comment2_color text;

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS abbrev text;

ALTER TABLE public.daily_tasks
  ADD COLUMN IF NOT EXISTS comment1_text text,
  ADD COLUMN IF NOT EXISTS comment1_color text,
  ADD COLUMN IF NOT EXISTS comment2_text text,
  ADD COLUMN IF NOT EXISTS comment2_color text;
