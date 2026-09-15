-- ASST-007: authoritative manual-draft provenance and persistent edit undo/redo.
CREATE OR REPLACE FUNCTION public.assisted_patch_draft(p_plan_id integer,p_expected_fingerprint text,p_expected_base bigint,p_snapshot jsonb,p_fingerprint text)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; changed_ids jsonb; forward_rows jsonb; inverse_rows jsonb; trace jsonb;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 IF jsonb_typeof(p_snapshot->'tasks') IS DISTINCT FROM 'array' OR
   (SELECT array_agg((x->>'taskId')::integer ORDER BY (x->>'taskId')::integer) FROM jsonb_array_elements(p_snapshot->'tasks') x)
   IS DISTINCT FROM
   (SELECT array_agg((x->>'taskId')::integer ORDER BY (x->>'taskId')::integer) FROM jsonb_array_elements(s.draft_snapshot_json->'tasks') x)
 THEN RAISE EXCEPTION 'TASK_SET_MISMATCH'; END IF;
 SELECT coalesce(jsonb_agg((next->>'taskId')::integer ORDER BY (next->>'taskId')::integer),'[]'::jsonb),
        coalesce(jsonb_agg(next ORDER BY (next->>'taskId')::integer),'[]'::jsonb),
        coalesce(jsonb_agg(previous ORDER BY (previous->>'taskId')::integer),'[]'::jsonb)
 INTO changed_ids,forward_rows,inverse_rows
 FROM jsonb_array_elements(p_snapshot->'tasks') next
 JOIN jsonb_array_elements(s.draft_snapshot_json->'tasks') previous ON previous->>'taskId'=next->>'taskId'
 WHERE next IS DISTINCT FROM previous;
 IF coalesce(p_snapshot->'planningBlocks','[]'::jsonb) IS DISTINCT FROM coalesce(s.draft_snapshot_json->'planningBlocks','[]'::jsonb) THEN
   SELECT (SELECT coalesce(jsonb_agg(DISTINCT id ORDER BY id),'[]'::jsonb) FROM (
     SELECT (id#>>'{}')::integer id FROM jsonb_array_elements(changed_ids) id
     UNION
     SELECT (member#>>'{}')::integer id FROM jsonb_array_elements(coalesce(p_snapshot->'planningBlocks','[]')) block,
       jsonb_array_elements(block->'memberTaskIds') member
     UNION
     SELECT (member#>>'{}')::integer id FROM jsonb_array_elements(coalesce(s.draft_snapshot_json->'planningBlocks','[]')) block,
       jsonb_array_elements(block->'memberTaskIds') member) members) INTO changed_ids;
 END IF;
 IF jsonb_array_length(changed_ids)=0 THEN RAISE EXCEPTION 'VALIDATION_REQUIRED'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot->'tasks') next
   JOIN jsonb_array_elements(s.draft_snapshot_json->'tasks') previous ON previous->>'taskId'=next->>'taskId'
   WHERE next IS DISTINCT FROM previous AND
    (next-'startPlanned'-'endPlanned') IS DISTINCT FROM (previous-'startPlanned'-'endPlanned'))
 THEN RAISE EXCEPTION 'UNSUPPORTED_MANUAL_FIELD'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot->'tasks') next
   JOIN jsonb_array_elements(s.draft_snapshot_json->'tasks') previous ON previous->>'taskId'=next->>'taskId'
   WHERE next IS DISTINCT FROM previous AND (
    ((next->'startPlanned'='null'::jsonb) IS DISTINCT FROM (next->'endPlanned'='null'::jsonb)) OR
    (next->'startPlanned'='null'::jsonb AND NOT EXISTS (
      SELECT 1 FROM public.assisted_planning_stages base_stage,
        jsonb_array_elements(base_stage.snapshot_json->'tasks') base_task
      WHERE base_stage.id=s.draft_base_stage_id AND base_task->>'taskId'=next->>'taskId'
        AND base_task->'startPlanned'='null'::jsonb AND base_task->'endPlanned'='null'::jsonb)) OR
    (next->'startPlanned'<>'null'::jsonb AND ((next->>'endPlanned')::time-(next->>'startPlanned')::time IS DISTINCT FROM
      (previous->>'endPlanned')::time-(previous->>'startPlanned')::time))))
 THEN RAISE EXCEPTION 'INVALID_MANUAL_DURATION'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(changed_ids) x JOIN public.daily_tasks t ON t.id=(x#>>'{}')::integer
   WHERE t.plan_id=p_plan_id AND t.status NOT IN ('pending','interrupted')) THEN RAISE EXCEPTION 'IMMUTABLE_TASK'; END IF;
 trace:=coalesce(s.draft_scope_json,'{}'::jsonb);
 trace:=trace || jsonb_build_object('editKind','MANUAL','originProposalRunId',coalesce(trace->'originProposalRunId',trace->'proposalRunId'),
   'originalScope',coalesce(trace->'originalScope',trace-'proposalRunId'-'editLedger'-'redoLedger'),
   'manualTouchedTaskIds',(SELECT coalesce(jsonb_agg(DISTINCT id ORDER BY id),'[]'::jsonb) FROM
      (SELECT (x#>>'{}')::integer id FROM jsonb_array_elements(coalesce(trace->'manualTouchedTaskIds','[]')) x
       UNION SELECT (x#>>'{}')::integer FROM jsonb_array_elements(changed_ids) x) touched),
   'editLedger',coalesce(trace->'editLedger','[]') || jsonb_build_array(jsonb_build_object(
     'beforeFingerprint',s.draft_fingerprint,'afterFingerprint',p_fingerprint,'forward',forward_rows,'inverse',inverse_rows,
     'forwardBlocks',coalesce(p_snapshot->'planningBlocks','[]'::jsonb),'inverseBlocks',coalesce(s.draft_snapshot_json->'planningBlocks','[]'::jsonb),
     'forwardHasBlocks',p_snapshot ? 'planningBlocks','inverseHasBlocks',s.draft_snapshot_json ? 'planningBlocks')),
   'redoLedger','[]'::jsonb)-'proposalRunId';
 UPDATE public.assisted_planning_sessions SET draft_snapshot_json=p_snapshot,draft_fingerprint=p_fingerprint,
   draft_scope_json=trace,draft_validation_id=NULL,updated_at=now() WHERE id=s.id;
 RETURN s.id;
END $$;

REVOKE ALL ON FUNCTION public.assisted_patch_draft(integer,text,bigint,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.assisted_patch_draft(integer,text,bigint,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.assisted_move_draft_edit(p_plan_id integer,p_expected_fingerprint text,p_expected_base bigint,p_redo boolean)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; trace jsonb; source jsonb; operation jsonb; next_snapshot jsonb; next_fingerprint text;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 trace:=coalesce(s.draft_scope_json,'{}'::jsonb); source:=coalesce(trace->(CASE WHEN p_redo THEN 'redoLedger' ELSE 'editLedger' END),'[]'::jsonb);
 IF jsonb_array_length(source)=0 THEN RAISE EXCEPTION USING MESSAGE=CASE WHEN p_redo THEN 'NO_REDO_AVAILABLE' ELSE 'NO_UNDO_AVAILABLE' END; END IF;
 operation:=source->(jsonb_array_length(source)-1); next_snapshot:=s.draft_snapshot_json;
 IF jsonb_typeof(operation) IS DISTINCT FROM 'object'
   OR coalesce(operation->>'beforeFingerprint','') !~ '^[0-9a-f]{64}$'
   OR coalesce(operation->>'afterFingerprint','') !~ '^[0-9a-f]{64}$'
   OR jsonb_typeof(operation->'forward') IS DISTINCT FROM 'array'
   OR jsonb_typeof(operation->'inverse') IS DISTINCT FROM 'array'
   OR s.draft_fingerprint IS DISTINCT FROM operation->>(CASE WHEN p_redo THEN 'beforeFingerprint' ELSE 'afterFingerprint' END)
 THEN RAISE EXCEPTION 'CORRUPT_EDIT_LEDGER'; END IF;
 SELECT jsonb_set(next_snapshot,'{tasks}',jsonb_agg(coalesce(patch.row,current.row) ORDER BY (current.row->>'taskId')::integer)) INTO next_snapshot
 FROM jsonb_array_elements(next_snapshot->'tasks') current(row)
 LEFT JOIN jsonb_array_elements(operation->(CASE WHEN p_redo THEN 'forward' ELSE 'inverse' END)) patch(row)
   ON patch.row->>'taskId'=current.row->>'taskId';
 IF operation ? (CASE WHEN p_redo THEN 'forwardHasBlocks' ELSE 'inverseHasBlocks' END) THEN
   IF (operation->>(CASE WHEN p_redo THEN 'forwardHasBlocks' ELSE 'inverseHasBlocks' END))::boolean THEN
     next_snapshot:=jsonb_set(next_snapshot,'{planningBlocks}',operation->(CASE WHEN p_redo THEN 'forwardBlocks' ELSE 'inverseBlocks' END),true);
   ELSE next_snapshot:=next_snapshot-'planningBlocks'; END IF;
 END IF;
 next_fingerprint:=operation->>(CASE WHEN p_redo THEN 'afterFingerprint' ELSE 'beforeFingerprint' END);
 trace:=jsonb_set(trace,ARRAY[CASE WHEN p_redo THEN 'redoLedger' ELSE 'editLedger' END],source-(jsonb_array_length(source)-1));
 trace:=jsonb_set(trace,ARRAY[CASE WHEN p_redo THEN 'editLedger' ELSE 'redoLedger' END],
   coalesce(trace->(CASE WHEN p_redo THEN 'editLedger' ELSE 'redoLedger' END),'[]'::jsonb)||jsonb_build_array(operation));
 UPDATE public.assisted_planning_sessions SET draft_snapshot_json=next_snapshot,draft_fingerprint=next_fingerprint,
   draft_scope_json=trace,draft_validation_id=NULL,updated_at=now() WHERE id=s.id;
 RETURN s.id;
END $$;

CREATE OR REPLACE FUNCTION public.assisted_record_manual_clean_validation(p_plan_id integer,p_expected_fingerprint text,p_expected_base bigint,p_expected_config bigint,p_report jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; validation_id bigint;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.current_config_revision_id<>p_expected_config THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
 IF s.draft_scope_json->>'editKind' IS DISTINCT FROM 'MANUAL' THEN RAISE EXCEPTION 'VALIDATION_REQUIRED'; END IF;
 IF p_report->>'mode' IS DISTINCT FROM 'MANUAL_DELTA_CLEAN_V1' OR p_report->>'completeForScope' IS DISTINCT FROM 'true'
  OR p_report->>'protectedPlacementsPreserved' IS DISTINCT FROM 'true' OR p_report->>'hardValid' IS DISTINCT FROM 'true'
  OR p_report->>'requiredValid' IS DISTINCT FROM 'true' OR p_report->>'futureFullDayFeasibility' IS DISTINCT FROM 'NOT_CERTIFIED'
 THEN RAISE EXCEPTION 'VALIDATION_NOT_ACCEPTABLE'; END IF;
 INSERT INTO public.planning_stage_validations(plan_id,session_id,base_stage_id,draft_fingerprint,config_revision_id,hard_count,required_count,preferred_count,report_json)
 VALUES(p_plan_id,s.id,s.draft_base_stage_id,s.draft_fingerprint,s.current_config_revision_id,0,0,0,p_report) RETURNING id INTO validation_id;
 UPDATE public.assisted_planning_sessions SET draft_validation_id=validation_id,updated_at=now() WHERE id=s.id;
 RETURN validation_id;
END $$;
REVOKE ALL ON FUNCTION public.assisted_move_draft_edit(integer,text,bigint,boolean), public.assisted_record_manual_clean_validation(integer,text,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.assisted_move_draft_edit(integer,text,bigint,boolean), public.assisted_record_manual_clean_validation(integer,text,bigint,bigint,jsonb) TO service_role;
