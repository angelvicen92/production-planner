import assert from "node:assert/strict";
import test from "node:test";
import { resolveInitialConstructionDependencyTemporalBounds, evaluateInitialConstructionCombinedDependencyCompatibility } from "./initialConstructionDependencyTemporalBounds";

const task = (id:number, extra:any={}) => ({ id, status:"pending", durationMin:30, contestantId:1, ...extra });

test("derives lower and upper bounds from assigned canonical dependencies",()=>{
  const input:any={tasks:[task(1),task(2,{dependsOnTaskId:1}),task(3,{dependsOnTaskId:2})]};
  const bounds=resolveInitialConstructionDependencyTemporalBounds({input,taskId:2,assignments:[{taskId:1,startPlanned:"09:00",endPlanned:"09:30",resourceIds:[]},{taskId:3,startPlanned:"10:00",endPlanned:"10:30",resourceIds:[]}]});
  assert.equal(bounds.earliestStart,"09:30");
  assert.equal(bounds.latestEnd,"10:00");
  assert.deepEqual(bounds.assignedPrerequisiteTaskIds,[1]);
  assert.deepEqual(bounds.assignedDependentTaskIds,[3]);
});

test("template dependency is canonical and duplicate explicit/template edges collapse",()=>{
  const input:any={tasks:[task(1,{templateId:7}),task(2,{templateId:8,dependsOnTaskId:1,dependsOnTemplateId:7})]};
  const bounds=resolveInitialConstructionDependencyTemporalBounds({input,taskId:2,assignments:[{taskId:1,startPlanned:"08:00",endPlanned:"08:45",resourceIds:[]}]});
  assert.equal(bounds.earliestStart,"08:45");
  assert.equal(bounds.prerequisiteFinishBounds.length,1);
  assert.deepEqual(bounds.prerequisiteFinishBounds[0].edge.sourceTypes,["explicit_task","template"]);
});

test("provisionally satisfied audit never invents missing assignment times",()=>{
  const input:any={tasks:[task(1),task(2,{dependsOnTaskId:1})]};
  const bounds=resolveInitialConstructionDependencyTemporalBounds({input,taskId:2,assignments:[],provisionallySatisfiedTaskIds:[1]});
  assert.equal(bounds.earliestStart,null);
  assert.equal(bounds.provisionallySatisfiedDependencyAudit.coherent,false);
  assert.deepEqual(bounds.provisionallySatisfiedDependencyAudit.declaredWithoutAssignmentTaskIds,[1]);
});

test("combined dependency precheck rejects branch before downstream stages",()=>{
  const input:any={tasks:[task(1),task(2,{dependsOnTaskId:1})]};
  const result=evaluateInitialConstructionCombinedDependencyCompatibility({input,baseAssignments:[{taskId:1,startPlanned:"10:00",endPlanned:"11:00",resourceIds:[]}],branchAssignments:[{taskId:2,startPlanned:"10:30",endPlanned:"11:30",resourceIds:[]}]});
  assert.equal(result.compatible,false);
  assert.equal(result.violationCount,1);
  assert.equal(result.violations[0].prerequisiteTaskId,1);
});
