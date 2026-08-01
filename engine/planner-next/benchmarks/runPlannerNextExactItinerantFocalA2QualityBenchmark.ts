import assert from "node:assert/strict";
import type { PlannerNextProblem, ScheduledTask } from "../contracts";
import { constructExactItinerantPlan } from "../exactItinerantPlan";
import { evaluateParticipantItineraryQuality } from "../participantItineraryQuality";
import { validatePlan } from "../validate";
import { focalA2HumanItinerantReference } from "./focal-a2/focalA2HumanItinerantReference";
import { itinerantOperationProfiles, projectCombinedFocalA2ItinerantProblem } from "./focal-a2/focalA2RealityReference";

const SELECTED_CORE_FINGERPRINT = "0948b758c96f17ec546c331ce6d8b42464dbdbe95970d0640ae5fbea95fdbae9";
const FULL_FINGERPRINT = "825314fa954d2511c5cef2bcd2d6f988efe560131c6039dc99d4ba4c80b662b4";
const BRANCHES_EXPLORED = 85_557;
const searchPolicy = "EXACT_CONSTRUCTIVE" as const;

function createProblem(reversed = false): PlannerNextProblem {
  const problem = projectCombinedFocalA2ItinerantProblem(reversed ? [...itinerantOperationProfiles].reverse() : itinerantOperationProfiles);
  problem.searchPolicy = searchPolicy;
  if (reversed) {
    problem.tasks.reverse(); problem.participants.reverse(); problem.spaces.reverse(); problem.resources.reverse(); problem.coaches.reverse();
    problem.anchoredAccompaniments?.reverse();
    for (const participant of problem.participants) participant.availability.reverse();
  }
  return problem;
}

function operationIntervals(problem: PlannerNextProblem, tasks: ScheduledTask[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const anchoredById = new Map(problem.anchoredAccompaniments?.map((operation) => [operation.id, operation]) ?? []);
  return itinerantOperationProfiles.map((profile) => {
    const members = profile.type === "STANDALONE" ? [byId.get(profile.id)] : (() => {
      const contract = anchoredById.get(profile.id)!;
      return [...contract.beforeTaskIds, contract.anchorTaskId, ...contract.afterTaskIds].map((id) => byId.get(id));
    })();
    assert.ok(members.every((task) => task !== undefined), `complete operation ${profile.id}`);
    const scheduled = members as ScheduledTask[];
    return { operationId: profile.id, start: Math.min(...scheduled.map(({ start }) => start)), end: Math.max(...scheduled.map(({ end }) => end)) };
  }).sort((a, b) => a.operationId.localeCompare(b.operationId));
}

function run(reversed = false) {
  const problem = createProblem(reversed); const before = JSON.stringify(problem);
  const plan = constructExactItinerantPlan(problem);
  const validation = validatePlan(problem, plan.scheduledTasks, [], plan.scheduledSpaceMeals);
  const quality = evaluateParticipantItineraryQuality(problem, plan.scheduledTasks);
  const operations = operationIntervals(problem, plan.scheduledTasks);
  assert.equal(plan.status, "COMPLETE"); assert.equal(plan.scheduledTasks.length, 53); assert.equal(plan.remainingTaskIds.length, 0);
  assert.equal(validation.hardValid, true); assert.equal(operations.length, 12);
  assert.equal(operations.reduce((sum, operation) => sum + operation.end - operation.start, 0), 375);
  assert.equal(plan.evidence.selectedCoreFingerprint, SELECTED_CORE_FINGERPRINT);
  assert.equal(plan.evidence.fullFingerprint, FULL_FINGERPRINT); assert.equal(plan.evidence.branchesExplored, BRANCHES_EXPLORED);
  assert.equal(JSON.stringify(problem), before);
  return { plan, validation, quality, operations, inputUnchanged: JSON.stringify(problem) === before };
}

const first = run(); const second = run(); const reversed = run(true);
assert.deepEqual(second.plan, first.plan); assert.deepEqual(reversed.plan, first.plan);
assert.deepEqual(second.quality, first.quality); assert.deepEqual(reversed.quality, first.quality);
assert.equal(second.quality.summary.qualityFingerprint, first.quality.summary.qualityFingerprint);
assert.equal(reversed.quality.summary.qualityFingerprint, first.quality.summary.qualityFingerprint);

const humanById = new Map(focalA2HumanItinerantReference.map((item) => [item.operationId, item]));
const humanComparison = first.operations.map((generated) => {
  const human = humanById.get(generated.operationId)!; const startDifference = generated.start - human.start; const endDifference = generated.end - human.end;
  return { operationId: generated.operationId, generatedStart: generated.start, generatedEnd: generated.end, humanStart: human.start, humanEnd: human.end,
    startDifference, endDifference, absoluteStartDifference: Math.abs(startDifference), absoluteEndDifference: Math.abs(endDifference) };
});
const topGaps = first.quality.participants.flatMap(({ participantId, gaps }) => gaps.map((gap) => ({ participantId, ...gap })))
  .sort((a, b) => b.duration - a.duration || a.participantId.localeCompare(b.participantId) || a.start - b.start).slice(0, 5);
const evidence = {
  classification: "DB Safe Merge", searchPolicy,
  operational: { status: first.plan.status, taskCount: first.plan.scheduledTasks.length, remainingTaskCount: first.plan.remainingTaskIds.length,
    itinerantOperationCount: first.operations.length, itinerantProductiveMinutes: first.operations.reduce((sum, operation) => sum + operation.end - operation.start, 0),
    selectedCoreFingerprint: first.plan.evidence.selectedCoreFingerprint, fullFingerprint: first.plan.evidence.fullFingerprint,
    branchesExplored: first.plan.evidence.branchesExplored, hardValid: first.validation.hardValid },
  qualitySummary: first.quality.summary, participantMetrics: first.quality.participants,
  topFiveByIdle: first.quality.summary.participantIdsByIdleDescending.slice(0, 5),
  topFiveByPresence: first.quality.summary.participantIdsByPresenceDescending.slice(0, 5), topFiveGaps: topGaps,
  executionChecks: { deterministicPlan: JSON.stringify(first.plan) === JSON.stringify(second.plan), orderInvariantPlan: JSON.stringify(first.plan) === JSON.stringify(reversed.plan),
    deterministicEvidence: JSON.stringify(first.quality) === JSON.stringify(second.quality), orderInvariantEvidence: JSON.stringify(first.quality) === JSON.stringify(reversed.quality),
    inputUnchanged: first.inputUnchanged && second.inputUnchanged && reversed.inputUnchanged,
    qualityFingerprints: [first, second, reversed].map(({ quality }) => quality.summary.qualityFingerprint) },
  informationalHumanComparison: { operations: humanComparison,
    meanAbsoluteStartDifference: humanComparison.reduce((sum, item) => sum + item.absoluteStartDifference, 0) / humanComparison.length,
    maximumAbsoluteStartDifference: Math.max(...humanComparison.map(({ absoluteStartDifference }) => absoluteStartDifference)),
    operationsEarlier: humanComparison.filter(({ startDifference }) => startDifference < 0).length,
    operationsLater: humanComparison.filter(({ startDifference }) => startDifference > 0).length,
    operationsWithSameStart: humanComparison.filter(({ startDifference }) => startDifference === 0).length,
    informationalOnly: true },
};
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
