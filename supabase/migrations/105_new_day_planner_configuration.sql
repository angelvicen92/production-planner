-- Additive opt-in authority. No rewrite/backfill of historical days or 088 JSON.
CREATE TABLE public.new_day_planner_configuration (
 id integer PRIMARY KEY CHECK (id=1),
 revision integer NOT NULL DEFAULT 0 CHECK (revision>=0),
 configuration jsonb,
 CHECK (configuration IS NULL OR ((jsonb_typeof(configuration)='object' AND configuration->>'contractVersion'='1') IS TRUE))
);
INSERT INTO public.new_day_planner_configuration(id) VALUES (1);
ALTER TABLE public.new_day_planner_configuration ENABLE ROW LEVEL SECURITY;
-- All access goes through the authenticated HTTP boundary. No client writes.
REVOKE ALL ON public.new_day_planner_configuration FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE ON public.new_day_planner_configuration TO service_role;

ALTER TABLE public.plans ADD COLUMN planner_next_profile jsonb;
ALTER TABLE public.plan_task_template_snapshots ADD COLUMN planner_next_operation jsonb;
ALTER TABLE public.plans ADD CONSTRAINT planner_next_profile_shape CHECK (
 planner_next_profile IS NULL OR ((jsonb_typeof(planner_next_profile)='object' AND planner_next_profile->>'contractVersion'='1') IS TRUE)
);
ALTER TABLE public.plans ADD CONSTRAINT planner_next_single_authority CHECK (
 planner_next_profile IS NULL OR planner_next_configuration IS NULL
);
ALTER TABLE public.plan_task_template_snapshots ADD CONSTRAINT planner_next_operation_shape CHECK (
 planner_next_operation IS NULL OR (jsonb_typeof(planner_next_operation)='object' AND planner_next_operation->>'contractVersion'='1'
 AND planner_next_operation->>'kind' IN ('main','vocal','auxiliary','technical')) IS TRUE
);
CREATE FUNCTION public.preserve_new_day_planner_profile() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.planner_next_profile IS DISTINCT FROM OLD.planner_next_profile THEN
  RAISE EXCEPTION 'PLANNER_NEXT_PROFILE_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_new_day_planner_profile BEFORE UPDATE ON public.plans
 FOR EACH ROW EXECUTE FUNCTION public.preserve_new_day_planner_profile();
REVOKE ALL ON FUNCTION public.preserve_new_day_planner_profile() FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the new optional template authority through the existing authorized,
-- versioned refresh. The prior writer still owns all checks and transaction locks.
ALTER FUNCTION public.assisted_apply_config_refresh(integer,uuid,bigint,jsonb,jsonb,jsonb) RENAME TO assisted_apply_config_refresh_v2;
CREATE FUNCTION public.assisted_apply_config_refresh(p_plan_id integer,p_user_id uuid,p_expected_revision bigint,p_identity jsonb,p_replay jsonb,p_diff jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result bigint;
BEGIN
 result:=public.assisted_apply_config_refresh_v2(p_plan_id,p_user_id,p_expected_revision,p_identity,p_replay,p_diff);
 UPDATE public.plan_task_template_snapshots s SET planner_next_operation=nullif(item->'plannerNextOperation','null'::jsonb)
 FROM jsonb_array_elements(p_replay->'taskTemplateSnapshots') item
 WHERE s.plan_id=p_plan_id AND s.source_template_id=(item->>'sourceTemplateId')::integer;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.assisted_apply_config_refresh(integer,uuid,bigint,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assisted_apply_config_refresh(integer,uuid,bigint,jsonb,jsonb,jsonb) TO service_role;
