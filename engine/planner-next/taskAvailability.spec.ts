import assert from "node:assert/strict";
import test from "node:test";
import { mainFlowMealScenario } from "./scenarios/mainFlowMealScenario";
import { canonicalTaskAvailability, taskFitsAvailability, validateTaskAvailability } from "./taskAvailability";
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
