import assert from "node:assert/strict";
import test from "node:test";
import { resolveInitialConstructionTaskUniverse } from "./initialConstructionTaskUniverse";

const input:any={tasks:[
 {id:4,operationalRole:"transport_departure",templateId:20},
 {id:-1,isPlaceholder:true,isMeal:true,fixedWindowStart:"12:00",fixedWindowEnd:"12:30"},
 {id:3,countsAsWork:true,dependsOnTaskIds:[2]},
 {id:2,operationalRole:"transport_arrival",templateId:10},
 {id:1,countsAsWork:true},
],transport:{arrivalTemplateId:10,departureTemplateId:20},mealWindow:{start:"12:00",end:"13:00"}};

test("canonical Initial Construction universe includes arrivals and excludes departures and synthetic placeholders",()=>{
 const a=resolveInitialConstructionTaskUniverse({input}), b=resolveInitialConstructionTaskUniverse({input:{...input,tasks:[...input.tasks].reverse()}});
 assert.deepEqual(a.strictProductiveWorkTaskIds,[1,3]);
 assert.deepEqual(a.transportArrivalTaskIds,[2]);
 assert.deepEqual(a.constructiveTargetTaskIds,[1,2,3]);
 assert.deepEqual(a.transportDepartureTaskIds,[4]);
 assert.deepEqual(a.syntheticNonConstructiveTaskIds,[-1]);
 assert.equal(a.constructiveTargetFingerprint,b.constructiveTargetFingerprint);
 assert.equal(a.constructiveExecutionFingerprint,b.constructiveExecutionFingerprint);
});

test("prerequisite closure admits only operational support",()=>{
 const universe=resolveInitialConstructionTaskUniverse({input:{...input,tasks:[...input.tasks,{id:5,countsAsWork:false},{id:6,countsAsWork:true,dependsOnTaskIds:[5]}]}});
 assert.deepEqual(universe.constructiveSupportTaskIds,[5]);
 assert.deepEqual(universe.constructiveExecutionTaskIds,[1,2,3,5,6]);
});
