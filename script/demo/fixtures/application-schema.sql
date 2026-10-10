-- Test fixture generated from the application Drizzle schema.
-- Not a Supabase migration or a production bootstrap. Tests explicitly simulate remote drift.
CREATE TYPE "public"."lock_type" AS ENUM('time', 'space', 'resource', 'full');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('auxiliar', 'coach', 'presenter');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'done', 'interrupted', 'cancelled');--> statement-breakpoint
CREATE TABLE "assisted_planning_sessions" (
	"id" bigint PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"status" text NOT NULL,
	"active_stage_id" bigint,
	"draft_base_stage_id" bigint,
	"current_config_revision_id" bigint NOT NULL,
	"draft_scope_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft_snapshot_json" jsonb NOT NULL,
	"draft_fingerprint" text NOT NULL,
	"draft_validation_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assisted_planning_sessions_status_check" CHECK ("assisted_planning_sessions"."status" IN ('ACTIVE', 'CLOSED', 'ABANDONED'))
);
--> statement-breakpoint
CREATE TABLE "assisted_planning_stages" (
	"id" bigint PRIMARY KEY NOT NULL,
	"session_id" bigint NOT NULL,
	"plan_id" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"parent_stage_id" bigint,
	"scope_json" jsonb NOT NULL,
	"scope_task_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"include_prerequisites" boolean DEFAULT false NOT NULL,
	"config_revision_id" bigint NOT NULL,
	"proposal_run_id" bigint,
	"snapshot_json" jsonb NOT NULL,
	"snapshot_fingerprint" text NOT NULL,
	"validation_summary_json" jsonb NOT NULL,
	"accepted_by" uuid NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assisted_planning_stages_ordinal_check" CHECK ("assisted_planning_stages"."ordinal" >= 0),
	CONSTRAINT "assisted_planning_stages_scope_task_ids_array_check" CHECK (jsonb_typeof("assisted_planning_stages"."scope_task_ids_json") = 'array')
);
--> statement-breakpoint
CREATE TABLE "contestants" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer,
	"name" text NOT NULL,
	"instrument" boolean DEFAULT false NOT NULL,
	"instrument_name" text,
	"coach_id" integer,
	"song" text,
	"notes" text,
	"availability_start" text,
	"availability_end" text,
	"vocal_coach_plan_resource_item_id" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"contestant_id" integer,
	"duration_override" integer,
	"cameras_override" integer,
	"participant_margin_before_minutes" integer,
	"participant_margin_after_minutes" integer,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"zone_id" integer,
	"space_id" integer,
	"location_label" text,
	"start_planned" text,
	"end_planned" text,
	"assigned_resource_ids" jsonb,
	"start_real" text,
	"start_real_seconds" integer,
	"paused_total_seconds" integer DEFAULT 0 NOT NULL,
	"paused_at_seconds" integer,
	"paused_at_hhmm" text,
	"end_real" text,
	"end_real_seconds" integer,
	"comment1_text" text,
	"comment1_color" text,
	"comment2_text" text,
	"comment2_color" text
);
--> statement-breakpoint
CREATE TABLE "locks" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"lock_type" "lock_type" NOT NULL,
	"locked_start" text,
	"locked_end" text,
	"locked_resource_id" integer,
	"created_by" text NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "optimizer_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"main_zone_id" integer,
	"prioritize_main_zone" boolean DEFAULT false NOT NULL,
	"group_by_space_and_template" boolean DEFAULT true NOT NULL,
	"main_zone_priority_level" integer DEFAULT 0 NOT NULL,
	"grouping_level" integer DEFAULT 2 NOT NULL,
	"contestant_stay_in_zone_level" integer DEFAULT 0 NOT NULL,
	"optimization_mode" text DEFAULT 'basic' NOT NULL,
	"main_zone_priority_advanced_value" integer DEFAULT 0 NOT NULL,
	"main_zone_finish_early_level" integer DEFAULT 0 NOT NULL,
	"main_zone_finish_early_advanced_value" integer DEFAULT 0 NOT NULL,
	"main_zone_keep_busy_level" integer DEFAULT 0 NOT NULL,
	"main_zone_keep_busy_advanced_value" integer DEFAULT 0 NOT NULL,
	"grouping_advanced_value" integer DEFAULT 6 NOT NULL,
	"contestant_compact_advanced_value" integer DEFAULT 0 NOT NULL,
	"contestant_stay_in_zone_advanced_value" integer DEFAULT 0 NOT NULL,
	"contestant_total_span_level" integer DEFAULT 0 NOT NULL,
	"contestant_total_span_advanced_value" integer,
	"main_zone_opt_finish_early" boolean DEFAULT true NOT NULL,
	"main_zone_opt_keep_busy" boolean DEFAULT true NOT NULL,
	"contestant_compact_level" integer DEFAULT 0 NOT NULL,
	"arrival_task_template_name" text,
	"departure_task_template_name" text,
	"arrival_grouping_target" integer DEFAULT 0 NOT NULL,
	"departure_grouping_target" integer DEFAULT 0 NOT NULL,
	"arrival_min_gap_minutes" integer DEFAULT 0 NOT NULL,
	"departure_min_gap_minutes" integer DEFAULT 0 NOT NULL,
	"van_capacity" integer DEFAULT 0 NOT NULL,
	"weight_arrival_departure_grouping" integer DEFAULT 0 NOT NULL,
	"near_hard_breaks_max" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_breaks" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"kind" text NOT NULL,
	"space_id" integer,
	"itinerant_team_id" integer,
	"duration_minutes" integer NOT NULL,
	"earliest_start" text,
	"latest_end" text,
	"locked_start" text,
	"locked_end" text,
	"planned_start" text,
	"planned_end" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plan_config_revisions" (
	"id" bigint PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"parent_revision_id" bigint,
	"source" text NOT NULL,
	"fingerprint" text NOT NULL,
	"identity_json" jsonb NOT NULL,
	"replay_snapshot_json" jsonb NOT NULL,
	"diff_json" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_config_revisions_fingerprint_check" CHECK ("plan_config_revisions"."fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "plan_optimizer_snapshot_grouping_zones" (
	"id" bigint PRIMARY KEY NOT NULL,
	"snapshot_id" bigint NOT NULL,
	"zone_id" integer NOT NULL,
	CONSTRAINT "plan_optimizer_snapshot_grouping_zones_zone_check" CHECK (zone_id > 0)
);
--> statement-breakpoint
CREATE TABLE "plan_optimizer_snapshot_heuristics" (
	"id" bigint PRIMARY KEY NOT NULL,
	"snapshot_id" bigint NOT NULL,
	"heuristic_key" text NOT NULL,
	"basic_level" integer NOT NULL,
	"advanced_value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_optimizer_snapshot_heuristics_basic_level_check" CHECK (basic_level between 0 and 3),
	CONSTRAINT "plan_optimizer_snapshot_heuristics_advanced_value_check" CHECK (advanced_value between 0 and 10),
	CONSTRAINT "plan_optimizer_snapshot_heuristics_key_check" CHECK (heuristic_key in ('MAIN_ZONE_PRIORITY', 'MAIN_ZONE_FINISH_EARLY', 'MAIN_ZONE_KEEP_BUSY', 'CONTESTANT_COMPACT', 'GROUP_BY_SPACE_TEMPLATE_MATCH', 'GROUP_BY_SPACE_ACTIVE', 'CONTESTANT_STAY_IN_ZONE', 'CONTESTANT_TOTAL_SPAN', 'ARRIVAL_DEPARTURE_GROUPING'))
);
--> statement-breakpoint
CREATE TABLE "plan_optimizer_snapshots" (
	"id" bigint PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"contract_version" integer DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"editing_mode" text NOT NULL,
	"main_zone_id" integer,
	"arrival_plan_template_snapshot_id" bigint,
	"departure_plan_template_snapshot_id" bigint,
	"arrival_grouping_target" integer DEFAULT 0 NOT NULL,
	"departure_grouping_target" integer DEFAULT 0 NOT NULL,
	"arrival_min_gap_minutes" integer DEFAULT 0 NOT NULL,
	"departure_min_gap_minutes" integer DEFAULT 0 NOT NULL,
	"van_capacity" integer DEFAULT 0 NOT NULL,
	"grouping_weight" integer DEFAULT 0 NOT NULL,
	"near_hard_breaks_max" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_optimizer_snapshots_contract_version_check" CHECK (contract_version = 1),
	CONSTRAINT "plan_optimizer_snapshots_source_check" CHECK (source in ('INHERITED', 'LEGACY_BACKFILL', 'DAY_OVERRIDE')),
	CONSTRAINT "plan_optimizer_snapshots_editing_mode_check" CHECK (editing_mode in ('BASIC', 'ADVANCED')),
	CONSTRAINT "plan_optimizer_snapshots_arrival_target_check" CHECK (arrival_grouping_target >= 0),
	CONSTRAINT "plan_optimizer_snapshots_departure_target_check" CHECK (departure_grouping_target >= 0),
	CONSTRAINT "plan_optimizer_snapshots_arrival_gap_check" CHECK (arrival_min_gap_minutes >= 0),
	CONSTRAINT "plan_optimizer_snapshots_departure_gap_check" CHECK (departure_min_gap_minutes >= 0),
	CONSTRAINT "plan_optimizer_snapshots_van_capacity_check" CHECK (van_capacity >= 0),
	CONSTRAINT "plan_optimizer_snapshots_grouping_weight_check" CHECK (grouping_weight between 0 and 10),
	CONSTRAINT "plan_optimizer_snapshots_near_hard_check" CHECK (near_hard_breaks_max between 0 and 10),
	CONSTRAINT "plan_optimizer_snapshots_arrival_active_reference_check" CHECK (grouping_weight = 0 or arrival_grouping_target = 0 or arrival_plan_template_snapshot_id is not null),
	CONSTRAINT "plan_optimizer_snapshots_departure_active_reference_check" CHECK (grouping_weight = 0 or departure_grouping_target = 0 or departure_plan_template_snapshot_id is not null)
);
--> statement-breakpoint
CREATE TABLE "plan_resource_bundle_snapshots" (
	"id" bigint PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"contract_version" integer DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"bundles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"space_affinities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_resource_items" (
	"id" bigint PRIMARY KEY NOT NULL,
	"plan_id" bigint NOT NULL,
	"type_id" bigint NOT NULL,
	"resource_item_id" bigint,
	"name" text NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'default' NOT NULL,
	"availability_start" text,
	"availability_end" text,
	CONSTRAINT "plan_resource_items_availability_pair_check" CHECK (("plan_resource_items"."availability_start" IS NULL) = ("plan_resource_items"."availability_end" IS NULL)),
	CONSTRAINT "plan_resource_items_availability_format_check" CHECK ("plan_resource_items"."availability_start" IS NULL OR ("plan_resource_items"."availability_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "plan_resource_items"."availability_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
	CONSTRAINT "plan_resource_items_availability_order_check" CHECK ("plan_resource_items"."availability_start" IS NULL OR "plan_resource_items"."availability_start" < "plan_resource_items"."availability_end")
);
--> statement-breakpoint
CREATE TABLE "plan_resource_pools" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"pool_id" integer NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"names" jsonb
);
--> statement-breakpoint
CREATE TABLE "plan_space_settings" (
	"id" bigint PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"space_id" integer NOT NULL,
	"zone_id" integer NOT NULL,
	"availability_start" text,
	"availability_end" text,
	"source" text DEFAULT 'default' NOT NULL,
	"config_source" text DEFAULT 'INHERITED' NOT NULL,
	"name" text NOT NULL,
	"parent_space_id" integer,
	"priority_level" integer DEFAULT 1 NOT NULL,
	"grouping_level" integer DEFAULT 0 NOT NULL,
	"grouping_min_chain" integer DEFAULT 4 NOT NULL,
	"grouping_apply_to_descendants" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_space_settings_availability_pair_check" CHECK (("plan_space_settings"."availability_start" IS NULL) = ("plan_space_settings"."availability_end" IS NULL)),
	CONSTRAINT "plan_space_settings_availability_format_check" CHECK ("plan_space_settings"."availability_start" IS NULL OR ("plan_space_settings"."availability_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "plan_space_settings"."availability_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
	CONSTRAINT "plan_space_settings_availability_order_check" CHECK ("plan_space_settings"."availability_start" IS NULL OR "plan_space_settings"."availability_start" < "plan_space_settings"."availability_end")
);
--> statement-breakpoint
CREATE TABLE "plan_task_template_snapshots" (
	"id" bigint PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"source_template_id" integer NOT NULL,
	"contract_version" integer DEFAULT 2 NOT NULL,
	"source" text NOT NULL,
	"template_name" text NOT NULL,
	"default_duration" integer NOT NULL,
	"default_cameras" integer DEFAULT 0 NOT NULL,
	"default_zone_id" integer,
	"default_space_id" integer,
	"auto_create_on_contestant_create" boolean DEFAULT false NOT NULL,
	"requires_auxiliar" boolean DEFAULT false NOT NULL,
	"requires_coach" boolean DEFAULT false NOT NULL,
	"requires_presenter" boolean DEFAULT false NOT NULL,
	"exclusive_auxiliar" boolean DEFAULT false NOT NULL,
	"has_dependency" boolean DEFAULT false NOT NULL,
	"dependency_template_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resource_requirements" jsonb,
	"itinerant_team_requirement" text DEFAULT 'none' NOT NULL,
	"itinerant_team_id" integer,
	"allowed_itinerant_team_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"setup_id" integer,
	"participant_margin_before_minutes" integer,
	"participant_margin_after_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_task_template_snapshots_contract_version_check" CHECK ("plan_task_template_snapshots"."contract_version" = 2),
	CONSTRAINT "plan_task_template_snapshots_source_check" CHECK ("plan_task_template_snapshots"."source" in ('inherited', 'legacy_backfill', 'ad_hoc_from_default')),
	CONSTRAINT "plan_task_template_snapshots_template_name_check" CHECK (length(btrim("plan_task_template_snapshots"."template_name")) > 0),
	CONSTRAINT "plan_task_template_snapshots_duration_check" CHECK ("plan_task_template_snapshots"."default_duration" > 0),
	CONSTRAINT "plan_task_template_snapshots_cameras_check" CHECK ("plan_task_template_snapshots"."default_cameras" >= 0),
	CONSTRAINT "plan_task_template_snapshots_dependency_array_check" CHECK (jsonb_typeof("plan_task_template_snapshots"."dependency_template_ids") = 'array'),
	CONSTRAINT "plan_task_template_snapshots_allowed_team_array_check" CHECK (jsonb_typeof("plan_task_template_snapshots"."allowed_itinerant_team_ids") = 'array'),
	CONSTRAINT "plan_task_template_snapshots_itinerant_requirement_check" CHECK ("plan_task_template_snapshots"."itinerant_team_requirement" in ('none', 'any', 'specific')),
	CONSTRAINT "plan_task_template_snapshots_specific_team_check" CHECK ((("plan_task_template_snapshots"."itinerant_team_requirement" = 'specific' and "plan_task_template_snapshots"."itinerant_team_id" is not null and "plan_task_template_snapshots"."itinerant_team_id" > 0) or ("plan_task_template_snapshots"."itinerant_team_requirement" <> 'specific' and "plan_task_template_snapshots"."itinerant_team_id" is null)))
);
--> statement-breakpoint
CREATE TABLE "plan_zone_settings" (
	"id" bigint PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"zone_id" integer NOT NULL,
	"availability_start" text,
	"availability_end" text,
	"source" text DEFAULT 'default' NOT NULL,
	"config_source" text DEFAULT 'INHERITED' NOT NULL,
	"name" text NOT NULL,
	"meal_start_preferred" text,
	"meal_end_preferred" text,
	"grouping_level" integer DEFAULT 0 NOT NULL,
	"grouping_min_chain" integer DEFAULT 4 NOT NULL,
	"max_template_changes" integer DEFAULT 4 NOT NULL,
	"space_meal_break_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_zone_settings_availability_pair_check" CHECK (("plan_zone_settings"."availability_start" IS NULL) = ("plan_zone_settings"."availability_end" IS NULL)),
	CONSTRAINT "plan_zone_settings_availability_format_check" CHECK ("plan_zone_settings"."availability_start" IS NULL OR ("plan_zone_settings"."availability_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "plan_zone_settings"."availability_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
	CONSTRAINT "plan_zone_settings_availability_order_check" CHECK ("plan_zone_settings"."availability_start" IS NULL OR "plan_zone_settings"."availability_start" < "plan_zone_settings"."availability_end")
);
--> statement-breakpoint
CREATE TABLE "planning_accepted_exceptions" (
	"id" bigint PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"stage_id" bigint NOT NULL,
	"severity" text NOT NULL,
	"rule_code" text NOT NULL,
	"violation_key" text NOT NULL,
	"config_revision_id" bigint NOT NULL,
	"snapshot_fingerprint" text NOT NULL,
	"affected_task_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_resource_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_space_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"details_json" jsonb NOT NULL,
	"status" text NOT NULL,
	"accepted_by" uuid NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "planning_accepted_exceptions_severity_check" CHECK ("planning_accepted_exceptions"."severity" IN ('HARD', 'REQUIRED')),
	CONSTRAINT "planning_accepted_exceptions_status_check" CHECK ("planning_accepted_exceptions"."status" IN ('ACTIVE', 'RESOLVED', 'STALE', 'SUPERSEDED')),
	CONSTRAINT "planning_accepted_exceptions_task_ids_array_check" CHECK (jsonb_typeof("planning_accepted_exceptions"."affected_task_ids_json") = 'array')
);
--> statement-breakpoint
CREATE TABLE "planning_runs" (
	"id" bigint PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_pending" integer DEFAULT 0 NOT NULL,
	"planned_count" integer DEFAULT 0 NOT NULL,
	"message" text,
	"last_reasons" jsonb,
	"request_id" uuid,
	"engine" text,
	"engine_version" text,
	"solution_source" text,
	"requested_time_limit_ms" integer,
	"finished_at" timestamp with time zone,
	"cancel_requested_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"phase" text,
	"phase_progress_pct" integer DEFAULT 0 NOT NULL,
	"progress_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_progress_at" timestamp with time zone,
	"candidates_evaluated" integer DEFAULT 0 NOT NULL,
	"candidates_generated" integer DEFAULT 0 NOT NULL,
	"current_best_reason" text,
	"last_task_id" integer,
	"last_task_name" text,
	"planned_tasks" integer,
	"unplanned_tasks" integer,
	"hard_constraint_violations" integer,
	"main_stage_gap_minutes" integer,
	"main_stage_gap_count" integer,
	"coach_switch_count" integer,
	"restrictive_talent_average_start_offset" integer,
	"selected_candidate_metrics" jsonb,
	"engine_metadata" jsonb,
	"diagnostic_warnings" jsonb,
	"execution_kind" text DEFAULT 'FULL_PLAN' NOT NULL,
	"assisted_session_id" bigint,
	"base_stage_id" bigint,
	"config_revision_id" bigint,
	"scope_json" jsonb,
	"scope_task_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"include_prerequisites" boolean DEFAULT false NOT NULL,
	"source_draft_fingerprint" text,
	"result_fingerprint" text,
	"assisted_result_json" jsonb,
	CONSTRAINT "planning_runs_scope_task_ids_check" CHECK (public.positive_integer_jsonb_array("planning_runs"."scope_task_ids_json")),
	CONSTRAINT "planning_runs_result_fingerprint_check" CHECK ("planning_runs"."result_fingerprint" IS NULL OR "planning_runs"."result_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "planning_stage_validations" (
	"id" bigint PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"session_id" bigint NOT NULL,
	"base_stage_id" bigint,
	"draft_fingerprint" text NOT NULL,
	"config_revision_id" bigint NOT NULL,
	"hard_count" integer NOT NULL,
	"required_count" integer NOT NULL,
	"preferred_count" integer NOT NULL,
	"report_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_stage_validations_counts_check" CHECK ("planning_stage_validations"."hard_count" >= 0 AND "planning_stage_validations"."required_count" >= 0 AND "planning_stage_validations"."preferred_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"work_start" text NOT NULL,
	"work_end" text NOT NULL,
	"meal_start" text NOT NULL,
	"meal_end" text NOT NULL,
	"meal_mode" text DEFAULT 'flexible_meal_window' NOT NULL,
	"work_baseline_start" text NOT NULL,
	"work_baseline_end" text NOT NULL,
	"work_config_source" text NOT NULL,
	"work_override_by" uuid,
	"work_override_at" timestamp with time zone,
	"meal_baseline_start" text NOT NULL,
	"meal_baseline_end" text NOT NULL,
	"meal_baseline_mode" text NOT NULL,
	"meal_config_source" text NOT NULL,
	"meal_override_by" uuid,
	"meal_override_at" timestamp with time zone,
	"participant_transition_minutes" integer DEFAULT 5 NOT NULL,
	"participant_transition_baseline_minutes" integer DEFAULT 5 NOT NULL,
	"participant_transition_config_source" text DEFAULT 'LEGACY_BACKFILL' NOT NULL,
	"participant_transition_override_by" uuid,
	"participant_transition_override_at" timestamp with time zone,
	"current_config_revision_id" bigint,
	"contestant_meal_duration_minutes" integer DEFAULT 75 NOT NULL,
	"contestant_meal_max_simultaneous" integer DEFAULT 10 NOT NULL,
	"space_meal_break_minutes" integer,
	"cameras_available" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"planning_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"planning_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"optimizer_engine" text DEFAULT 'v3' NOT NULL,
	"planner_next_configuration" jsonb
);
--> statement-breakpoint
CREATE TABLE "program_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"default_work_start" text DEFAULT '09:00' NOT NULL,
	"default_participant_transition_minutes" integer DEFAULT 5 NOT NULL,
	"default_work_end" text DEFAULT '21:00' NOT NULL,
	"meal_start" text NOT NULL,
	"meal_end" text NOT NULL,
	"meal_mode" text DEFAULT 'flexible_meal_window' NOT NULL,
	"contestant_meal_duration_minutes" integer DEFAULT 75 NOT NULL,
	"contestant_meal_max_simultaneous" integer DEFAULT 10 NOT NULL,
	"space_meal_break_minutes" integer DEFAULT 75 NOT NULL,
	"itinerant_meal_break_minutes" integer DEFAULT 45 NOT NULL,
	"clock_mode" text DEFAULT 'auto' NOT NULL,
	"simulated_time" text,
	"simulated_set_at" timestamp with time zone,
	"ui_itinerant_group_order_index" integer,
	"ui_unlocated_group_order_index" integer,
	CONSTRAINT "program_settings_default_work_format_check" CHECK ("program_settings"."default_work_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "program_settings"."default_work_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "program_settings_default_work_order_check" CHECK ("program_settings"."default_work_start" < "program_settings"."default_work_end")
);
--> statement-breakpoint
CREATE TABLE "resource_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_bundle_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_id" uuid NOT NULL,
	"resource_id" bigint,
	"resource_item_id" bigint,
	"component_role" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_bundle_components_quantity_check" CHECK ("resource_bundle_components"."quantity" > 0),
	CONSTRAINT "resource_bundle_components_single_source" CHECK (num_nonnulls("resource_bundle_components"."resource_id", "resource_bundle_components"."resource_item_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "resource_bundle_space_affinities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_id" uuid NOT NULL,
	"space_id" bigint NOT NULL,
	"affinity_score" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"bundle_type" text DEFAULT 'composite' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_items" (
	"id" bigint PRIMARY KEY NOT NULL,
	"type_id" bigint NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"default_availability_start" text,
	"default_availability_end" text,
	CONSTRAINT "resource_items_default_availability_pair_check" CHECK (("resource_items"."default_availability_start" IS NULL) = ("resource_items"."default_availability_end" IS NULL)),
	CONSTRAINT "resource_items_default_availability_format_check" CHECK ("resource_items"."default_availability_start" IS NULL OR ("resource_items"."default_availability_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "resource_items"."default_availability_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
	CONSTRAINT "resource_items_default_availability_order_check" CHECK ("resource_items"."default_availability_start" IS NULL OR "resource_items"."default_availability_start" < "resource_items"."default_availability_end")
);
--> statement-breakpoint
CREATE TABLE "resource_pools" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"default_quantity" integer DEFAULT 0 NOT NULL,
	"default_names" jsonb
);
--> statement-breakpoint
CREATE TABLE "resource_types" (
	"id" bigint PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "resource_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "resource_type" NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbrev" text,
	"zone_id" integer NOT NULL,
	"priority_level" integer DEFAULT 1 NOT NULL,
	"parent_space_id" integer,
	"minimize_changes_level" integer DEFAULT 0 NOT NULL,
	"minimize_changes_min_chain" integer DEFAULT 4 NOT NULL,
	"grouping_level" integer DEFAULT 0 NOT NULL,
	"grouping_min_chain" integer DEFAULT 4 NOT NULL,
	"grouping_apply_to_descendants" boolean DEFAULT false NOT NULL,
	"default_availability_start" text,
	"default_availability_end" text,
	CONSTRAINT "spaces_default_availability_pair_check" CHECK (("spaces"."default_availability_start" IS NULL) = ("spaces"."default_availability_end" IS NULL)),
	CONSTRAINT "spaces_default_availability_format_check" CHECK ("spaces"."default_availability_start" IS NULL OR ("spaces"."default_availability_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "spaces"."default_availability_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
	CONSTRAINT "spaces_default_availability_order_check" CHECK ("spaces"."default_availability_start" IS NULL OR "spaces"."default_availability_start" < "spaces"."default_availability_end")
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_duration" integer NOT NULL,
	"auto_create_on_contestant_create" boolean DEFAULT false NOT NULL,
	"requires_auxiliar" boolean DEFAULT false NOT NULL,
	"requires_coach" boolean DEFAULT false NOT NULL,
	"requires_presenter" boolean DEFAULT false NOT NULL,
	"default_cameras" integer DEFAULT 0 NOT NULL,
	"abbrev" text,
	"default_comment1_color" text,
	"default_comment2_color" text,
	"exclusive_auxiliar" boolean DEFAULT false NOT NULL,
	"setup_id" integer,
	"rules_json" jsonb,
	"participant_margin_before_minutes" integer,
	"participant_margin_after_minutes" integer,
	"ui_color" text,
	"ui_color_secondary" text,
	"itinerant_team_requirement" text DEFAULT 'none' NOT NULL,
	"itinerant_team_id" integer,
	"has_dependency" boolean DEFAULT false NOT NULL,
	"depends_on_template_id" integer,
	"depends_on_template_ids" jsonb,
	"resource_requirements" jsonb,
	"zone_id" integer,
	"space_id" integer
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ui_color" text,
	"meal_start_preferred" text,
	"meal_end_preferred" text,
	"minimize_changes_level" integer DEFAULT 0 NOT NULL,
	"minimize_changes_min_chain" integer DEFAULT 4 NOT NULL,
	"grouping_level" integer DEFAULT 0 NOT NULL,
	"grouping_min_chain" integer DEFAULT 4 NOT NULL,
	"max_template_changes" integer DEFAULT 4 NOT NULL,
	"space_meal_break_minutes" integer,
	"ui_order_index" integer,
	"default_availability_start" text,
	"default_availability_end" text,
	CONSTRAINT "zones_default_availability_pair_check" CHECK (("zones"."default_availability_start" IS NULL) = ("zones"."default_availability_end" IS NULL)),
	CONSTRAINT "zones_default_availability_format_check" CHECK ("zones"."default_availability_start" IS NULL OR ("zones"."default_availability_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "zones"."default_availability_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
	CONSTRAINT "zones_default_availability_order_check" CHECK ("zones"."default_availability_start" IS NULL OR "zones"."default_availability_start" < "zones"."default_availability_end")
);
--> statement-breakpoint
ALTER TABLE "assisted_planning_sessions" ADD CONSTRAINT "assisted_planning_sessions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assisted_planning_stages" ADD CONSTRAINT "assisted_planning_stages_session_id_assisted_planning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assisted_planning_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assisted_planning_stages" ADD CONSTRAINT "assisted_planning_stages_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assisted_planning_stages" ADD CONSTRAINT "assisted_planning_stages_config_revision_id_plan_config_revisions_id_fk" FOREIGN KEY ("config_revision_id") REFERENCES "public"."plan_config_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assisted_planning_stages" ADD CONSTRAINT "assisted_planning_stages_proposal_run_id_planning_runs_id_fk" FOREIGN KEY ("proposal_run_id") REFERENCES "public"."planning_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contestants" ADD CONSTRAINT "contestants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contestants" ADD CONSTRAINT "contestants_coach_id_resources_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_contestant_id_contestants_id_fk" FOREIGN KEY ("contestant_id") REFERENCES "public"."contestants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locks" ADD CONSTRAINT "locks_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locks" ADD CONSTRAINT "locks_task_id_daily_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."daily_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locks" ADD CONSTRAINT "locks_locked_resource_id_resources_id_fk" FOREIGN KEY ("locked_resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimizer_settings" ADD CONSTRAINT "optimizer_settings_main_zone_id_zones_id_fk" FOREIGN KEY ("main_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_breaks" ADD CONSTRAINT "plan_breaks_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_config_revisions" ADD CONSTRAINT "plan_config_revisions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_optimizer_snapshot_grouping_zones" ADD CONSTRAINT "plan_optimizer_snapshot_grouping_zones_snapshot_id_plan_optimizer_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."plan_optimizer_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_optimizer_snapshot_heuristics" ADD CONSTRAINT "plan_optimizer_snapshot_heuristics_snapshot_id_plan_optimizer_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."plan_optimizer_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_optimizer_snapshots" ADD CONSTRAINT "plan_optimizer_snapshots_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_optimizer_snapshots" ADD CONSTRAINT "plan_optimizer_snapshots_arrival_plan_template_snapshot_id_plan_task_template_snapshots_id_fk" FOREIGN KEY ("arrival_plan_template_snapshot_id") REFERENCES "public"."plan_task_template_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_optimizer_snapshots" ADD CONSTRAINT "plan_optimizer_snapshots_departure_plan_template_snapshot_id_plan_task_template_snapshots_id_fk" FOREIGN KEY ("departure_plan_template_snapshot_id") REFERENCES "public"."plan_task_template_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_resource_bundle_snapshots" ADD CONSTRAINT "plan_resource_bundle_snapshots_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_resource_items" ADD CONSTRAINT "plan_resource_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_resource_items" ADD CONSTRAINT "plan_resource_items_type_id_resource_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."resource_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_resource_items" ADD CONSTRAINT "plan_resource_items_resource_item_id_resource_items_id_fk" FOREIGN KEY ("resource_item_id") REFERENCES "public"."resource_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_resource_pools" ADD CONSTRAINT "plan_resource_pools_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_resource_pools" ADD CONSTRAINT "plan_resource_pools_pool_id_resource_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."resource_pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_space_settings" ADD CONSTRAINT "plan_space_settings_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_space_settings" ADD CONSTRAINT "plan_space_settings_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_space_settings" ADD CONSTRAINT "plan_space_settings_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_task_template_snapshots" ADD CONSTRAINT "plan_task_template_snapshots_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_zone_settings" ADD CONSTRAINT "plan_zone_settings_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_zone_settings" ADD CONSTRAINT "plan_zone_settings_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_accepted_exceptions" ADD CONSTRAINT "planning_accepted_exceptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_accepted_exceptions" ADD CONSTRAINT "planning_accepted_exceptions_stage_id_assisted_planning_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."assisted_planning_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_accepted_exceptions" ADD CONSTRAINT "planning_accepted_exceptions_config_revision_id_plan_config_revisions_id_fk" FOREIGN KEY ("config_revision_id") REFERENCES "public"."plan_config_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_runs" ADD CONSTRAINT "planning_runs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_stage_validations" ADD CONSTRAINT "planning_stage_validations_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_stage_validations" ADD CONSTRAINT "planning_stage_validations_session_id_assisted_planning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assisted_planning_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_stage_validations" ADD CONSTRAINT "planning_stage_validations_config_revision_id_plan_config_revisions_id_fk" FOREIGN KEY ("config_revision_id") REFERENCES "public"."plan_config_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_availability" ADD CONSTRAINT "resource_availability_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_availability" ADD CONSTRAINT "resource_availability_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_bundle_components" ADD CONSTRAINT "resource_bundle_components_bundle_id_resource_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."resource_bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_bundle_components" ADD CONSTRAINT "resource_bundle_components_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_bundle_components" ADD CONSTRAINT "resource_bundle_components_resource_item_id_resource_items_id_fk" FOREIGN KEY ("resource_item_id") REFERENCES "public"."resource_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_bundle_space_affinities" ADD CONSTRAINT "resource_bundle_space_affinities_bundle_id_resource_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."resource_bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_bundle_space_affinities" ADD CONSTRAINT "resource_bundle_space_affinities_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_items" ADD CONSTRAINT "resource_items_type_id_resource_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."resource_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_parent_space_id_spaces_id_fk" FOREIGN KEY ("parent_space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_depends_on_template_id_task_templates_id_fk" FOREIGN KEY ("depends_on_template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assisted_planning_sessions_plan_id_idx" ON "assisted_planning_sessions" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assisted_planning_sessions_one_active_per_plan" ON "assisted_planning_sessions" USING btree ("plan_id") WHERE "assisted_planning_sessions"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "assisted_planning_stages_session_ordinal_key" ON "assisted_planning_stages" USING btree ("session_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "assisted_planning_stages_one_live_child" ON "assisted_planning_stages" USING btree ("session_id","parent_stage_id") WHERE "assisted_planning_stages"."archived_at" IS NULL AND "assisted_planning_stages"."parent_stage_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "assisted_planning_stages_plan_id_idx" ON "assisted_planning_stages" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_config_revisions_plan_id_idx" ON "plan_config_revisions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_optimizer_snapshot_grouping_zones_snapshot_id_idx" ON "plan_optimizer_snapshot_grouping_zones" USING btree ("snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_optimizer_snapshot_grouping_zones_key" ON "plan_optimizer_snapshot_grouping_zones" USING btree ("snapshot_id","zone_id");--> statement-breakpoint
CREATE INDEX "plan_optimizer_snapshot_heuristics_snapshot_id_idx" ON "plan_optimizer_snapshot_heuristics" USING btree ("snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_optimizer_snapshot_heuristics_key" ON "plan_optimizer_snapshot_heuristics" USING btree ("snapshot_id","heuristic_key");--> statement-breakpoint
CREATE INDEX "plan_optimizer_snapshots_plan_id_idx" ON "plan_optimizer_snapshots" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_optimizer_snapshots_plan_key" ON "plan_optimizer_snapshots" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_resource_bundle_snapshots_plan_uidx" ON "plan_resource_bundle_snapshots" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_space_settings_plan_space_uidx" ON "plan_space_settings" USING btree ("plan_id","space_id");--> statement-breakpoint
CREATE INDEX "plan_task_template_snapshots_plan_id_idx" ON "plan_task_template_snapshots" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_task_template_snapshots_plan_template_key" ON "plan_task_template_snapshots" USING btree ("plan_id","source_template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_zone_settings_plan_zone_uidx" ON "plan_zone_settings" USING btree ("plan_id","zone_id");--> statement-breakpoint
CREATE INDEX "planning_accepted_exceptions_stage_id_idx" ON "planning_accepted_exceptions" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "planning_accepted_exceptions_plan_status_idx" ON "planning_accepted_exceptions" USING btree ("plan_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "planning_accepted_exceptions_stage_violation_key" ON "planning_accepted_exceptions" USING btree ("stage_id","severity","violation_key");--> statement-breakpoint
CREATE INDEX "planning_runs_plan_id_idx" ON "planning_runs" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "planning_runs_plan_created_at_idx" ON "planning_runs" USING btree ("plan_id","created_at");--> statement-breakpoint
CREATE INDEX "planning_runs_assisted_session_created_idx" ON "planning_runs" USING btree ("assisted_session_id","created_at");--> statement-breakpoint
CREATE INDEX "planning_stage_validations_draft_idx" ON "planning_stage_validations" USING btree ("session_id","draft_fingerprint");--> statement-breakpoint
CREATE INDEX "resource_bundle_components_bundle_id_idx" ON "resource_bundle_components" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX "resource_bundle_components_resource_id_idx" ON "resource_bundle_components" USING btree ("resource_id") WHERE "resource_bundle_components"."resource_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "resource_bundle_components_resource_item_id_idx" ON "resource_bundle_components" USING btree ("resource_item_id") WHERE "resource_bundle_components"."resource_item_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "resource_bundle_space_affinities_bundle_id_idx" ON "resource_bundle_space_affinities" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX "resource_bundle_space_affinities_space_id_idx" ON "resource_bundle_space_affinities" USING btree ("space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_bundle_space_affinities_bundle_space_key" ON "resource_bundle_space_affinities" USING btree ("bundle_id","space_id");--> statement-breakpoint
CREATE INDEX "resource_bundles_is_active_idx" ON "resource_bundles" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_resource_items_type" ON "resource_items" USING btree ("type_id");