import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import type {EngineInput} from "../../types";
import {adaptEngineInputToPlannerNextProblem} from "./engineInputAdapter";
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from "../assistedPlanning";
import {validatePlan} from "../validate";

const native=()=>JSON.parse(readFileSync("docs/evidence/p0-u00f/native/second-input.json","utf8")) as EngineInput;
const adapted=()=>{
 const result=adaptEngineInputToPlannerNextProblem(native());assert.equal(result.status,"SUPPORTED");
 if(result.status!=="SUPPORTED")throw Error("Native fixture unsupported");return result.problem;
};
const solve=(problem:ReturnType<typeof adapted>)=>executeAssistedPlanning(buildAssistedProblem(problem,
 createPlanningScope({kind:"DAY",value:"transport regression"},{},problem.tasks.map(task=>task.id)),[]));

test("native nine-obligation empty core uses charged standalone completion and Future Feasibility",()=>{
 const problem=adapted(),before=structuredClone(problem),first=solve(problem),again=solve(problem);
 assert.equal(first.proposal?.length,9);
 assert.equal(first.evidence.completeForScope,true);assert.equal(first.evidence.requiredValid,true);
 assert.equal(first.evidence.work.coreBranches,0);assert.equal(first.evidence.work.bundleMatchingAttempts,0);
 assert.ok(first.evidence.work.standaloneBranches>0);
 assert.equal(first.evidence.work.branchesExplored,first.evidence.work.standaloneBranches);
 assert.ok(first.evidence.work.branchesExplored<=problem.budget.maxBranchExpansions!);
 assert.equal(validatePlan(problem,[...first.proposal!]).hardValid,true);
 assert.deepEqual(first.proposal,again.proposal);assert.equal(first.evidence.fingerprint,again.evidence.fingerprint);
 assert.deepEqual(first.evidence.work,again.evidence.work);assert.deepEqual(problem,before);
});

test("incomplete transport contracts, absent dependencies and unknown resources never become ordinary tasks",()=>{
 const cases=[
  (input:EngineInput)=>{input.transportSettings=undefined;},
  (input:EngineInput)=>{input.arrivalMinimumGroupSize=4;input.transportSettings!.arrivalMinimumGroupSize=4;},
  (input:EngineInput)=>{input.tasks[1].dependsOnTaskIds=[999999];},
  (input:EngineInput)=>{input.tasks[0].declaredResourceIds=[999999];},
 ];
 for(const change of cases){const input=native();change(input);assert.equal(adaptEngineInputToPlannerNextProblem(input).status,"UNSUPPORTED");}
});

test("impossible group cardinality, separation and windows produce no partial proposal",()=>{
 for(const variant of ["group","gap","window"]){
  const problem=structuredClone(adapted());
  if(variant==="group")problem.transportPolicy!.arrival.minimumGroupSize=problem.transportPolicy!.arrival.maximumGroupSize=2;
  else if(variant==="gap"){
   problem.transportPolicy!.arrival.minimumGroupSize=problem.transportPolicy!.arrival.maximumGroupSize=1;
   problem.transportPolicy!.arrival.minGapMinutes=problem.day.end-problem.day.start+5;
  }
  else for(const task of problem.tasks.filter(task=>problem.transportPolicy!.arrival.taskIds.includes(task.id)))task.availability=[{start:540,end:545}];
  const result=solve(problem);assert.equal(result.proposal,null);assert.equal(result.evidence.completeForScope,false);
 }
});

test("incorrect transport dependencies fail preflight",()=>{
 const input=native();const arrival=input.tasks.find(task=>task.operationalRole==="transport_arrival")!;
 const departure=input.tasks.find(task=>task.operationalRole==="transport_departure"&&task.contestantId===arrival.contestantId)!;
 arrival.dependsOnTaskIds=[departure.id];
 const result=adaptEngineInputToPlannerNextProblem(input);assert.equal(result.status,"UNSUPPORTED");assert.ok(result.reasonCodes.includes("DEPENDENCY_CYCLE"));
});
