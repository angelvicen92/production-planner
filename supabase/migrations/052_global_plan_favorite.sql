ALTER TABLE public.plans
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.plans
SET is_favorite = FALSE
WHERE is_favorite = TRUE;

WITH picked AS (
  SELECT up.favorite_plan_id AS plan_id
  FROM public.user_preferences up
  WHERE up.favorite_plan_id IS NOT NULL
  ORDER BY up.updated_at DESC NULLS LAST
  LIMIT 1
)
UPDATE public.plans p
SET is_favorite = TRUE
FROM picked
WHERE p.id = picked.plan_id;

CREATE UNIQUE INDEX IF NOT EXISTS plans_single_global_favorite_idx
ON public.plans (is_favorite)
WHERE is_favorite = TRUE;
