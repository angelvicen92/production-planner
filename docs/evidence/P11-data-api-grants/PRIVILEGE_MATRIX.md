# P11 — Matriz efectiva de la reconstrucción

PostgreSQL 17; ledger 001–099 sin editar + 100, sin grants automáticos para tablas/secuencias/funciones. `anon` no recibe ningún grant. Esta matriz se obtiene antes del bundle de seguridad del ensayo A2; el contrato machine-readable está en `script/demo/fixtures/data-api-privileges.json`.

`S/I/U/D` equivalen a SELECT/INSERT/UPDATE/DELETE. Los permisos adicionales de snapshots y secuencias son históricos explícitos, no concesiones nuevas de P11. Las columnas restringidas se muestran entre paréntesis.

## Tablas y vista

| Objeto | Creación | service_role efectivo | authenticated efectivo | Protección RLS/policies | Call path / uso |
|---|---|---|---|---|---|
| `assisted_planning_sessions` | 077 | SELECT, INSERT, UPDATE | SELECT | RLS; assisted_planning_sessions_insert_admin_production, assisted_planning_sessions_read_all_roles, assisted_planning_sessions_update_admin_production | POST /api/plans/:id/reset |
| `assisted_planning_stages` | 077 | SELECT, INSERT + UPDATE(archived_at) | SELECT | RLS; assisted_planning_stages_archive_admin_production, assisted_planning_stages_insert_admin_production, assisted_planning_stages_read_all_roles | storage: archiveAssistedPlanningStage, createAssistedPlanningStage, getAssistedPlanningHistoryTimings, getAssistedPlanningStage |
| `contestants` | 002 | SELECT, INSERT, UPDATE, DELETE | — | RLS; Allow authenticated delete contestants, Allow authenticated insert contestants, Allow authenticated read contestants, Allow authenticated update contestants | DELETE /api/plans/:id |
| `control_room_settings` | 047 | SELECT, UPDATE | — | RLS; control_room_settings_admin_update, control_room_settings_read_all_roles | server/routes.ts |
| `daily_tasks` | 001 | SELECT, INSERT, UPDATE, DELETE | SELECT | RLS; Allow authenticated read tasks, Allow authenticated write tasks | DELETE /api/daily-tasks/:id/lock; DELETE /api/plans/:id; GET /api/debug/daily-task/:taskId; GET /api/plans/:id/tasks |
| `engine_plan_results` | 070 | SELECT, INSERT, DELETE | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | POST /api/plans/:id/reset |
| `itinerant_teams` | 032 | SELECT, INSERT, UPDATE, DELETE | — | RLS; Allow authenticated read itinerant_teams, itinerant_teams_admin_all, itinerant_teams_read_authenticated | storage: syncPlanMealBreaks |
| `locks` | 001 | SELECT, INSERT, UPDATE, DELETE | SELECT | RLS; locks_read_all_roles, locks_write_admin_production | DELETE /api/daily-tasks/:id/lock; DELETE /api/plans/:id; DELETE /api/plans/:id/time-locks; GET /api/plans/:id/locks |
| `operational_incident_events` | 094 | SELECT, INSERT | SELECT | RLS; incident_events_read_scope | /api/plans/:planId/incidents/* → incident_query / incident_command. |
| `operational_incidents` | 094 | SELECT, INSERT + UPDATE(type,cause,status,context,task_id,version,zone_id,severity,space_id,updated_at,description,resolved_at,resource_id,contestant_id,responsible_id,resolution_note) | SELECT | RLS; incidents_read_scope | /api/plans/:planId/incidents/* → incident_query / incident_command. |
| `optimizer_settings` | 026 | SELECT, UPDATE | — | RLS; optimizer_settings_admin_all | storage: createPlan, getOptimizerSettings |
| `plan_breaks` | 043 | SELECT, INSERT, UPDATE, DELETE | — | RLS; plan_breaks_read_all_roles, plan_breaks_write_admin_production | POST /api/plans/:id/manual-block; POST /api/plans/:id/reset |
| `plan_config_revisions` | 077 | SELECT, INSERT | SELECT | RLS; plan_config_revisions_insert_admin_production, plan_config_revisions_read_all_roles | storage: createPlanConfigRevision, getPlanConfigRevision, listPlanConfigRevisions |
| `plan_header_notes` | 095 | SELECT, INSERT + UPDATE(lines,version,updated_at,updated_by) | SELECT | RLS; planning_header_read | /api/plans/:planId/header-notes → SELECT / save_planning_header_notes. |
| `plan_optimizer_snapshot_grouping_zones` | 075 | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | storage: createPlan, getPlanOptimizerSnapshot |
| `plan_optimizer_snapshot_heuristics` | 075 | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | storage: createPlan, getPlanOptimizerSnapshot |
| `plan_optimizer_snapshots` | 075 | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | storage: createPlan, getPlanOptimizerSnapshot |
| `plan_resource_bundle_snapshots` | 076 | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | storage: createPlan, getPlanResourceBundleSnapshot |
| `plan_resource_items` | 006 | SELECT, INSERT, UPDATE, DELETE | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | DELETE /api/plans/:id |
| `plan_resource_pools` | 005 | SELECT, INSERT, UPDATE, DELETE | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | DELETE /api/plans/:id |
| `plan_space_resource_assignments` | 013 | SELECT, INSERT, DELETE | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | storage: getSpaceResourceAssignmentsForPlan |
| `plan_space_resource_type_requirements` | 020 | SELECT, INSERT, DELETE | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | storage: createPlan, getSpaceResourceTypeRequirementsForPlan |
| `plan_space_settings` | 073 | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | storage: createDailyTask, createPlan, getPlanSpaceSettings, initializePlanSpatialAvailabilitySnapshots |
| `plan_staff_assignments` | 029 | SELECT, INSERT, DELETE | — | RLS; Allow authenticated read plan_staff_assignments, Allow authenticated write plan_staff_assignments | storage: createPlan |
| `plan_summaries` | 048 | SELECT | — | security_invoker=true | storage: getPlans |
| `plan_task_template_snapshots` | 074 | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | POST /api/plans/:id/manual-block |
| `plan_vocal_coach_rules` | 023 | SELECT, INSERT, DELETE | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | server/routes.ts |
| `plan_zone_resource_assignments` | 014 | SELECT, INSERT, DELETE | — | RLS; plan_zone_resource_assignments_read_all_roles, plan_zone_resource_assignments_write_admin_production | storage: createPlan, getZoneResourceAssignmentsForPlan |
| `plan_zone_resource_type_requirements` | 020 | SELECT, INSERT, DELETE | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | storage: createPlan, getZoneResourceTypeRequirementsForPlan |
| `plan_zone_settings` | 073 | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | storage: createPlan, getPlanZoneSettings, initializePlanSpatialAvailabilitySnapshots, updatePlanSpaceAvailability |
| `plan_zone_staff_mode` | 029 | SELECT, INSERT, DELETE | — | RLS; Allow authenticated read plan_zone_staff_mode, Allow authenticated write plan_zone_staff_mode | storage: createPlan |
| `planning_accepted_exceptions` | 077 | SELECT, INSERT + UPDATE(status,resolved_at) | SELECT | RLS; planning_accepted_exceptions_insert_admin_production, planning_accepted_exceptions_read_all_roles, planning_accepted_exceptions_update_admin_production | storage: createPlanningAcceptedException, listPlanningAcceptedExceptions |
| `planning_runs` | 047 | SELECT, INSERT, UPDATE | SELECT | RLS; planning_runs_read_all_roles, planning_runs_write_admin_production | storage: create, createPlanningRunDiagnostics, fail, find |
| `planning_stage_validations` | 077 | SELECT, INSERT | SELECT | RLS; planning_stage_validations_insert_admin_production, planning_stage_validations_read_all_roles | storage: createPlanningStageValidation, getPlanningStageValidation |
| `plans` | 001 | SELECT, INSERT, UPDATE, DELETE | SELECT | RLS; plans_read_all_roles, plans_write_admin_production | DELETE /api/plans/:id; DELETE /api/plans/:id/time-locks; GET /api/me/preferences; POST /api/me/preferences/favorite-plan |
| `program_settings` | 011 | SELECT, UPDATE | — | RLS; program_settings_admin_all | storage: createPlan, getPlanEngineInputDetails, getPlanFullDetails, syncPlanMealBreaks |
| `resource_availability` | 001 | SELECT, DELETE | — | RLS; Allow authenticated read availability, resource_availability_read_all_roles, resource_availability_write_admin_production | DELETE /api/plans/:id |
| `resource_bundle_components` | 066 | SELECT | — | RLS; resource_bundle_components_admin_all, resource_bundle_components_read_all_roles | storage: createPlan, getResourceBundleComponents |
| `resource_bundle_space_affinities` | 066 | SELECT | — | RLS; resource_bundle_space_affinities_admin_all, resource_bundle_space_affinities_read_all_roles | storage: createPlan, getResourceBundleSpaceAffinities |
| `resource_bundles` | 066 | SELECT | — | RLS; resource_bundles_admin_all, resource_bundles_read_all_roles | storage: createPlan, getResourceBundles |
| `resource_item_components` | 018 | SELECT, INSERT, DELETE | — | RLS; resource_item_components_admin_all, resource_item_components_read_all_roles | GET /api/resource-items/:id/components; PUT /api/resource-items/:id/components |
| `resource_items` | 006 | SELECT, INSERT, UPDATE | — | RLS; resource_items_admin_all, resource_items_read_authenticated | DELETE /api/resource-items/:id; GET /api/resource-items/:id/components; PATCH /api/admin/users/:userId/links; PATCH /api/resource-items/:id |
| `resource_pools` | 005 | SELECT, INSERT, UPDATE, DELETE | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | DELETE /api/resource-pools/:id; GET /api/resource-pools; PATCH /api/resource-pools/:id; POST /api/resource-pools |
| `resource_types` | 006 | SELECT, INSERT, UPDATE | — | RLS; resource_types_admin_all, resource_types_read_authenticated | DELETE /api/resource-types/:id; GET /api/resource-types-with-items; POST /api/resource-types |
| `resources` | 001 | — | — | RLS; Allow authenticated read resources, resources_admin_all, resources_read_all_roles | Tabla legacy; sin call path Data API actual. Sin grant nuevo. |
| `roles` | 037 | SELECT | — | RLS; roles_read_authenticated | PATCH /api/admin/users/:userId/role; POST /api/bootstrap-role |
| `space_resource_defaults` | 013 | SELECT, INSERT, DELETE | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | server/routes.ts |
| `space_resource_type_defaults` | 020 | SELECT, INSERT, DELETE | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | storage: createPlan |
| `spaces` | 001 | SELECT, INSERT, UPDATE, DELETE | — | RLS; Allow authenticated read spaces, spaces_admin_delete | storage: createPlan, createSpace, getSpaces, initializePlanSpatialAvailabilitySnapshots |
| `staff_assignment_defaults` | 030 | SELECT, INSERT, DELETE | — | RLS; Allow authenticated read staff_assignment_defaults, Allow authenticated write staff_assignment_defaults | storage: createPlan |
| `staff_people` | 029 | SELECT, INSERT, UPDATE, DELETE | — | RLS; Allow authenticated read staff_people, staff_people_admin_all, staff_people_read_authenticated | PATCH /api/admin/users/:userId/links |
| `staff_zone_mode_defaults` | 030 | SELECT, INSERT, DELETE | — | RLS; Allow authenticated read staff_zone_mode_defaults, Allow authenticated write staff_zone_mode_defaults | storage: createPlan |
| `task_status_events` | 039 | SELECT, INSERT | — | RLS; task_status_events_read_all_roles, task_status_events_write_admin_production | /api/tasks/:id/status, /real-time, /execution-history → RPC INVOKER de ejecución; eventos append-only. |
| `task_templates` | 001 | SELECT, INSERT, UPDATE, DELETE | — | RLS; task_templates_admin_all | POST /api/plans/:id/manual-block |
| `user_entity_links` | 040 | SELECT, INSERT, UPDATE, DELETE | — | RLS; user_entity_links_admin_manage, user_entity_links_select_self_or_admin | GET /api/admin/users; GET /api/me/links; PATCH /api/admin/users/:userId/links |
| `user_preferences` | 045 | — | — | RLS; user_preferences_insert_self, user_preferences_select_self, user_preferences_update_self | Legacy 045; preferencias vigentes usan plans.is_favorite (052). Sin grant nuevo. |
| `user_roles` | 037 | SELECT, INSERT, UPDATE, DELETE | — | RLS; user_roles_admin_manage, user_roles_read_self_or_admin | GET /api/admin/users; PATCH /api/admin/users/:userId/role; POST /api/bootstrap-role |
| `vocal_coach_rules` | 024 | SELECT, INSERT, DELETE | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | storage: createContestantForPlan, updateContestantForPlan |
| `zone_resource_defaults` | 014 | SELECT, INSERT, DELETE | — | RLS; zone_resource_defaults_admin_all, zone_resource_defaults_read_all_roles | storage: createPlan |
| `zone_resource_type_defaults` | 020 | SELECT, INSERT, DELETE | — | RLS; sin policies: denegación para clientes; servidor BYPASSRLS | storage: createPlan |
| `zones` | 001 | SELECT, INSERT, UPDATE, DELETE | — | RLS; Allow authenticated read static, zones_admin_all, zones_admin_delete, zones_read_all_roles | storage: createPlan, createZone, getZones, initializePlanSpatialAvailabilitySnapshots |

Los 61 objetos anteriores (60 tablas + plan_summaries) carecen de SELECT/INSERT/UPDATE/DELETE para anon en la reconstrucción restringida. service_role puede leer 59 objetos; resources y user_preferences quedan inaccesibles por falta de grant. authenticated puede leer 12 objetos tras la 100: cada fila queda bajo sus policies. El bundle histórico `script/demo/sql/security.sql` incorpora además 15 lecturas autenticadas y sus límites RLS, como en el ensayo nativo preexistente; el gate registra por separado sus 27 lecturas y los ocho objetos deliberadamente sin policies.

## Secuencias

Las 20 concesiones nuevas son exclusivamente USAGE para `nextval()` de secuencias serial usadas por INSERT. Las identity no necesitan grants de secuencia para asignación interna. Los snapshots y Stages ya conservan sus grants explícitos históricos.

| Secuencia | Propietaria | anon | authenticated | service_role |
|---|---|---|---|---|
| `assisted_planning_sessions_id_seq` | assisted_planning_sessions | — | USAGE, SELECT | USAGE, SELECT |
| `assisted_planning_stages_id_seq` | assisted_planning_stages | — | USAGE, SELECT | USAGE, SELECT |
| `contestants_id_seq` | contestants | — | — | — |
| `daily_tasks_id_seq` | daily_tasks | — | — | — |
| `engine_plan_results_id_seq` | engine_plan_results | — | — | USAGE |
| `itinerant_teams_id_seq` | itinerant_teams | — | — | — |
| `locks_id_seq` | locks | — | — | — |
| `operational_incident_events_id_seq` | operational_incident_events | — | — | USAGE |
| `plan_breaks_id_seq` | plan_breaks | — | — | USAGE |
| `plan_config_revisions_id_seq` | plan_config_revisions | — | USAGE, SELECT | USAGE, SELECT |
| `plan_optimizer_snapshot_grouping_zones_id_seq` | plan_optimizer_snapshot_grouping_zones | — | — | USAGE, SELECT, UPDATE |
| `plan_optimizer_snapshot_heuristics_id_seq` | plan_optimizer_snapshot_heuristics | — | — | USAGE, SELECT, UPDATE |
| `plan_optimizer_snapshots_id_seq` | plan_optimizer_snapshots | — | — | USAGE, SELECT, UPDATE |
| `plan_resource_bundle_snapshots_id_seq` | plan_resource_bundle_snapshots | — | — | USAGE, SELECT, UPDATE |
| `plan_resource_items_id_seq` | plan_resource_items | — | — | USAGE |
| `plan_resource_pools_id_seq` | plan_resource_pools | — | — | USAGE |
| `plan_space_resource_assignments_id_seq` | plan_space_resource_assignments | — | — | USAGE |
| `plan_space_resource_type_requirements_id_seq` | plan_space_resource_type_requirements | — | — | USAGE |
| `plan_space_settings_id_seq` | plan_space_settings | — | — | USAGE, SELECT, UPDATE |
| `plan_staff_assignments_id_seq` | plan_staff_assignments | — | — | — |
| `plan_task_template_snapshots_id_seq` | plan_task_template_snapshots | — | — | USAGE, SELECT, UPDATE |
| `plan_vocal_coach_rules_id_seq` | plan_vocal_coach_rules | — | — | USAGE |
| `plan_zone_resource_assignments_id_seq` | plan_zone_resource_assignments | — | — | USAGE |
| `plan_zone_resource_type_requirements_id_seq` | plan_zone_resource_type_requirements | — | — | USAGE |
| `plan_zone_settings_id_seq` | plan_zone_settings | — | — | USAGE, SELECT, UPDATE |
| `planning_accepted_exceptions_id_seq` | planning_accepted_exceptions | — | USAGE, SELECT | USAGE, SELECT |
| `planning_runs_id_seq` | planning_runs | — | — | USAGE |
| `planning_stage_validations_id_seq` | planning_stage_validations | — | USAGE, SELECT | USAGE, SELECT |
| `plans_id_seq` | plans | — | — | — |
| `resource_availability_id_seq` | resource_availability | — | — | — |
| `resource_item_components_id_seq` | resource_item_components | — | — | USAGE |
| `resource_items_id_seq` | resource_items | — | — | USAGE |
| `resource_pools_id_seq` | resource_pools | — | — | USAGE |
| `resource_types_id_seq` | resource_types | — | — | USAGE |
| `resources_id_seq` | resources | — | — | — |
| `space_resource_defaults_id_seq` | space_resource_defaults | — | — | USAGE |
| `space_resource_type_defaults_id_seq` | space_resource_type_defaults | — | — | USAGE |
| `spaces_id_seq` | spaces | — | — | — |
| `staff_assignment_defaults_id_seq` | staff_assignment_defaults | — | — | — |
| `staff_people_id_seq` | staff_people | — | — | — |
| `task_status_events_id_seq` | task_status_events | — | — | USAGE |
| `task_templates_id_seq` | task_templates | — | — | — |
| `user_entity_links_id_seq` | user_entity_links | — | — | — |
| `vocal_coach_rules_id_seq` | vocal_coach_rules | — | — | USAGE |
| `zone_resource_defaults_id_seq` | zone_resource_defaults | — | — | USAGE |
| `zone_resource_type_defaults_id_seq` | zone_resource_type_defaults | — | — | USAGE |
| `zones_id_seq` | zones | — | — | — |

## Funciones públicas

La columna actores indica EXECUTE efectivo, incluyendo herencia de PUBLIC. `trigger` no necesita EXECUTE del llamador para dispararse; sus funciones no reciben grants nuevos. P11 sólo añade EXECUTE a cuatro helpers puros usados por vistas/CHECKs. Las RPC privilegiadas conservan exactamente sus firmas, cuerpo, SECURITY y actores.

| Firma | Creador / última redefinición | Tipo | EXECUTE efectivo | Uso |
|---|---|---|---|---|
| `apply_day_config_operation(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)` | 084/099 | INVOKER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `apply_day_config_operation_v2(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)` | 085/099 | INVOKER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `apply_day_config_operation_v3(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)` | 092/092 | INVOKER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `assisted_accept_stage(integer,uuid,text,bigint,text)` | 078/089 | INVOKER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `assisted_apply_config_refresh(integer,uuid,bigint,jsonb,jsonb,jsonb)` | 083/099 | INVOKER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `assisted_apply_proposal(integer,bigint,text,bigint)` | 079/079 | DEFINER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `assisted_apply_snapshot(integer,jsonb)` | 078/086 | DEFINER; void | — | /api/plans/:id/assisted/* y configuración versionada |
| `assisted_bootstrap_session(integer,uuid,jsonb,jsonb,jsonb,text)` | 078/086 | DEFINER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `assisted_finish_proposal(integer,bigint,jsonb)` | 079/079 | DEFINER; void | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `assisted_move_draft_edit(integer,text,bigint,boolean)` | 081/081 | INVOKER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `assisted_move_stage(integer,bigint,boolean)` | 078/078 | DEFINER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `assisted_patch_draft(integer,text,bigint,jsonb,text)` | 078/090 | INVOKER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `assisted_record_manual_clean_validation(integer,text,bigint,bigint,jsonb)` | 081/081 | INVOKER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `assisted_record_proposal_clean_validation(integer,text,bigint,bigint)` | 080/080 | INVOKER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `assisted_record_stage_validation(integer,text,bigint,bigint,jsonb)` | 082/082 | INVOKER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `assisted_restart_bootstrap(integer,text,bigint)` | 091/091 | INVOKER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `correct_task_execution_time(bigint,uuid,text,text,text,integer)` | 097/098 | INVOKER; daily_tasks | service_role | /api/tasks/* y /api/plans/:id/execution |
| `execute_task_transition(bigint,uuid,text,text,integer)` | 093/098 | INVOKER; daily_tasks | service_role | /api/tasks/* y /api/plans/:id/execution |
| `execution_clock(bigint)` | 093/093 | INVOKER; jsonb | service_role | /api/tasks/* y /api/plans/:id/execution |
| `execution_context(bigint,uuid)` | 093/096 | INVOKER; jsonb | service_role | /api/tasks/* y /api/plans/:id/execution |
| `execution_history_immutable()` | 097/097 | INVOKER; trigger | — | Trigger interno; no RPC de producto |
| `execution_plan_ready(bigint)` | 093/093 | INVOKER; boolean | service_role | /api/tasks/* y /api/plans/:id/execution |
| `execution_task_authorized(bigint,uuid)` | 093/093 | INVOKER; boolean | service_role | /api/tasks/* y /api/plans/:id/execution |
| `execution_task_resources(bigint)` | 093/093 | INVOKER; SETOF plan_resource_items | service_role | /api/tasks/* y /api/plans/:id/execution |
| `execution_task_scope(bigint,uuid)` | 093/096 | INVOKER; boolean | service_role | /api/tasks/* y /api/plans/:id/execution |
| `guard_assisted_planning_stage_update()` | 077/077 | INVOKER; trigger | — | Trigger interno; no RPC de producto |
| `guard_assisted_stage_proposal_plan()` | 077/089 | INVOKER; trigger | — | Trigger interno; no RPC de producto |
| `guard_main_flow_preference()` | 092/092 | INVOKER; trigger | — | Trigger interno; no RPC de producto |
| `guard_transport_policy_revision()` | 099/099 | INVOKER; trigger | — | Trigger interno; no RPC de producto |
| `has_role(text)` | 037/037 | DEFINER; boolean | authenticated | RLS: identidad viva en user_roles |
| `hhmm_to_minutes(text)` | 048/048 | INVOKER; integer | service_role | Helper de CHECK/vista |
| `incident_actor_name(uuid,text)` | 094/094 | INVOKER; text | service_role | /api/plans/:id/incidents/* |
| `incident_command(bigint,uuid,text,jsonb,uuid,integer,text)` | 094/094 | INVOKER; jsonb | service_role | /api/plans/:id/incidents/* |
| `incident_document(operational_incidents,uuid)` | 094/094 | INVOKER; jsonb | service_role | /api/plans/:id/incidents/* |
| `incident_manageable(bigint,bigint,uuid)` | 094/094 | INVOKER; boolean | service_role | /api/plans/:id/incidents/* |
| `incident_query(bigint,uuid,uuid,boolean)` | 094/094 | INVOKER; jsonb | service_role | /api/plans/:id/incidents/* |
| `incident_role(uuid)` | 094/094 | INVOKER; text | service_role | /api/plans/:id/incidents/* |
| `incident_validate_links()` | 094/094 | INVOKER; trigger | service_role | Trigger interno; no RPC de producto |
| `incident_visible(bigint,bigint,uuid)` | 094/094 | INVOKER; boolean | service_role | /api/plans/:id/incidents/* |
| `initialize_day_config_revision(integer,uuid,jsonb,jsonb,jsonb)` | 084/087 | INVOKER; bigint | service_role | /api/plans/:id/assisted/* y configuración versionada |
| `is_positive_integer_jsonb_array(jsonb)` | 077/077 | INVOKER; boolean | service_role | Helper de CHECK/vista |
| `optimizer_baseline_from_assisted_refresh()` | 085/085 | DEFINER; trigger | — | Trigger interno; no RPC de producto |
| `optimizer_snapshot_provenance_metadata()` | 085/085 | INVOKER; trigger | — | Trigger interno; no RPC de producto |
| `planning_header_scope_valid()` | 095/095 | INVOKER; trigger | — | Trigger interno; no RPC de producto |
| `positive_integer_jsonb_array(jsonb)` | 079/079 | INVOKER; boolean | service_role | Helper de CHECK/vista |
| `preserve_plan_planner_next_configuration()` | 088/088 | INVOKER; trigger | — | Trigger interno; no RPC de producto |
| `reset_task_execution(bigint,uuid)` | 093/097 | INVOKER; daily_tasks | service_role | /api/tasks/* y /api/plans/:id/execution |
| `save_planning_header_notes(bigint,uuid,text,bigint,integer,jsonb)` | 095/095 | INVOKER; jsonb | service_role | /api/plans/:id/header-notes |
| `set_resource_bundle_updated_at()` | 066/066 | INVOKER; trigger | — | Trigger interno; no RPC de producto |
| `spec11_validate_plan_optimizer_grouping_zone_scope()` | 075/075 | INVOKER; trigger | — | Trigger interno; no RPC de producto |
| `spec11_validate_plan_optimizer_snapshot_scope()` | 075/075 | INVOKER; trigger | — | Trigger interno; no RPC de producto |
| `task_execution_history(bigint,uuid)` | 097/097 | INVOKER; jsonb | service_role | /api/tasks/* y /api/plans/:id/execution |
| `valid_planning_header_lines(jsonb)` | 095/095 | INVOKER; boolean | service_role | Helper de CHECK/vista |

`incident_private.visible(bigint,bigint)` permanece fuera del esquema expuesto; su USAGE/EXECUTE authenticated ya se define en 094. Evalúa auth.uid() y delega su predicado fijo bajo SECURITY DEFINER para leer snapshots privados. Su comportamiento se ejerce mediante las lecturas RLS reales de incidentes. `auth.uid()` es una primitiva de plataforma, fuera de public.

## Trazabilidad y transporte

`source-calls.json` conserva 410 call sites de supabase-js con archivo/línea, operaciones y endpoints directos cuando están contenidos en un handler. Las llamadas de storage incluyen el método; los lectores indirectos se resuelven por los endpoints de planes, configuración y tareas. Los .rpc dinámicos de Assisted están además ejercidos por los ensayos y sus firmas constan arriba.

`server/supabase.ts` crea el cliente Admin con service_role; `server/storage.ts`, authz y rutas envían SQL por PostgREST. La clave anon del servidor se usa para `auth.getUser(token)`, sin requerir grants sobre public. El navegador usa Auth y las cinco suscripciones Realtime de use-plan-realtime.ts. La conexión `server/db.ts` crea un Pool/Drizzle; el pool importado en rutas no ejecuta las operaciones auditadas. Las consultas directas PostgreSQL del ensayo son bootstrap, auditoría, fixtures e inyección local; no representan el transporte productivo de storage.
