-- P0-U02b: admit native Main/Vocal alongside fixed physical REQUIRED phases.
-- Literal body edits preserve ownership, SECURITY INVOKER, search_path and ACLs.
DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_technical_chains(integer,jsonb)'::regprocedure);
 needle:='p.planner_next_profile#>>''{configuration,scenario}'' IS DISTINCT FROM ''STANDALONE_ONLY''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'MAIN_PHASE_COMPOSITION_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'(coalesce(p.planner_next_profile#>>''{configuration,scenario}'','''') NOT IN (''STANDALONE_ONLY'',''MAIN_WITH_VOCAL_FEEDER'') OR p.planner_next_profile#>>''{configuration,searchPolicy}'' IS DISTINCT FROM ''EXACT_CONSTRUCTIVE'')');
 EXECUTE definition;
END $migration$;
DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_joint_groups(integer,jsonb)'::regprocedure);
 needle:='p.planner_next_profile#>>''{configuration,scenario}'' IS DISTINCT FROM ''STANDALONE_ONLY''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'MAIN_PHASE_COMPOSITION_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'(coalesce(p.planner_next_profile#>>''{configuration,scenario}'','''') NOT IN (''STANDALONE_ONLY'',''MAIN_WITH_VOCAL_FEEDER'') OR p.planner_next_profile#>>''{configuration,searchPolicy}'' IS DISTINCT FROM ''EXACT_CONSTRUCTIVE'')');
 EXECUTE definition;
END $migration$;
