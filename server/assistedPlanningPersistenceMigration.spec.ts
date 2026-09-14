import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../supabase/migrations/077_assisted_planning_state.sql", import.meta.url), "utf8");
const schema = await readFile(new URL("../shared/schema.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("./storage.ts", import.meta.url), "utf8");

const normalizedSql = sql.replace(/\s+/g, " ");

test("077 creates all five authorities and keeps one ACTIVE session per plan", () => {
  for (const table of ["plan_config_revisions", "assisted_planning_sessions", "assisted_planning_stages", "planning_stage_validations", "planning_accepted_exceptions"])
    assert.match(sql, new RegExp(`CREATE TABLE public\\.${table}`));
  assert.match(sql, /one_active_per_plan[\s\S]*WHERE status = 'ACTIVE'/);
  assert.match(sql, /UNIQUE \(session_id, ordinal\)/);
  assert.match(sql, /is_positive_integer_jsonb_array\(scope_task_ids_json\)/);
  assert.match(sql, /is_positive_integer_jsonb_array\(affected_task_ids_json\)/);
  assert.match(sql, /identity_json->>'configurationFingerprint' = fingerprint/);
});

test("A -> B -> A fingerprints remain distinct historical revisions with same-plan lineage", () => {
  assert.doesNotMatch(sql, /UNIQUE\s*\(\s*plan_id\s*,\s*fingerprint\s*\)/i);
  assert.doesNotMatch(sql, /CREATE\s+UNIQUE\s+INDEX[^;]*fingerprint/i);
  assert.match(normalizedSql, /UNIQUE \(id, plan_id\).*FOREIGN KEY \(parent_revision_id, plan_id\) REFERENCES public\.plan_config_revisions\(id, plan_id\)/);
});

test("cross-plan references stay composite and plan deletion cascades through historical roots", () => {
  for (const token of ["plan_config_revisions_parent_fk", "assisted_sessions_config_fk", "assisted_stages_session_fk", "assisted_stages_parent_fk", "assisted_stages_config_fk", "stage_validations_session_fk", "stage_validations_base_fk", "stage_validations_config_fk", "accepted_exceptions_stage_fk"])
    assert.ok(sql.includes(token), token);
  assert.match(sql, /plan_config_revisions[\s\S]*plan_id INTEGER NOT NULL REFERENCES public\.plans\(id\) ON DELETE CASCADE/);
  assert.match(sql, /assisted_stages_session_fk[\s\S]*ON DELETE CASCADE/);
  assert.match(sql, /accepted_exceptions_stage_fk[\s\S]*ON DELETE CASCADE/);
  assert.match(sql, /hard_count >= 0/); assert.match(sql, /required_count >= 0/); assert.match(sql, /preferred_count >= 0/);
  assert.match(sql, /assisted_sessions_validation_fk[\s\S]*draft_fingerprint, current_config_revision_id/);
  assert.match(sql, /guard_assisted_stage_proposal_plan/);
});

test("service-role privileges enforce history while preserving plan-owned cascades", () => {
  assert.match(normalizedSql, /REVOKE ALL ON TABLE .* FROM anon, authenticated, service_role/);
  assert.match(normalizedSql, /GRANT SELECT, INSERT ON TABLE public\.plan_config_revisions, public\.planning_stage_validations TO authenticated, service_role/);
  assert.match(normalizedSql, /GRANT SELECT, INSERT ON TABLE public\.assisted_planning_stages TO authenticated, service_role/);
  assert.match(normalizedSql, /GRANT UPDATE \(archived_at\) ON TABLE public\.assisted_planning_stages TO authenticated, service_role/);
  assert.match(normalizedSql, /GRANT SELECT, INSERT ON TABLE public\.planning_accepted_exceptions TO authenticated, service_role/);
  assert.match(normalizedSql, /GRANT UPDATE \(status, resolved_at\) ON TABLE public\.planning_accepted_exceptions TO authenticated, service_role/);
  assert.match(normalizedSql, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.assisted_planning_sessions TO authenticated, service_role/);
  assert.doesNotMatch(normalizedSql, /GRANT[^;]*DELETE[^;]*(plan_config_revisions|assisted_planning_sessions|assisted_planning_stages|planning_stage_validations|planning_accepted_exceptions)/);
  assert.doesNotMatch(normalizedSql, /assisted_planning_sessions_delete_admin_production/);
});

test("accepted stages reject mutation except their first archive transition", () => {
  assert.match(sql, /guard_assisted_planning_stage_update/);
  assert.match(sql, /OLD\.archived_at IS NOT NULL OR NEW\.archived_at IS NULL/);
  assert.match(sql, /to_jsonb\(NEW\) - 'archived_at'/);
  assert.match(storage, /update\(\{ archived_at: archivedAt \}\)[\s\S]*is\("archived_at", null\)/);
});

test("RLS complements rather than broadens physical privileges", () => {
  for (const role of ["admin", "production", "aux", "viewer"]) assert.match(sql, new RegExp(`has_role\\(''${role}''\\)`));
  assert.doesNotMatch(sql, /FOR ALL TO authenticated/);
  assert.doesNotMatch(sql, /authenticated\s+USING\s*\(true\)/i);
});

test("Drizzle and storage expose milestone authorities without assisted daily-task writes", () => {
  for (const name of ["planConfigRevisions", "assistedPlanningSessions", "assistedPlanningStages", "planningStageValidations", "planningAcceptedExceptions"])
    assert.ok(schema.includes(`export const ${name}`), name);
  for (const method of ["createPlanConfigRevision", "getActiveAssistedPlanningSession", "updateAssistedPlanningSession", "createAssistedPlanningStage", "createPlanningStageValidation", "createPlanningAcceptedException", "archiveAssistedPlanningStage"])
    assert.ok(storage.includes(`${method}(`), method);
  const assistedMethods = storage.slice(storage.indexOf("async createPlanConfigRevision"), storage.indexOf("async getPlans"));
  assert.doesNotMatch(assistedMethods, /daily_tasks/);
});
