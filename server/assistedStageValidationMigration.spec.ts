import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const sql=fs.readFileSync("supabase/migrations/082_assisted_stage_validation_exceptions.sql","utf8");
const editingSql=fs.readFileSync("supabase/migrations/081_assisted_draft_editing.sql","utf8");
test("082 persists exact exception identity and prevents duplicates",()=>{
  for(const token of ["config_revision_id","snapshot_fingerprint","affected_resource_ids_json","affected_space_ids_json","stage_violation_key"])assert.match(sql,new RegExp(token));
});
test("082 incrementally reuses the HARD/REQUIRED check already installed by 077",()=>{
  const stateSql=fs.readFileSync("supabase/migrations/077_assisted_planning_state.sql","utf8");
  assert.match(stateSql,/severity TEXT NOT NULL CHECK \(severity IN \('HARD', 'REQUIRED'\)\)/);
  assert.doesNotMatch(sql,/ADD CONSTRAINT\s+planning_accepted_exceptions_severity_check/);
  assert.doesNotMatch(sql,/DROP CONSTRAINT\s+(?:IF EXISTS\s+)?planning_accepted_exceptions_severity_check/);
});
test("validation and accept are server-only and validation freshness is checked under lock",()=>{
  assert.equal((sql.match(/SECURITY INVOKER SET search_path=''/g)??[]).length,2); assert.doesNotMatch(sql,/SECURITY DEFINER/);
  assert.match(sql,/FOR UPDATE/); assert.match(sql,/v\.draft_fingerprint<>s\.draft_fingerprint/);
  assert.match(sql,/v\.config_revision_id<>s\.current_config_revision_id/); assert.match(sql,/v\.base_stage_id IS DISTINCT FROM s\.draft_base_stage_id/);
  assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/); assert.match(sql,/GRANT EXECUTE[\s\S]+TO service_role/);
});
test("accept requires typed confirmation and creates HARD and REQUIRED exceptions in its transaction",()=>{
  assert.match(sql,/INVALID_CONFIRMATION/); assert.match(sql,/HARD_CONFIRMATION_REQUIRED/); assert.match(sql,/REQUIRED_CONFIRMATION_REQUIRED/);
  assert.match(sql,/INSERT INTO public\.planning_accepted_exceptions/); assert.match(sql,/UPDATE public\.daily_tasks/);
  assert.match(sql,/value->>'severity' IN \('HARD','REQUIRED'\)/); assert.match(sql,/item->>'severity'/);
  const validate=sql.slice(sql.indexOf("assisted_record_stage_validation"),sql.indexOf("DROP FUNCTION public.assisted_accept_stage"));
  assert.doesNotMatch(validate,/UPDATE public\.planning_accepted_exceptions/);
  assert.match(sql,/WITH RECURSIVE lineage/);assert.match(sql,/status='SUPERSEDED'/);
});
test("082 preserves exact, edited-proposal and manual-only stage provenance",()=>{
  const accept=sql.slice(sql.indexOf("CREATE FUNCTION public.assisted_accept_stage"),sql.indexOf("REVOKE ALL ON FUNCTION public.assisted_record_stage_validation"));
  assert.match(accept,/s\.draft_scope_json,\s*coalesce\(s\.draft_scope_json->'resolvedTaskIds',s\.draft_scope_json->'originalScope'->'resolvedTaskIds'/);
  assert.match(accept,/coalesce\(\(s\.draft_scope_json->>'includePrerequisites'\)::boolean,\(s\.draft_scope_json->'originalScope'->>'includePrerequisites'\)::boolean,false\)/);
  assert.match(accept,/CASE WHEN s\.draft_scope_json->>'editKind' IS DISTINCT FROM 'MANUAL' THEN \(s\.draft_scope_json->>'proposalRunId'\)::bigint ELSE NULL END/);
  assert.doesNotMatch(accept,/s\.draft_base_stage_id,'\{\}','\[\]',false/);
  // Manual-only drafts retain their existing scope JSON and cannot manufacture a run;
  // edited proposals retain originalScope/originProposalRunId while exact proposals retain proposalRunId.
  for(const field of ["originalScope","originProposalRunId","manualTouchedTaskIds","editLedger"]) assert.match(editingSql,new RegExp(field));
});
test("Drizzle mirrors migration 082 critical nullability and accepted severity",()=>{
  const schema=fs.readFileSync("shared/schema.ts","utf8");
  const table=schema.slice(schema.indexOf('export const planningAcceptedExceptions'),schema.indexOf('// 8. locks'));
  assert.match(table,/config_revision_id[^\n]+\.notNull\(\)/);assert.match(table,/snapshot_fingerprint[^\n]+\.notNull\(\)/);
  assert.match(table,/severity[^\n]+ IN \('HARD', 'REQUIRED'\)/);
});
