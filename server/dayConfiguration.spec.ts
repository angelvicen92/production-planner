import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDayConfigurationIntentSchema, dayConfigEditSchema, dayConfigRefreshSchema } from "../shared/dayConfig";
import { configurabilityCounts, configurabilityRegistry } from "../shared/configurability";

test("creation intent is explicit and equal overrides remain overrides",()=>{
  const inherited=createDayConfigurationIntentSchema.parse({workday:{intent:"INHERIT"},meal:{intent:"INHERIT"}});
  const same=createDayConfigurationIntentSchema.parse({workday:{intent:"OVERRIDE",value:{start:"09:00",end:"18:00"}},meal:{intent:"OVERRIDE",value:{start:"13:00",end:"14:00",mode:"global_hard_break"}}});
  assert.equal(inherited.workday.intent,"INHERIT");
  assert.equal(same.workday.intent,"OVERRIDE");
  assert.equal(same.meal.intent,"OVERRIDE");
});

test("typed edit and refresh reject ambiguous or implicit operations",()=>{
  assert.throws(()=>dayConfigEditSchema.parse({workday:{start:"09:00"}}));
  assert.throws(()=>dayConfigEditSchema.parse({}));
  assert.deepEqual(dayConfigRefreshSchema.parse({capabilities:["WORKDAY_WINDOW"]}).legacyTreatment,"KEEP_LEGACY");
});

test("084 preserves 077 canonical revisions, safe legacy materialization, mutations and RLS",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/084_day_config_provenance.sql",import.meta.url),"utf8");
  for(const token of ["LEGACY_BACKFILL","work_baseline_start","meal_baseline_mode","work_config_source='INHERITED'","meal_config_source='INHERITED'","work_config_source='DAY_OVERRIDE'","meal_config_source='DAY_OVERRIDE'","CANONICAL_MATERIALIZATION","p_expected_identity","p_expected_replay","p_candidate_identity","p_candidate_replay","created_by","draft_validation_id=NULL","REVOKE ALL","service_role"]) assert.match(sql,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(sql,/work_start=work_baseline_start,work_end=work_baseline_end/);
  assert.match(sql,/p\.work_config_source='DAY_OVERRIDE' THEN work_start ELSE g\.default_work_start/);
  assert.match(sql,/p\.meal_config_source='DAY_OVERRIDE' THEN meal_start ELSE g\.meal_start/);
  assert.doesNotMatch(sql,/work_start\s*=\s*g\.default_work_start[\s\S]{0,100}p_operation='RESTORE'/);
  assert.doesNotMatch(sql,/CREATE TRIGGER[\s\S]*plans_initialize_day_config_revision/i);
  assert.doesNotMatch(sql,/UPDATE public\.contestants/i);
  assert.doesNotMatch(sql,/\bencode\s*\(|\bdigest\s*\(/i);
  assert.doesNotMatch(sql,/INSERT INTO public\.plan_config_revisions[\s\S]{0,500}legacyBackfill/i);
  assert.match(sql,/p_(?:expected|candidate)_identity->>'contractVersion'/);
  assert.match(sql,/\(p_(?:expected|candidate)_identity->>'planId'\)::integer<>p_plan_id/);
  assert.match(sql,/p_(?:expected|candidate)_replay->>'contractVersion'/);
  assert.match(sql,/p_candidate_identity->>'configurationFingerprint'/);
  assert.match(sql,/current_config_revision_id=new_revision/);
  assert.match(sql,/FOR UPDATE/);
  assert.doesNotMatch(sql,/UPDATE public\.assisted_planning_stages|UPDATE public\.planning_accepted_exceptions|UPDATE public\.daily_tasks|UPDATE public\.locks/);
});

test("085 keeps optimizer baseline separate and restores without consulting General",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/085_optimizer_day_config_restore.sql",import.meta.url),"utf8");
  for(const token of ["baseline_snapshot","LEGACY_BACKFILL","OPTIMIZER_RESTORE_NOT_AVAILABLE","p_candidate_replay->'optimizerSnapshot'","REVOKE ALL","service_role"]) assert.match(sql,new RegExp(token));
  assert.match(sql,/p_operation='REFRESH'[\s\S]*optimizerBaseline/);
  assert.match(sql,/p_operation='RESTORE'[\s\S]*baseline_snapshot IS NOT NULL/);
  assert.doesNotMatch(sql,/FROM public\.optimizer_settings/);
});

test("canonical day revisions are built from the complete existing EngineInput authorities",()=>{
  const source=readFileSync(new URL("./dayConfigurationService.ts",import.meta.url),"utf8");
  for(const token of ["buildEngineInput","getPlanTaskTemplateSnapshots","getPlanOptimizerSnapshot","projectEffectiveAuthoritiesFromEngineInputV1","buildEffectivePlanConfigRevisionV1","buildEffectivePlanConfigReplaySnapshotV1"]) assert.match(source,new RegExp(token));
  assert.match(source,/initialize_day_config_revision/);
  assert.match(source,/p_expected_identity: current\.identity/);
  assert.match(source,/p_candidate_identity: candidate\.identity/);
});

test("the 27-capability registry promotes the three demonstrated capabilities",()=>{
  assert.equal(configurabilityRegistry.length,27);
  assert.deepEqual(configurabilityRegistry.filter(x=>x.status==="PRODUCTIVE").map(x=>x.capabilityId),["WORKDAY_WINDOW","GLOBAL_MEAL_BREAK","OPTIMIZATION"]);
  assert.equal(configurabilityCounts.PRODUCTIVE,3);
});
