-- P0-U01d: explicit empty common identity set for phased REQUIRED chains.
-- Preserve the linear branch, source authentication and every physical check.
-- Replacing existing bodies preserves their owner, ACL and invoker settings.
DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_technical_chains(integer,jsonb)'::regprocedure);
 needle:='OR jsonb_typeof(policy->''requiredResourceIds'') IS DISTINCT FROM ''array'' OR jsonb_array_length(policy->''requiredResourceIds'')=0';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'EMPTY_PHASE_UNEXPECTED_AUTHORITY'; END IF;
 definition:=replace(definition,needle,'OR jsonb_typeof(policy->''requiredResourceIds'') IS DISTINCT FROM ''array''');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.assert_daily_technical_chain_snapshot(integer,jsonb,bigint,bigint)'::regprocedure);
 needle:='IF NOT (row->''requiredResourceIds'') @> (SELECT jsonb_agg(''plan-resource:''||v) FROM jsonb_array_elements_text(policy->''requiredResourceIds'') v)';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'EMPTY_PHASE_UNEXPECTED_SNAPSHOT_CONSUMER'; END IF;
 -- jsonb_agg over zero rows is SQL NULL. The declared set is [], and the
 -- tasks with no resources may omit their optional array. Physical equality is checked upstream
 -- by assert_anchored_choice_witness, including omitted or invented resources.
 definition:=replace(definition,needle,'IF NOT coalesce(row->''requiredResourceIds'',''[]''::jsonb) @> (SELECT coalesce(jsonb_agg(''plan-resource:''||v),''[]''::jsonb) FROM jsonb_array_elements_text(policy->''requiredResourceIds'') v)');
 EXECUTE definition;
END $migration$;
