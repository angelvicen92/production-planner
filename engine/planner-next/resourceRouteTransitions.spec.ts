import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { canPlaceTask, exactTaskStartDomain } from "./placement";
import { effectiveResourceTransitionMinutes, resourceRouteTransitionPreflightReasons } from "./resourceRouteTransitions";
import { validatePlan } from "./validate";
import { residualMatchingOperationsMayInteract } from "./exactMainAndFeederCore";
import { adaptEngineInputToPlannerNextProblem } from "./integration/engineInputAdapter";
import { createSpec10019CoachRouteTransitionFixture } from "./benchmarks/runSpec10019CoachRouteTransitionBenchmark";
import { preflightEngineInputForPlannerNext } from "./integration/engineInputPreflight";
import { resourceRouteMetrics } from "./resourcePresence";

function fixture() {
  const availability = [{start:0,end:200}];
  const first:ScheduledTask={id:"a",kind:"technical",spaceId:"A",duration:10,dependencies:[],requiredResourceIds:["CAM1","SON1"],start:0,end:10};
  const next:Task={id:"b",kind:"technical",spaceId:"B",duration:10,dependencies:[],requiredResourceIds:["CAM1","SON1"]};
  const problem:PlannerNextProblem={day:{start:0,end:200},profile:"STANDALONE_ONLY",participants:[],coaches:[],
    spaces:["A","B"].map(id=>({id,availability})),resources:["CAM1","SON1","presentadora"].map(id=>({id,availability,presencePreference:"OFF"})),
    tasks:[first,next],participantTransitionMinutes:0,resourceTransitionMinutes:5,
    resourceRouteTransitions:[{resourceId:"CAM1",fromSpaceId:"A",toSpaceId:"B",minutes:10}],
    budget:{bestK:1,maxBacktracks:10,maxPatterns:10,maxBranchExpansions:1000}};
  return {problem,first,next};
}
test("CAM identity and direction: 5 rejected, 10 accepted, reverse fallback and no effective consumption",()=>{
  const {problem,first,next}=fixture();
  assert.equal(canPlaceTask(problem,next,15,[first]),false);
  assert.equal(canPlaceTask(problem,next,20,[first]),true);
  assert.equal(effectiveResourceTransitionMinutes(problem,"CAM1","B","A"),5);
  assert.equal(canPlaceTask(problem,{...next,requiredResourceIds:["SON1"]},15,[first]),true);
  assert.equal(canPlaceTask(problem,{...next,spaceId:"A"},10,[first]),true);
  assert.equal(validatePlan(problem,[first,{...next,start:15,end:25}]).resourceTransitionViolationCount,1);
  assert.equal(validatePlan(problem,[first,{...next,start:20,end:30}]).resourceTransitionViolationCount,0);
});
test("resource fallback and simultaneous resources use max, with independent opposite routes",()=>{
  const {problem,first,next}=fixture();problem.resources[0]!.transitionMinutes=30;
  assert.equal(effectiveResourceTransitionMinutes(problem,"CAM1","A","B"),10);
  assert.equal(effectiveResourceTransitionMinutes(problem,"CAM1","B","A"),30);
  problem.resourceRouteTransitions!.push({resourceId:"SON1",fromSpaceId:"A",toSpaceId:"B",minutes:20},
    {resourceId:"CAM1",fromSpaceId:"B",toSpaceId:"A",minutes:15},
    {resourceId:"presentadora",fromSpaceId:"A",toSpaceId:"B",minutes:40});
  assert.deepEqual(resourceRouteTransitionPreflightReasons(problem),[]);
  assert.equal(canPlaceTask(problem,next,25,[first]),false);
  assert.equal(canPlaceTask(problem,next,30,[first]),true);
  assert.equal(effectiveResourceTransitionMinutes(problem,"CAM1","B","A"),15);
  assert.equal(canPlaceTask(problem,{...next,requiredResourceIds:["presentadora"]},10,[first]),true);
});
test("domains, residual matching and Evidence resolve the same temporal direction in either search order",()=>{
  const {problem,first,next}=fixture();
  const domain=exactTaskStartDomain(problem,next,[first]);assert.equal([...domain.starts()][0],20);
  const fixed={...next,start:20,end:30};
  const earlier={...first,id:"earlier",start:0,end:10};
  const reverse=exactTaskStartDomain(problem,earlier,[fixed]);
  assert.ok([...reverse.starts()].includes(0));assert.ok(![...reverse.starts()].includes(5));
  assert.equal(residualMatchingOperationsMayInteract(problem,[first],[{...next,start:15,end:25}]),true);
  assert.equal(residualMatchingOperationsMayInteract(problem,[first],[fixed]),false);
  assert.equal(resourceRouteMetrics(problem,[first,fixed]).transitionSlackMinutesById.CAM1,0);
});
test("coach compatibility: canonical 29/30, legacy fallback, duplicate declaration rejected and no double count",()=>{
  const {problem,first,next}=fixture();
  problem.coaches=[{id:"coach",availability:[{start:0,end:200}]}];
  problem.resources.push({id:"coach",availability:[{start:0,end:200}],presencePreference:"OFF"});
  const a={...first,kind:"auxiliary" as const,participantId:"p1",coachId:"coach",requiredResourceIds:["coach"]};
  const b={...next,kind:"auxiliary" as const,participantId:"p2",coachId:"coach",requiredResourceIds:["coach"]};
  problem.participants=["p1","p2"].map(id=>({id,availability:[{start:0,end:200}]}));
  problem.tasks=[a,b];problem.resourceRouteTransitions=[{resourceId:"coach",fromSpaceId:"A",toSpaceId:"B",minutes:30}];
  assert.equal(canPlaceTask(problem,b,39,[a]),false);assert.equal(canPlaceTask(problem,b,40,[a]),true);
  const invalid=validatePlan(problem,[a,{...b,start:39,end:49}]);
  assert.equal(invalid.transitionViolationCount,1);assert.equal(invalid.resourceTransitionViolationCount,0);
  problem.coachRouteTransitions=[{coachId:"coach",fromSpaceId:"A",toSpaceId:"B",minutes:30}];
  assert.ok(resourceRouteTransitionPreflightReasons(problem).length);
  assert.throws(()=>effectiveResourceTransitionMinutes(problem,"coach","A","B"));
});
test("route preflight rejects missing identities, same space, duplicates, zero and off grid",()=>{
  for(const mutate of [(p:PlannerNextProblem)=>p.resourceRouteTransitions![0]!.resourceId="unknown",
    (p:PlannerNextProblem)=>p.resourceRouteTransitions![0]!.toSpaceId="A",
    (p:PlannerNextProblem)=>p.resourceRouteTransitions!.push({...p.resourceRouteTransitions![0]!}),
    (p:PlannerNextProblem)=>p.resourceRouteTransitions![0]!.minutes=0,
    (p:PlannerNextProblem)=>p.resourceRouteTransitions![0]!.minutes=7]){
    const {problem}=fixture();mutate(problem);assert.ok(resourceRouteTransitionPreflightReasons(problem).length);
  }
});
test("EngineInput real daily IDs, fingerprints, unavailable catalog and historical ambiguity",()=>{
  const input=createSpec10019CoachRouteTransitionFixture();
  const legacy=input.coachRouteTransitions![0]!;
  input.resourceRouteTransitions=[{planResourceItemId:legacy.coachPlanResourceItemId,fromSpaceId:legacy.fromSpaceId,toSpaceId:legacy.toSpaceId,minutes:30}];
  assert.equal(preflightEngineInputForPlannerNext(input).status,"UNSUPPORTED");
  input.coachRouteTransitions=[];
  const result=adaptEngineInputToPlannerNextProblem(input);assert.equal(result.status,"SUPPORTED");
  if(result.status!=="SUPPORTED")throw Error("adapter");
  assert.equal(result.problem.resourceRouteTransitions![0]!.resourceId,`plan-resource:${legacy.coachPlanResourceItemId}`);
  const fingerprint=result.problemFingerprint;input.resourceRouteTransitions[0]!.minutes=35;
  assert.notEqual(adaptEngineInputToPlannerNextProblem(input).problemFingerprint,fingerprint);
  input.planResourceItems.find(r=>r.id===legacy.coachPlanResourceItemId)!.isAvailable=false;
  assert.equal(preflightEngineInputForPlannerNext(input).status,"UNSUPPORTED");
});
