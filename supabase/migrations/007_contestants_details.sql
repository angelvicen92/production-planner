-- 007_contestants_details.sql
-- Add song + vocal coach (per-plan resource item snapshot)

ALTER TABLE public.contestants
  ADD COLUMN IF NOT EXISTS song TEXT;

ALTER TABLE public.contestants
  ADD COLUMN IF NOT EXISTS vocal_coach_plan_resource_item_id BIGINT
    REFERENCES public.plan_resource_items(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contestants_vocal_coach_pri_idx
  ON public.contestants(vocal_coach_plan_resource_item_id);
