import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { mainFlowVocalScenario } from "../scenarios/mainFlowVocalScenario";
import { mainFlowVocalBacktrackingScenario } from "../scenarios/mainFlowVocalBacktrackingScenario";
import { mainFlowResourcePresenceScenario } from "../scenarios/mainFlowResourcePresenceScenario";
import { auxiliaryScarcityScenario } from "../scenarios/auxiliaryScarcityScenario";
import { itinerantUnitsScenario } from "../scenarios/itinerantUnitsScenario";
import { longSecondaryBlockScenario } from "../scenarios/longSecondaryBlockScenario";
import { secondaryFutureFeasibilityScenario } from "../scenarios/secondaryFutureFeasibilityScenario";
import { boundedFutureFeasibilityScenario } from "../scenarios/boundedFutureFeasibilityScenario";
import type { PlannerNextProblem } from "../contracts";
import { generateBlockCandidates } from "../placeAuxiliaryTasks";
import { assessFutureFeasibility } from "../futureFeasibility";
import { createHash } from "node:crypto";
import { branchHistoryControlScenario, branchHistoryIsolatedPruningScenario, isolatedParticipantIds, isolatedTaskIds } from "../scenarios/branchHistoryInvarianceScenario";

const frozen = {
  baseline: "070b4d4a2259b629b8e818fd6e34ea4bba63c05f87d60b4b5f4cbfc7b1b6848b",
  adversarial: "dbd3d669a6fd2121bab29f6372d974366661399d797baf5df9eac2b28592176f",
  resourceOff: "94a29319aa0cd1d91eb42c38b2fdf5b118e8b67a6aa9fc4f5370a5edcd47baea",
  resourceHigh: "e66cde36ff46933d1383321dbdb9d97f1dfb8f67e7c4c383f9e3f684f7108b82",
  auxiliaryOff: "47fbb0653150918250be0b3b423b4a57c7ff20af48ad2943570e672b9d11b4f8",
  auxiliaryHigh: "c936b716e7e70594ba0390c43b5032caa4d6f745ef276883c413d0c5f8fbce12",
  itinerantUnits: "eed9c26041aba86398c0c898940f5dfd9cf0d5571209cadaafd8ce49ac55e9e3",
  longSecondaryBlock: "0ef512d872eaf904c61e464b90cd9e5f8bacf194a1ead1cdfdcbad043117b9aa",
  futureFeasibility: "d975d3a4dd8b070bc964a42b026d1c1d00cae16762fab166c6e26a6686a58798",
  boundedFutureFeasibility: "0b9d019238a779e92f522c26c3902143a585e564a728acda3f81b0df9483ad20",
};
const zero = () => { const problem = mainFlowVocalBacktrackingScenario(); problem.budget.maxBacktracks = 0; return problem; };
const inputs: Record<string, () => PlannerNextProblem> = {
  baseline: mainFlowVocalScenario,
  adversarial: mainFlowVocalBacktrackingScenario,
  adversarialZeroBacktracks: zero,
  resourceOff: () => mainFlowResourcePresenceScenario("OFF"),
  resourceHigh: () => mainFlowResourcePresenceScenario("HIGH"),
  auxiliaryOff: () => auxiliaryScarcityScenario("OFF"),
  auxiliaryHigh: () => auxiliaryScarcityScenario("HIGH"),
  itinerantUnits: itinerantUnitsScenario,
  longSecondaryBlock: longSecondaryBlockScenario,
  futureFeasibility: secondaryFutureFeasibilityScenario,
  boundedFutureFeasibility: boundedFutureFeasibilityScenario,
  branchHistoryIsolatedPruning: branchHistoryIsolatedPruningScenario,
};
function logicalResult(problem: PlannerNextProblem) {
  const result = planMainFlowAndFeeders(problem), m = result.metrics;
  return {
    bestK: problem.budget.bestK,
    complete: result.complete, hardValid: m.hardValid, plannedTaskCount: m.plannedTaskCount,
    planFingerprint: m.planFingerprint,
    logicalMetrics: {
      branchesExplored: m.branchesExplored, branchBudgetConsumed: m.branchBudgetConsumed,
      branchBudgetMaximum: problem.budget.maxBranchExpansions, backtracks: m.backtracks,
      auxiliaryBranchesExplored: m.auxiliaryBranchesExplored,
      secondaryBlockBranchesExplored: m.secondaryBlockBranchesExplored,
      futureFeasibilityChecks: m.futureFeasibilityChecks,
      futureFeasibilityBranchesExplored: m.futureFeasibilityBranchesExplored,
      futureInfeasibleCandidatesPruned: m.futureInfeasibleCandidatesPruned,
      futureTopRankedCandidatesPruned: m.futureTopRankedCandidatesPruned,
      futureBlockerCountByWorkItemKey: m.futureBlockerCountByWorkItemKey,
      acceptedPathMinimumFutureAlternativeCount: m.acceptedPathMinimumFutureAlternativeCount,
    },
    mainFlowStart: m.mainFlowStart, mainFlowEnd: m.mainFlowEnd, mainFlowGapMinutes: m.mainFlowGapMinutes,
    secondaryContinuityViolationCount: m.secondaryContinuityViolationCount,
    secondarySpaceStartById: m.secondarySpaceStartById, secondarySpaceEndById: m.secondarySpaceEndById,
    secondarySpaceGapMinutesById: m.secondarySpaceGapMinutesById, secondarySpaceBlockCountById: m.secondarySpaceBlockCountById,
    workItemSelectionOrder: m.auxiliaryWorkItemSelectionOrder,
    auxiliary: Object.fromEntries(result.scheduledTasks.filter(t => t.kind === "auxiliary").map(t => [t.id, { start: t.start, end: t.end }])),
    violationCount: m.dependencyViolationCount + m.overlapViolationCount + m.transitionViolationCount + m.availabilityViolationCount + m.blockViolationCount + m.resourceAvailabilityViolationCount + m.resourceOverlapViolationCount + m.resourceTransitionViolationCount + m.secondaryContinuityViolationCount,
    runtimeMs: m.runtimeMs,
  };
}
const scenarios: Record<string, any> = {};
for (const [name, make] of Object.entries(inputs)) {
  const scenario = logicalResult(make()), again = logicalResult(make());
  const { runtimeMs: _runtime, ...logical } = scenario;
  const { runtimeMs: _againRuntime, ...againLogical } = again;
  scenarios[name] = { ...scenario, deterministic: JSON.stringify(logical) === JSON.stringify(againLogical) };
}

const diagnosticProblem = boundedFutureFeasibilityScenario();
const diagnosticPlan = planMainFlowAndFeeders(diagnosticProblem);
const diagnosticPlaced = diagnosticPlan.scheduledTasks.filter(t => t.kind !== "auxiliary");
const diagnosticTasks = diagnosticProblem.tasks.filter(t => t.id.startsWith("long-block-"));
const search = generateBlockCandidates(diagnosticProblem, diagnosticTasks, diagnosticPlaced, 100000);
const probe1 = generateBlockCandidates(diagnosticProblem, diagnosticTasks, diagnosticPlaced, 100000, 0, "PROBE", 1);
const probeK = generateBlockCandidates(diagnosticProblem, diagnosticTasks, diagnosticPlaced, 100000, 0, "PROBE", diagnosticProblem.budget.bestK);
const startCount = Math.ceil((diagnosticProblem.day.end - diagnosticProblem.day.start) / 5), taskCount = diagnosticTasks.length, bestK = diagnosticProblem.budget.bestK;
const polynomialUpperBound = startCount * (taskCount + bestK * taskCount * (taskCount - 1) / 2);
const remaining = diagnosticProblem.tasks.filter(t => t.kind === "auxiliary" && !diagnosticTasks.some(x => x.id === t.id));
const assess = (candidate: (typeof search.candidates)[number]) => assessFutureFeasibility(diagnosticProblem, [...diagnosticPlaced, ...candidate.tasks], remaining, { remaining: 100000 }, () => ({ count: 0, exhausted: false }));
const ordered = search.candidates, top = ordered[0];
const topAssessment = top ? assess(top) : undefined;
const second = ordered.slice(1).find(candidate => assess(candidate).feasible), secondAssessment = second ? assess(second) : undefined;
const blockSignature = (candidate: typeof top) => candidate ? candidate.tasks.map(t => `${t.id}@${t.start}`).join("|") : null;
const boundedBlockConstruction = {
  taskCount, bestK, startCount, searchBranches: search.consumed, probeBranchesLimit1: probe1.consumed,
  probeBranchesLimitBestK: probeK.consumed, completeCandidatesGenerated: search.candidates.length,
  maximumPartialStatesPerStart: search.diagnostics.maximumPartialStatesPerStart, polynomialUpperBound,
  withinBound: search.consumed <= polynomialUpperBound,
  deterministic: JSON.stringify(search) === JSON.stringify(generateBlockCandidates(diagnosticProblem, diagnosticTasks, diagnosticPlaced, 100000)),
};
const acceptedBlockSignature = diagnosticPlan.scheduledTasks.filter(t => t.id.startsWith("long-block-")).map(t => `${t.id}@${t.start}`).join("|");
scenarios.boundedFutureFeasibility.boundedEvidence = {
  bestK, orderedLocalCandidateSignatures: ordered.map(blockSignature), topLocalCandidateSignature: blockSignature(top),
  topLocalCandidateFeasible: topAssessment?.feasible, topLocalCandidateBlockers: topAssessment?.blockingWorkItemKeys,
  secondLocalCandidateSignature: blockSignature(second), secondLocalCandidateFeasible: secondAssessment?.feasible,
  acceptedBlockSignature, acceptedBlockIsViableAlternative: ordered.slice(1).some(candidate => blockSignature(candidate) === acceptedBlockSignature && assess(candidate).feasible),
  alternativeCounts: { top: topAssessment?.assessments, second: secondAssessment?.assessments },
  branchBudget: { consumed: diagnosticPlan.metrics.branchBudgetConsumed, maximum: diagnosticProblem.budget.maxBranchExpansions },
};
const historicalOk = Object.entries(frozen).every(([name, fingerprint]) => scenarios[name]?.planFingerprint === fingerprint);
const bounded = scenarios.boundedFutureFeasibility, historical = scenarios.futureFeasibility;
const countersOk = Object.values(scenarios).every((scenario: any) => scenario.logicalMetrics.branchBudgetConsumed <= scenario.logicalMetrics.branchBudgetMaximum && scenario.logicalMetrics.secondaryBlockBranchesExplored + scenario.logicalMetrics.futureFeasibilityBranchesExplored <= scenario.logicalMetrics.auxiliaryBranchesExplored);
const controlProblem=branchHistoryControlScenario(), originalTaskIds=controlProblem.tasks.map(t=>t.id).sort(), controlPlan=planMainFlowAndFeeders(controlProblem);
const variantProblem=branchHistoryIsolatedPruningScenario(), variantPlan=planMainFlowAndFeeders(variantProblem);
const project=(tasks:typeof controlPlan.scheduledTasks)=>tasks.filter(t=>originalTaskIds.includes(t.id)).map(({id,start,end,spaceId})=>({taskId:id,start,end,spaceId})).sort((a,b)=>a.taskId.localeCompare(b.taskId));
const controlProjection=project(controlPlan.scheduledTasks), variantProjection=project(variantPlan.scheduledTasks);
const stable=(value:unknown)=>JSON.stringify(value), hash=(value:unknown)=>createHash("sha256").update(stable(value)).digest("hex");
const originalOrder=(order:string[])=>order.filter(key=>originalTaskIds.some(id=>key===`task:${id}`));
const controlTasks=controlProblem.tasks, isolatedTasks=variantProblem.tasks.filter(task=>isolatedTaskIds.includes(task.id as typeof isolatedTaskIds[number]));
const ids=(values:(string|undefined)[])=>[...new Set(values.filter((value):value is string=>Boolean(value)))].sort();
const disjoint=(a:string[],b:string[])=>a.every(id=>!b.includes(id));
const originalParticipantIds=ids(controlTasks.map(task=>task.participantId)), actualIsolatedParticipantIds=ids(isolatedTasks.map(task=>task.participantId));
const originalSpaceIds=ids(controlTasks.map(task=>task.spaceId)), isolatedSpaceIds=ids(isolatedTasks.map(task=>task.spaceId));
const originalResourceIds=ids(controlTasks.flatMap(task=>task.requiredResourceIds??[])), isolatedResourceIds=ids(isolatedTasks.flatMap(task=>task.requiredResourceIds??[]));
const originalDependencyIds=ids(controlTasks.flatMap(task=>task.dependencies)), isolatedDependencyIds=ids(isolatedTasks.flatMap(task=>task.dependencies));
const originalCoachIds=ids(controlTasks.map(task=>task.coachId)), isolatedCoachIds=ids(isolatedTasks.map(task=>task.coachId));
const participantsDisjoint=disjoint(originalParticipantIds,actualIsolatedParticipantIds), spacesDisjoint=disjoint(originalSpaceIds,isolatedSpaceIds), resourcesDisjoint=disjoint(originalResourceIds,isolatedResourceIds);
const dependenciesDisjoint=disjoint(originalTaskIds,isolatedDependencyIds)&&disjoint([...isolatedTaskIds],originalDependencyIds), coachesDisjoint=disjoint(originalCoachIds,isolatedCoachIds);
const subset=(record:Record<string,number>, keys:string[])=>Object.fromEntries(keys.map(key=>[key,record[key]??0]));
const originalParticipantPresenceControl=subset(controlPlan.metrics.participantPresenceMinutesById,originalParticipantIds), originalParticipantPresenceVariant=subset(variantPlan.metrics.participantPresenceMinutesById,originalParticipantIds);
const originalAuxiliaryIds=controlTasks.filter(task=>task.kind==="auxiliary").map(task=>task.id).sort();
const originalAuxiliaryCandidateCountsControl=subset(controlPlan.metrics.auxiliaryCandidateCountWhenSelectedByTaskId,originalAuxiliaryIds), originalAuxiliaryCandidateCountsVariant=subset(variantPlan.metrics.auxiliaryCandidateCountWhenSelectedByTaskId,originalAuxiliaryIds);
const originalResourcePresenceControl=subset(controlPlan.metrics.resourcePresenceMinutesById,originalResourceIds), originalResourcePresenceVariant=subset(variantPlan.metrics.resourcePresenceMinutesById,originalResourceIds);
const regionStructurallyIndependent=participantsDisjoint&&spacesDisjoint&&resourcesDisjoint&&dependenciesDisjoint&&coachesDisjoint&&stable(actualIsolatedParticipantIds)===stable([...isolatedParticipantIds].sort());
const branchHistoryInvariance={originalTaskIds,controlProjection,variantProjection,controlProjectionFingerprint:hash(controlProjection),variantProjectionFingerprint:hash(variantProjection),projectionsEqual:stable(controlProjection)===stable(variantProjection),originalWorkItemOrderControl:originalOrder(controlPlan.metrics.auxiliaryWorkItemSelectionOrder),originalWorkItemOrderVariant:originalOrder(variantPlan.metrics.auxiliaryWorkItemSelectionOrder),originalWorkItemOrderEqual:stable(originalOrder(controlPlan.metrics.auxiliaryWorkItemSelectionOrder))===stable(originalOrder(variantPlan.metrics.auxiliaryWorkItemSelectionOrder)),originalParticipantIds,isolatedParticipantIds:actualIsolatedParticipantIds,participantsDisjoint,originalSpaceIds,isolatedSpaceIds,spacesDisjoint,originalResourceIds,isolatedResourceIds,resourcesDisjoint,isolatedDependencyIds,dependenciesDisjoint,isolatedCoachIds,coachesDisjoint,regionStructurallyIndependent,originalParticipantPresenceControl,originalParticipantPresenceVariant,originalParticipantPresenceEqual:stable(originalParticipantPresenceControl)===stable(originalParticipantPresenceVariant),originalAuxiliaryCandidateCountsControl,originalAuxiliaryCandidateCountsVariant,originalAuxiliaryCandidateCountsEqual:stable(originalAuxiliaryCandidateCountsControl)===stable(originalAuxiliaryCandidateCountsVariant),originalResourcePresenceControl,originalResourcePresenceVariant,originalResourcePresenceEqual:stable(originalResourcePresenceControl)===stable(originalResourcePresenceVariant),isolatedTaskIds:[...isolatedTaskIds],isolatedTasksPlanned:isolatedTaskIds.every(id=>variantPlan.scheduledTasks.some(t=>t.id===id)),isolatedFuturePrunes:variantPlan.metrics.futureInfeasibleCandidatesPruned,isolatedTopLocalPrunes:variantPlan.metrics.futureTopRankedCandidatesPruned,isolatedBlockers:variantPlan.metrics.futureBlockerCountByWorkItemKey,deterministic:variantPlan.metrics.planFingerprint===planMainFlowAndFeeders(branchHistoryIsolatedPruningScenario()).metrics.planFingerprint};
const isolatedBlockersOnly=Object.keys(branchHistoryInvariance.isolatedBlockers).length>0&&Object.keys(branchHistoryInvariance.isolatedBlockers).every(key=>key===`task:${isolatedTaskIds[1]}`);
const variant=scenarios.branchHistoryIsolatedPruning;
const accepted = historicalOk && historical.bestK === 5 && bounded.bestK === 1 && bestK === 1 && bounded.complete && bounded.hardValid && bounded.plannedTaskCount === 22 && bounded.mainFlowGapMinutes === 0 && bounded.secondaryContinuityViolationCount === 0 && bounded.violationCount === 0 && bounded.logicalMetrics.futureInfeasibleCandidatesPruned >= 1 && bounded.logicalMetrics.futureTopRankedCandidatesPruned >= 1 && bounded.logicalMetrics.futureBlockerCountByWorkItemKey["task:scarce-window-task"] >= 1 && bounded.logicalMetrics.acceptedPathMinimumFutureAlternativeCount >= 1 && topAssessment?.feasible === false && topAssessment.blockingWorkItemKeys.includes("task:scarce-window-task") && secondAssessment?.feasible === true && scenarios.boundedFutureFeasibility.boundedEvidence.acceptedBlockIsViableAlternative && boundedBlockConstruction.withinBound && boundedBlockConstruction.deterministic && boundedBlockConstruction.maximumPartialStatesPerStart <= 1 && probe1.consumed < search.consumed && probeK.consumed <= search.consumed && search.candidates.length >= 2 && countersOk && branchHistoryInvariance.regionStructurallyIndependent && branchHistoryInvariance.projectionsEqual && branchHistoryInvariance.originalWorkItemOrderEqual && branchHistoryInvariance.originalParticipantPresenceEqual && branchHistoryInvariance.originalAuxiliaryCandidateCountsEqual && branchHistoryInvariance.originalResourcePresenceEqual && branchHistoryInvariance.isolatedTasksPlanned && branchHistoryInvariance.isolatedFuturePrunes>=1 && branchHistoryInvariance.isolatedTopLocalPrunes>=1 && isolatedBlockersOnly && variant.complete && variant.hardValid && variant.plannedTaskCount===22 && variant.violationCount===0 && Object.values(scenarios).every((scenario: any) => scenario.runtimeMs < 2000 && scenario.deterministic);
process.stdout.write(JSON.stringify({ version: "planner-next-branch-local-ranking-v2", scenarios, boundedBlockConstruction, branchHistoryInvariance, acceptance: { accepted, frozenFingerprints: frozen } }, null, 2) + "\n");
