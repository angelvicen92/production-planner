import test from "node:test";
import assert from "node:assert/strict";
import {resolveEffectiveTaskResourceAssignments} from "./effectiveTaskResourceAssignments";
import type {EngineInput} from "../../types";
import {effectivePlanningResourceIds} from "../../../client/src/lib/planning-view-policy";

test("view assignment projection matches the existing engine authority for exact, sparse and conflicting identities",()=>{
  const spaces=new Map([[3,{zoneId:1}],[4,{zoneId:2}]]);
  for(const task of [{spaceId:3,zoneId:1,assignedResources:[7]}, {spaceId:3,assignedResources:[]},
    {spaceId:3,zoneId:2}, {spaceId:99,zoneId:2}, {zoneId:2}, {}]){
    const source:EngineInput={planId:1,workDay:{start:"08:00",end:"20:00"},meal:{start:"13:00",end:"14:00"},camerasAvailable:1,
      tasks:[{id:1,planId:1,templateId:1,status:"pending",...task,assignedResourceIds:task.assignedResources}],locks:[],
      planZoneSettings:[1,2].map(zoneId=>({zoneId,availabilityStart:null,availabilityEnd:null})),
      planSpaceSettings:[...spaces].map(([spaceId,space])=>({spaceId,zoneId:space.zoneId!,availabilityStart:null,availabilityEnd:null})),
      zoneResourceAssignments:{1:[8],2:[9]},spaceResourceAssignments:{3:[7,10]},zoneResourceTypeRequirements:{},spaceResourceTypeRequirements:{},
      planResourceItems:[],resourceItemComponents:{},groupingZoneIds:[]};
    assert.deepEqual(effectivePlanningResourceIds(task,spaces,source.spaceResourceAssignments,source.zoneResourceAssignments),resolveEffectiveTaskResourceAssignments(source).assignments[0].effectiveResourceIds);
  }
});
