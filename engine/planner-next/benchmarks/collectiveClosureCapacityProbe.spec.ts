import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem,ScheduledParticipantMeal,ScheduledTask,Task } from "../contracts";
import { classifyCollectiveClosureCapacity } from "./collectiveClosureCapacityProbe";

const task=(id:string,participantId:string,dependencies:string[],starts:number[],spaceId="shared"):Task=>({id,kind:"auxiliary",participantId,spaceId,duration:10,dependencies,
  availability:starts.map(start=>({start,end:start+10}))});
const fixture=(startsA:number[],startsB:number[],outStartsA=[20,30],outStartsB=[20,30],ids=["pre-a","pre-b"])=>{
  const meals:ScheduledParticipantMeal[]=[];
  const prerequisites=[task(ids[0]!,"pa",[],startsA),task(ids[1]!,"pb",[],startsB)];
  const outs=[task("out-a","pa",[ids[0]!],outStartsA,"out-space"),task("out-b","pb",[ids[1]!],outStartsB,"out-space")];
  const problem:PlannerNextProblem={day:{start:0,end:50},spaces:[{id:"shared",availability:[{start:0,end:50}]},{id:"out-space",availability:[{start:0,end:50}]}],resources:[],
    participants:["pa","pb"].map(id=>({id,availability:[{start:0,end:50}]})),coaches:[],tasks:[...prerequisites,...outs],
    mainFlow:{spaceId:"shared",preferredEnd:50,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,
    budget:{bestK:1,maxBacktracks:1,maxPatterns:1,maxBranchExpansions:1},transportPolicy:{arrival:{taskIds:[],minimumGroupSize:1,maximumGroupSize:2,minGapMinutes:0,groupingWeight:1},
      departure:{taskIds:outs.map(item=>item.id),minimumGroupSize:1,maximumGroupSize:2,minGapMinutes:0,groupingWeight:1}}};
  return {problem,meals};
};
const terminal=(status:"FEASIBLE"|"INFEASIBLE"|"BUDGET_EXHAUSTED")=>({status,scheduled:status==="FEASIBLE"?[]:null,evidence:{directions:[]}} as any);
const run=(value:ReturnType<typeof fixture>,status:"FEASIBLE"|"INFEASIBLE"|"BUDGET_EXHAUSTED"="FEASIBLE")=>
  classifyCollectiveClosureCapacity(value.problem,[],value.meals,()=>terminal(status));

test("individually feasible prerequisites without collective shared-space matching are exactly infeasible",()=>{
  const result=run(fixture([10],[10]));
  assert.equal(result.status,"COLLECTIVE_CLOSURE_CAPACITY_INFEASIBLE");
  assert.equal(result.evidence.maximumMatchingCardinality,1);
  assert.equal(result.evidence.unmatchedPrerequisiteIds.length,1);
});

test("an OUT-aware collective matching passes",()=>{
  const result=run(fixture([10],[10,20], [20,30],[30,40]));
  assert.equal(result.status,"COLLECTIVE_CLOSURE_CAPACITY_PASS");
  assert.equal(result.evidence.maximumMatchingCardinality,2);
});

test("a prerequisite edge is removed when it leaves its participant OUT without an exact domain",()=>{
  const result=run(fixture([10,20],[30],[20],[40]));
  assert.equal(result.evidence.candidateEdgesBeforeOutFiltering,3);
  assert.equal(result.evidence.candidateEdgesAfterOutFiltering,2);
  assert.equal(result.evidence.domainSizeByPrerequisite["pre-a"],1);
  assert.equal(result.evidence.lastOutCompatibleStartByParticipant.pa,10);
});

test("classification and cardinality are invariant under opaque task ID renumbering",()=>{
  const first=run(fixture([10],[10,20],[20,30],[30,40],["a","z"]));
  const second=run(fixture([10],[10,20],[20,30],[30,40],["900","001"]));
  assert.equal(first.status,second.status);
  assert.equal(first.evidence.maximumMatchingCardinality,second.evidence.maximumMatchingCardinality);
  assert.equal(first.evidence.candidateEdgesAfterOutFiltering,second.evidence.candidateEdgesAfterOutFiltering);
});

test("terminal transport budget exhaustion cannot create a false collective infeasible result",()=>{
  const result=run(fixture([10],[20],[20,30],[30,40]),"BUDGET_EXHAUSTED");
  assert.equal(result.status,"COLLECTIVE_CLOSURE_CAPACITY_PASS");
  assert.equal(result.evidence.terminalTransportStatus,"BUDGET_EXHAUSTED");
});

test("geometry not certifiable as unit slots is inconclusive, never infeasible",()=>{
  const value=fixture([10],[15]);
  const result=run(value);
  assert.equal(result.status,"INCONCLUSIVE");
  assert.equal(result.evidence.geometry,"NOT_CERTIFIED_UNIT_SLOTS");
});
