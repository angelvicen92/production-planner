-- P0-G03b: phases + flexible individual meals, without opening joint admission.
-- Extend the existing global witness consumer; no scheduler, RPC or grants.
DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_technical_chains(integer,jsonb)'::regprocedure);
 needle:='p.meal_mode IS DISTINCT FROM ''global_hard_break''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'FLEXIBLE_PHASE_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'(coalesce(p.meal_mode,'''') NOT IN (''global_hard_break'',''flexible_meal_window'')
    OR (p.meal_mode=''flexible_meal_window'' AND coalesce(p.daily_joint_groups->''groups'',''[]'')<>''[]''))');
 EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_anchored_choice_witness(integer,jsonb,bigint)'::regprocedure);
 -- 121 already authenticates identity, completeness, windows, duration, locks,
 -- dependencies and capacity, then adds participant occupations to the shared
 -- physical validator. Phases must enter that channel without a dummy pause.
 needle:='coalesce(p.daily_operational_meal_policies->''policies'',''[]'')<>''[]'' AND p.meal_mode=''flexible_meal_window''';
 IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>3
 THEN RAISE EXCEPTION 'FLEXIBLE_PHASE_WITNESS_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'(coalesce(p.daily_operational_meal_policies->''policies'',''[]'')<>''[]'' OR p.daily_technical_chains#>''{policies,0,phases}'' IS NOT NULL) AND p.meal_mode=''flexible_meal_window''');
 -- These virtual occupations have no physical location/transition. Match the
 -- participantMeals/108 contract: no overlap, plus dependencies and capacity.
 -- Productive task pairs keep their complete effective margin calculation.
 needle:='IF gap<participant_margin THEN RAISE EXCEPTION ''ANCHORED_WITNESS_PARTICIPANT_CONFLICT''; END IF;';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'FLEXIBLE_PHASE_PARTICIPANT_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'IF gap<(CASE WHEN item->>''kind''=''participant-meal'' OR other->>''kind''=''participant-meal'' THEN 0 ELSE participant_margin END) THEN RAISE EXCEPTION ''ANCHORED_WITNESS_PARTICIPANT_CONFLICT''; END IF;');
 EXECUTE definition;
END $migration$;
