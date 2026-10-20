-- P11: availability on a rebuild without automatic Data API grants.
-- Explicit runtime needs, audited against server/storage.ts and server routes.
-- Additive only: no default ACL, function-body or historical privilege changes.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- The production audit already reports RLS on all 60 tables. The historical
-- ledger alone leaves these 12 disabled (11 are enabled by the separate demo
-- security bundle). Rebuilds must also fail closed. No policies are invented:
-- service_role keeps BYPASSRLS and authenticated reads require existing policy.
ALTER TABLE public.engine_plan_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_resource_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_resource_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_space_resource_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_space_resource_type_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_vocal_coach_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_zone_resource_type_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_resource_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_resource_type_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocal_coach_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zone_resource_type_defaults ENABLE ROW LEVEL SECURITY;

-- Server Data API (service_role), after HTTP authorization. Existing restricted
-- Stage/event/incident/header/snapshot grants remain as defined in 073–097.
GRANT SELECT ON TABLE
  public.plan_summaries,
  public.resource_bundle_components,
  public.resource_bundle_space_affinities,
  public.resource_bundles,
  public.roles
TO service_role;

GRANT SELECT, DELETE ON TABLE
  public.resource_availability
TO service_role;

GRANT SELECT, INSERT ON TABLE
  public.task_status_events
TO service_role;

GRANT SELECT, INSERT, DELETE ON TABLE
  public.engine_plan_results,
  public.plan_space_resource_assignments,
  public.plan_space_resource_type_requirements,
  public.plan_staff_assignments,
  public.plan_vocal_coach_rules,
  public.plan_zone_resource_assignments,
  public.plan_zone_resource_type_requirements,
  public.plan_zone_staff_mode,
  public.resource_item_components,
  public.space_resource_defaults,
  public.space_resource_type_defaults,
  public.staff_assignment_defaults,
  public.staff_zone_mode_defaults,
  public.vocal_coach_rules,
  public.zone_resource_defaults,
  public.zone_resource_type_defaults
TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.planning_runs,
  public.resource_items,
  public.resource_types
TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.contestants,
  public.daily_tasks,
  public.itinerant_teams,
  public.locks,
  public.plan_breaks,
  public.plan_resource_items,
  public.plan_resource_pools,
  public.plans,
  public.resource_pools,
  public.spaces,
  public.staff_people,
  public.task_templates,
  public.user_entity_links,
  public.user_roles,
  public.zones
TO service_role;

GRANT SELECT, UPDATE ON TABLE
  public.control_room_settings,
  public.optimizer_settings,
  public.program_settings
TO service_role;

-- nextval() for serial inserts only; identity sequences need no client grant.
GRANT USAGE ON SEQUENCE
  public.engine_plan_results_id_seq,
  public.plan_breaks_id_seq,
  public.plan_resource_items_id_seq,
  public.plan_resource_pools_id_seq,
  public.plan_space_resource_assignments_id_seq,
  public.plan_space_resource_type_requirements_id_seq,
  public.plan_vocal_coach_rules_id_seq,
  public.plan_zone_resource_assignments_id_seq,
  public.plan_zone_resource_type_requirements_id_seq,
  public.planning_runs_id_seq,
  public.resource_item_components_id_seq,
  public.resource_items_id_seq,
  public.resource_pools_id_seq,
  public.resource_types_id_seq,
  public.space_resource_defaults_id_seq,
  public.space_resource_type_defaults_id_seq,
  public.task_status_events_id_seq,
  public.vocal_coach_rules_id_seq,
  public.zone_resource_defaults_id_seq,
  public.zone_resource_type_defaults_id_seq
TO service_role;

-- Authenticated Realtime subscriptions (use-plan-realtime.ts). Row visibility
-- remains governed by existing policies; every mutation stays server-authorized.
GRANT SELECT ON TABLE public.plans, public.daily_tasks, public.locks,
  public.planning_runs TO authenticated;
-- operational_incidents already has its explicit read grant in 094.

-- Pure view/check-constraint helpers need EXECUTE even with table grants.
-- These already inherited PUBLIC EXECUTE under the previous platform defaults.
GRANT EXECUTE ON FUNCTION public.hhmm_to_minutes(text),
  public.positive_integer_jsonb_array(jsonb),
  public.is_positive_integer_jsonb_array(jsonb),
  public.valid_planning_header_lines(jsonb)
TO service_role;

-- No anon grants; no authenticated write grants; no privileged RPC is opened.
NOTIFY pgrst, 'reload schema';
COMMIT;
