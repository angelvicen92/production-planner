import assert from "node:assert/strict";
import test from "node:test";
import { buildEffectiveConfigurationView, deriveReadiness } from "./effectiveConfigurationView";

test("effective view does not require an Assisted session and never invents missing values",async()=>{
  const storage={getPlan:async()=>({id:27}),getActiveAssistedPlanningSession:async()=>null} as any;
  const view=await buildEffectiveConfigurationView(storage,27,async()=>({planId:27,workDay:{start:"08:00",end:"18:00"},meal:{start:"13:00",end:"14:00"},camerasAvailable:2,tasks:[],locks:[],zoneResourceAssignments:{},spaceResourceAssignments:{},zoneResourceTypeRequirements:{},spaceResourceTypeRequirements:{},planResourceItems:[],resourceItemComponents:{},groupingZoneIds:[],optimizerSnapshotSource:"INHERITED",optimizerSnapshotEditingMode:"BASIC"}) as any);
  assert.equal(view.planId,27); assert.equal(view.readiness.status,"UNSUPPORTED");
  const blocks=view.values.find(v=>v.capabilityId==="BLOCK_COUNT_POLICY");
  assert.deepEqual({availability:blocks?.availability,value:blocks?.value,validation:blocks?.validationStatus},{availability:"UNAVAILABLE",value:null,validation:"UNSUPPORTED"});
  assert.equal(view.values.find(v=>v.capabilityId==="WORKDAY_GRID")?.source,"DAY_OVERRIDE");
});

test("readiness categories follow demonstrated causal validation only",()=>{
  const readiness=deriveReadiness([{capabilityId:"X",label:"X",category:"Avanzado",value:null,availability:"AVAILABLE",unit:"x",source:"UNKNOWN",overrideState:"UNKNOWN",validationStatus:"INCOMPATIBLE",requiresReplan:"UNKNOWN"}]);
  assert.equal(readiness.status,"INCOMPATIBLE"); assert.equal(readiness.issues[0].navigationTarget,"Avanzado");
});
