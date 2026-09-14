import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const sql=await readFile(new URL("../supabase/migrations/079_assisted_proposal_runs.sql",import.meta.url),"utf8");
const schema=await readFile(new URL("../shared/schema.ts",import.meta.url),"utf8");
test("079 extends planning_runs without introducing a job table",()=>{
 for(const column of ["execution_kind","assisted_session_id","base_stage_id","config_revision_id","scope_json","scope_task_ids_json","include_prerequisites","source_draft_fingerprint","result_fingerprint","assisted_result_json"]) assert.match(sql,new RegExp(`ADD COLUMN ${column}`));
 assert.doesNotMatch(sql,/CREATE TABLE/i); assert.match(schema,/assistedResultJson/);
});
test("apply is one locked authority operation and never writes product tasks",()=>{
 const apply=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.assisted_apply_proposal"),sql.indexOf("REVOKE ALL ON FUNCTION public.assisted_apply_proposal"));
 assert.match(apply,/status='ACTIVE' FOR UPDATE/); assert.match(apply,/draft_validation_id=NULL/);
 assert.doesNotMatch(apply,/UPDATE daily_tasks|INSERT INTO daily_tasks|DELETE FROM daily_tasks/);
 for(const gate of ["RUN_NOT_FOUND","RUN_SESSION_MISMATCH","RUN_NOT_READY","RUN_HAS_NO_PROPOSAL","STALE_BASE_STAGE","STALE_DRAFT","STALE_CONFIG_REVISION","RUN_RESULT_INVALID"]) assert.match(apply,new RegExp(gate));
});
test("acceptance and stage trigger retain exact proposal provenance",()=>{
 assert.match(sql,/s\.draft_scope_json[\s\S]*proposalRunId/);
 assert.match(sql,/r\.scope_task_ids_json=NEW\.scope_task_ids_json/);
 assert.match(sql,/r\.base_stage_id IS NOT DISTINCT FROM NEW\.parent_stage_id/);
});
