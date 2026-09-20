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

test("migration makes backfill, restore, refresh, audit and RLS contracts explicit",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/084_day_config_provenance.sql",import.meta.url),"utf8");
  for(const token of ["LEGACY_BACKFILL","work_baseline_start","meal_baseline_mode","work_config_source='INHERITED'","meal_config_source='INHERITED'","work_config_source='DAY_OVERRIDE'","meal_config_source='DAY_OVERRIDE'","record_day_config_revision","created_by","draft_validation_id=NULL","REVOKE ALL","service_role"]) assert.match(sql,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(sql,/work_start=work_baseline_start,work_end=work_baseline_end/);
  assert.match(sql,/p\.work_config_source='DAY_OVERRIDE' THEN work_start ELSE g\.default_work_start/);
  assert.match(sql,/p\.meal_config_source='DAY_OVERRIDE' THEN meal_start ELSE g\.meal_start/);
  assert.doesNotMatch(sql,/work_start\s*=\s*g\.default_work_start[\s\S]{0,100}p_operation='RESTORE'/);
});

test("the 27-capability registry promotes only the two demonstrated capabilities",()=>{
  assert.equal(configurabilityRegistry.length,27);
  assert.deepEqual(configurabilityRegistry.filter(x=>x.status==="PRODUCTIVE").map(x=>x.capabilityId),["WORKDAY_WINDOW","GLOBAL_MEAL_BREAK"]);
  assert.equal(configurabilityCounts.PRODUCTIVE,2);
});
