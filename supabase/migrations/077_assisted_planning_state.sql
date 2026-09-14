-- ASST-003: immutable configuration/stage history and mutable assisted draft state.
CREATE OR REPLACE FUNCTION public.is_positive_integer_jsonb_array(value JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item JSONB; BEGIN
  IF jsonb_typeof(value) <> 'array' THEN RETURN false; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
    IF jsonb_typeof(item) <> 'number' OR (item #>> '{}') !~ '^[1-9][0-9]*$' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
CREATE TABLE public.plan_config_revisions (
  id BIGSERIAL PRIMARY KEY, plan_id INTEGER NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  parent_revision_id BIGINT, source TEXT NOT NULL CHECK (length(btrim(source)) > 0),
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  identity_json JSONB NOT NULL CHECK (jsonb_typeof(identity_json) = 'object' AND identity_json->>'contractVersion' = '1'
    AND identity_json->>'configurationFingerprint' = fingerprint AND (identity_json->>'planId')::INTEGER = plan_id),
  replay_snapshot_json JSONB NOT NULL CHECK (jsonb_typeof(replay_snapshot_json) = 'object' AND replay_snapshot_json->>'contractVersion' = '1'),
  diff_json JSONB CHECK (diff_json IS NULL OR jsonb_typeof(diff_json) = 'object'),
  created_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, plan_id),
  CONSTRAINT plan_config_revisions_parent_fk FOREIGN KEY (parent_revision_id, plan_id)
    REFERENCES public.plan_config_revisions(id, plan_id)
);

CREATE TABLE public.assisted_planning_sessions (
  id BIGSERIAL PRIMARY KEY, plan_id INTEGER NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CLOSED', 'ABANDONED')),
  active_stage_id BIGINT, draft_base_stage_id BIGINT,
  current_config_revision_id BIGINT NOT NULL,
  draft_scope_json JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(draft_scope_json) = 'object'),
  draft_snapshot_json JSONB NOT NULL CHECK (jsonb_typeof(draft_snapshot_json) = 'object' AND draft_snapshot_json->>'contractVersion' = '1'),
  draft_fingerprint TEXT NOT NULL CHECK (draft_fingerprint ~ '^[0-9a-f]{64}$'), draft_validation_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, plan_id),
  CONSTRAINT assisted_sessions_config_fk FOREIGN KEY (current_config_revision_id, plan_id)
    REFERENCES public.plan_config_revisions(id, plan_id)
);
CREATE UNIQUE INDEX assisted_planning_sessions_one_active_per_plan
  ON public.assisted_planning_sessions(plan_id) WHERE status = 'ACTIVE';

CREATE TABLE public.assisted_planning_stages (
  id BIGSERIAL PRIMARY KEY, session_id BIGINT NOT NULL, plan_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0), parent_stage_id BIGINT,
  scope_json JSONB NOT NULL CHECK (jsonb_typeof(scope_json) = 'object'),
  scope_task_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (public.is_positive_integer_jsonb_array(scope_task_ids_json)),
  include_prerequisites BOOLEAN NOT NULL DEFAULT false,
  config_revision_id BIGINT NOT NULL, proposal_run_id BIGINT REFERENCES public.planning_runs(id),
  snapshot_json JSONB NOT NULL CHECK (jsonb_typeof(snapshot_json) = 'object' AND snapshot_json->>'contractVersion' = '1'),
  snapshot_fingerprint TEXT NOT NULL CHECK (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  validation_summary_json JSONB NOT NULL CHECK (jsonb_typeof(validation_summary_json) = 'object'),
  accepted_by UUID NOT NULL REFERENCES auth.users(id), accepted_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, ordinal), UNIQUE (id, session_id, plan_id), UNIQUE (id, plan_id),
  CONSTRAINT assisted_stages_session_fk FOREIGN KEY (session_id, plan_id)
    REFERENCES public.assisted_planning_sessions(id, plan_id) ON DELETE CASCADE,
  CONSTRAINT assisted_stages_parent_fk FOREIGN KEY (parent_stage_id, session_id, plan_id)
    REFERENCES public.assisted_planning_stages(id, session_id, plan_id),
  CONSTRAINT assisted_stages_config_fk FOREIGN KEY (config_revision_id, plan_id)
    REFERENCES public.plan_config_revisions(id, plan_id)
);

CREATE TABLE public.planning_stage_validations (
  id BIGSERIAL PRIMARY KEY, plan_id INTEGER NOT NULL, session_id BIGINT NOT NULL, base_stage_id BIGINT,
  draft_fingerprint TEXT NOT NULL CHECK (draft_fingerprint ~ '^[0-9a-f]{64}$'), config_revision_id BIGINT NOT NULL,
  hard_count INTEGER NOT NULL CHECK (hard_count >= 0), required_count INTEGER NOT NULL CHECK (required_count >= 0),
  preferred_count INTEGER NOT NULL CHECK (preferred_count >= 0),
  report_json JSONB NOT NULL CHECK (jsonb_typeof(report_json) = 'object'), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, session_id, plan_id), UNIQUE (id, session_id, plan_id, draft_fingerprint, config_revision_id),
  CONSTRAINT stage_validations_session_fk FOREIGN KEY (session_id, plan_id) REFERENCES public.assisted_planning_sessions(id, plan_id) ON DELETE CASCADE,
  CONSTRAINT stage_validations_base_fk FOREIGN KEY (base_stage_id, session_id, plan_id) REFERENCES public.assisted_planning_stages(id, session_id, plan_id),
  CONSTRAINT stage_validations_config_fk FOREIGN KEY (config_revision_id, plan_id) REFERENCES public.plan_config_revisions(id, plan_id)
);

CREATE TABLE public.planning_accepted_exceptions (
  id BIGSERIAL PRIMARY KEY, plan_id INTEGER NOT NULL, stage_id BIGINT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('HARD', 'REQUIRED')), rule_code TEXT NOT NULL, violation_key TEXT NOT NULL,
  affected_task_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (public.is_positive_integer_jsonb_array(affected_task_ids_json)),
  details_json JSONB NOT NULL CHECK (jsonb_typeof(details_json) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'RESOLVED', 'STALE', 'SUPERSEDED')),
  accepted_by UUID NOT NULL REFERENCES auth.users(id), accepted_at TIMESTAMPTZ NOT NULL, resolved_at TIMESTAMPTZ,
  CONSTRAINT accepted_exceptions_stage_fk FOREIGN KEY (stage_id, plan_id) REFERENCES public.assisted_planning_stages(id, plan_id) ON DELETE CASCADE
);

ALTER TABLE public.assisted_planning_sessions
  ADD CONSTRAINT assisted_sessions_active_stage_fk FOREIGN KEY (active_stage_id, id, plan_id)
    REFERENCES public.assisted_planning_stages(id, session_id, plan_id),
  ADD CONSTRAINT assisted_sessions_draft_base_fk FOREIGN KEY (draft_base_stage_id, id, plan_id)
    REFERENCES public.assisted_planning_stages(id, session_id, plan_id),
  ADD CONSTRAINT assisted_sessions_validation_fk FOREIGN KEY (draft_validation_id, id, plan_id, draft_fingerprint, current_config_revision_id)
    REFERENCES public.planning_stage_validations(id, session_id, plan_id, draft_fingerprint, config_revision_id);

CREATE OR REPLACE FUNCTION public.guard_assisted_stage_proposal_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.proposal_run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.planning_runs run WHERE run.id = NEW.proposal_run_id AND run.plan_id = NEW.plan_id
  ) THEN RAISE EXCEPTION 'proposal run belongs to a different plan'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assisted_stage_proposal_plan BEFORE INSERT OR UPDATE OF proposal_run_id, plan_id
ON public.assisted_planning_stages FOR EACH ROW EXECUTE FUNCTION public.guard_assisted_stage_proposal_plan();

CREATE OR REPLACE FUNCTION public.guard_assisted_planning_stage_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.archived_at IS NOT NULL OR NEW.archived_at IS NULL
     OR (to_jsonb(NEW) - 'archived_at') IS DISTINCT FROM (to_jsonb(OLD) - 'archived_at') THEN
    RAISE EXCEPTION 'accepted planning stage is immutable; only initial archival is allowed';
  END IF;
  RETURN NEW;
END $$;

-- RLS is bypassed by service_role, so table/column privileges are the primary
-- write boundary. Direct child-table DELETE is deliberately not granted; FK
-- cascades from deleting the owning plan remain database-managed.
REVOKE ALL ON TABLE public.plan_config_revisions, public.assisted_planning_sessions, public.assisted_planning_stages, public.planning_stage_validations, public.planning_accepted_exceptions FROM anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.plan_config_revisions, public.planning_stage_validations TO authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.assisted_planning_stages TO authenticated, service_role;
GRANT UPDATE (archived_at) ON TABLE public.assisted_planning_stages TO authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.planning_accepted_exceptions TO authenticated, service_role;
GRANT UPDATE (status, resolved_at) ON TABLE public.planning_accepted_exceptions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.assisted_planning_sessions TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.plan_config_revisions_id_seq, public.assisted_planning_sessions_id_seq, public.assisted_planning_stages_id_seq, public.planning_stage_validations_id_seq, public.planning_accepted_exceptions_id_seq TO authenticated, service_role;
CREATE TRIGGER assisted_planning_stages_immutable BEFORE UPDATE ON public.assisted_planning_stages
FOR EACH ROW EXECUTE FUNCTION public.guard_assisted_planning_stage_update();

CREATE INDEX plan_config_revisions_plan_id_idx ON public.plan_config_revisions(plan_id, created_at DESC);
CREATE INDEX assisted_planning_sessions_plan_id_idx ON public.assisted_planning_sessions(plan_id);
CREATE INDEX assisted_planning_stages_plan_id_idx ON public.assisted_planning_stages(plan_id, accepted_at DESC);
CREATE INDEX assisted_planning_stages_parent_idx ON public.assisted_planning_stages(parent_stage_id);
CREATE INDEX planning_stage_validations_draft_idx ON public.planning_stage_validations(session_id, draft_fingerprint, created_at DESC);
CREATE INDEX planning_accepted_exceptions_stage_id_idx ON public.planning_accepted_exceptions(stage_id);
CREATE INDEX planning_accepted_exceptions_plan_status_idx ON public.planning_accepted_exceptions(plan_id, status);

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['plan_config_revisions','assisted_planning_sessions','assisted_planning_stages','planning_stage_validations','planning_accepted_exceptions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_role(''admin'') OR public.has_role(''production'') OR public.has_role(''aux'') OR public.has_role(''viewer''))', table_name || '_read_all_roles', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(''admin'') OR public.has_role(''production''))', table_name || '_insert_admin_production', table_name);
  END LOOP;
END $$;
CREATE POLICY assisted_planning_sessions_update_admin_production ON public.assisted_planning_sessions
  FOR UPDATE TO authenticated USING (public.has_role('admin') OR public.has_role('production'))
  WITH CHECK (public.has_role('admin') OR public.has_role('production'));
CREATE POLICY assisted_planning_stages_archive_admin_production ON public.assisted_planning_stages
  FOR UPDATE TO authenticated USING (public.has_role('admin') OR public.has_role('production'))
  WITH CHECK (public.has_role('admin') OR public.has_role('production'));
CREATE POLICY planning_accepted_exceptions_update_admin_production ON public.planning_accepted_exceptions
  FOR UPDATE TO authenticated USING (public.has_role('admin') OR public.has_role('production'))
  WITH CHECK (public.has_role('admin') OR public.has_role('production'));
