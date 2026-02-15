-- 034_task_templates_itinerant_team_requirement.sql
-- Requisito de equipo itinerante en Task Templates:
--  - none: no necesita equipo
--  - any: necesita un equipo cualquiera (motor decide)
--  - specific: necesita uno concreto (itinerant_team_id)

ALTER TABLE public.task_templates
  ADD COLUMN IF NOT EXISTS itinerant_team_requirement text NOT NULL DEFAULT 'none';

ALTER TABLE public.task_templates
  ADD COLUMN IF NOT EXISTS itinerant_team_id bigint NULL
    REFERENCES public.itinerant_teams(id) ON DELETE SET NULL;

-- constraint de coherencia
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'task_templates_itinerant_team_requirement_check'
  ) THEN
    ALTER TABLE public.task_templates
      DROP CONSTRAINT task_templates_itinerant_team_requirement_check;
  END IF;
END $$;

ALTER TABLE public.task_templates
  ADD CONSTRAINT task_templates_itinerant_team_requirement_check CHECK (
    itinerant_team_requirement IN ('none','any','specific')
    AND (
      (itinerant_team_requirement = 'specific' AND itinerant_team_id IS NOT NULL)
      OR (itinerant_team_requirement <> 'specific' AND itinerant_team_id IS NULL)
    )
  );

CREATE INDEX IF NOT EXISTS idx_task_templates_itinerant_team_id
  ON public.task_templates(itinerant_team_id);