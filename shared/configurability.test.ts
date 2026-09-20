import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { configurabilityCounts, configurabilityRegistry } from "./configurability";

test("the v2.4 registry enforces semantic and security gates without count targets",()=>{
  assert.equal(Object.values(configurabilityCounts).reduce((sum,count)=>sum+count,0),configurabilityRegistry.length);
  assert.equal(new Set(configurabilityRegistry.map(c=>c.capabilityId)).size,configurabilityRegistry.length);
  for(const capability of configurabilityRegistry){
    for(const key of ["name","owner","unit","generalSource","dailyPersistence","override","generalUi","dayUi","engineInputProjection","preflight","engineConsumer","validator","evidenceFingerprint","permissionsRls"] as const)assert.equal(typeof capability[key],"string",`${capability.capabilityId}.${key}`);
    assert.ok(capability.levels.length>0);
    if(capability.status==="PRODUCTIVE")assert.equal(capability.blockers.length,0);
    else assert.ok(capability.blockers.length>0);
  }
  assert.equal(configurabilityRegistry.find(c=>c.capabilityId==="PROTECTED_STATE_LOCKS")?.status,"NOT_APPLICABLE");
  for(const id of ["PARTICIPANTS","TASKS_DEPENDENCIES","SPATIAL_AVAILABILITY","RESOURCE_CATALOG","PLAN_RESOURCE_ASSIGNMENTS"])
    assert.equal(configurabilityRegistry.find(c=>c.capabilityId===id)?.status,"BLOCKED",id);
  assert.equal(configurabilityRegistry.find(c=>c.capabilityId==="SPACE_CAPACITY")?.status,"MISSING");
  assert.equal(configurabilityRegistry.find(c=>c.capabilityId==="TRANSITIONS")?.status,"MISSING");
  const workday=configurabilityRegistry.find(c=>c.capabilityId==="WORKDAY_WINDOW");
  assert.deepEqual(workday?.levels,["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE"]);
  assert.equal(workday?.generalSource,"program_settings.default_work_start/default_work_end");
  for(const id of ["WORKDAY_WINDOW","GLOBAL_MEAL_BREAK"]){
    const capability=configurabilityRegistry.find(c=>c.capabilityId===id);
    assert.equal(capability?.status,"PRODUCTIVE",id);
    assert.equal(capability?.blockers.length,0,id);
  }
  const optimization=configurabilityRegistry.find(c=>c.capabilityId==="OPTIMIZATION");
  assert.equal(optimization?.status,"PARTIAL");
  assert.ok(optimization?.blockers.some(blocker=>/superficie diaria|comparaci.n\/confirmaci.n/.test(blocker)));
});

test("every concrete registry test reference exists",()=>{
  for(const capability of configurabilityRegistry)
    for(const path of capability.tests)
      assert.ok(existsSync(resolve(process.cwd(),path)),`${capability.capabilityId} references missing test ${path}`);
});

test("documentary Evidence is checked against the canonical registry",()=>{
  const evidence=readFileSync(new URL("../docs/evidence/PRODUCT-CONFIGURABILITY-AUDIT-v2.4.md",import.meta.url),"utf8");
  assert.match(evidence,new RegExp(`Total: \\*\\*${configurabilityRegistry.length} capabilities\\*\\*`));
  for(const [status,count] of Object.entries(configurabilityCounts))assert.match(evidence,new RegExp(`\\| ${status} \\| ${count} \\|`));
  for(const capability of configurabilityRegistry.filter(item=>item.status==="PRODUCTIVE"))assert.ok(evidence.includes("`"+capability.capabilityId+"`"));
});

test("future contracts keep AUTO, fixed count, run overrides and causal outcomes distinct",()=>{
  assert.deepEqual(configurabilityRegistry.find(c=>c.capabilityId==="BLOCK_COUNT_POLICY")?.semantics,["AUTO_MIN_FEASIBLE","FIXED_COUNT(n)"]);
  assert.deepEqual(configurabilityRegistry.find(c=>c.capabilityId==="ASSISTED_PROPOSAL_TIME_LIMIT")?.semantics,["RUN_OVERRIDE","TIME_LIMIT_REACHED","BUDGET_EXHAUSTED","INFEASIBLE"]);
});
