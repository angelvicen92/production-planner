import type { PlannerNextProblem } from "../contracts";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { auxiliaryScarcityScenario } from "../scenarios/auxiliaryScarcityScenario";
import { mainFlowResourcePresenceScenario } from "../scenarios/mainFlowResourcePresenceScenario";
import { mainFlowVocalBacktrackingScenario } from "../scenarios/mainFlowVocalBacktrackingScenario";
import { mainFlowVocalScenario } from "../scenarios/mainFlowVocalScenario";

function logical(factory:()=>PlannerNextProblem) {
  const result=planMainFlowAndFeeders(factory()), m=result.metrics;
  return { complete:result.complete, hardValid:m.hardValid, plannedTaskCount:m.plannedTaskCount, mainFlowStart:m.mainFlowStart, mainFlowEnd:m.mainFlowEnd,
    mainFlowGapMinutes:m.mainFlowGapMinutes, planFingerprint:m.planFingerprint, reasonCodes:m.reasonCodes, backtracks:m.backtracks,
    searchStopReason:m.searchStopReason, auxiliarySelectionOrder:m.auxiliarySelectionOrder,
    auxiliaryCandidateCountWhenSelectedByTaskId:m.auxiliaryCandidateCountWhenSelectedByTaskId,
    totalParticipantPresenceMinutes:m.totalParticipantPresenceMinutes, participantPresenceMinutesById:m.participantPresenceMinutesById,
    resourcePresenceMinutesById:m.resourcePresenceMinutesById, resourceInternalGapMinutesById:m.resourceInternalGapMinutesById,
    violationCount:m.dependencyViolationCount+m.overlapViolationCount+m.transitionViolationCount+m.availabilityViolationCount+m.blockViolationCount+m.resourceAvailabilityViolationCount+m.resourceOverlapViolationCount+m.resourceTransitionViolationCount,
    runtimeMs:m.runtimeMs };
}
function run(factory:()=>PlannerNextProblem) { const first=logical(factory), second=logical(factory); const {runtimeMs:_,...a}=first,{runtimeMs:__,...b}=second; return {...first,deterministic:JSON.stringify(a)===JSON.stringify(b)}; }
const scenarios={
  baseline:run(mainFlowVocalScenario), adversarial:run(mainFlowVocalBacktrackingScenario),
  adversarialZeroBacktracks:run(()=>{const p=mainFlowVocalBacktrackingScenario();p.budget.maxBacktracks=0;return p;}),
  resourceOff:run(()=>mainFlowResourcePresenceScenario("OFF")), resourceHigh:run(()=>mainFlowResourcePresenceScenario("HIGH")),
  auxiliaryOff:run(()=>auxiliaryScarcityScenario("OFF")), auxiliaryHigh:run(()=>auxiliaryScarcityScenario("HIGH")),
};
const scarceFirst=scenarios.auxiliaryHigh.auxiliarySelectionOrder[0]?.includes("scarce")===true;
const accepted=scenarios.baseline.planFingerprint==="070b4d4a2259b629b8e818fd6e34ea4bba63c05f87d60b4b5f4cbfc7b1b6848b"
 && scenarios.adversarial.planFingerprint==="dbd3d669a6fd2121bab29f6372d974366661399d797baf5df9eac2b28592176f"
 && scenarios.resourceOff.planFingerprint==="94a29319aa0cd1d91eb42c38b2fdf5b118e8b67a6aa9fc4f5370a5edcd47baea"
 && scenarios.resourceHigh.planFingerprint==="e66cde36ff46933d1383321dbdb9d97f1dfb8f67e7c4c383f9e3f684f7108b82"
 && scenarios.adversarial.backtracks>=1 && scenarios.adversarialZeroBacktracks.searchStopReason==="BACKTRACK_BUDGET_EXHAUSTED"
 && scenarios.auxiliaryOff.plannedTaskCount===20 && scenarios.auxiliaryHigh.plannedTaskCount===20 && scarceFirst
 && scenarios.auxiliaryHigh.totalParticipantPresenceMinutes<scenarios.auxiliaryOff.totalParticipantPresenceMinutes
 && Object.values(scenarios).every((x)=>x.deterministic&&x.runtimeMs<2000&&(x.complete?x.violationCount===0:true));
process.stdout.write(JSON.stringify({version:"planner-next-auxiliary-scarcity-v1",scenarios,acceptance:{accepted,scarceFirst}},null,2)+"\n");
