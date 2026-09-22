import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { PreparedFutureTechnicalChainAuthority, probeTechnicalChainFutureReservations } from "./technicalChainFutureFeasibility";

const problem=():PlannerNextProblem=>({day:{start:0,end:60},spaces:[{id:"shared",availability:[{start:0,end:60}]},{id:"other",availability:[{start:0,end:60}]}],resources:[],participants:[{id:"future-person",availability:[{start:0,end:60}]},{id:"current-person",availability:[{start:0,end:60}]}],coaches:[],tasks:[],mainFlow:{spaceId:"other",preferredEnd:60,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{maxBranchExpansions:100,bestK:2},searchPolicy:"EXACT_CONSTRUCTIVE",analyticalFutureTechnicalChains:[{policy:{id:"future-structure",orderedTaskIds:["future-a","future-b"],adjacency:"REQUIRED",resourceContinuity:"REQUIRED",requiredResourceIds:[]},tasks:[{id:"future-a",kind:"technical",participantId:"future-person",spaceId:"shared",duration:20,availability:[{start:0,end:60}],dependencies:[]},{id:"future-b",kind:"technical",participantId:"future-person",spaceId:"shared",duration:20,availability:[{start:0,end:60}],dependencies:["future-a"]}]}]});
const placement=(start:number):ScheduledTask=>({id:"provisional",kind:"auxiliary",participantId:"current-person",spaceId:"shared",duration:20,availability:[{start:0,end:60}],dependencies:[],start,end:start+20});

test("prunes a provisional placement only after the exact required-chain probe proves zero domain",()=>{
  const placed=placement(20),result=probeTechnicalChainFutureReservations(problem(),[placed],[placed],100);
  assert.equal(result.status,"PRUNE"); assert.equal(result.result,"ZERO_DOMAIN");
  assert.equal(result.structureId,"future-structure"); assert.equal(result.workItemKey,"technical-chain:future-a");
  assert.equal(result.certifiedCausingTaskId,"provisional",
    "removing the newly added placement restores the chain witness");
  assert.ok(result.branchesConsumed>0);
});

test("keeps a provisional geometry when the required chain retains a complete witness",()=>{
  const placed=placement(40),result=probeTechnicalChainFutureReservations(problem(),[placed],[placed],100);
  assert.equal(result.status,"PASS"); assert.equal(result.result,"WITNESS"); assert.equal(result.candidateCount,1);
  assert.equal(result.certifiedCausingTaskId,null);
});

test("does not certify an older placement outside the material delta",()=>{
  const older=placement(20),unrelated={...placement(40),id:"unrelated",spaceId:"other"};
  const result=probeTechnicalChainFutureReservations(problem(),[older,unrelated],[unrelated],100);
  assert.equal(result.status,"PASS", "an unrelated delta does not claim or inspect a causal placement");
  assert.equal(result.certifiedCausingTaskId,null);
});

test("abstains rather than claiming infeasibility when the exact probe budget is unavailable",()=>{
  const placed=placement(20),result=probeTechnicalChainFutureReservations(problem(),[placed],[placed],0);
  assert.equal(result.status,"ABSTAIN"); assert.equal(result.result,"BUDGET_EXHAUSTED"); assert.equal(result.branchesConsumed,0);
});

test("deletion minimization isolates successive repair decisions in a multi-blocker zero domain",()=>{
  const p=problem();
  p.analyticalFutureTechnicalChains![0]!.tasks.forEach(task=>task.duration=25);
  const first={...placement(0),id:"first-decision"};
  const second={...placement(40),id:"second-decision"};
  const depth=(id:string)=>id==="first-decision"?1:id==="second-decision"?2:null;

  const initial=probeTechnicalChainFutureReservations(p,[first,second],[first,second],500,depth);
  assert.equal(initial.status,"PRUNE");
  assert.equal(initial.initialRepairableGroupCount,2);
  assert.deepEqual(initial.redundantDecisionDepths,[1],
    "removing the first group still leaves the second blocker, so it is redundant in this minimal proof");
  assert.deepEqual(initial.irreducibleDecisionDepths,[2]);
  assert.equal(initial.certifiedCausingTaskId,"second-decision");
  assert.equal(initial.certifiedDecisionDepth,2);
  assert.equal(initial.minimizationProbes,2);

  const repairedSecond={...second,spaceId:"other",start:20,end:40};
  const next=probeTechnicalChainFutureReservations(p,[first,repairedSecond],[first,second],500,depth);
  assert.equal(next.status,"PRUNE", "the following leaf isolates the other decision");
  assert.equal(next.certifiedCausingTaskId,"first-decision");
  assert.equal(next.certifiedDecisionDepth,1);

  const repairedFirst={...first,spaceId:"other"};
  const complete=probeTechnicalChainFutureReservations(p,[repairedFirst,repairedSecond],[first,second],500,depth);
  assert.equal(complete.status,"PASS", "after both main@slot repairs the future REQUIRED chain retains a witness");
  assert.equal(complete.result,"WITNESS");
});

test("prepared authority reuses a valid witness and preserves disjoint occupancy support",()=>{
  const p=problem();p.day.end=100;p.spaces.forEach(space=>space.availability=[{start:0,end:100}]);
  p.participants.forEach(person=>person.availability=[{start:0,end:100}]);
  p.analyticalFutureTechnicalChains![0]!.tasks[0]!.availability=[{start:0,end:20},{start:60,end:80}];
  p.analyticalFutureTechnicalChains![0]!.tasks[1]!.availability=[{start:20,end:40},{start:80,end:100}];
  p.analyticalFutureTechnicalChains![0]!.tasks[1]!.participantId="current-person";
  const authority=new PreparedFutureTechnicalChainAuthority(p);
  assert.deepEqual(authority.occupancySupport("future-person"),[{start:0,end:20},{start:60,end:80}],
    "a safe hole must not be widened into one continuous critical window");
  const reusable=new PreparedFutureTechnicalChainAuthority(problem());
  const interacting={...placement(40),spaceId:"other",participantId:"future-person",duration:5,end:45};
  const first=reusable.assess([interacting],[interacting]);
  assert.equal(first.status,"PASS");
  const evaluations=reusable.evidence.exactRootOrderEvaluations;
  const second=reusable.assess([interacting],[interacting]);
  assert.equal(second.status,"PASS");
  assert.equal(second.witnessReuseHit,true);
  assert.equal(reusable.evidence.exactRootOrderEvaluations,evaluations,"reuse performs no hidden search");
});

test("future pressure ranks a nearby safe placement ahead of a farther intrusive placement",()=>{
  const authority=new PreparedFutureTechnicalChainAuthority(problem());
  const safe={...placement(0),spaceId:"other",participantId:"current-person"};
  const intrusive={...placement(40),participantId:"future-person",spaceId:"other"};
  assert.equal(authority.intrusion([safe]),0);
  assert.ok(authority.intrusion([intrusive])>0,"classification is overlap-based, never distance-based");
});

test("an invalidated phased witness resumes at the next order of the same root",()=>{
  const p=problem(),future=p.analyticalFutureTechnicalChains![0]!;
  p.day={start:0,end:20};p.spaces.forEach(space=>space.availability=[{start:0,end:20}]);
  p.participants.forEach(person=>person.availability=[{start:0,end:20}]);
  p.participants.push({id:"future-person-b",availability:[{start:0,end:20}]});
  future.policy.phases=[["future-a","future-b"]];
  future.tasks[0]!.duration=10;future.tasks[0]!.availability=[{start:0,end:20}];future.tasks[0]!.dependencies=[];
  future.tasks[1]!.duration=10;future.tasks[1]!.availability=[{start:0,end:20}];future.tasks[1]!.dependencies=[];
  future.tasks[1]!.participantId="future-person-b";
  const authority=new PreparedFutureTechnicalChainAuthority(p);
  const harmless={...placement(0),id:"harmless",spaceId:"other",participantId:"future-person-b",start:20,end:20,duration:0};
  const first=authority.assess([harmless],[harmless]);
  assert.equal(first.status,"PASS");assert.equal(authority.evidence.exactRootOrderEvaluations,1);
  const blocker={...placement(0),id:"blocker",spaceId:"other",participantId:"future-person",duration:10,end:10};
  const repaired=authority.assess([blocker],[blocker]);
  assert.equal(repaired.status,"PASS");assert.equal(repaired.result,"WITNESS");
  assert.equal(authority.evidence.exactRootOrderEvaluations,2,
    "repair must evaluate O2 at root zero rather than skipping to another root");
});

test("phased static envelope retains a root when a member other than orderedTaskIds[0] can lead",()=>{
  const p=problem(),future=p.analyticalFutureTechnicalChains![0]!;p.day={start:0,end:20};
  p.spaces.forEach(space=>space.availability=[{start:0,end:20}]);p.participants.forEach(person=>person.availability=[{start:0,end:20}]);
  future.policy.phases=[["future-a","future-b"]];future.tasks.forEach(task=>{task.duration=10;task.dependencies=[];});
  future.tasks[0]!.availability=[{start:10,end:20}];future.tasks[1]!.availability=[{start:0,end:10}];
  const authority=new PreparedFutureTechnicalChainAuthority(p),prepared=authority.evidence.preparedFutureStructures[0]!;
  assert.equal(prepared.derivationMode,"STATIC_PHASE_ENVELOPE");assert.equal(prepared.rootsInStaticEnvelope,1);
  assert.deepEqual(authority.occupancySupport("future-person"),[{start:0,end:20}],
    "root zero and both phase offsets survive although future-a cannot be first");
});

test("assess hot paths and pressure cache do not scan known candidates for evidence",()=>{
  const authority=new PreparedFutureTechnicalChainAuthority(problem());
  const irrelevant={...placement(0),spaceId:"other"};authority.assess([irrelevant],[irrelevant]);
  assert.equal(authority.evidence.irrelevantFastPasses,1);assert.equal(authority.evidence.knownCandidateChecks,0);
  const relevant={...placement(40),participantId:"future-person",spaceId:"other",duration:5,end:45};
  authority.assess([relevant],[relevant]);const scans=authority.evidence.fullCandidateScans;
  authority.assess([relevant],[relevant]);assert.equal(authority.evidence.fullCandidateScans,scans,"lastWitness Evidence is O(1)");
  authority.pressure([relevant]);authority.pressure([relevant]);assert.equal(authority.evidence.pressureCacheHits,1);
});
