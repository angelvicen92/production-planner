import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, Task } from "./contracts";
import { createExactSearchLedger } from "./exactMainAndFeederCore";
import { exploreExactPreferredResourceUnit } from "./exactPreferredResourceUnit";
import type { ParticipantFutureReservationProbe, ParticipantFutureReservationStatus } from "./participantFutureFeasibility";

const futureProbe=(status:ParticipantFutureReservationStatus,reason:ParticipantFutureReservationProbe["reasonCode"]=null,
  abstainCause:ParticipantFutureReservationProbe["abstainCause"]=null):ParticipantFutureReservationProbe=>({
  status,affectedParticipants:[],affectedFutureTasksChecked:0,affectedMealsChecked:0,individualDomainChecks:0,
  individualZeroDomainPrunes:Number(reason==="FUTURE_PARTICIPANT_TASK_ZERO_DOMAIN"),jointTaskMealChecks:0,jointTaskMealPrunes:0,
  collectiveChecks:0,collectivePasses:0,collectivePrunes:Number(reason==="FUTURE_PARTICIPANT_COLLECTIVE_INFEASIBLE"),
  collectiveObligationIds:[],collectiveDomainSizes:{},collectiveWitnessFound:false,compatiblePairChecks:0,analyticChecks:1,
  branchesConsumed:0,unresolvedDependencyIds:[],abstainCause,reasonCode:reason,futureTaskId:null,mealTaskId:null,
  participantId:null,futureTaskCandidateCount:0,mealCandidateCount:0,compatiblePairCount:0,participantDiagnostics:[],
  dominatedLaterStartsSkipped:0,earliestDominanceBranches:0,
});

function fixture(reverse=false){
  const availability=[{start:0,end:60}];
  const resourceTasks:Task[]=["a","b"].map(id=>({id,kind:"auxiliary",participantId:id,duration:10,
    spaceId:`space-${id}`,dependencies:[],availability,requiredResourceIds:["preferred"]}));
  const setupTasks:Task[]=[{id:"setup",kind:"auxiliary",participantId:"setup",duration:10,spaceId:"setup-space",
    dependencies:[],availability:[{start:20,end:30}],setupFamilyId:"family"}];
  const problem:PlannerNextProblem={day:{start:0,end:60},spaces:[...resourceTasks.map(task=>({id:task.spaceId,availability})),
    {id:"setup-space",availability,secondaryContinuity:"REQUIRED",setupPolicy:{familyOrder:["family"],reentry:"FORBIDDEN"}}],
    resources:[{id:"preferred",availability,presencePreference:"PREFERRED",transitionMinutes:0}],
    participants:[...resourceTasks,...setupTasks].map(task=>({id:task.participantId!,availability})),coaches:[],
    tasks:reverse?[...setupTasks,...resourceTasks].reverse():[...resourceTasks,...setupTasks],participantTransitionMinutes:0,
    resourceTransitionMinutes:0,auxiliaryPolicy:{participantPresencePreference:"OFF"},
    budget:{bestK:1,maxBacktracks:0,maxPatterns:20,maxBranchExpansions:1000},searchPolicy:"EXACT_CONSTRUCTIVE"};
  return{problem,resourceTasks:reverse?[...resourceTasks].reverse():resourceTasks,setupTasks};
}

test("preferred-resource matching repairs a future-infeasible nominal edge without changing geometry",()=>{
  const {problem,resourceTasks,setupTasks}=fixture();const attempts:Array<Record<string,number>>=[];
  const result=exploreExactPreferredResourceUnit({problem,resourceId:"preferred",resourceTasks,setupTasks,placed:[],preparations:[],
    meals:[],ledger:createExactSearchLedger(1000),continuation:candidate=>{attempts.push(Object.fromEntries(candidate.tasks
      .filter(task=>task.id==="a"||task.id==="b").map(task=>[task.id,task.start])));return attempts.length===1
        ?{outcome:"DEAD_END",participantFutureExactPrune:true,terminalFutureResult:"PRUNE"}
        :{outcome:"FOUND",terminalFutureResult:"PASS"};},authorities:{participantFutureProbe:(...args)=>
      args[4]==="EXACT"&&args[2][0]!.id==="a"&&args[2][0]!.start===10
        ?futureProbe("PRUNE","FUTURE_PARTICIPANT_TASK_ZERO_DOMAIN"):futureProbe("PASS")}});
  assert.equal(result.outcome,"FOUND");assert.deepEqual(attempts.slice(0,2),[{a:10,b:0},{a:0,b:10}]);
  assert.equal(result.evidence.incrementalRepairs,1);assert.equal(result.evidence.causalForbiddenEdges,1);
  assert.equal(result.evidence.geometriesRescuedByRematching,1);assert.notDeepEqual(result.evidence.firstMatchingWitness,result.evidence.selectedMatchingWitness);
});

test("collective-only PRUNE creates no edge nogood, while ABSTAIN retains edges",()=>{
  const {problem,resourceTasks,setupTasks}=fixture();let continuations=0;
  const collective=exploreExactPreferredResourceUnit({problem,resourceId:"preferred",resourceTasks,setupTasks,placed:[],preparations:[],
    meals:[],ledger:createExactSearchLedger(1000),continuation:()=>{continuations+=1;return{outcome:"DEAD_END",participantFutureExactPrune:true,
      terminalFutureResult:"PRUNE"};},authorities:{participantFutureProbe:(...args)=>args[4]==="EXACT"
      ?futureProbe("PASS","FUTURE_PARTICIPANT_COLLECTIVE_INFEASIBLE"):futureProbe("ABSTAIN","FUTURE_PARTICIPANT_RESERVATION_INCONCLUSIVE","INCONCLUSIVE_SHAPE")}});
  assert.equal(collective.outcome,"DEAD_END");assert.ok(continuations>0);assert.equal(collective.evidence.causalForbiddenEdges,0);
  assert.equal(collective.evidence.incrementalRepairs,0);assert.equal(collective.evidence.analyticPrunedEdges,0);
});

test("preferred-resource future-aware matching is invariant to input order",()=>{
  const run=(reverse:boolean)=>{const {problem,resourceTasks,setupTasks}=fixture(reverse);let selected:Record<string,number>|null=null;
    const result=exploreExactPreferredResourceUnit({problem,resourceId:"preferred",resourceTasks,setupTasks,placed:[],preparations:[],meals:[],
      ledger:createExactSearchLedger(1000),continuation:candidate=>{selected=Object.fromEntries(candidate.tasks.filter(task=>task.id!=="setup")
        .map(task=>[task.id,task.start]));return{outcome:"FOUND"};},authorities:{participantFutureProbe:()=>futureProbe("PASS")}});
    assert.equal(result.outcome,"FOUND");return selected;};
  assert.deepEqual(run(false),run(true));
});
