import assert from "node:assert/strict";import test from "node:test";
import type { PlannerNextProblem,ScheduledParticipantMeal,ScheduledTask,Task } from "../../engine/planner-next/contracts";
import { solveStageClosure } from "./runA2Stage209ClosureWitnessProbe";

const task=(id:string,participantId:string,dependencies:string[],availability=[{start:0,end:40}]):Task=>({id,kind:"auxiliary",participantId,spaceId:"shared",duration:10,dependencies,availability});
const fixture=(startsA=[0,10],startsB=[0,10],ids=["a","b"])=>{const meals:ScheduledParticipantMeal[]=[
  {id:"ma",sourceTaskId:"meal-a",participantId:"pa",duration:5,start:0,end:5},{id:"mb",sourceTaskId:"meal-b",participantId:"pb",duration:5,start:0,end:5}];
  const prerequisites=[task(ids[0]!,"pa",["meal-a"],startsA.map(start=>({start,end:start+10}))),task(ids[1]!,"pb",["meal-b"],startsB.map(start=>({start,end:start+10})))];
  const outs=[task("out-a","pa",[ids[0]!],[{start:10,end:40}]),task("out-b","pb",[ids[1]!],[{start:10,end:40}])];
  const problem:PlannerNextProblem={day:{start:0,end:40},spaces:[{id:"shared",availability:[{start:0,end:40}]}],resources:[],participants:["pa","pb"].map(id=>({id,availability:[{start:0,end:40}]})),coaches:[],tasks:[...prerequisites,...outs],mainFlow:{spaceId:"shared",preferredEnd:40,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:1,maxPatterns:1,maxBranchExpansions:1},participantMeals:meals.map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,participantId:meal.participantId,duration:meal.duration,window:{start:0,end:40},status:"pending"})),participantMealCapacity:{maxSimultaneous:2},transportPolicy:{arrival:{taskIds:[],minimumGroupSize:1,maximumGroupSize:2,minGapMinutes:0,groupingWeight:1},departure:{taskIds:outs.map(x=>x.id),minimumGroupSize:1,maximumGroupSize:2,minGapMinutes:0,groupingWeight:1}}};return {problem,meals};};
const validation:any={hardValid:true,requiredValid:true,reasonCodes:[],violations:[]};
const transport=(status:"FEASIBLE"|"INFEASIBLE"|"BUDGET_EXHAUSTED",out:ScheduledTask[]=[])=>({status,scheduled:status==="FEASIBLE"?out:null,evidence:{directions:[{statesExplored:1}]}} as any);

test("meal dependency and real space occupation limit prerequisite start",()=>{const {problem,meals}=fixture([0,5,10,20],[10]);let seen:ScheduledTask[]=[];
 const result=solveStageClosure(problem,[],meals,{transport:(_p,t)=>{seen=[...t];return transport("FEASIBLE",[]);},validate:()=>validation});assert.equal(result.status,"PASS");
 assert.equal(seen.find(x=>x.id==="a")?.start,20);});
test("earliest slot is attempted before latest",()=>{const {problem,meals}=fixture([10,20],[20]);let start=-1;
 solveStageClosure(problem,[],meals,{transport:(_p,t)=>{start=t.find(x=>x.id==="a")!.start;return transport("FEASIBLE");},validate:()=>validation});assert.equal(start,10);});
test("individually viable tasks without a global matching are infeasible",()=>{const {problem,meals}=fixture([10],[10]);assert.equal(solveStageClosure(problem,[],meals,{transport:()=>transport("FEASIBLE"),validate:()=>validation}).status,"INFEASIBLE");});
test("a global matching passes",()=>{const {problem,meals}=fixture([10],[10,20]);assert.equal(solveStageClosure(problem,[],meals,{transport:()=>transport("FEASIBLE"),validate:()=>validation}).status,"PASS");});
test("a rejected first perfect matching is repaired by a second",()=>{const {problem,meals}=fixture([10,20],[10,20]);let calls=0;const result=solveStageClosure(problem,[],meals,{transport:()=>++calls===1?transport("INFEASIBLE"):transport("FEASIBLE"),validate:()=>validation});assert.equal(result.status,"PASS");assert.equal(result.evidence.perfectMatchingsTried,2);});
test("transport budget exhaustion is never converted to infeasible",()=>{const {problem,meals}=fixture([10],[20]);assert.equal(solveStageClosure(problem,[],meals,{transport:()=>transport("BUDGET_EXHAUSTED")}).status,"BUDGET_EXHAUSTED");});
test("future OUT feasibility prunes a prerequisite geometry before transport",()=>{const {problem,meals}=fixture([30],[10]);let calls=0;
 const result=solveStageClosure(problem,[],meals,{transport:()=>{calls++;return transport("FEASIBLE");},validate:()=>validation});
 assert.equal(result.status,"INFEASIBLE");assert.equal(calls,0);assert.ok(result.evidence.futureOutPrunes>0);});
test("closure state exhaustion remains explicit",()=>{const {problem,meals}=fixture([10,20],[10,20]);
 const result=solveStageClosure(problem,[],meals,{maxClosureStates:0,transport:()=>transport("FEASIBLE"),validate:()=>validation});
 assert.equal(result.status,"BUDGET_EXHAUSTED");assert.equal(result.evidence.budgetExhausted,true);});
test("renumbering opaque task IDs does not change the outcome",()=>{const first=fixture([10],[10,20],["a","z"]),second=fixture([10],[10,20],["900","001"]);const run=(x:ReturnType<typeof fixture>)=>solveStageClosure(x.problem,[],x.meals,{transport:()=>transport("FEASIBLE"),validate:()=>validation});assert.equal(run(first).status,run(second).status);assert.equal(run(first).evidence.perfectMatchingsTried,run(second).evidence.perfectMatchingsTried);});
test("overlapping starts are not treated as distinct capacity slots",()=>{const {problem,meals}=fixture([10],[15]);
 const result=solveStageClosure(problem,[],meals,{transport:()=>transport("FEASIBLE"),validate:()=>validation});
 assert.equal(result.status,"INFEASIBLE");assert.equal(result.evidence.matchingAlgorithm,"CONFLICT_AWARE_DFS");});
test("independent spaces may share a start",()=>{const {problem,meals}=fixture([10],[10]);problem.spaces.push({id:"other",availability:[{start:0,end:40}]});problem.tasks.find(x=>x.id==="b")!.spaceId="other";
 const result=solveStageClosure(problem,[],meals,{transport:()=>transport("FEASIBLE"),validate:()=>validation});
 assert.equal(result.status,"PASS");assert.equal(result.evidence.matchingAlgorithm,"CONFLICT_AWARE_DFS");});
test("equal grid-sized tasks on one exclusive capacity use slot matching",()=>{const {problem,meals}=fixture([10,20],[10,20]);
 const result=solveStageClosure(problem,[],meals,{transport:()=>transport("FEASIBLE"),validate:()=>validation});
 assert.equal(result.status,"PASS");assert.equal(result.evidence.matchingAlgorithm,"BIPARTITE_UNIT_SLOTS");});
