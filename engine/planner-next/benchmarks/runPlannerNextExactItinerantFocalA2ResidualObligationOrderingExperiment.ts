import assert from "node:assert/strict";
import { anchoredTaskIds } from "../anchoredAccompaniment";
import type { PlannerNextProblem } from "../contracts";
import { constructExactMainAndFeederCore } from "../exactMainAndFeederCore";
import { constructExactItinerantPlan, runExactItinerantPlanSearch } from "../exactItinerantPlan";
import { evaluateParticipantItineraryQuality } from "../participantItineraryQuality";
import { createResidualObligationMainOrderer } from "../residualObligationAlignment";
import { validatePlan } from "../validate";
import { createAcceptedExactConstructiveFocalA2Problem } from "./focal-a2/focalA2ExactConstructiveConfiguration";
import { itinerantOperationProfiles } from "./focal-a2/focalA2RealityReference";

const reverseWindows = <T extends { availability: Array<{ start: number; end: number }> }>(items: T[]) => {
  items.reverse(); for (const item of items) item.availability.reverse();
};
function createProblem(reversed = false): PlannerNextProblem {
  const problem = createAcceptedExactConstructiveFocalA2Problem(reversed ? [...itinerantOperationProfiles].reverse() : itinerantOperationProfiles);
  if (reversed) {
    problem.tasks.reverse(); for (const task of problem.tasks) task.availability?.reverse();
    reverseWindows(problem.participants); reverseWindows(problem.spaces); reverseWindows(problem.resources);
    reverseWindows(problem.coaches); problem.anchoredAccompaniments?.reverse();
  }
  return problem;
}
function run(mode: "ACCEPTED_BASELINE" | "RESIDUAL_OBLIGATION_ALIGNMENT", reversed = false) {
  const problem = createProblem(reversed), before = JSON.stringify(problem);
  const coreIds = new Set(problem.tasks.filter(({ kind }) => kind === "main" || kind === "vocal").map(({ id }) => id));
  for (const id of anchoredTaskIds(problem)) coreIds.add(id);
  const standalone = problem.tasks.filter(({ id }) => !coreIds.has(id));
  const orderer = mode === "RESIDUAL_OBLIGATION_ALIGNMENT" ? createResidualObligationMainOrderer(problem, standalone) : null;
  const plan = orderer ? runExactItinerantPlanSearch(problem, { coreOrderer: orderer.options }) : constructExactItinerantPlan(problem);
  const quality = evaluateParticipantItineraryQuality(problem, plan.scheduledTasks);
  return { mode, plan, quality, orderingEvidence: orderer?.evidence ?? null,
    hardValid: validatePlan(problem, plan.scheduledTasks, [], plan.scheduledSpaceMeals).hardValid,
    inputUnchanged: JSON.stringify(problem) === before };
}
const baseline = run("ACCEPTED_BASELINE"), baselineAgain = run("ACCEPTED_BASELINE"), baselineReversed = run("ACCEPTED_BASELINE", true);
const experiment = run("RESIDUAL_OBLIGATION_ALIGNMENT"), experimentAgain = run("RESIDUAL_OBLIGATION_ALIGNMENT"), experimentReversed = run("RESIDUAL_OBLIGATION_ALIGNMENT", true);
assert.deepEqual(baseline.plan, baselineAgain.plan); assert.deepEqual(baseline.plan, baselineReversed.plan);
assert.deepEqual(experiment.plan, experimentAgain.plan); assert.deepEqual(experiment.plan, experimentReversed.plan);
assert.deepEqual(experiment.orderingEvidence, experimentAgain.orderingEvidence); assert.deepEqual(experiment.orderingEvidence, experimentReversed.orderingEvidence);
assert.equal(baseline.plan.status, "COMPLETE"); assert.equal(baseline.plan.scheduledTasks.length, 53);
assert.equal(baseline.plan.evidence.branchesExplored, 85_557);
assert.equal(baseline.plan.evidence.selectedCoreFingerprint, "0948b758c96f17ec546c331ce6d8b42464dbdbe95970d0640ae5fbea95fdbae9");
assert.equal(baseline.plan.evidence.fullFingerprint, "fded1fd188ba3daa833f68ce74533e6db43fd6e801d64f7f4cebea42aa5224d6");
assert.equal(baseline.quality.summary.qualityFingerprint, "a64f641fcde8d470808a1b3e2eda986b5a99390600dd5c70ab189d37fc16189f");
assert.equal(baseline.hardValid, true); assert.equal(experiment.hardValid, true);
assert.equal(baseline.inputUnchanged, true); assert.equal(experiment.inputUnchanged, true);
assert.equal(experiment.plan.status, "COMPLETE"); assert.equal(experiment.plan.scheduledTasks.length, 53);
assert.equal(experiment.plan.remainingTaskIds.length, 0); assert.equal(experiment.plan.evidence.branchesExplored, 70_704);
assert.equal(experiment.plan.evidence.coreBranches, 48_224); assert.equal(experiment.plan.evidence.standaloneBranches, 22_480);
assert.equal(experiment.plan.evidence.selectedCoreFingerprint, "44f10279aa01fa7628c01962e9fbdd819d69486ae11df4fe4851de946600f07f");
assert.equal(experiment.plan.evidence.fullFingerprint, "38309867fb51dcb14515d152035b7076a4738cac04d3d8cea721ec7be0749fa8");
assert.equal(experiment.quality.summary.qualityFingerprint, "13a87e0d9b6983c18ca5a0162785058b67b10f8ea65d46644463f49063791c75");
assert.equal(experiment.orderingEvidence?.cacheScope, "DESCRIPTOR_STATE");
assert.equal(experiment.orderingEvidence?.staticStartEvaluations, 13_944);
assert.equal(experiment.orderingEvidence?.staticStartsFound, 2_748);

const beforeByParticipant = new Map(baseline.quality.participants.map((item) => [item.participantId, item]));
const participantDeltas = experiment.quality.participants.map((item) => ({ participantId: item.participantId,
  idleDelta: item.idleMinutes - beforeByParticipant.get(item.participantId)!.idleMinutes }));
const standaloneProfileIds = new Set(itinerantOperationProfiles.filter(({ type }) => type === "STANDALONE").map(({ id }) => id));
const movedByKind = (kind: "main" | "vocal") => experiment.plan.scheduledTasks.filter((task) => task.kind === kind
  && baseline.plan.scheduledTasks.find(({ id }) => id === task.id)?.start !== task.start).map(({ id }) => id).sort();
const movedStandalone = experiment.plan.scheduledTasks.filter((task) => standaloneProfileIds.has(task.id)
  && baseline.plan.scheduledTasks.find(({ id }) => id === task.id)?.start !== task.start).map(({ id }) => id).sort();
const gapKey = (participantId: string, beforeTaskId: string, afterTaskId: string) => `${participantId}:${beforeTaskId}->${afterTaskId}`;
const baselineGaps = new Set(baseline.quality.participants.flatMap((participant) => participant.gaps.map((gap) =>
  gapKey(participant.participantId, gap.beforeTaskId, gap.afterTaskId))));
const experimentalGaps = new Set(experiment.quality.participants.flatMap((participant) => participant.gaps.map((gap) =>
  gapKey(participant.participantId, gap.beforeTaskId, gap.afterTaskId))));
const b = baseline.quality.summary, e = experiment.quality.summary;
const equivalent = baseline.plan.evidence.fullFingerprint === experiment.plan.evidence.fullFingerprint
  || (b.totalIdleMinutes === e.totalIdleMinutes && b.maximumParticipantIdleMinutes === e.maximumParticipantIdleMinutes
    && b.maximumSingleGapMinutes === e.maximumSingleGapMinutes);
const classification = experiment.plan.status !== "COMPLETE" || experiment.plan.evidence.branchesExplored >= 300_000 ? "E"
  : e.totalIdleMinutes < b.totalIdleMinutes && (e.maximumParticipantIdleMinutes > b.maximumParticipantIdleMinutes
    || e.maximumSingleGapMinutes > b.maximumSingleGapMinutes || participantDeltas.some(({ idleDelta }) => idleDelta > 0)) ? "B"
  : e.totalIdleMinutes < b.totalIdleMinutes && e.maximumParticipantIdleMinutes <= b.maximumParticipantIdleMinutes
    && e.maximumSingleGapMinutes <= b.maximumSingleGapMinutes ? "A" : equivalent ? "C" : "D";
const artifact = { baseline, experiment, deterministic: true, orderInvariant: true,
  isolatedCoreFingerprint: constructExactMainAndFeederCore(createProblem()).evidence.coreFingerprint,
  deltas: { totalPresenceDelta: e.totalPresenceSpanMinutes - b.totalPresenceSpanMinutes,
    totalIdleDelta: e.totalIdleMinutes - b.totalIdleMinutes, idleRatioDelta: e.overallIdleRatio - b.overallIdleRatio,
    maximumPresenceDelta: e.maximumParticipantPresenceSpanMinutes - b.maximumParticipantPresenceSpanMinutes,
    maximumIdleDelta: e.maximumParticipantIdleMinutes - b.maximumParticipantIdleMinutes,
    maximumGapDelta: e.maximumSingleGapMinutes - b.maximumSingleGapMinutes,
    totalGapCountDelta: e.totalGapCount - b.totalGapCount, spaceChangeCountDelta: e.totalSpaceChangeCount - b.totalSpaceChangeCount,
    branchesDelta: experiment.plan.evidence.branchesExplored - baseline.plan.evidence.branchesExplored,
    coreBranchesDelta: experiment.plan.evidence.coreBranches - baseline.plan.evidence.coreBranches,
    standaloneBranchesDelta: experiment.plan.evidence.standaloneBranches - baseline.plan.evidence.standaloneBranches },
  participants: { improved: participantDeltas.filter(({ idleDelta }) => idleDelta < 0), worsened: participantDeltas.filter(({ idleDelta }) => idleDelta > 0),
    unchanged: participantDeltas.filter(({ idleDelta }) => idleDelta === 0).map(({ participantId }) => participantId) },
  gaps: { eliminated: [...baselineGaps].filter((key) => !experimentalGaps.has(key)).sort(),
    new: [...experimentalGaps].filter((key) => !baselineGaps.has(key)).sort() },
  moved: { main: movedByKind("main"), feeders: movedByKind("vocal"), standalone: movedStandalone },
  classification, recommendation: classification === "A" ? "Considerar integración posterior tras congelar Evidence y explicabilidad."
    : classification === "B" ? "No activar; analizar equidad y participantes perjudicados."
    : classification === "C" ? "No integrar; estudiar contexto dinámico o comparación futura de hojas completas."
    : classification === "D" ? "Descartar este orden." : "No aumentar presupuesto; analizar por qué se retrasa la primera solución." };
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
assert.equal(classification, "B");
