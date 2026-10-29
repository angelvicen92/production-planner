-- P0-G03e: admit flexible meals only with the existing REQUIRED phase witness.
-- Preserve the physical consumers, versioned writer, ownership and ACLs.
DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_joint_groups(integer,jsonb)'::regprocedure);
 needle:='p.meal_mode<>''global_hard_break''';
 IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1
 THEN RAISE EXCEPTION 'JOINT_FLEXIBLE_PHASE_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'(coalesce(p.meal_mode,'''') NOT IN (''global_hard_break'',''flexible_meal_window'')
   OR (p.meal_mode=''flexible_meal_window'' AND (p.daily_technical_chains#>''{policies,0,phases}'' IS NULL
    OR coalesce(p.daily_anchored_accompaniments->''policies'',''[]'')<>''[]'' OR coalesce(p.daily_task_operation_scopes->''policies'',''[]'')<>''[]''
    OR coalesce(p.daily_operational_meal_policies->''policies'',''[]'')<>''[]'' OR coalesce(p.daily_resource_route_transitions->''routes'',''[]'')<>''[]'')))');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.assert_daily_technical_chains(integer,jsonb)'::regprocedure);
 needle:='(coalesce(p.meal_mode,'''') NOT IN (''global_hard_break'',''flexible_meal_window'')
    OR (p.meal_mode=''flexible_meal_window'' AND coalesce(p.daily_joint_groups->''groups'',''[]'')<>''[]''))';
 IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1
 THEN RAISE EXCEPTION 'PHASE_JOINT_FLEXIBLE_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'(coalesce(p.meal_mode,'''') NOT IN (''global_hard_break'',''flexible_meal_window'')
    OR (p.meal_mode=''flexible_meal_window'' AND coalesce(p.daily_joint_groups->''groups'',''[]'')<>''[]'' AND (
     coalesce(p.daily_anchored_accompaniments->''policies'',''[]'')<>''[]'' OR coalesce(p.daily_task_operation_scopes->''policies'',''[]'')<>''[]''
     OR coalesce(p.daily_operational_meal_policies->''policies'',''[]'')<>''[]'' OR coalesce(p.daily_resource_route_transitions->''routes'',''[]'')<>''[]'')))');
 EXECUTE definition;
END $migration$;
