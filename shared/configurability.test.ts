import assert from "node:assert/strict";
import test from "node:test";
import { configurabilityCounts, configurabilityRegistry } from "./configurability";

test("the v2.4 registry is stable, complete and deterministically ordered",()=>{
  assert.deepEqual(configurabilityCounts,{PRODUCTIVE:11,PARTIAL:8,MISSING:2,BLOCKED:0,NOT_APPLICABLE:0});
  assert.equal(new Set(configurabilityRegistry.map(c=>c.capabilityId)).size,configurabilityRegistry.length);
  for(const capability of configurabilityRegistry){
    for(const key of ["name","owner","unit","generalSource","dailyPersistence","override","generalUi","dayUi","engineInputProjection","preflight","engineConsumer","validator","evidenceFingerprint","permissionsRls"] as const)assert.equal(typeof capability[key],"string",`${capability.capabilityId}.${key}`);
    assert.ok(capability.levels.length>0);
    if(capability.status==="PRODUCTIVE")assert.equal(capability.blockers.length,0);
    else assert.ok(capability.blockers.length>0);
  }
});

test("future contracts keep AUTO, fixed count, run overrides and causal outcomes distinct",()=>{
  assert.deepEqual(configurabilityRegistry.find(c=>c.capabilityId==="BLOCK_COUNT_POLICY")?.semantics,["AUTO_MIN_FEASIBLE","FIXED_COUNT(n)"]);
  assert.deepEqual(configurabilityRegistry.find(c=>c.capabilityId==="ASSISTED_PROPOSAL_TIME_LIMIT")?.semantics,["RUN_OVERRIDE","TIME_LIMIT_REACHED","BUDGET_EXHAUSTED","INFEASIBLE"]);
});
