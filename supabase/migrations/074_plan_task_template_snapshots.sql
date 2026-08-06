-- SPEC11-002: immutable per-plan operational snapshots of task templates.
-- Server-only: user authorization remains enforced by server routes before supabaseAdmin.

CREATE TABLE IF NOT EXISTS public.plan_task_template_snapshots (
  id BIGSERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  source_template_id INTEGER NOT NULL,
  contract_version INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  template_name TEXT NOT NULL,
  default_duration INTEGER NOT NULL,
  default_cameras INTEGER NOT NULL DEFAULT 0,
  default_zone_id INTEGER,
  default_space_id INTEGER,
  auto_create_on_contestant_create BOOLEAN NOT NULL DEFAULT false,
  requires_auxiliar BOOLEAN NOT NULL DEFAULT false,
  requires_coach BOOLEAN NOT NULL DEFAULT false,
  requires_presenter BOOLEAN NOT NULL DEFAULT false,
  exclusive_auxiliar BOOLEAN NOT NULL DEFAULT false,
  has_dependency BOOLEAN NOT NULL DEFAULT false,
  dependency_template_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  resource_requirements JSONB,
  itinerant_team_requirement TEXT NOT NULL DEFAULT 'none',
  itinerant_team_id INTEGER,
  allowed_itinerant_team_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  setup_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_task_template_snapshots_plan_template_key UNIQUE (plan_id, source_template_id),
  CONSTRAINT plan_task_template_snapshots_contract_version_check CHECK (contract_version = 1),
  CONSTRAINT plan_task_template_snapshots_source_check CHECK (source IN ('inherited', 'legacy_backfill', 'ad_hoc_from_default')),
  CONSTRAINT plan_task_template_snapshots_template_name_check CHECK (length(btrim(template_name)) > 0),
  CONSTRAINT plan_task_template_snapshots_duration_check CHECK (default_duration > 0),
  CONSTRAINT plan_task_template_snapshots_cameras_check CHECK (default_cameras >= 0),
  CONSTRAINT plan_task_template_snapshots_dependency_array_check CHECK (jsonb_typeof(dependency_template_ids) = 'array'),
  CONSTRAINT plan_task_template_snapshots_allowed_team_array_check CHECK (jsonb_typeof(allowed_itinerant_team_ids) = 'array'),
  CONSTRAINT plan_task_template_snapshots_itinerant_requirement_check CHECK (itinerant_team_requirement IN ('none', 'any', 'specific')),
  CONSTRAINT plan_task_template_snapshots_specific_team_check CHECK (
    (itinerant_team_requirement = 'specific' AND itinerant_team_id IS NOT NULL AND itinerant_team_id > 0)
    OR (itinerant_team_requirement <> 'specific' AND itinerant_team_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS plan_task_template_snapshots_plan_id_idx
  ON public.plan_task_template_snapshots(plan_id);

ALTER TABLE public.plan_task_template_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.plan_task_template_snapshots FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.plan_task_template_snapshots_id_seq FROM anon, authenticated;
GRANT ALL ON TABLE public.plan_task_template_snapshots TO service_role;
GRANT ALL ON SEQUENCE public.plan_task_template_snapshots_id_seq TO service_role;

-- Defensive parser used only by this migration for legacy JSON strings.
CREATE OR REPLACE FUNCTION pg_temp.spec11_safe_jsonb(value TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN value::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Existing plans receive the best reproducible reconstruction available at migration time.
-- The cross join intentionally freezes the complete catalog, including templates not yet instantiated.
INSERT INTO public.plan_task_template_snapshots (
  plan_id,
  source_template_id,
  contract_version,
  source,
  template_name,
  default_duration,
  default_cameras,
  default_zone_id,
  default_space_id,
  auto_create_on_contestant_create,
  requires_auxiliar,
  requires_coach,
  requires_presenter,
  exclusive_auxiliar,
  has_dependency,
  dependency_template_ids,
  resource_requirements,
  itinerant_team_requirement,
  itinerant_team_id,
  allowed_itinerant_team_ids,
  setup_id
)
SELECT
  p.id,
  t.id,
  1,
  'legacy_backfill',
  t.name,
  CASE WHEN t.default_duration > 0 THEN t.default_duration ELSE 30 END,
  GREATEST(0, COALESCE(t.default_cameras, 0)),
  CASE WHEN t.zone_id > 0 THEN t.zone_id ELSE NULL END,
  CASE WHEN t.space_id > 0 THEN t.space_id ELSE NULL END,
  COALESCE(t.auto_create_on_contestant_create, false),
  COALESCE(t.requires_auxiliar, false),
  COALESCE(t.requires_coach, false),
  COALESCE(t.requires_presenter, false),
  COALESCE(t.exclusive_auxiliar, false),
  COALESCE(t.has_dependency, false),
  COALESCE((
    SELECT jsonb_agg(dep_id ORDER BY dep_id)
    FROM (
      SELECT DISTINCT dep_id
      FROM (
        SELECT CASE
          WHEN jsonb_typeof(entry) = 'number' THEN (entry::text)::numeric::integer
          WHEN jsonb_typeof(entry) = 'string' AND (entry #>> '{}') ~ '^[0-9]+$' THEN (entry #>> '{}')::integer
          ELSE NULL
        END AS dep_id
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(t.depends_on_template_ids) = 'array'
            THEN t.depends_on_template_ids
            ELSE '[]'::jsonb
          END
        ) AS entry
        UNION ALL
        SELECT CASE WHEN t.depends_on_template_id > 0 THEN t.depends_on_template_id ELSE NULL END
      ) normalized
      WHERE dep_id > 0
    ) distinct_ids
  ), '[]'::jsonb),
  CASE
    WHEN jsonb_typeof(t.resource_requirements) = 'object' THEN t.resource_requirements
    WHEN jsonb_typeof(t.resource_requirements) = 'string'
      AND jsonb_typeof(pg_temp.spec11_safe_jsonb(t.resource_requirements #>> '{}')) = 'object'
      THEN pg_temp.spec11_safe_jsonb(t.resource_requirements #>> '{}')
    ELSE NULL
  END,
  CASE
    WHEN lower(COALESCE(t.itinerant_team_requirement, 'none')) = 'specific' AND t.itinerant_team_id > 0 THEN 'specific'
    WHEN lower(COALESCE(t.itinerant_team_requirement, 'none')) = 'any' THEN 'any'
    ELSE 'none'
  END,
  CASE
    WHEN lower(COALESCE(t.itinerant_team_requirement, 'none')) = 'specific' AND t.itinerant_team_id > 0
      THEN t.itinerant_team_id
    ELSE NULL
  END,
  COALESCE((
    SELECT jsonb_agg(team_id ORDER BY team_id)
    FROM (
      SELECT DISTINCT team_id
      FROM (
        SELECT CASE
          WHEN jsonb_typeof(entry) = 'number' THEN (entry::text)::numeric::integer
          WHEN jsonb_typeof(entry) = 'string' AND (entry #>> '{}') ~ '^[0-9]+$' THEN (entry #>> '{}')::integer
          ELSE NULL
        END AS team_id
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(t.rules_json -> 'itinerantTeamAllowedIds') = 'array'
              THEN t.rules_json -> 'itinerantTeamAllowedIds'
            WHEN jsonb_typeof(t.rules_json -> 'itinerant_team_allowed_ids') = 'array'
              THEN t.rules_json -> 'itinerant_team_allowed_ids'
            ELSE '[]'::jsonb
          END
        ) AS entry
        UNION ALL
        SELECT CASE
          WHEN lower(COALESCE(t.itinerant_team_requirement, 'none')) = 'specific' AND t.itinerant_team_id > 0
            THEN t.itinerant_team_id
          ELSE NULL
        END
      ) normalized
      WHERE team_id > 0
    ) distinct_ids
  ), '[]'::jsonb),
  CASE WHEN t.setup_id > 0 THEN t.setup_id ELSE NULL END
FROM public.plans p
CROSS JOIN public.task_templates t
ON CONFLICT (plan_id, source_template_id) DO NOTHING;
