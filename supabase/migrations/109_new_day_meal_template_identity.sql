-- Explicit catalogue selection for future days. Existing profiles and revisions
-- stay byte-for-byte intact; their names are never backfilled into identities.
ALTER TABLE public.program_settings ADD COLUMN meal_task_template_id bigint
  REFERENCES public.task_templates(id) ON DELETE RESTRICT;
