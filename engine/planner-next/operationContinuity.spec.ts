import assert from "node:assert/strict";
import test from "node:test";
import { operationContinuityScenario } from "./scenarios/operationContinuityScenario";
import { materializeNominalPipelineWitness } from "./anonymousPipelineWitness";
import { assessOperationContinuity, continuityPenalty, operationContinuityPreflight } from "./operationContinuity";
import { validatePlan } from "./validate";
import { executePlannerNext } from "./executePlannerNext";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { buildAssistedProblem, createPlanningScope } from "./assistedPlanning";

const architecture={pattern:["coach","coach","coach"],slots:[120,130,140]};
test("OFF entry geometry crosses separate availability windows and remains a complete physical witness",()=>{
  const problem=operationContinuityScenario(), original=structuredClone(problem);
  const result=materializeNominalPipelineWitness(problem,architecture);
  assert.equal(result.witness.status,"FEASIBLE",result.witness.reason);
  assert.deepEqual(result.witness.stylingSpots.map(spot=>spot.start),[10,40,70]);
  assert.equal(validatePlan(problem,[...result.scheduledTasks]).hardValid,true);
  assert.equal(new Set(result.scheduledTasks.filter(task=>task.id.startsWith("arrival-")).map(task=>task.start)).size,3);
  assert.equal(continuityPenalty(problem,result.scheduledTasks),0);
  assert.equal(assessOperationContinuity(problem,result.scheduledTasks)[0].gapMinutes,40);
  assert.deepEqual(problem,original);
  const reversed=structuredClone(problem);reversed.tasks.reverse();reversed.participants.reverse();
  assert.deepEqual(materializeNominalPipelineWitness(reversed,architecture).witness,result.witness);
});

test("REQUIRED rejects the same gapped witness; PREFERRED quantifies it without a hard violation",()=>{
  const problem=operationContinuityScenario(), result=materializeNominalPipelineWitness(problem,architecture);
  problem.operationContinuityGroups![0].policy="PREFERRED";
  assert.equal(validatePlan(problem,[...result.scheduledTasks]).hardValid,true);
  assert.equal(continuityPenalty(problem,result.scheduledTasks),80);
  assert.deepEqual(assessOperationContinuity(problem,result.scheduledTasks)[0],{groupId:problem.operationContinuityGroups![0].id,policy:"PREFERRED",requestedGapMinutes:0,gapMinutes:40,deviationMinutes:40,penalty:80,satisfied:true,complete:true});
  problem.operationContinuityGroups![0].policy="REQUIRED";
  assert.equal(validatePlan(problem,[...result.scheduledTasks]).hardValid,false);
  assert.ok(validatePlan(problem,[...result.scheduledTasks]).reasonCodes.includes("OPERATION_CONTINUITY_REQUIRED"));
  assert.notEqual(materializeNominalPipelineWitness(problem,architecture).witness.status,"FEASIBLE");
});

test("two independent groups can interleave in the same room, which remains physically exclusive",()=>{
  const problem=operationContinuityScenario(), result=materializeNominalPipelineWitness(problem,architecture);
  const other={id:"other-family",kind:"auxiliary" as const,participantId:"other-person",spaceId:"shared-room",duration:10,dependencies:[]};
  problem.participants.push({id:"other-person",availability:[problem.day]});problem.tasks.push(other);
  problem.operationContinuityGroups!.push({id:"93460c12-a85b-4340-9194-fe8d0d2d6e28",taskIds:[other.id],policy:"REQUIRED",gapWeight:1});
  assert.equal(validatePlan(problem,[...result.scheduledTasks,{...other,start:30,end:40}]).hardValid,true);
  assert.equal(validatePlan(problem,[...result.scheduledTasks,{...other,start:15,end:25}]).hardValid,false);
  assert.equal(operationContinuityPreflight(problem).length,0);
});

test("PREFERRED influences the existing candidate scorer, OFF is neutral, HARD candidates are still rejected",()=>{
  const problem=operationContinuityScenario();problem.tasks=problem.tasks.filter(task=>task.id.startsWith("preparation"));
  problem.tasks.forEach(task=>{task.dependencies=[];delete task.availability;});
  const [first,second]=problem.tasks, placed=[{...first,start:10,end:20}];
  problem.operationContinuityGroups![0].policy="PREFERRED";
  assert.equal(scoreAuxiliaryTask(problem,second,30,placed).cost-scoreAuxiliaryTask(problem,second,20,placed).cost,20);
  problem.operationContinuityGroups![0].policy="OFF";
  assert.equal(scoreAuxiliaryTask(problem,second,30,placed).cost,scoreAuxiliaryTask(problem,second,20,placed).cost);
});

test("the automatic engine completes an OFF day and never publishes an interrupted REQUIRED group",()=>{
  const problem=operationContinuityScenario();
  const run=executePlannerNext(problem);
  assert.ok(run.result);assert.equal(run.result.complete,true);
  assert.equal(validatePlan(problem,run.result.scheduledTasks).hardValid,true);
  problem.operationContinuityGroups![0].policy="REQUIRED";
  const required=executePlannerNext(problem);assert.ok(required.result);
  assert.equal(required.result.complete,false);
  assert.equal(required.result.scheduledTasks.length,0);
});

test("REQUIRED can construct a complete continuous group when its windows permit it",()=>{
  const problem=operationContinuityScenario();problem.operationContinuityGroups![0].policy="REQUIRED";
  problem.tasks.filter(task=>task.id.startsWith("preparation")).forEach(task=>{task.availability=[{start:10,end:90}];});
  const result=executePlannerNext(problem);assert.equal(result.result?.complete,true);
  assert.equal(assessOperationContinuity(problem,result.result!.scheduledTasks)[0].gapMinutes,0);
});

test("partial PREFERRED scopes report partial results while REQUIRED includes the whole group",()=>{
  const problem = operationContinuityScenario();
  const group = problem.operationContinuityGroups![0];
  const scope = createPlanningScope({ kind: "ids", value: "preparation-0" }, {}, ["preparation-0"]);
  group.policy = "PREFERRED";
  const partial = buildAssistedProblem(problem, scope, []).problem;
  assert.deepEqual(partial.operationContinuityGroups![0].taskIds, ["preparation-0"]);
  assert.equal(partial.operationContinuityGroups![0].declaredTaskCount, 3);
  const task = partial.tasks.find(task => task.id === "preparation-0")!;
  assert.equal(assessOperationContinuity(partial, [{ ...task, start: 10, end: 20 }])[0].complete, false);
  assert.deepEqual(operationContinuityPreflight(partial), []);
  group.policy = "REQUIRED";
  const complete = buildAssistedProblem(problem, scope, []).problem;
  assert.deepEqual(complete.operationContinuityGroups![0].taskIds, group.taskIds);
  assert.equal(complete.operationContinuityGroups![0].declaredTaskCount, undefined);
  complete.operationContinuityGroups![0].declaredTaskCount = 4;
  assert.deepEqual(operationContinuityPreflight(complete), ["INVALID_OPERATION_CONTINUITY_GROUP"]);
});
