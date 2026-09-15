import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration=await readFile(new URL("../supabase/migrations/080_assisted_clean_validation.sql",import.meta.url),"utf8");
const service=await readFile(new URL("./assistedPlanningService.ts",import.meta.url),"utf8");
const routes=await readFile(new URL("./routes.ts",import.meta.url),"utf8");
const compact=migration.replace(/\s+/g," ");
const rpc=migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION"),migration.indexOf("REVOKE ALL"));

test("validation delegates only to proposal-certified DB authority and permits incomplete stages",()=>{
  assert.match(service,/assisted_record_proposal_clean_validation/);
  assert.match(service,/PROPOSAL_CERTIFIED_CLEAN_V1/);
  assert.doesNotMatch(service,/validatePlan|scheduled\.length|adaptEngineInputToPlannerNextProblem/);
  assert.doesNotMatch(rpc,/daily_tasks|expectedTaskCount|reasonCodes/);
  assert.match(routes,/assisted\/validate/);
});
test("080 locks authorities and derives proposal provenance and evidence under the same transaction",()=>{
  assert.match(rpc,/status='ACTIVE' FOR UPDATE/);
  for(const code of ["STALE_DRAFT","STALE_BASE_STAGE","STALE_CONFIG_REVISION","VALIDATION_REQUIRED","RUN_RESULT_INVALID","VALIDATION_NOT_ACCEPTABLE"]) assert.match(rpc,new RegExp(code));
  for(const authority of ["proposalRunId","ASSISTED_SCOPE","assisted_session_id","base_stage_id","config_revision_id","result_fingerprint","proposedDraftSnapshot","proposedDraftFingerprint","scopeTaskIds","includePrerequisites","proposalCount","completeForScope","protectedPlacementsPreserved","hardValid","requiredValid"]) assert.match(rpc,new RegExp(authority));
  assert.match(compact,/INSERT INTO planning_stage_validations.*UPDATE assisted_planning_sessions/);
});
test("report is honest about preferred and caller cannot supply evidence",()=>{
  assert.match(rpc,/PROPOSAL_CERTIFIED_CLEAN_V1/);
  assert.match(rpc,/preferredAssessment','NOT_CLASSIFIED'/);
  assert.doesNotMatch(rpc,/p_report|p_proposal_run|p_hard|p_required/);
});
test("proposal validation RPC revokes every role before granting only service_role",()=>{
  for(const role of ["PUBLIC","anon","authenticated","service_role"]) assert.match(migration,new RegExp(`REVOKE ALL ON FUNCTION public\\.assisted_record_proposal_clean_validation[^;]+FROM ${role}`));
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.assisted_record_proposal_clean_validation[^;]+TO service_role/);
});
test("incomplete and internal-supporting snapshots are accepted based on clean ASST-005 evidence, not physical placement counts",()=>{
  assert.doesNotMatch(rpc,/jsonb_array_length\(result->'proposedDraftSnapshot'->'tasks'\).*proposal|plannedTaskCount|totalActiveObligationCount/);
  assert.doesNotMatch(rpc,/supportingTaskIds|includePrerequisites.*true/);
  assert.match(rpc,/evidence->>'completeForScope' IS DISTINCT FROM 'true'/);
});
