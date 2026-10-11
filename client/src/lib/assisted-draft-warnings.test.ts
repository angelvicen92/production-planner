import assert from "node:assert/strict";
import test from "node:test";
import {collectAssistedDraftWarnings} from "./assisted-draft-warnings";
test("local assisted warnings cover bounded conflicts without solver or repair",()=>{
  const tasks=[{id:1,startPlanned:"08:45",endPlanned:"09:30",spaceId:1,contestantId:1,resourceIds:[7]},
    {id:2,startPlanned:"09:00",endPlanned:"09:45",spaceId:1,contestantId:1,resourceIds:[7],dependsOnTaskIds:[1]}];
  const result=collectAssistedDraftWarnings(tasks,{start:"09:00",end:"18:00"});
  assert.deepEqual(new Set(result.map(row=>row.kind)),new Set(["AVAILABILITY","DIRECT_DEPENDENCY","PARTICIPANT_OVERLAP","SPACE_OVERLAP","RESOURCE_OVERLAP"]));
  assert.deepEqual(tasks[0].startPlanned,"08:45");
});
test("explicit synchronized transport respects capacity without masking other overlaps",()=>{
  const tasks=Array.from({length:3},(_,i)=>({id:i+1,startPlanned:"09:00",endPlanned:"09:15",spaceId:8,contestantId:i+1,assignedResourceIds:[7]}));
  const configuration={taskOperations:tasks.map(task=>({taskId:task.id,operationalRole:'transport_arrival'})),arrivalMaximumGroupSize:3};
  assert.deepEqual(collectAssistedDraftWarnings(tasks,undefined,configuration),[]);
  assert.ok(collectAssistedDraftWarnings(tasks).some(w=>w.kind==='SPACE_OVERLAP'));
  assert.ok(collectAssistedDraftWarnings(tasks,undefined,{...configuration,arrivalMaximumGroupSize:2}).some(w=>w.kind==='RESOURCE_OVERLAP'));
  const shifted=tasks.map((task,i)=>({...task,startPlanned:i===0?'09:05':task.startPlanned}));
  assert.ok(collectAssistedDraftWarnings(shifted,undefined,configuration).some(w=>w.kind==='SPACE_OVERLAP'));
  assert.ok(collectAssistedDraftWarnings(tasks,undefined,{...configuration,taskOperations:configuration.taskOperations.map((op,i)=>({...op,operationalRole:i===0?'transport_departure':op.operationalRole}))}).some(w=>w.kind==='SPACE_OVERLAP'));
});
test("joint activities only share occupancy when explicitly synchronized",()=>{
  const tasks=[{id:1,startPlanned:'10:00',endPlanned:'10:30',spaceId:3,assignedResourceIds:[9]},{id:2,startPlanned:'10:00',endPlanned:'10:30',spaceId:3,assignedResourceIds:[9]}];
  const configuration={taskOperations:tasks.map(task=>({taskId:task.id,jointGroupId:'joint'}))};
  assert.deepEqual(collectAssistedDraftWarnings(tasks,undefined,configuration),[]);
  assert.ok(collectAssistedDraftWarnings([{...tasks[0],endPlanned:'10:15'},tasks[1]],undefined,configuration).length>0);
});
