-- A2 UI-only palette recovery from already-configured Legacy task families.
-- The 31 imported canonical A2 templates were created with NULL ui_color and
-- ui_color_secondary. PlanningTimeline intentionally uses the same palette
-- renderer for Legacy and Assisted, so the A2 cards appeared uncolored.
--
-- Applies ONLY to the 31 imported A2 template IDs in this known demo dataset;
-- copies existing operator-configured colors, never changes historical defaults.
-- This is visual metadata: effective operational snapshots do not carry UI color.
-- Manual operation; not run by app startup. Keep audit of affected rows.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE _a2_ui_palette_mapping (
  a2_id integer PRIMARY KEY,
  legacy_id integer NOT NULL
) ON COMMIT DROP;
INSERT INTO _a2_ui_palette_mapping(a2_id,legacy_id) VALUES
  (20001, 21),
  (20002, 21),
  (20003, 2),
  (20004, 32),
  (20005, 34),
  (20006, 33),
  (20007, 17),
  (20008, 13),
  (20009, 16),
  (20010, 29),
  (20011, 18),
  (20012, 35),
  (20013, 27),
  (20014, 28),
  (20015, 19),
  (20016, 5),
  (20017, 4),
  (20018, 21),
  (20019, 2),
  (20020, 21),
  (20021, 21),
  (20022, 21),
  (20023, 21),
  (20024, 21),
  (20025, 21),
  (20026, 12),
  (20027, 3),
  (20028, 14),
  (20029, 30),
  (20030, 31),
  (20031, 30);

CREATE TEMP TABLE _a2_legacy_ui_unchanged ON COMMIT DROP AS
  SELECT id, to_jsonb(t) AS before_row FROM public.task_templates t
  WHERE id NOT IN (SELECT a2_id FROM _a2_ui_palette_mapping);

DO $$ BEGIN
  IF (SELECT count(*) FROM _a2_ui_palette_mapping) <> 31
     OR (SELECT count(*) FROM public.plans WHERE id=27001 AND date='2026-10-30') <> 1
     OR (SELECT count(*) FROM public.daily_tasks WHERE plan_id=27001) <> 266
     OR (SELECT count(*) FROM public.task_templates t
         JOIN _a2_ui_palette_mapping m ON m.a2_id=t.id) <> 31
     OR (SELECT count(*) FROM public.task_templates t
         JOIN _a2_ui_palette_mapping m ON m.legacy_id=t.id
         WHERE t.ui_color IS NOT NULL) <> 31
  THEN RAISE EXCEPTION 'A2_UI_PALETTE_TARGET_NOT_VERIFIED'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.task_templates a
    JOIN _a2_ui_palette_mapping m ON m.a2_id=a.id
    JOIN public.task_templates old ON old.id=m.legacy_id
    WHERE a.ui_color IS NOT NULL AND
      (a.ui_color IS DISTINCT FROM old.ui_color OR
       a.ui_color_secondary IS DISTINCT FROM old.ui_color_secondary)
  ) THEN RAISE EXCEPTION 'A2_UI_PALETTE_OPERATOR_OVERRIDE_PRESENT'; END IF;
END $$;

UPDATE public.task_templates a
SET ui_color = old.ui_color, ui_color_secondary = old.ui_color_secondary
FROM _a2_ui_palette_mapping m
JOIN public.task_templates old ON old.id=m.legacy_id
WHERE a.id=m.a2_id AND a.ui_color IS NULL;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM _a2_legacy_ui_unchanged before
    LEFT JOIN public.task_templates t ON t.id=before.id
    WHERE t.id IS NULL OR to_jsonb(t) IS DISTINCT FROM before.before_row
  ) THEN RAISE EXCEPTION 'A2_UI_PALETTE_HISTORICAL_TEMPLATES_CHANGED'; END IF;
  IF EXISTS (
    SELECT 1 FROM _a2_ui_palette_mapping m
    JOIN public.task_templates a ON a.id=m.a2_id
    JOIN public.task_templates old ON old.id=m.legacy_id
    WHERE a.ui_color IS DISTINCT FROM old.ui_color OR
          a.ui_color_secondary IS DISTINCT FROM old.ui_color_secondary
  ) THEN RAISE EXCEPTION 'A2_UI_PALETTE_MISMATCH'; END IF;
END $$;
SELECT json_build_object(
  'a2_template_colors', (SELECT count(*) FROM public.task_templates t
     JOIN _a2_ui_palette_mapping m ON m.a2_id=t.id WHERE t.ui_color IS NOT NULL),
  'a2_tasks_with_colors', (SELECT count(*) FROM public.daily_tasks dt
     JOIN public.task_templates t ON t.id=dt.template_id
     WHERE dt.plan_id=27001 AND t.ui_color IS NOT NULL),
  'historic_template_count', (SELECT count(*) FROM _a2_legacy_ui_unchanged)
) AS verification;
COMMIT;
