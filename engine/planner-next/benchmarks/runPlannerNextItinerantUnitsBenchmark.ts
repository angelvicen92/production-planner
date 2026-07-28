import type { PlannerNextProblem, ScheduledTask } from "../contracts";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { auxiliaryScarcityScenario } from "../scenarios/auxiliaryScarcityScenario";
import { itinerantUnitsScenario } from "../scenarios/itinerantUnitsScenario";
import { mainFlowResourcePresenceScenario } from "../scenarios/mainFlowResourcePresenceScenario";
import { mainFlowVocalBacktrackingScenario } from "../scenarios/mainFlowVocalBacktrackingScenario";
import { mainFlowVocalScenario } from "../scenarios/mainFlowVocalScenario";

function unitView(tasks: ScheduledTask[], id: string) {
  const own = tasks.filter((task) => task.requiredResourceIds?.includes(id)).sort((a,b) => a.start-b.start || a.id.localeCompare(b.id));
  return { taskIds: own.map(({id:taskId})=>taskId), spaceIds: own.map(({spaceId})=>spaceId),
    start: own.map(({start})=>start), end: own.map(({end})=>end), gaps: own.slice(1).map((task,index)=>task.start-own[index]!.end) };
}
function logical(factory:()=>PlannerNextProblem, units=false) {
  const result=planMainFlowAndFeeders(factory()), m=result.metrics;
  return { complete:result.complete, hardValid:m.hardValid, plannedTaskCount:m.plannedTaskCount, mainFlowStart:m.mainFlowStart, mainFlowEnd:m.mainFlowEnd,
    mainFlowGapMinutes:m.mainFlowGapMinutes, planFingerprint:m.planFingerprint, reasonCodes:m.reasonCodes, backtracks:m.backtracks,
    searchStopReason:m.searchStopReason, auxiliarySelectionOrder:m.auxiliarySelectionOrder,
    auxiliaryCandidateCountWhenSelectedByTaskId:m.auxiliaryCandidateCountWhenSelectedByTaskId,
    totalParticipantPresenceMinutes:m.totalParticipantPresenceMinutes, participantPresenceMinutesById:m.participantPresenceMinutesById,
    resourcePresenceMinutesById:m.resourcePresenceMinutesById, resourceInternalGapMinutesById:m.resourceInternalGapMinutesById,
    resourceMoveCountById:m.resourceMoveCountById, resourceTransitionSlackMinutesById:m.resourceTransitionSlackMinutesById,
    violationCount:m.dependencyViolationCount+m.overlapViolationCount+m.transitionViolationCount+m.availabilityViolationCount+m.blockViolationCount+m.resourceAvailabilityViolationCount+m.resourceOverlapViolationCount+m.resourceTransitionViolationCount,
    unitRoutes: units ? { "mobile-unit-a":unitView(result.scheduledTasks,"mobile-unit-a"), "mobile-unit-b":unitView(result.scheduledTasks,"mobile-unit-b") } : undefined,
    parallel: units ? result.scheduledTasks.some(a=>a.requiredResourceIds?.includes("mobile-unit-a")&&result.scheduledTasks.some(b=>b.requiredResourceIds?.includes("mobile-unit-b")&&a.start<b.end&&b.start<a.end)) : undefined,
    runtimeMs:m.runtimeMs };
}
function run(factory:()=>PlannerNextProblem, units=false) { const first=logical(factory,units), second=logical(factory,units); const {runtimeMs:_,...a}=first,{runtimeMs:__,...b}=second; return {...first,deterministic:JSON.stringify(a)===JSON.stringify(b)}; }
const scenarios={
  baseline:run(mainFlowVocalScenario), adversarial:run(mainFlowVocalBacktrackingScenario),
  adversarialZeroBacktracks:run(()=>{const p=mainFlowVocalBacktrackingScenario();p.budget.maxBacktracks=0;return p;}),
  resourceOff:run(()=>mainFlowResourcePresenceScenario("OFF")), resourceHigh:run(()=>mainFlowResourcePresenceScenario("HIGH")),
  auxiliaryOff:run(()=>auxiliaryScarcityScenario("OFF")), auxiliaryHigh:run(()=>auxiliaryScarcityScenario("HIGH")), itinerantUnits:run(itinerantUnitsScenario,true),
};
const fingerprints={baseline:"070b4d4a2259b629b8e818fd6e34ea4bba63c05f87d60b4b5f4cbfc7b1b6848b",adversarial:"dbd3d669a6fd2121bab29f6372d974366661399d797baf5df9eac2b28592176f",resourceOff:"94a29319aa0cd1d91eb42c38b2fdf5b118e8b67a6aa9fc4f5370a5edcd47baea",resourceHigh:"e66cde36ff46933d1383321dbdb9d97f1dfb8f67e7c4c383f9e3f684f7108b82",auxiliaryOff:"47fbb0653150918250be0b3b423b4a57c7ff20af48ad2943570e672b9d11b4f8",auxiliaryHigh:"c936b716e7e70594ba0390c43b5032caa4d6f745ef276883c413d0c5f8fbce12"};
const frozen=Object.entries(fingerprints).every(([key,value])=>scenarios[key as keyof typeof scenarios].planFingerprint===value);
const itinerant=scenarios.itinerantUnits;
const accepted=frozen && scenarios.adversarial.backtracks>=1 && scenarios.adversarialZeroBacktracks.searchStopReason==="BACKTRACK_BUDGET_EXHAUSTED"
 && scenarios.resourceOff.resourcePresenceMinutesById["shared-production-resource"]===120 && scenarios.resourceHigh.resourcePresenceMinutesById["shared-production-resource"]===60
 && scenarios.auxiliaryOff.totalParticipantPresenceMinutes===1295 && scenarios.auxiliaryHigh.totalParticipantPresenceMinutes===1005
 && itinerant.complete && itinerant.hardValid && itinerant.plannedTaskCount===22 && itinerant.mainFlowStart===780 && itinerant.mainFlowEnd===900 && itinerant.mainFlowGapMinutes===0
 && itinerant.resourceMoveCountById["mobile-unit-a"]===1 && itinerant.resourceMoveCountById["mobile-unit-b"]===1
 && itinerant.resourceTransitionSlackMinutesById["mobile-unit-a"]===0 && itinerant.resourceTransitionSlackMinutesById["mobile-unit-b"]===0 && itinerant.parallel
 && Object.values(scenarios).every((x)=>x.deterministic&&x.runtimeMs<2000&&(x.complete?x.violationCount===0:true));
process.stdout.write(JSON.stringify({version:"planner-next-itinerant-units-v1",scenarios,acceptance:{accepted,frozenFingerprints:frozen}},null,2)+"\n");
