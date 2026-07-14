import test from "node:test";
import assert from "node:assert/strict";
import type { EngineInput } from "../../types";
import type { CandidateAssignment, OperationalState, SimulatedState } from "../contracts";
import { deepFreeze } from "../immutability";
import { evaluateInitialConstructionPlacementFeasibility } from "./initialConstructionPlacementFeasibility";
import { validateSimulatedStates } from "../validation/validationEngine";

const task = (id:number, extra:any={}) => ({ id, planId: 1, templateId: id, status: "pending" as const, durationOverrideMin: 30, contestantId: id, spaceId: 1, countsAsWork: true, allowsSpaceOverlap: true, ...extra });
const assignment = (taskId:number, extra:Partial<CandidateAssignment>={}) => ({ taskId, startPlanned: "09:00", endPlanned: "09:30", spaceId: 1, resourceIds: [], ...extra });
function input(tasks:any[], extra:any={}): EngineInput { return { planId: 1, workDay: { start: "09:00", end: "18:00" }, meal: { start: "13:00", end: "14:00" }, mealMode: "flexible_meal_window", tasks, planResourceItems: [], ...extra } as any; }
function state(i:EngineInput): OperationalState { return deepFreeze({ id: "s", planId: 1, workDay: i.workDay, planning: [], tasks: i.tasks ?? [], resources: [], spaces: { parentById:{}, nameById:{1:"S1"}, capacityById:{1:2}, concurrencyById:{1:2}, exclusiveById:{}, priorityById:{} }, availability: { workDay: i.workDay, meal: i.meal, mealWindow: i.mealWindow ?? i.meal, actualMeal: i.actualMeal ?? null, globalHardBreaks: i.globalHardBreaks ?? [], protectedBreaks: i.protectedBreaks ?? [], contestantAvailabilityById: (i as any).contestantAvailabilityById ?? {} }, dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} }, source: "EngineInput", schemaVersion: "ORC-SPEC-01" } as OperationalState); }
function evalCase(i:EngineInput, t:any, a:CandidateAssignment, occupied:CandidateAssignment[]=[]){ return evaluateInitialConstructionPlacementFeasibility({ input: i, originOperationalState: state(i), task: t, assignment: a, occupiedAssignments: occupied, tasks: new Map((i.tasks??[]).map((x:any)=>[x.id,x])) }); }
function validationCodes(i:EngineInput, planning:any[]): string[] { const st = state(i) as any; const sim = deepFreeze({ id:"sim", candidateStateId:"cs", baseStateId:"s", operationalStateSnapshot: deepFreeze({ ...st, planning }), appliedTransformations: [], simulationMode:"ASSIGNMENT_APPLICATION_SHADOW", readOnly:true, createdAt:null } as SimulatedState); return [...validateSimulatedStates([sim]).validationResults[0].violatedConstraints]; }

test("placement feasibility covers windows, protected breaks, contestants, space cardinality, resources and determinism", () => {
  assert.deepEqual(evalCase(input([task(1)]), task(1), assignment(1,{ startPlanned:"08:30", endPlanned:"09:00" })).reasonCodes, ["TASK_WINDOW_CONFLICT"]);
  assert.deepEqual(evalCase(input([task(1)], { contestantAvailabilityById:{1:{start:"10:00",end:"18:00"}} }), task(1), assignment(1)).reasonCodes, ["TASK_WINDOW_CONFLICT"]);
  assert.deepEqual(evalCase(input([task(1,{fixedWindowStart:"10:00",fixedWindowEnd:"10:30"})]), task(1,{fixedWindowStart:"10:00",fixedWindowEnd:"10:30"}), assignment(1)).reasonCodes, ["TASK_WINDOW_CONFLICT"]);
  assert.deepEqual(evalCase(input([task(1)], { globalHardBreaks:[{start:"09:15",end:"09:45"}] }), task(1), assignment(1)).reasonCodes, ["PROTECTED_INTERVAL_CONFLICT"]);
  assert.equal(evalCase(input([task(1)], { globalHardBreaks:[{start:"09:30",end:"10:00"}] }), task(1), assignment(1)).valid, true);
  assert.equal(evalCase(input([task(1)], { mealMode:"flexible_meal_window", meal:{start:"09:00",end:"09:30"} }), task(1), assignment(1)).valid, true);
  assert.equal(evalCase(input([task(1)], { protectedBreaks:[{start:"09:00",end:"09:30",spaceId:2}] }), task(1), assignment(1)).valid, true);
  assert.deepEqual(evalCase(input([task(1)], { protectedBreaks:[{start:"09:00",end:"09:30",spaceId:1}] }), task(1), assignment(1)).reasonCodes, ["PROTECTED_INTERVAL_CONFLICT"]);
  assert.deepEqual(evalCase(input([task(1),task(2,{contestantId:1})]), task(1), assignment(1), [assignment(2)]).reasonCodes, ["CONTESTANT_OVERLAP"]);
  assert.equal(evalCase(input([task(1),task(2,{contestantId:1,isPlaceholder:true,nonOperational:true,countsAsWork:false,blocksSpace:false})]), task(1), assignment(1), [assignment(2)]).valid, true);
  assert.deepEqual(evalCase(input([task(1,{blocksSpace:true}),task(2,{blocksSpace:true})]), task(1,{blocksSpace:true}), assignment(1), [assignment(2)]).reasonCodes, ["SPACE_OVERLAP"]);
  assert.equal(evalCase(input([task(1),task(2)]), task(1), assignment(1), [assignment(2)]).valid, true);
  assert.deepEqual(evalCase(input([task(1),task(2),task(3)]), task(3), assignment(3), [assignment(1), assignment(2)]).reasonCodes, ["SPACE_OVERLAP"]);
  assert.equal(evalCase(input([task(1),task(2,{blocksSpace:false,countsAsWork:false,nonOperational:true,isPlaceholder:true})]), task(1), assignment(1), [assignment(2)]).valid, true);
  assert.deepEqual(evalCase(input([task(1),task(2,{blocksSpace:true,isPlaceholder:true,breakKind:"space_break",countsAsWork:false})]), task(1), assignment(1), [assignment(2)]).reasonCodes, ["SPACE_OVERLAP"]);
  assert.deepEqual(evalCase(input([task(1),task(2)]), task(1), assignment(1,{resourceIds:[7]}), [assignment(2,{resourceIds:[7]})]).reasonCodes, ["RESOURCE_OVERLAP"]);
  assert.equal(evalCase(input([task(1),task(2)]), task(1), assignment(1,{resourceIds:[7]}), [assignment(2,{resourceIds:[8]})]).valid, true);
  const triple = input([task(1),task(2),task(3)]); const pre = evalCase(triple, task(3), assignment(3), [assignment(1), assignment(2)]); assert.deepEqual(pre.reasonCodes, ["SPACE_OVERLAP"]); assert.ok(validationCodes(triple, [assignment(1), assignment(2), assignment(3)].map((a:any)=>({taskId:a.taskId,startPlanned:a.startPlanned,endPlanned:a.endPlanned,spaceId:a.spaceId,assignedResourceIds:a.resourceIds}))).includes("SPACE_OVERLAP"));
  assert.deepEqual(evalCase(triple, task(3), assignment(3), [assignment(1), assignment(2)]), evalCase(triple, task(3), assignment(3), [assignment(1), assignment(2)]));
});

test("placement feasibility reports causal conflict ids",()=>{
  const i:any=input([task(1,{contestantId:1,spaceId:1}),task(2,{contestantId:1,spaceId:1,dependsOnTaskIds:[1]})], { contestantAvailabilityById:{1:{start:"08:00",end:"12:00"}}, workDay:{start:"08:00",end:"12:00"} });
  const tasks=new Map(i.tasks.map((t:any)=>[t.id,t]));
  const result=evaluateInitialConstructionPlacementFeasibility({input:i,originOperationalState:state(i),task:i.tasks[1],assignment:{taskId:2,startPlanned:"08:15",endPlanned:"08:45",spaceId:1,resourceIds:[7]},occupiedAssignments:[{taskId:1,startPlanned:"08:00",endPlanned:"08:30",spaceId:1,resourceIds:[7]}],tasks});
  assert.equal(result.valid,false);
  assert.ok(result.reasonCodes.includes("CONTESTANT_OVERLAP"));
  assert.ok(result.reasonCodes.includes("DEPENDENCY_CONFLICT"));
  assert.deepEqual(result.contestantConflictTaskIds,[1]);
  assert.deepEqual(result.resourceConflictTaskIds,[1]);
  assert.deepEqual(result.dependencyLowerBoundTaskIds,[1]);
  assert.equal(result.taskWindowConflictDetails.some((d)=>d.kind==="DEPENDENCY_LOWER_BOUND"),true);
});
