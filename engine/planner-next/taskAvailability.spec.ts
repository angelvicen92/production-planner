import assert from "node:assert/strict";
import test from "node:test";
import { mainFlowMealScenario } from "./scenarios/mainFlowMealScenario";
import { canonicalTaskAvailability, staticTaskStartDomain, taskFitsAvailability, validateTaskAvailability } from "./taskAvailability";
import { canPlaceTask } from "./placement";
import { preflight, validatePlan } from "./validate";

test("task availability is canonical, generic, immutable and supports multiple windows",()=>{
  const p=mainFlowMealScenario(), task=p.tasks[0]!; task.availability=[{start:600,end:700},{start:540,end:590}];
  const before=JSON.stringify(task.availability);
  assert.deepEqual(canonicalTaskAvailability(task,p.day),[{start:540,end:590},{start:600,end:700}]);
  assert.equal(taskFitsAvailability(task,610,625),true); assert.equal(taskFitsAvailability(task,590,605),false);
  assert.equal(JSON.stringify(task.availability),before);
  for(const kind of ["main","vocal","auxiliary","technical"] as const){const copy={...task,kind,availability:[{start:600,end:700}]} as typeof task;assert.equal(taskFitsAvailability(copy,610,625),true);assert.equal(taskFitsAvailability(copy,590,605),false)}
});

test("empty and invalid availability have exact deterministic behavior",()=>{
  const p=mainFlowMealScenario(),task=p.tasks[0]!;task.availability=[];
  assert.equal(validateTaskAvailability(task,p.day),true);assert.equal(canPlaceTask(p,task,600,[]),false);
  task.availability=[{start:Number.NaN,end:700}];assert.equal(validateTaskAvailability(task,p.day),false);
  assert.deepEqual(preflight(p),[`INVALID_TASK_AVAILABILITY:${task.id}`]);
});

test("validatePlan counts each unavailable productive task once",()=>{
  const p=mainFlowMealScenario(), task=p.tasks[0]!;task.availability=[{start:540,end:550}];
  const scheduled={...task,start:600,end:615};const v=validatePlan(p,[scheduled]);
  assert.equal(v.taskAvailabilityViolationCount,1);assert.ok(v.reasonCodes.includes(`TASK_AVAILABILITY:${task.id}`));
});

test("static start domain intersects every availability authority without removing placeable starts",()=>{
  const p=mainFlowMealScenario(),task={...p.tasks[0]!,availability:[{start:540,end:620},{start:650,end:720}],coachId:"domain-coach",requiredResourceIds:["domain-resource"],itinerantUnitId:"domain-unit"};
  p.participants.find(x=>x.id===task.participantId)!.availability=[{start:550,end:710}];
  p.coaches.push({id:"domain-coach",availability:[{start:560,end:700}]});
  p.spaces.find(x=>x.id===task.spaceId)!.availability=[{start:570,end:690}];
  p.resources.push({id:"domain-resource",availability:[{start:580,end:680}]});
  p.itinerantUnits=[{id:"domain-unit",availability:[{start:590,end:670}]}];
  const domain=staticTaskStartDomain(p,task);
  assert.deepEqual(domain,[590,595,600,605,650,655]);
  for(let start=p.day.start;start+task.duration<=p.day.end;start+=5)
    if(canPlaceTask(p,task,start,[]))assert.ok(domain.includes(start),`accepted start ${start} absent from static domain`);
});
