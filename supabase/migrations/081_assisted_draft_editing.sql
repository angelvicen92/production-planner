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
 IF jsonb_array_length(changed_ids)=0 THEN RAISE EXCEPTION 'VALIDATION_REQUIRED'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot->'tasks') next
   JOIN jsonb_array_elements(s.draft_snapshot_json->'tasks') previous ON previous->>'taskId'=next->>'taskId'
   WHERE next IS DISTINCT FROM previous AND
    (next-'startPlanned'-'endPlanned') IS DISTINCT FROM (previous-'startPlanned'-'endPlanned'))
 THEN RAISE EXCEPTION 'UNSUPPORTED_MANUAL_FIELD'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot->'tasks') next
   JOIN jsonb_array_elements(s.draft_snapshot_json->'tasks') previous ON previous->>'taskId'=next->>'taskId'
   WHERE next IS DISTINCT FROM previous AND
    ((next->>'startPlanned')::time IS NULL OR (next->>'endPlanned')::time IS NULL OR
     (next->>'endPlanned')::time-(next->>'startPlanned')::time IS DISTINCT FROM
     (previous->>'endPlanned')::time-(previous->>'startPlanned')::time))
 THEN RAISE EXCEPTION 'INVALID_MANUAL_DURATION'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(changed_ids) x JOIN public.daily_tasks t ON t.id=(x#>>'{}')::integer
   WHERE t.plan_id=p_plan_id AND t.status NOT IN ('pending','interrupted')) THEN RAISE EXCEPTION 'IMMUTABLE_TASK'; END IF;
 trace:=coalesce(s.draft_scope_json,'{}'::jsonb);
 trace:=trace || jsonb_build_object('editKind','MANUAL','originProposalRunId',coalesce(trace->'originProposalRunId',trace->'proposalRunId'),
   'originalScope',coalesce(trace->'originalScope',trace-'proposalRunId'-'editLedger'-'redoLedger'),
   'manualTouchedTaskIds',(SELECT coalesce(jsonb_agg(DISTINCT id ORDER BY id),'[]'::jsonb) FROM
      (SELECT (x#>>'{}')::integer id FROM jsonb_array_elements(coalesce(trace->'manualTouchedTaskIds','[]')) x
       UNION SELECT (x#>>'{}')::integer FROM jsonb_array_elements(changed_ids) x) touched),
   'editLedger',coalesce(trace->'editLedger','[]') || jsonb_build_array(jsonb_build_object('forward',forward_rows,'inverse',inverse_rows)),
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
 SELECT jsonb_set(next_snapshot,'{tasks}',jsonb_agg(coalesce(patch.row,current.row) ORDER BY (current.row->>'taskId')::integer)) INTO next_snapshot
 FROM jsonb_array_elements(next_snapshot->'tasks') current(row)
 LEFT JOIN jsonb_array_elements(operation->(CASE WHEN p_redo THEN 'forward' ELSE 'inverse' END)) patch(row)
   ON patch.row->>'taskId'=current.row->>'taskId';
 next_fingerprint:=encode(extensions.digest(convert_to(next_snapshot::text,'UTF8'),'sha256'),'hex');
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
