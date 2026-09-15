import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const sql=fs.readFileSync("supabase/migrations/082_assisted_stage_validation_exceptions.sql","utf8");
test("082 persists exact exception identity and prevents duplicates",()=>{
  for(const token of ["config_revision_id","snapshot_fingerprint","affected_resource_ids_json","affected_space_ids_json","stage_violation_key","severity='HARD'"])assert.match(sql,new RegExp(token));
});
test("validation and accept are server-only and validation freshness is checked under lock",()=>{
  assert.match(sql,/SECURITY INVOKER SET search_path=''/); assert.match(sql,/SECURITY DEFINER SET search_path=''/);
  assert.match(sql,/FOR UPDATE/); assert.match(sql,/v\.draft_fingerprint<>s\.draft_fingerprint/);
  assert.match(sql,/v\.config_revision_id<>s\.current_config_revision_id/); assert.match(sql,/v\.base_stage_id IS DISTINCT FROM s\.draft_base_stage_id/);
  assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/); assert.match(sql,/GRANT EXECUTE[\s\S]+TO service_role/);
});
test("accept requires typed confirmation and creates HARD exceptions in its transaction",()=>{
  assert.match(sql,/HARD_CONFIRMATION_REQUIRED/); assert.match(sql,/REQUIRED_CONFIRMATION_REQUIRED/);
  assert.match(sql,/INSERT INTO public\.planning_accepted_exceptions/); assert.match(sql,/PERFORM public\.assisted_apply_snapshot/);
});
