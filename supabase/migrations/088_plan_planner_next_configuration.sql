-- Prepared for an explicitly approved independent demo project. Never applied by the importer.
-- NULL preserves existing days and their current engine behavior.
ALTER TABLE public.plans ADD COLUMN planner_next_configuration jsonb;
ALTER TABLE public.plans ADD CONSTRAINT plans_planner_next_configuration_shape CHECK (
 planner_next_configuration IS NULL OR
 (jsonb_typeof(planner_next_configuration)='object' AND
  planner_next_configuration->>'contractVersion'='1' AND
  jsonb_typeof(planner_next_configuration->'taskOperations')='array')
);
-- No route edits this contract. Future configuration editing needs an explicit
-- revision/refresh design; ordinary status/current-revision updates stay allowed.
CREATE FUNCTION public.preserve_plan_planner_next_configuration() RETURNS trigger
 LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.planner_next_configuration IS DISTINCT FROM OLD.planner_next_configuration THEN
  RAISE EXCEPTION 'PLANNER_NEXT_CONFIGURATION_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_plan_planner_next_configuration BEFORE UPDATE ON public.plans
 FOR EACH ROW EXECUTE FUNCTION public.preserve_plan_planner_next_configuration();
REVOKE ALL ON FUNCTION public.preserve_plan_planner_next_configuration() FROM PUBLIC,anon,authenticated;
