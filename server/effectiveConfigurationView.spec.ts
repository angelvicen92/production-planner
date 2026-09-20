import assert from "node:assert/strict";
import test from "node:test";
import { configurabilityCounts } from "../shared/configurability";
import { buildEffectiveConfigurationView, deriveReadiness } from "./effectiveConfigurationView";

const input = (optimizerSnapshotSource:"INHERITED"|"DAY_OVERRIDE"|"LEGACY_BACKFILL"="INHERITED") => ({planId:27,workDay:{start:"08:00",end:"18:00"},meal:{start:"13:00",end:"14:00"},camerasAvailable:2,tasks:[],locks:[],zoneResourceAssignments:{},spaceResourceAssignments:{},zoneResourceTypeRequirements:{},spaceResourceTypeRequirements:{},planResourceItems:[],resourceItemComponents:{},groupingZoneIds:[],optimizerSnapshotSource,optimizerSnapshotEditingMode:"BASIC"}) as any;

test("effective values without auditable provenance stay usable and do not degrade readiness",async()=>{
  const storage={getPlan:async()=>({id:27}),getActiveAssistedPlanningSession:async()=>null} as any;
  const view=await buildEffectiveConfigurationView(storage,27,async()=>input());
  assert.equal(view.planId,27); assert.equal(view.readiness.status,"READY");
  const blocks=view.values.find(v=>v.capabilityId==="BLOCK_COUNT_POLICY");
  assert.deepEqual({availability:blocks?.availability,value:blocks?.value,validation:blocks?.validationStatus},{availability:"UNAVAILABLE",value:null,validation:"UNSUPPORTED"});
  for(const id of ["WORKDAY_WINDOW","GLOBAL_MEAL_BREAK"]){
    const value=view.values.find(v=>v.capabilityId===id);
    assert.equal(value?.availability,"AVAILABLE");
    assert.equal(value?.source,"UNKNOWN");
    assert.equal(value?.validationStatus,"VALID");
    assert.equal(value?.implementationStatus,"PRODUCTIVE");
  }
  assert.deepEqual(view.productCoverage,configurabilityCounts);
  assert.equal(view.productCoverage.PRODUCTIVE,2);
});

test("optimizer exposes only the provenance carried by its authoritative snapshot",async()=>{
  const storage={getPlan:async()=>({id:27}),getActiveAssistedPlanningSession:async()=>null} as any;
  for(const source of ["INHERITED","DAY_OVERRIDE","LEGACY_BACKFILL"] as const){
    const view=await buildEffectiveConfigurationView(storage,27,async()=>input(source));
    assert.equal(view.values.find(v=>v.capabilityId==="OPTIMIZATION")?.source,source);
  }
});

test("readiness categories follow demonstrated causal validation only",()=>{
  const readiness=deriveReadiness([{capabilityId:"X",label:"X",category:"Avanzado",value:null,availability:"AVAILABLE",unit:"x",source:"UNKNOWN",validationStatus:"INCOMPATIBLE",requiresReplan:"UNKNOWN",implementationStatus:"PRODUCTIVE",blockers:[],requiredForDay:false}]);
  assert.equal(readiness.status,"INCOMPATIBLE"); assert.equal(readiness.issues[0].navigationTarget,"Avanzado");
});
