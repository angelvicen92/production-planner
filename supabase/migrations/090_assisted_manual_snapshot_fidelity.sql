-- Manual operations can edit task times and planning blocks only.
-- All other snapshot fields are immutable across patch and its task/block ledger.
CREATE OR REPLACE FUNCTION public.assisted_patch_draft(p_plan_id integer,p_expected_fingerprint text,p_expected_base bigint,p_snapshot jsonb,p_fingerprint text)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; changed_ids jsonb; forward_rows jsonb; inverse_rows jsonb; trace jsonb;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 IF (p_snapshot-'tasks'-'planningBlocks') IS DISTINCT FROM
    (s.draft_snapshot_json-'tasks'-'planningBlocks')
 THEN RAISE EXCEPTION 'UNSUPPORTED_MANUAL_FIELD'; END IF;
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
