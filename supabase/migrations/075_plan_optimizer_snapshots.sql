-- SPEC11-010 checkpoint 2: immutable per-plan optimizer configuration snapshots.
-- Server-only. Global optimizer_settings initialize new/legacy plans but never remain the daily authority.

CREATE TABLE IF NOT EXISTS public.plan_optimizer_snapshots (
  id BIGSERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  contract_version INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  editing_mode TEXT NOT NULL,
  main_zone_id INTEGER,
  arrival_plan_template_snapshot_id BIGINT REFERENCES public.plan_task_template_snapshots(id) ON DELETE CASCADE,
  departure_plan_template_snapshot_id BIGINT REFERENCES public.plan_task_template_snapshots(id) ON DELETE CASCADE,
  arrival_grouping_target INTEGER NOT NULL DEFAULT 0,
  departure_grouping_target INTEGER NOT NULL DEFAULT 0,
  arrival_min_gap_minutes INTEGER NOT NULL DEFAULT 0,
  departure_min_gap_minutes INTEGER NOT NULL DEFAULT 0,
  van_capacity INTEGER NOT NULL DEFAULT 0,
  grouping_weight INTEGER NOT NULL DEFAULT 0,
  near_hard_breaks_max INTEGER NOT NULL DEFAULT 0,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_optimizer_snapshots_plan_key UNIQUE (plan_id),
  CONSTRAINT plan_optimizer_snapshots_contract_version_check CHECK (contract_version = 1),
  CONSTRAINT plan_optimizer_snapshots_source_check CHECK (source IN ('INHERITED', 'LEGACY_BACKFILL', 'DAY_OVERRIDE')),
  CONSTRAINT plan_optimizer_snapshots_editing_mode_check CHECK (editing_mode IN ('BASIC', 'ADVANCED')),
  CONSTRAINT plan_optimizer_snapshots_arrival_target_check CHECK (arrival_grouping_target >= 0),
  CONSTRAINT plan_optimizer_snapshots_departure_target_check CHECK (departure_grouping_target >= 0),
  CONSTRAINT plan_optimizer_snapshots_arrival_gap_check CHECK (arrival_min_gap_minutes >= 0),
  CONSTRAINT plan_optimizer_snapshots_departure_gap_check CHECK (departure_min_gap_minutes >= 0),
  CONSTRAINT plan_optimizer_snapshots_van_capacity_check CHECK (van_capacity >= 0),
  CONSTRAINT plan_optimizer_snapshots_grouping_weight_check CHECK (grouping_weight BETWEEN 0 AND 10),
  CONSTRAINT plan_optimizer_snapshots_near_hard_check CHECK (near_hard_breaks_max BETWEEN 0 AND 10),
  CONSTRAINT plan_optimizer_snapshots_arrival_active_reference_check CHECK (
    grouping_weight = 0 OR arrival_grouping_target = 0 OR arrival_plan_template_snapshot_id IS NOT NULL
  ),
  CONSTRAINT plan_optimizer_snapshots_departure_active_reference_check CHECK (
    grouping_weight = 0 OR departure_grouping_target = 0 OR departure_plan_template_snapshot_id IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.plan_optimizer_snapshot_heuristics (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id BIGINT NOT NULL REFERENCES public.plan_optimizer_snapshots(id) ON DELETE CASCADE,
  heuristic_key TEXT NOT NULL,
  basic_level INTEGER NOT NULL,
  advanced_value INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_optimizer_snapshot_heuristics_key UNIQUE (snapshot_id, heuristic_key),
  CONSTRAINT plan_optimizer_snapshot_heuristics_basic_level_check CHECK (basic_level BETWEEN 0 AND 3),
  CONSTRAINT plan_optimizer_snapshot_heuristics_advanced_value_check CHECK (advanced_value BETWEEN 0 AND 10),
  CONSTRAINT plan_optimizer_snapshot_heuristics_key_check CHECK (heuristic_key IN (
    'MAIN_ZONE_PRIORITY',
    'MAIN_ZONE_FINISH_EARLY',
    'MAIN_ZONE_KEEP_BUSY',
    'CONTESTANT_COMPACT',
    'GROUP_BY_SPACE_TEMPLATE_MATCH',
    'GROUP_BY_SPACE_ACTIVE',
    'CONTESTANT_STAY_IN_ZONE',
    'CONTESTANT_TOTAL_SPAN',
    'ARRIVAL_DEPARTURE_GROUPING'
  ))
);

CREATE TABLE IF NOT EXISTS public.plan_optimizer_snapshot_grouping_zones (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id BIGINT NOT NULL REFERENCES public.plan_optimizer_snapshots(id) ON DELETE CASCADE,
  zone_id INTEGER NOT NULL,
  CONSTRAINT plan_optimizer_snapshot_grouping_zones_key UNIQUE (snapshot_id, zone_id),
  CONSTRAINT plan_optimizer_snapshot_grouping_zones_zone_check CHECK (zone_id > 0)
);

CREATE INDEX IF NOT EXISTS plan_optimizer_snapshots_plan_id_idx
  ON public.plan_optimizer_snapshots(plan_id);
CREATE INDEX IF NOT EXISTS plan_optimizer_snapshot_heuristics_snapshot_id_idx
  ON public.plan_optimizer_snapshot_heuristics(snapshot_id);
CREATE INDEX IF NOT EXISTS plan_optimizer_snapshot_grouping_zones_snapshot_id_idx
  ON public.plan_optimizer_snapshot_grouping_zones(snapshot_id);

-- Daily references must belong to the same plan. We intentionally do not FK to global zones/settings.
CREATE OR REPLACE FUNCTION public.spec11_validate_plan_optimizer_snapshot_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.main_zone_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.plan_zone_settings z
    WHERE z.plan_id = NEW.plan_id AND z.zone_id = NEW.main_zone_id
  ) THEN
    RAISE EXCEPTION 'PLAN_OPTIMIZER_ZONE_OUT_OF_SCOPE: main zone % does not belong to plan %', NEW.main_zone_id, NEW.plan_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.arrival_plan_template_snapshot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.plan_task_template_snapshots t
    WHERE t.id = NEW.arrival_plan_template_snapshot_id AND t.plan_id = NEW.plan_id
  ) THEN
    RAISE EXCEPTION 'PLAN_OPTIMIZER_TEMPLATE_OUT_OF_SCOPE: arrival snapshot % does not belong to plan %', NEW.arrival_plan_template_snapshot_id, NEW.plan_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.departure_plan_template_snapshot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.plan_task_template_snapshots t
    WHERE t.id = NEW.departure_plan_template_snapshot_id AND t.plan_id = NEW.plan_id
  ) THEN
    RAISE EXCEPTION 'PLAN_OPTIMIZER_TEMPLATE_OUT_OF_SCOPE: departure snapshot % does not belong to plan %', NEW.departure_plan_template_snapshot_id, NEW.plan_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS spec11_plan_optimizer_snapshot_scope ON public.plan_optimizer_snapshots;
CREATE TRIGGER spec11_plan_optimizer_snapshot_scope
BEFORE INSERT OR UPDATE ON public.plan_optimizer_snapshots
FOR EACH ROW EXECUTE FUNCTION public.spec11_validate_plan_optimizer_snapshot_scope();

CREATE OR REPLACE FUNCTION public.spec11_validate_plan_optimizer_grouping_zone_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owning_plan_id INTEGER;
BEGIN
  SELECT s.plan_id INTO owning_plan_id
  FROM public.plan_optimizer_snapshots s
  WHERE s.id = NEW.snapshot_id;

  IF owning_plan_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.plan_zone_settings z
    WHERE z.plan_id = owning_plan_id AND z.zone_id = NEW.zone_id
  ) THEN
    RAISE EXCEPTION 'PLAN_OPTIMIZER_ZONE_OUT_OF_SCOPE: grouping zone % is invalid for snapshot %', NEW.zone_id, NEW.snapshot_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS spec11_plan_optimizer_grouping_zone_scope ON public.plan_optimizer_snapshot_grouping_zones;
CREATE TRIGGER spec11_plan_optimizer_grouping_zone_scope
BEFORE INSERT OR UPDATE ON public.plan_optimizer_snapshot_grouping_zones
FOR EACH ROW EXECUTE FUNCTION public.spec11_validate_plan_optimizer_grouping_zone_scope();

ALTER TABLE public.plan_optimizer_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_optimizer_snapshot_heuristics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_optimizer_snapshot_grouping_zones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.plan_optimizer_snapshots FROM anon, authenticated;
REVOKE ALL ON TABLE public.plan_optimizer_snapshot_heuristics FROM anon, authenticated;
REVOKE ALL ON TABLE public.plan_optimizer_snapshot_grouping_zones FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.plan_optimizer_snapshots_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.plan_optimizer_snapshot_heuristics_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.plan_optimizer_snapshot_grouping_zones_id_seq FROM anon, authenticated;

GRANT ALL ON TABLE public.plan_optimizer_snapshots TO service_role;
GRANT ALL ON TABLE public.plan_optimizer_snapshot_heuristics TO service_role;
GRANT ALL ON TABLE public.plan_optimizer_snapshot_grouping_zones TO service_role;
GRANT ALL ON SEQUENCE public.plan_optimizer_snapshots_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.plan_optimizer_snapshot_heuristics_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.plan_optimizer_snapshot_grouping_zones_id_seq TO service_role;

-- Migration-local compatibility helpers. grouping_zone_ids has existed in more than one physical representation.
CREATE OR REPLACE FUNCTION pg_temp.spec11_optimizer_zone_ids(value JSONB)
RETURNS TABLE(zone_id INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  parsed JSONB := value;
BEGIN
  IF parsed IS NULL OR parsed = 'null'::jsonb THEN
    RETURN;
  END IF;

  IF jsonb_typeof(parsed) = 'string' THEN
    BEGIN
      parsed := (parsed #>> '{}')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RETURN;
    END;
  END IF;

  IF jsonb_typeof(parsed) <> 'array' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT normalized.zone_id
  FROM (
    SELECT CASE
      WHEN jsonb_typeof(entry.value) = 'number' THEN (entry.value::text)::numeric::integer
      WHEN jsonb_typeof(entry.value) = 'string' AND (entry.value #>> '{}') ~ '^[0-9]+$' THEN (entry.value #>> '{}')::integer
      ELSE NULL
    END AS zone_id
    FROM jsonb_array_elements(parsed) AS entry(value)
  ) normalized
  WHERE normalized.zone_id > 0
  ORDER BY normalized.zone_id;
END;
$$;

-- Existing plans receive the best reproducible reconstruction available at migration time.
-- Ambiguous or active unresolved legacy names are never resolved by taking the first match.
INSERT INTO public.plan_optimizer_snapshots (
  plan_id,
  contract_version,
  source,
  editing_mode,
  main_zone_id,
  arrival_plan_template_snapshot_id,
  departure_plan_template_snapshot_id,
  arrival_grouping_target,
  departure_grouping_target,
  arrival_min_gap_minutes,
  departure_min_gap_minutes,
  van_capacity,
  grouping_weight,
  near_hard_breaks_max
)
SELECT
  p.id,
  1,
  'LEGACY_BACKFILL',
  CASE WHEN lower(COALESCE(o.optimization_mode, 'basic')) = 'advanced' THEN 'ADVANCED' ELSE 'BASIC' END,
  CASE WHEN o.main_zone_id > 0 THEN o.main_zone_id ELSE NULL END,
  CASE WHEN arrival_match.match_count = 1 THEN arrival_match.snapshot_id ELSE NULL END,
  CASE WHEN departure_match.match_count = 1 THEN departure_match.snapshot_id ELSE NULL END,
  normalized.arrival_target,
  normalized.departure_target,
  normalized.arrival_gap,
  normalized.departure_gap,
  normalized.van_capacity,
  normalized.grouping_weight,
  normalized.near_hard
FROM public.plans p
CROSS JOIN public.optimizer_settings o
CROSS JOIN LATERAL (
  SELECT
    GREATEST(0, COALESCE(o.arrival_grouping_target, 0))::integer AS arrival_target,
    GREATEST(0, COALESCE(o.departure_grouping_target, 0))::integer AS departure_target,
    GREATEST(0, COALESCE(o.arrival_min_gap_minutes, 0))::integer AS arrival_gap,
    GREATEST(0, COALESCE(o.departure_min_gap_minutes, 0))::integer AS departure_gap,
    GREATEST(0, COALESCE(o.van_capacity, 0))::integer AS van_capacity,
    GREATEST(0, LEAST(10, COALESCE(o.weight_arrival_departure_grouping, 0)))::integer AS grouping_weight,
    GREATEST(0, LEAST(10, COALESCE(o.near_hard_breaks_max, 0)))::integer AS near_hard
) normalized
CROSS JOIN LATERAL (
  SELECT count(*)::integer AS match_count, min(t.id)::bigint AS snapshot_id
  FROM public.plan_task_template_snapshots t
  WHERE t.plan_id = p.id
    AND length(btrim(COALESCE(o.arrival_task_template_name, ''))) > 0
    AND lower(btrim(t.template_name)) = lower(btrim(o.arrival_task_template_name))
) arrival_match
CROSS JOIN LATERAL (
  SELECT count(*)::integer AS match_count, min(t.id)::bigint AS snapshot_id
  FROM public.plan_task_template_snapshots t
  WHERE t.plan_id = p.id
    AND length(btrim(COALESCE(o.departure_task_template_name, ''))) > 0
    AND lower(btrim(t.template_name)) = lower(btrim(o.departure_task_template_name))
) departure_match
WHERE o.id = 1
  AND (
    o.main_zone_id IS NULL OR o.main_zone_id <= 0 OR EXISTS (
      SELECT 1 FROM public.plan_zone_settings z WHERE z.plan_id = p.id AND z.zone_id = o.main_zone_id
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_temp.spec11_optimizer_zone_ids(to_jsonb(o) -> 'grouping_zone_ids') grouping_zone
    WHERE NOT EXISTS (
      SELECT 1 FROM public.plan_zone_settings z WHERE z.plan_id = p.id AND z.zone_id = grouping_zone.zone_id
    )
  )
  AND (normalized.grouping_weight = 0 OR normalized.arrival_target = 0 OR arrival_match.match_count = 1)
  AND (normalized.grouping_weight = 0 OR normalized.departure_target = 0 OR departure_match.match_count = 1)
ON CONFLICT (plan_id) DO NOTHING;

INSERT INTO public.plan_optimizer_snapshot_heuristics (
  snapshot_id,
  heuristic_key,
  basic_level,
  advanced_value
)
SELECT
  s.id,
  heuristic.heuristic_key,
  heuristic.basic_level,
  heuristic.advanced_value
FROM public.plan_optimizer_snapshots s
CROSS JOIN public.optimizer_settings o
CROSS JOIN LATERAL (
  VALUES
    (
      'MAIN_ZONE_PRIORITY'::text,
      GREATEST(0, LEAST(3, COALESCE(o.main_zone_priority_level, CASE WHEN COALESCE(o.prioritize_main_zone, false) THEN 2 ELSE 0 END)))::integer,
      GREATEST(0, LEAST(10, COALESCE(o.main_zone_priority_advanced_value, 0)))::integer
    ),
    (
      'MAIN_ZONE_FINISH_EARLY'::text,
      GREATEST(0, LEAST(3, COALESCE(o.main_zone_finish_early_level, o.main_zone_priority_level, 0)))::integer,
      GREATEST(0, LEAST(10, COALESCE(o.main_zone_finish_early_advanced_value, o.main_zone_priority_advanced_value, 0)))::integer
    ),
    (
      'MAIN_ZONE_KEEP_BUSY'::text,
      GREATEST(0, LEAST(3, COALESCE(o.main_zone_keep_busy_level, o.main_zone_priority_level, 0)))::integer,
      GREATEST(0, LEAST(10, COALESCE(o.main_zone_keep_busy_advanced_value, o.main_zone_priority_advanced_value, 0)))::integer
    ),
    (
      'CONTESTANT_COMPACT'::text,
      GREATEST(0, LEAST(3, COALESCE(o.contestant_compact_level, 0)))::integer,
      GREATEST(0, LEAST(10, COALESCE(o.contestant_compact_advanced_value, 0)))::integer
    ),
    (
      'GROUP_BY_SPACE_TEMPLATE_MATCH'::text,
      GREATEST(0, LEAST(3, COALESCE(o.grouping_level, CASE WHEN COALESCE(o.group_by_space_and_template, true) THEN 2 ELSE 0 END)))::integer,
      GREATEST(0, LEAST(10, COALESCE(o.grouping_advanced_value, 0)))::integer
    ),
    (
      'GROUP_BY_SPACE_ACTIVE'::text,
      GREATEST(0, LEAST(3, COALESCE(o.grouping_level, CASE WHEN COALESCE(o.group_by_space_and_template, true) THEN 2 ELSE 0 END)))::integer,
      GREATEST(0, LEAST(10, COALESCE(o.grouping_advanced_value, 0)))::integer
    ),
    (
      'CONTESTANT_STAY_IN_ZONE'::text,
      GREATEST(0, LEAST(3, COALESCE(o.contestant_stay_in_zone_level, 0)))::integer,
      GREATEST(0, LEAST(10, COALESCE(o.contestant_stay_in_zone_advanced_value, 0)))::integer
    ),
    (
      'CONTESTANT_TOTAL_SPAN'::text,
      GREATEST(0, LEAST(3, COALESCE(o.contestant_total_span_level, 0)))::integer,
      GREATEST(0, LEAST(10, COALESCE(o.contestant_total_span_advanced_value, 0)))::integer
    ),
    (
      'ARRIVAL_DEPARTURE_GROUPING'::text,
      CASE
        WHEN GREATEST(0, LEAST(10, COALESCE(o.weight_arrival_departure_grouping, 0))) <= 1 THEN 0
        WHEN GREATEST(0, LEAST(10, COALESCE(o.weight_arrival_departure_grouping, 0))) <= 4 THEN 1
        WHEN GREATEST(0, LEAST(10, COALESCE(o.weight_arrival_departure_grouping, 0))) <= 7 THEN 2
        ELSE 3
      END::integer,
      GREATEST(0, LEAST(10, COALESCE(o.weight_arrival_departure_grouping, 0)))::integer
    )
) AS heuristic(heuristic_key, basic_level, advanced_value)
WHERE o.id = 1
  AND s.source = 'LEGACY_BACKFILL'
ON CONFLICT (snapshot_id, heuristic_key) DO NOTHING;

INSERT INTO public.plan_optimizer_snapshot_grouping_zones (snapshot_id, zone_id)
SELECT s.id, grouping_zone.zone_id
FROM public.plan_optimizer_snapshots s
CROSS JOIN public.optimizer_settings o
CROSS JOIN LATERAL pg_temp.spec11_optimizer_zone_ids(to_jsonb(o) -> 'grouping_zone_ids') grouping_zone
WHERE o.id = 1
  AND s.source = 'LEGACY_BACKFILL'
  AND EXISTS (
    SELECT 1
    FROM public.plan_zone_settings z
    WHERE z.plan_id = s.plan_id AND z.zone_id = grouping_zone.zone_id
  )
ON CONFLICT (snapshot_id, zone_id) DO NOTHING;

DO $$
DECLARE
  missing_plan RECORD;
BEGIN
  FOR missing_plan IN
    SELECT p.id
    FROM public.plans p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.plan_optimizer_snapshots s WHERE s.plan_id = p.id
    )
    ORDER BY p.id
  LOOP
    RAISE WARNING 'SPEC11-010 legacy plan % has no optimizer snapshot: active transport reference or daily zone scope requires review', missing_plan.id;
  END LOOP;
END;
$$;
