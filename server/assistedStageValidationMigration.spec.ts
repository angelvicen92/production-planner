import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const sql=fs.readFileSync("supabase/migrations/082_assisted_stage_validation_exceptions.sql","utf8");
test("082 persists exact exception identity and prevents duplicates",()=>{
  for(const token of ["config_revision_id","snapshot_fingerprint","affected_resource_ids_json","affected_space_ids_json","stage_violation_key","severity='HARD'"])assert.match(sql,new RegExp(token));
});
test("validation and accept are server-only and validation freshness is checked under lock",()=>{
  assert.equal((sql.match(/SECURITY INVOKER SET search_path=''/g)??[]).length,2); assert.doesNotMatch(sql,/SECURITY DEFINER/);
  assert.match(sql,/FOR UPDATE/); assert.match(sql,/v\.draft_fingerprint<>s\.draft_fingerprint/);
  assert.match(sql,/v\.config_revision_id<>s\.current_config_revision_id/); assert.match(sql,/v\.base_stage_id IS DISTINCT FROM s\.draft_base_stage_id/);
  assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/); assert.match(sql,/GRANT EXECUTE[\s\S]+TO service_role/);
});
test("accept requires typed confirmation and creates HARD exceptions in its transaction",()=>{
  assert.match(sql,/INVALID_CONFIRMATION/); assert.match(sql,/HARD_CONFIRMATION_REQUIRED/); assert.match(sql,/REQUIRED_CONFIRMATION_REQUIRED/);
  assert.match(sql,/INSERT INTO public\.planning_accepted_exceptions/); assert.match(sql,/UPDATE public\.daily_tasks/);
  const validate=sql.slice(sql.indexOf("assisted_record_stage_validation"),sql.indexOf("DROP FUNCTION public.assisted_accept_stage"));
  assert.doesNotMatch(validate,/UPDATE public\.planning_accepted_exceptions/);
  assert.match(sql,/WITH RECURSIVE lineage/);assert.match(sql,/status='SUPERSEDED'/);
});
test("Drizzle mirrors migration 082 critical nullability and HARD-only severity",()=>{
  const schema=fs.readFileSync("shared/schema.ts","utf8");
  const table=schema.slice(schema.indexOf('export const planningAcceptedExceptions'),schema.indexOf('// 8. locks'));
  assert.match(table,/config_revision_id[^\n]+\.notNull\(\)/);assert.match(table,/snapshot_fingerprint[^\n]+\.notNull\(\)/);
  assert.match(table,/severity[^\n]+ = 'HARD'/);assert.doesNotMatch(table,/HARD', 'REQUIRED/);
});
