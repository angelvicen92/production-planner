import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../supabase/migrations/077_assisted_planning_state.sql", import.meta.url), "utf8");
const schema = await readFile(new URL("../shared/schema.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("./storage.ts", import.meta.url), "utf8");

test("077 creates all five authorities and workflow uniqueness", () => {
  for (const table of ["plan_config_revisions", "assisted_planning_sessions", "assisted_planning_stages", "planning_stage_validations", "planning_accepted_exceptions"])
    assert.match(sql, new RegExp(`CREATE TABLE public\\.${table}`));
  assert.match(sql, /one_active_per_plan[\s\S]*WHERE status = 'ACTIVE'/);
  assert.match(sql, /UNIQUE \(session_id, ordinal\)/);
  assert.match(sql, /is_positive_integer_jsonb_array\(scope_task_ids_json\)/);
  assert.match(sql, /is_positive_integer_jsonb_array\(affected_task_ids_json\)/);
  assert.match(sql, /identity_json->>'configurationFingerprint' = fingerprint/);
});

test("cross-plan references retain composite integrity and validations are bounded", () => {
  for (const token of ["assisted_stages_session_fk", "assisted_stages_parent_fk", "assisted_stages_config_fk", "stage_validations_base_fk", "accepted_exceptions_stage_fk"])
    assert.ok(sql.includes(token), token);
  assert.match(sql, /hard_count >= 0/); assert.match(sql, /required_count >= 0/); assert.match(sql, /preferred_count >= 0/);
  assert.match(sql, /severity IN \('HARD', 'REQUIRED'\)/);
  assert.match(sql, /status IN \('ACTIVE', 'RESOLVED', 'STALE', 'SUPERSEDED'\)/);
  assert.match(sql, /assisted_sessions_validation_fk[\s\S]*draft_fingerprint, current_config_revision_id/);
  assert.match(sql, /guard_assisted_stage_proposal_plan/);
});

test("accepted stages reject mutation except their first archive transition", () => {
  assert.match(sql, /guard_assisted_planning_stage_update/);
  assert.match(sql, /OLD\.archived_at IS NOT NULL OR NEW\.archived_at IS NULL/);
  assert.match(sql, /to_jsonb\(NEW\) - 'archived_at'/);
  assert.match(storage, /update\(\{ archived_at: archivedAt \}\)[\s\S]*is\("archived_at", null\)/);
});

test("RLS reads all product roles and writes only admin or production", () => {
  for (const role of ["admin", "production", "aux", "viewer"]) assert.match(sql, new RegExp(`has_role\\(''${role}''\\)`));
  assert.match(sql, /_write_admin_production/);
  assert.doesNotMatch(sql, /authenticated\s+USING\s*\(true\)/i);
});

test("Drizzle and storage expose all milestone authorities without daily task writes", () => {
  for (const name of ["planConfigRevisions", "assistedPlanningSessions", "assistedPlanningStages", "planningStageValidations", "planningAcceptedExceptions"])
    assert.ok(schema.includes(`export const ${name}`), name);
  for (const method of ["createPlanConfigRevision", "getActiveAssistedPlanningSession", "createAssistedPlanningStage", "createPlanningStageValidation", "createPlanningAcceptedException", "archiveAssistedPlanningStage"])
    assert.ok(storage.includes(`${method}(`), method);
  const assistedMethods = storage.slice(storage.indexOf("async createPlanConfigRevision"), storage.indexOf("async getPlans"));
  assert.doesNotMatch(assistedMethods, /daily_tasks/);
});
