CREATE OR REPLACE FUNCTION public.hhmm_to_minutes(value text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT CASE
    WHEN value ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      THEN split_part(value, ':', 1)::integer * 60 + split_part(value, ':', 2)::integer
    ELSE NULL
  END;
$$;

CREATE OR REPLACE VIEW public.plan_summaries AS
WITH task_stats AS (
  SELECT
    dt.plan_id,
    COUNT(*)::integer AS tasks_total,
    COUNT(*) FILTER (
      WHERE dt.start_planned IS NOT NULL
        AND dt.end_planned IS NOT NULL
    )::integer AS tasks_planned,
    MIN(dt.start_planned) FILTER (WHERE dt.start_planned IS NOT NULL) AS first_task_start,
    MAX(dt.end_planned) FILTER (WHERE dt.end_planned IS NOT NULL) AS last_task_end,
    COALESCE(
      SUM(
        COALESCE(
          NULLIF(dt.duration_override, 0),
          NULLIF(tt.default_duration, 0),
          0
        )
      ),
      0
    )::integer AS minutes_tasks_total
  FROM public.daily_tasks dt
  LEFT JOIN public.task_templates tt ON tt.id = dt.template_id
  GROUP BY dt.plan_id
),
contestant_stats AS (
  SELECT
    c.plan_id,
    COUNT(*)::integer AS contestants_count
  FROM public.contestants c
  GROUP BY c.plan_id
)
SELECT
  p.id AS plan_id,
  p.id,
  p.date,
  p.status,
  p.work_start,
  p.work_end,
  COALESCE(cs.contestants_count, 0)::integer AS contestants_count,
  COALESCE(ts.tasks_total, 0)::integer AS tasks_total,
  COALESCE(ts.tasks_planned, 0)::integer AS tasks_planned,
  ts.first_task_start,
  ts.last_task_end,
  COALESCE(ts.minutes_tasks_total, 0)::integer AS minutes_tasks_total,
  (public.hhmm_to_minutes(p.work_end) - public.hhmm_to_minutes(p.work_start))::integer AS available_minutes,
  CASE
    WHEN ts.first_task_start IS NULL OR ts.last_task_end IS NULL THEN NULL
    ELSE (public.hhmm_to_minutes(ts.last_task_end) - public.hhmm_to_minutes(ts.first_task_start))::integer
  END AS real_span_minutes,
  CASE
    WHEN (public.hhmm_to_minutes(p.work_end) - public.hhmm_to_minutes(p.work_start)) > 0
      THEN ROUND((COALESCE(ts.minutes_tasks_total, 0)::numeric * 100.0)
        / (public.hhmm_to_minutes(p.work_end) - public.hhmm_to_minutes(p.work_start)), 2)
    ELSE NULL
  END AS occupancy_available_pct,
  CASE
    WHEN ts.first_task_start IS NOT NULL
      AND ts.last_task_end IS NOT NULL
      AND (public.hhmm_to_minutes(ts.last_task_end) - public.hhmm_to_minutes(ts.first_task_start)) > 0
      THEN ROUND((COALESCE(ts.minutes_tasks_total, 0)::numeric * 100.0)
        / (public.hhmm_to_minutes(ts.last_task_end) - public.hhmm_to_minutes(ts.first_task_start)), 2)
    ELSE NULL
  END AS occupancy_real_pct
FROM public.plans p
LEFT JOIN task_stats ts ON ts.plan_id = p.id
LEFT JOIN contestant_stats cs ON cs.plan_id = p.id;
