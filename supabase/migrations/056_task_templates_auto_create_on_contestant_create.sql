ALTER TABLE public.task_templates
  ADD COLUMN IF NOT EXISTS auto_create_on_contestant_create boolean NOT NULL DEFAULT false;
