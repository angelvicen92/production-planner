import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, candidateCuts, candidateTimelineDomain, candidateTimelines, mainFlowMealAligned } from "./mainFlowMeal";
import { constructExactMainAndFeederCore, runExactMainAndFeederSearch } from "./exactMainAndFeederCore";
import { mainFlowMealScenario } from "./scenarios/mainFlowMealScenario";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { validatePlan } from "./validate";
import type { ScheduledOperationalMeal } from "./contracts";
describe("NEXT-017 main flow meal",()=>{it("orders block boundaries before internal boundaries without eliminating either",()=>{const p=mainFlowMealScenario(),pattern=["a","a","b","b"];assert.deepEqual(candidateCuts(pattern),[2,1,3]);assert.deepEqual(buildTimeline(p,pattern,15,2).slots,[810,825,900,915]);assert.equal(mainFlowMealAligned(p),true)});it("selects a feasible boundary atomically",()=>{const r=planMainFlowAndFeeders(mainFlowMealScenario());assert.equal(r.complete,true);assert.ok((r.metrics.mainFlowSelectedSplitIndex??0)>0);assert.deepEqual(({start:r.scheduledSpaceMeals.find(x=>x.spaceId==="main-stage")?.start,end:r.scheduledSpaceMeals.find(x=>x.spaceId==="main-stage")?.end}),{start:840,end:900})})});

it("generates several in-window meal starts for one pattern and ranks natural block changes first",()=>{const p=mainFlowMealScenario();p.protectedMeal=undefined;p.spaces.find(({id})=>id==="main-stage")!.mealPolicy={window:{start:780,end:990},duration:75};const timelines=candidateTimelines(p,["a","a","b","b"],15);assert.ok(new Set(timelines.filter(x=>x.splitIndex===2).map(x=>x.meal.start)).size>1);assert.ok(timelines.every(x=>x.meal.start>=780&&x.meal.end<=990));assert.equal(timelines[0]!.splitIndex,2);assert.ok(timelines.some(x=>x.splitIndex===1&&x.strategyRank===1));assert.ok(timelines.every(x=>x.morningTaskCount+x.afternoonTaskCount===4));});

it("calculates exact feasible meal ranges and cardinalities without materializing starts",()=>{const p=mainFlowMealScenario();p.day={start:0,end:100};p.protectedMeal=undefined;p.spaces.find(({id})=>id==="main-stage")!.mealPolicy={window:{start:0,end:100},duration:20};const domain=candidateTimelineDomain(p,["a","a","b","b"],15);assert.deepEqual(domain.ranges.map(({cut,startMin,startMax,feasibleCount,rawCount,analyticallyEliminated})=>({cut,startMin,startMax,feasibleCount,rawCount,analyticallyEliminated})),[
  {cut:2,startMin:30,startMax:50,feasibleCount:5,rawCount:17,analyticallyEliminated:12},
  {cut:1,startMin:15,startMax:35,feasibleCount:5,rawCount:17,analyticallyEliminated:12},
  {cut:3,startMin:45,startMax:65,feasibleCount:5,rawCount:17,analyticallyEliminated:12},
]);assert.equal(domain.domainCount,51);assert.equal(domain.feasibleCount,15);assert.equal(domain.analyticallyEliminated,36);assert.equal("timelines" in domain,false);});

it("eliminates wholly impossible intervals without constructing timelines",()=>{const p=mainFlowMealScenario();p.day={start:0,end:40};p.protectedMeal=undefined;p.spaces.find(({id})=>id==="main-stage")!.mealPolicy={window:{start:0,end:100},duration:20};const domain=candidateTimelineDomain(p,["a","a","b","b"],15);assert.equal(domain.feasibleCount,0);assert.equal(domain.analyticallyEliminated,domain.domainCount);assert.deepEqual(candidateTimelines(p,["a","a","b","b"],15),[]);});

it("reconciles lazy meal evidence, preserves preferred-first ordering, and is deterministic",()=>{const make=()=>{const p=mainFlowMealScenario();p.protectedMeal=undefined;p.spaces.find(({id})=>id==="main-stage")!.mealPolicy={window:{start:780,end:990},duration:75};return p};const domain=candidateTimelineDomain(make(),["a","a","b","b"],15);assert.equal(domain.domainCount,domain.feasibleCount+domain.analyticallyEliminated);assert.deepEqual(domain.ranges.map(({cut,strategyRank})=>[cut,strategyRank]),[[2,0],[1,1],[3,1]]);const first=constructExactMainAndFeederCore(make()),again=constructExactMainAndFeederCore(make());assert.deepEqual(first.evidence,again.evidence);assert.equal(first.evidence.mealTimelinesPreferred+first.evidence.mealTimelinesNonPreferred,first.evidence.mealTimelinesExplored);assert.equal(first.evidence.mealTimelineDomainCount,first.evidence.mealTimelinesEliminatedAnalytically+first.evidence.mealTimelinesExplored+first.evidence.mealTimelinesPendingAtExhaustion);assert.ok(first.evidence.mealTimelinesPreferred>0);});

it("materializes exactly one meal timeline when only one timeline branch remains",()=>{const p=mainFlowMealScenario();p.protectedMeal=undefined;p.spaces.find(({id})=>id==="main-stage")!.mealPolicy={window:{start:780,end:990},duration:75};p.budget.maxBranchExpansions=2;const result=constructExactMainAndFeederCore(p);assert.equal(result.status,"BRANCH_BUDGET_EXHAUSTED");assert.equal(result.evidence.mealTimelinesExplored,1);assert.equal(result.evidence.mealTimelinesPreferred,1);assert.ok(result.evidence.mealTimelinesPendingAtExhaustion>0);assert.equal(result.evidence.mealTimelineDomainCount,result.evidence.mealTimelinesEliminatedAnalytically+result.evidence.mealTimelinesExplored+result.evidence.mealTimelinesPendingAtExhaustion);});

function operationalMainMealFixture(){
  const problem=mainFlowMealScenario(),space=problem.spaces.find(({id})=>id===problem.mainFlow.spaceId)!;
  const policy=space.mealPolicy!;delete space.mealPolicy;
  problem.operationalMealPolicies=[{id:"main-operational-meal",window:{...policy.window},duration:policy.duration,
    resourceIds:[],spaceIds:[problem.mainFlow.spaceId]}];
  const legacy=planMainFlowAndFeeders(mainFlowMealScenario()),timeline=legacy.scheduledSpaceMeals
    .find(meal=>meal.spaceId===problem.mainFlow.spaceId)!;
  const meal:ScheduledOperationalMeal={id:problem.operationalMealPolicies[0]!.id,resourceIds:[],
    spaceIds:[problem.mainFlow.spaceId],duration:timeline.duration,start:timeline.start,end:timeline.end};
  return{problem,tasks:legacy.scheduledTasks,meal};
}

it("authorizes only the exact operational main meal as a continuity bridge without changing block runs",()=>{
  const {problem,tasks,meal}=operationalMainMealFixture();
  const valid=validatePlan(problem,tasks,[],[],[],[],[],[],[meal]);
  assert.equal(valid.blockViolationCount,0);
  assert.ok(validatePlan(problem,tasks).reasonCodes.includes("BLOCK_VIOLATION"));
  for(const invalid of [{...meal,id:"other"},{...meal,spaceIds:["required-meal-room"]},{...meal,start:meal.start+5,end:meal.end+5}])
    assert.ok(validatePlan(problem,tasks,[],[],[],[],[],[],[invalid]).reasonCodes.includes("BLOCK_VIOLATION"));

  const orderedMains=tasks.filter(task=>task.kind==="main").sort((a,b)=>a.start-b.start);
  const split=orderedMains.findIndex(task=>task.end===meal.start);
  assert.ok(split>=0&&orderedMains[split+1]?.start===meal.end);
  const internalTasks=tasks.map(task=>task.kind==="main"?{...task,blockKey:"one-run"}:task);
  const internalProblem={...problem,tasks:problem.tasks.map(task=>task.kind==="main"?{...task,blockKey:"one-run"}:task)};
  assert.equal(validatePlan(internalProblem,internalTasks,[],[],[],[],[],[],[meal]).blockViolationCount,0,
    "an internal meal must leave one blockKey run");
  const boundaryKeys=new Map(orderedMains.map((task,index)=>[task.id,index<=split?"before":"after"]));
  const boundaryTasks=tasks.map(task=>task.kind==="main"?{...task,blockKey:boundaryKeys.get(task.id)!}:task);
  const boundaryProblem={...problem,tasks:problem.tasks.map(task=>task.kind==="main"?{...task,blockKey:boundaryKeys.get(task.id)!}:task)};
  assert.equal(validatePlan(boundaryProblem,boundaryTasks,[],[],[],[],[],[],[meal]).blockViolationCount,0,
    "a meal between two blockKeys must not create a third run");
});

it("preserves legacy space-meal continuity and validates an operational CORE leaf without unrelated meals",()=>{
  const legacyProblem=mainFlowMealScenario(),legacy=planMainFlowAndFeeders(legacyProblem);
  assert.equal(validatePlan(legacyProblem,legacy.scheduledTasks,legacy.scheduledSetupPreparations,legacy.scheduledSpaceMeals).hardValid,true);
  const availability=[{start:0,end:60}];
  const problem={day:{start:0,end:60},spaces:[{id:"main",availability},{id:"feed",availability},{id:"other",availability}],
    resources:[],participants:[{id:"a",availability},{id:"b",availability}],coaches:[{id:"coach-a",availability},{id:"coach-b",availability}],
    tasks:[
      {id:"feed-a",kind:"vocal" as const,participantId:"a",coachId:"coach-a",duration:10,spaceId:"feed",dependencies:[],availability:[{start:0,end:10}]},
      {id:"main-a",kind:"main" as const,participantId:"a",coachId:"coach-a",duration:10,spaceId:"main",dependencies:["feed-a"],blockKey:"coach-a"},
      {id:"feed-b",kind:"vocal" as const,participantId:"b",coachId:"coach-b",duration:10,spaceId:"feed",dependencies:[],availability:[{start:20,end:30}]},
      {id:"main-b",kind:"main" as const,participantId:"b",coachId:"coach-b",duration:10,spaceId:"main",dependencies:["feed-b"],blockKey:"coach-b"},
    ],mainFlow:{spaceId:"main",preferredEnd:20,continuity:"REQUIRED" as const,maxBlocksByKey:1,minTasksPerBlock:1},
    participantTransitionMinutes:0,resourceTransitionMinutes:0,auxiliaryPolicy:{participantPresencePreference:"OFF" as const},
    budget:{bestK:1,maxBacktracks:0,maxPatterns:20,maxBranchExpansions:20_000},searchPolicy:"EXACT_CONSTRUCTIVE" as const,
    operationalMealPolicies:[
      {id:"main-operational-meal",window:{start:20,end:30},duration:10,resourceIds:[],spaceIds:["main"]},
      {id:"deferred-operational-meal",window:{start:20,end:40},duration:10,resourceIds:[],spaceIds:["other"]},
    ]};
  let hardValidLeaves=0;
  const result=runExactMainAndFeederSearch(problem,{onHardValidCoreLeaf(){hardValidLeaves++;return "ACCEPT";}});
  assert.equal(result.status,"COMPLETE",result.evidence.reasonCodes.join(","));
  assert.ok(result.evidence.coreLeafValidationAccepted>0);assert.ok(hardValidLeaves>0);
  assert.equal(result.evidence.coreLeafHardValidationRejects,0);
  assert.equal(result.evidence.coreLeafValidationAttempts,result.evidence.coreLeafValidationAccepted);
});
