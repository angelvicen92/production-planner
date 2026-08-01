import assert from "node:assert/strict";
import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask } from "../contracts";
import { compareCompleteParticipantQuality, constructExactItinerantPlan,
  constructFirstHardValidExactItinerantPlan } from "../exactItinerantPlan";
import { evaluateParticipantItineraryQuality } from "../participantItineraryQuality";
import { validatePlan } from "../validate";
import { createAcceptedExactConstructiveFocalA2Problem } from "./focal-a2/focalA2ExactConstructiveConfiguration";
import { focalA2HumanItinerantReference } from "./focal-a2/focalA2HumanItinerantReference";
import { focalA2Participants, focalA2Reference } from "./focal-a2/focalA2Reference";
import { itinerantOperationProfiles } from "./focal-a2/focalA2RealityReference";

const BASELINE_FULL = "fded1fd188ba3daa833f68ce74533e6db43fd6e801d64f7f4cebea42aa5224d6";
const BASELINE_CORE = "0948b758c96f17ec546c331ce6d8b42464dbdbe95970d0640ae5fbea95fdbae9";
const BASELINE_QUALITY = "a64f641fcde8d470808a1b3e2eda986b5a99390600dd5c70ab189d37fc16189f";
const CANDIDATE_FULL = "b5b1fc1fe3b1813e425b26b22cbf7932604718f1b194eb00a8e909f0937f7357";
const CANDIDATE_QUALITY = "256244c1ccad494ca319d921dfcdc8c696b54a4b16506d42567f2e29abb5657b";

const comparison = {
  candidateDominates: "CANDIDATE_DOMINATES_HUMAN_REFERENCE",
  humanDominates: "HUMAN_REFERENCE_DOMINATES_CANDIDATE",
  mixed: "MIXED_CANDIDATE_VS_HUMAN",
  equivalent: "EQUIVALENT_CANDIDATE_AND_HUMAN",
  referenceInvalid: "REFERENCE_INVALID_OR_INCOMPLETE",
  engineRegression: "CANDIDATE_ENGINE_REGRESSION",
} as const;
type ValidHumanComparison = typeof comparison.candidateDominates | typeof comparison.humanDominates |
  typeof comparison.mixed | typeof comparison.equivalent;
type QualityVector = readonly [number, number, number, number, number];

function compareCandidateWithHuman(candidate: QualityVector, human: QualityVector): ValidHumanComparison {
  const improves = candidate.some((value, index) => value < human[index]!);
  const worsens = candidate.some((value, index) => value > human[index]!);
  if (improves && !worsens) return comparison.candidateDominates;
  if (worsens && !improves) return comparison.humanDominates;
  if (improves && worsens) return comparison.mixed;
  return comparison.equivalent;
}
assert.equal(compareCandidateWithHuman([1, 1, 1, 1, 1], [2, 2, 2, 2, 2]), comparison.candidateDominates);
assert.equal(compareCandidateWithHuman([2, 2, 2, 2, 2], [1, 1, 1, 1, 1]), comparison.humanDominates);
assert.equal(compareCandidateWithHuman([1, 2, 1, 1, 1], [2, 1, 1, 1, 1]), comparison.mixed);
assert.equal(compareCandidateWithHuman([1, 1, 1, 1, 1], [1, 1, 1, 1, 1]), comparison.equivalent);

const sorted = <T extends { id: string }>(items: readonly T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
const anchoredSegmentIds = (problem: PlannerNextProblem) => new Set(
  (problem.anchoredAccompaniments ?? []).flatMap(({ beforeTaskIds, afterTaskIds }) => [...beforeTaskIds, ...afterTaskIds]),
);

function createProblem(reversed = false): PlannerNextProblem {
  const problem = createAcceptedExactConstructiveFocalA2Problem(reversed ? [...itinerantOperationProfiles].reverse() : itinerantOperationProfiles);
  if (reversed) {
    problem.tasks.reverse(); problem.participants.reverse(); problem.spaces.reverse(); problem.resources.reverse(); problem.coaches.reverse();
    problem.anchoredAccompaniments?.reverse();
    for (const item of [...problem.tasks, ...problem.participants, ...problem.spaces, ...problem.resources, ...problem.coaches]) item.availability?.reverse();
  }
  return problem;
}

function humanReference(problem: PlannerNextProblem) {
  const errors: string[] = [], source = new Map(problem.tasks.map((task) => [task.id, task]));
  const tasks = focalA2Reference.tasks.map((reference) => {
    const task = source.get(reference.id);
    if (!task) { errors.push(`MISSING_CORE:${reference.id}`); return undefined; }
    return { ...task, start: reference.start, end: reference.end } as ScheduledTask;
  }).filter((task): task is ScheduledTask => task !== undefined);
  const intervals = new Map(focalA2HumanItinerantReference.map((item) => [item.operationId, item]));
  for (const profile of itinerantOperationProfiles.filter((item) => item.type === "STANDALONE")) {
    const task = source.get(profile.id), interval = intervals.get(profile.id);
    if (!task || !interval) { errors.push(`INCOMPLETE_STANDALONE:${profile.id}`); continue; }
    if (interval.end - interval.start !== task.duration) errors.push(`DURATION:${profile.id}`);
    tasks.push({ ...task, start: interval.start, end: interval.end });
  }
  for (const profile of itinerantOperationProfiles.filter((item) => item.type === "ANCHORED_ACCOMPANIMENT")) {
    const contract = problem.anchoredAccompaniments?.find(({ id }) => id === profile.id), interval = intervals.get(profile.id);
    const anchor = tasks.find(({ id }) => id === contract?.anchorTaskId);
    if (!contract || !interval || !anchor) { errors.push(`INCOMPLETE_ANCHORED:${profile.id}`); continue; }
    let cursor = interval.start;
    for (const id of contract.beforeTaskIds) {
      const task = source.get(id); if (!task) { errors.push(`MISSING_SEGMENT:${id}`); continue; }
      tasks.push({ ...task, start: cursor, end: cursor + task.duration }); cursor += task.duration;
    }
    if (cursor !== anchor.start) errors.push(`BEFORE_NOT_ADJACENT:${profile.id}:${cursor}:${anchor.start}`);
    cursor = anchor.end;
    for (const id of contract.afterTaskIds) {
      const task = source.get(id); if (!task) { errors.push(`MISSING_SEGMENT:${id}`); continue; }
      tasks.push({ ...task, start: cursor, end: cursor + task.duration }); cursor += task.duration;
    }
    if (cursor !== interval.end) errors.push(`AFTER_NOT_ADJACENT:${profile.id}:${cursor}:${interval.end}`);
  }
  const humanTasks = sorted(tasks), ids = humanTasks.map(({ id }) => id), unique = new Set(ids);
  const problemIds = new Set(problem.tasks.map(({ id }) => id));
  const missingIds = [...problemIds].filter((id) => !unique.has(id)).sort();
  const additionalIds = [...unique].filter((id) => !problemIds.has(id)).sort();
  const duplicateIds = [...unique].filter((id) => ids.filter((candidate) => candidate === id).length > 1).sort();
  const durationMismatchIds = humanTasks.filter((task) => task.end - task.start !== source.get(task.id)?.duration).map(({ id }) => id);
  const standaloneIds = new Set(itinerantOperationProfiles.filter(({ type }) => type === "STANDALONE").map(({ id }) => id));
  const segmentIds = anchoredSegmentIds(problem);
  const meals: ScheduledSpaceMeal[] = [{ id: `space-meal:${focalA2Reference.meal.spaceId}:1`, kind: "space-meal", entryIndex: 1, ...focalA2Reference.meal }];
  const validation = validatePlan(problem, humanTasks, [], meals);
  const integrity = {
    taskCount: humanTasks.length, uniqueTaskCount: unique.size,
    sameProblemIds: missingIds.length === 0 && additionalIds.length === 0,
    missingIds, additionalIds, duplicateIds, durationMismatchIds,
    mainCount: humanTasks.filter(({ kind }) => kind === "main").length,
    vocalCount: humanTasks.filter(({ kind }) => kind === "vocal").length,
    standaloneCount: humanTasks.filter(({ id }) => standaloneIds.has(id)).length,
    anchoredSegmentCount: humanTasks.filter(({ id }) => segmentIds.has(id)).length,
    completeAnchoredContractCount: (problem.anchoredAccompaniments ?? []).filter((contract) =>
      [contract.anchorTaskId, ...contract.beforeTaskIds, ...contract.afterTaskIds].every((id) => ids.filter((item) => item === id).length === 1)).length,
    itinerantOperationCount: itinerantOperationProfiles.length,
    itinerantMinutes: focalA2HumanItinerantReference.reduce((sum, item) => sum + item.end - item.start, 0),
    anchorsExactlyOnce: (problem.anchoredAccompaniments ?? []).every(({ anchorTaskId }) => ids.filter((id) => id === anchorTaskId).length === 1),
    segmentsExactlyOnce: [...segmentIds].every((id) => ids.filter((item) => item === id).length === 1),
    reconstructionErrors: errors, hardValid: validation.hardValid, validationReasonCodes: validation.reasonCodes,
  };
  const valid = errors.length === 0 && humanTasks.length === 53 && unique.size === 53 && missingIds.length === 0 && additionalIds.length === 0 &&
    duplicateIds.length === 0 && durationMismatchIds.length === 0 && integrity.mainCount === 19 && integrity.vocalCount === 19 &&
    integrity.standaloneCount === 9 && integrity.anchoredSegmentCount === 6 && integrity.completeAnchoredContractCount === 3 &&
    integrity.itinerantOperationCount === 12 && integrity.itinerantMinutes === 375 && integrity.anchorsExactlyOnce && integrity.segmentsExactlyOnce && validation.hardValid;
  return { tasks: humanTasks, meals, validation, integrity: { ...integrity, valid } };
}

function execute(reversed = false) {
  const problem = createProblem(reversed), before = JSON.stringify(problem);
  const baseline = constructFirstHardValidExactItinerantPlan(problem);
  const candidate = constructExactItinerantPlan(problem);
  return { problem, baseline, candidate, human: humanReference(problem),
    baselineValidation: validatePlan(problem, baseline.scheduledTasks, [], baseline.scheduledSpaceMeals),
    candidateValidation: validatePlan(problem, candidate.scheduledTasks, [], candidate.scheduledSpaceMeals),
    inputUnchanged: JSON.stringify(problem) === before };
}
type Execution = ReturnType<typeof execute>;

const qualityTable = (quality: ReturnType<typeof evaluateParticipantItineraryQuality>) => ({
  totalPresence: quality.summary.totalPresenceSpanMinutes, productive: quality.summary.totalProductiveMinutes,
  idle: quality.summary.totalIdleMinutes, idleRatio: quality.summary.overallIdleRatio,
  maximumPresence: quality.summary.maximumParticipantPresenceSpanMinutes, maximumIdle: quality.summary.maximumParticipantIdleMinutes,
  maximumGap: quality.summary.maximumSingleGapMinutes, participantsWithInternalGaps: quality.summary.participantsWithInternalGaps,
  gaps: quality.summary.totalGapCount, spaceChanges: quality.summary.totalSpaceChangeCount,
});
const qualityVector = (quality: ReturnType<typeof evaluateParticipantItineraryQuality>): QualityVector => [
  quality.summary.maximumParticipantIdleMinutes, quality.summary.maximumSingleGapMinutes, quality.summary.totalIdleMinutes,
  quality.summary.totalGapCount, quality.summary.totalSpaceChangeCount,
];

function participantComparison(execution: Execution, baselineQuality: ReturnType<typeof evaluateParticipantItineraryQuality>, candidateQuality: ReturnType<typeof evaluateParticipantItineraryQuality>) {
  const baselineById = new Map(baselineQuality.participants.map((item) => [item.participantId, item]));
  const participants = candidateQuality.participants.map((candidate) => {
    const baseline = baselineById.get(candidate.participantId)!;
    const deltas = { presence: candidate.presenceSpanMinutes - baseline.presenceSpanMinutes, productive: candidate.productiveMinutes - baseline.productiveMinutes,
      idle: candidate.idleMinutes - baseline.idleMinutes, maximumGap: candidate.maximumGapMinutes - baseline.maximumGapMinutes,
      gaps: candidate.gapCount - baseline.gapCount, spaceChanges: candidate.spaceChangeCount - baseline.spaceChangeCount };
    const compared = [deltas.presence, deltas.idle, deltas.maximumGap], improves = compared.some((value) => value < 0), worsens = compared.some((value) => value > 0);
    const classification = improves && worsens ? "MIXED" : improves ? "IMPROVED" : worsens ? "WORSENED" : "UNCHANGED";
    return { participantId: candidate.participantId, baselineFirstTask: { id: baseline.firstTaskId, start: baseline.firstTaskStart },
      candidateFirstTask: { id: candidate.firstTaskId, start: candidate.firstTaskStart }, baselineLastTask: { id: baseline.lastTaskId, end: baseline.lastTaskEnd },
      candidateLastTask: { id: candidate.lastTaskId, end: candidate.lastTaskEnd }, startDelta: candidate.firstTaskStart! - baseline.firstTaskStart!,
      endDelta: candidate.lastTaskEnd! - baseline.lastTaskEnd!, ...deltas, classification };
  });
  const rank = (items: typeof participants, direction: 1 | -1) => [...items].sort((a, b) =>
    direction * (b.presence - a.presence) || direction * (b.idle - a.idle) || a.participantId.localeCompare(b.participantId)).slice(0, 5);
  return { participants, summary: {
    improved: participants.filter(({ classification }) => classification === "IMPROVED").length,
    worsened: participants.filter(({ classification }) => classification === "WORSENED").length,
    mixed: participants.filter(({ classification }) => classification === "MIXED").length,
    unchanged: participants.filter(({ classification }) => classification === "UNCHANGED").length,
    grossPresenceReduction: participants.reduce((sum, item) => sum + Math.max(0, -item.presence), 0),
    grossPresenceIncrease: participants.reduce((sum, item) => sum + Math.max(0, item.presence), 0),
    grossIdleReduction: participants.reduce((sum, item) => sum + Math.max(0, -item.idle), 0),
    grossIdleIncrease: participants.reduce((sum, item) => sum + Math.max(0, item.idle), 0),
    fiveLargestImprovements: rank(participants.filter((item) => item.presence < 0 || item.idle < 0 || item.maximumGap < 0), -1),
    fiveLargestHarms: rank(participants.filter((item) => item.presence > 0 || item.idle > 0 || item.maximumGap > 0), 1),
  } };
}

function mainFlow(problem: PlannerNextProblem, tasks: ScheduledTask[], meals: ScheduledSpaceMeal[]) {
  const main = tasks.filter(({ kind }) => kind === "main").sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const meal = meals.find(({ spaceId }) => spaceId === problem.mainFlow.spaceId);
  const gaps = main.slice(1).map((task, index) => ({ start: main[index]!.end, end: task.start }))
    .filter((gap) => gap.end > gap.start && !(meal && gap.start === meal.start && gap.end === meal.end));
  const morning = main.filter((task) => !meal || task.end <= meal.start), afternoon = main.filter((task) => meal && task.start >= meal.end);
  const blocks = main.map((task) => task.blockKey ?? null);
  return { mainTaskCount: main.length, uniqueMainParticipantCount: new Set(main.map(({ participantId }) => participantId)).size,
    firstMain: main[0] && { id: main[0].id, start: main[0].start }, lastMain: main.at(-1) && { id: main.at(-1)!.id, end: main.at(-1)!.end },
    morningDuration: morning.length ? morning.at(-1)!.end - morning[0]!.start : 0, meal: meal ?? null,
    firstAfternoon: afternoon[0] && { id: afternoon[0].id, start: afternoon[0].start }, lastAfternoon: afternoon.at(-1) && { id: afternoon.at(-1)!.id, end: afternoon.at(-1)!.end },
    unauthorizedGapCount: gaps.length, unauthorizedGapMinutes: gaps.reduce((sum, gap) => sum + gap.end - gap.start, 0),
    participantOrder: main.map((task) => task.participantId), coachBlocks: blocks,
    blockChanges: blocks.slice(1).filter((block, index) => block !== blocks[index]).length, requiredContinuityPreserved: gaps.length === 0 };
}

function operations(problem: PlannerNextProblem, tasks: ScheduledTask[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return itinerantOperationProfiles.map((profile) => {
    const contract = problem.anchoredAccompaniments?.find(({ id }) => id === profile.id);
    const members = profile.type === "STANDALONE" ? [byId.get(profile.id)!] :
      [...contract!.beforeTaskIds, contract!.anchorTaskId, ...contract!.afterTaskIds].map((id) => byId.get(id)!);
    return { operationId: profile.id, participantId: profile.participantId, type: profile.type,
      start: Math.min(...members.map((task) => task.start)), end: Math.max(...members.map((task) => task.end)), unitId: profile.unitId,
      duration: members.reduce((sum, task) => sum + task.duration, 0), anchorTaskId: profile.type === "ANCHORED_ACCOMPANIMENT" ? profile.anchorTaskId : null };
  }).sort((a, b) => a.operationId.localeCompare(b.operationId));
}

function buildEvidence(execution: Execution) {
  const { problem, baseline, candidate, human } = execution;
  const baselineQuality = evaluateParticipantItineraryQuality(problem, baseline.scheduledTasks);
  const candidateQuality = evaluateParticipantItineraryQuality(problem, candidate.scheduledTasks);
  const participants = participantComparison(execution, baselineQuality, candidateQuality);
  const candidateDominatesBaseline = compareCompleteParticipantQuality(candidateQuality.summary, baselineQuality.summary) === 1;
  const baselineEvidence = { status: baseline.status, taskCount: baseline.scheduledTasks.length, remainingTaskCount: baseline.remainingTaskIds.length,
    hardValid: execution.baselineValidation.hardValid, metrics: qualityTable(baselineQuality), fingerprint: baseline.evidence.fullFingerprint,
    qualityFingerprint: baselineQuality.summary.qualityFingerprint, branches: baseline.evidence.branchesExplored };
  const candidateEvidence = { status: candidate.status, taskCount: candidate.scheduledTasks.length, remainingTaskCount: candidate.remainingTaskIds.length,
    hardValid: execution.candidateValidation.hardValid, metrics: qualityTable(candidateQuality), fingerprint: candidate.evidence.fullFingerprint,
    qualityFingerprint: candidateQuality.summary.qualityFingerprint, branches: candidate.evidence.branchesExplored, coreBranches: candidate.evidence.coreBranches,
    standaloneBranches: candidate.evidence.standaloneBranches, completePlansObserved: candidate.evidence.completePlansObserved,
    replacements: candidate.evidence.completeIncumbentReplacements, exhaustedWithCompleteIncumbent: candidate.evidence.completeSelectionStoppedByBudget };
  const candidateVsBaseline = { classification: candidateDominatesBaseline ? "CANDIDATE_DOMINATES_BASELINE" : comparison.engineRegression,
    metrics: { baseline: qualityVector(baselineQuality), candidate: qualityVector(candidateQuality) } };
  if (!human.integrity.valid) return { referenceIntegrity: human.integrity, baseline: baselineEvidence, candidate: candidateEvidence,
    human: { hardValid: human.validation.hardValid, metrics: null }, candidateVsBaseline,
    candidateVsHuman: { classification: comparison.referenceInvalid, metrics: null }, participantComparison: participants,
    taskTimingComparison: null, presenceEnvelopeComparison: null, mainFlowComparison: null, itinerantComparison: null,
    acceptance: { decision: "NOT_READY_FOR_HUMAN_REVIEW", operationalWarnings: participants.participants.some(({ classification }) => classification === "WORSENED"),
      acceptedExactRouteActive: true, finalDecisionOwner: "HUMAN" }, inputUnchanged: execution.inputUnchanged };

  const humanQuality = evaluateParticipantItineraryQuality(problem, human.tasks);
  const candidateVsHumanClassification = compareCandidateWithHuman(qualityVector(candidateQuality), qualityVector(humanQuality));
  const humanByTask = new Map(human.tasks.map((task) => [task.id, task])), candidateByTask = new Map(candidate.scheduledTasks.map((task) => [task.id, task]));
  const standaloneIds = new Set(itinerantOperationProfiles.filter(({ type }) => type === "STANDALONE").map(({ id }) => id));
  const segmentIds = anchoredSegmentIds(problem);
  const taskRows = sorted(problem.tasks).map((source) => {
    const humanTask = humanByTask.get(source.id), candidateTask = candidateByTask.get(source.id);
    assert.ok(humanTask && candidateTask);
    const category = source.kind === "main" ? "MAIN" : source.kind === "vocal" ? "VOCAL" : standaloneIds.has(source.id) ? "STANDALONE" : segmentIds.has(source.id) ? "ANCHORED_SEGMENT" : "UNKNOWN";
    return { taskId: source.id, participantId: source.participantId, category, humanStart: humanTask.start, candidateStart: candidateTask.start,
      startDelta: candidateTask.start - humanTask.start, humanEnd: humanTask.end, candidateEnd: candidateTask.end, endDelta: candidateTask.end - humanTask.end,
      absoluteStartDifference: Math.abs(candidateTask.start - humanTask.start), absoluteEndDifference: Math.abs(candidateTask.end - humanTask.end) };
  });
  const taskCategories = ["MAIN", "VOCAL", "STANDALONE", "ANCHORED_SEGMENT"].map((category) => {
    const rows = taskRows.filter((row) => row.category === category);
    return { category, taskCount: rows.length, sameStart: rows.filter(({ startDelta }) => startDelta === 0).length,
      earlier: rows.filter(({ startDelta }) => startDelta < 0).length, later: rows.filter(({ startDelta }) => startDelta > 0).length,
      meanAbsoluteStartDifference: rows.reduce((sum, row) => sum + row.absoluteStartDifference, 0) / rows.length,
      maximumAbsoluteStartDifference: Math.max(...rows.map(({ absoluteStartDifference }) => absoluteStartDifference)),
      meanAbsoluteEndDifference: rows.reduce((sum, row) => sum + row.absoluteEndDifference, 0) / rows.length,
      maximumAbsoluteEndDifference: Math.max(...rows.map(({ absoluteEndDifference }) => absoluteEndDifference)) };
  });
  const candidateParticipants = new Map(candidateQuality.participants.map((item) => [item.participantId, item]));
  const envelopeRows = focalA2Participants.map((reference) => {
    const item = candidateParticipants.get(reference.participantId)!;
    return { participantId: reference.participantId, humanPresenceStart: reference.presenceStart, candidateFirstObligation: item.firstTaskStart!,
      startDifference: item.firstTaskStart! - reference.presenceStart, humanPresenceEnd: reference.presenceEnd, candidateLastObligation: item.lastTaskEnd!,
      endDifference: item.lastTaskEnd! - reference.presenceEnd, humanSpan: reference.presenceEnd - reference.presenceStart,
      candidateSpan: item.presenceSpanMinutes, spanDelta: item.presenceSpanMinutes - (reference.presenceEnd - reference.presenceStart) };
  });
  const presenceEnvelopeComparison = { participants: envelopeRows, summary: {
    beforeHumanStart: envelopeRows.filter(({ startDifference }) => startDifference < 0).length,
    afterHumanEnd: envelopeRows.filter(({ endDifference }) => endDifference > 0).length,
    fullyInside: envelopeRows.filter(({ startDifference, endDifference }) => startDifference >= 0 && endDifference <= 0).length,
    largerSpan: envelopeRows.filter(({ spanDelta }) => spanDelta > 0).length, equalSpan: envelopeRows.filter(({ spanDelta }) => spanDelta === 0).length,
    smallerSpan: envelopeRows.filter(({ spanDelta }) => spanDelta < 0).length } };
  const baselineOperations = operations(problem, baseline.scheduledTasks), candidateOperations = operations(problem, candidate.scheduledTasks), humanOperations = operations(problem, human.tasks);
  const itinerantRows = humanOperations.map((humanOperation, index) => {
    const baselineOperation = baselineOperations[index]!, candidateOperation = candidateOperations[index]!;
    return { ...humanOperation, humanStart: humanOperation.start, humanEnd: humanOperation.end, baselineStart: baselineOperation.start,
      baselineEnd: baselineOperation.end, candidateStart: candidateOperation.start, candidateEnd: candidateOperation.end,
      baselineStartDifference: baselineOperation.start - humanOperation.start, baselineEndDifference: baselineOperation.end - humanOperation.end,
      candidateStartDifference: candidateOperation.start - humanOperation.start, candidateEndDifference: candidateOperation.end - humanOperation.end };
  });
  const operationAggregate = (key: "baselineStartDifference" | "candidateStartDifference") => ({
    sameStart: itinerantRows.filter((row) => row[key] === 0).length, earlier: itinerantRows.filter((row) => row[key] < 0).length,
    later: itinerantRows.filter((row) => row[key] > 0).length,
    meanAbsoluteStartDifference: itinerantRows.reduce((sum, row) => sum + Math.abs(row[key]), 0) / itinerantRows.length,
    maximumAbsoluteStartDifference: Math.max(...itinerantRows.map((row) => Math.abs(row[key]))),
  });
  const outsideEnvelope = envelopeRows.some(({ startDifference, endDifference }) => startDifference < 0 || endDifference > 0);
  const operationalWarnings = participants.participants.some(({ classification }) => classification === "WORSENED") || outsideEnvelope ||
    candidateVsHumanClassification === comparison.mixed || candidateVsHumanClassification === comparison.humanDominates;
  const ready = candidate.status === "COMPLETE" && execution.candidateValidation.hardValid && execution.inputUnchanged && candidateDominatesBaseline;
  return { referenceIntegrity: human.integrity, baseline: baselineEvidence, candidate: candidateEvidence,
    human: { hardValid: human.validation.hardValid, metrics: qualityTable(humanQuality) }, candidateVsBaseline,
    candidateVsHuman: { classification: candidateVsHumanClassification, metrics: { human: qualityVector(humanQuality), candidate: qualityVector(candidateQuality) } },
    participantComparison: participants, taskTimingComparison: { tasks: taskRows, categories: taskCategories }, presenceEnvelopeComparison,
    mainFlowComparison: { human: mainFlow(problem, human.tasks, human.meals), baseline: mainFlow(problem, baseline.scheduledTasks, baseline.scheduledSpaceMeals),
      candidate: mainFlow(problem, candidate.scheduledTasks, candidate.scheduledSpaceMeals) },
    itinerantComparison: { operations: itinerantRows, baseline: operationAggregate("baselineStartDifference"), candidate: operationAggregate("candidateStartDifference") },
    acceptance: { decision: ready ? "READY_FOR_HUMAN_REVIEW" : "NOT_READY_FOR_HUMAN_REVIEW", operationalWarnings,
      acceptedExactRouteActive: true, finalDecisionOwner: "HUMAN" }, inputUnchanged: execution.inputUnchanged };
}

const first = execute(), repeated = execute(), reversed = execute(true);
const firstEvidence = buildEvidence(first), repeatedEvidence = buildEvidence(repeated), reversedEvidence = buildEvidence(reversed);
const invalidReferenceEvidence = buildEvidence({ ...first, human: { ...first.human, tasks: [], integrity: { ...first.human.integrity, valid: false } } });
assert.equal(invalidReferenceEvidence.candidateVsHuman.classification, comparison.referenceInvalid);
assert.equal(invalidReferenceEvidence.human.metrics, null);
assert.equal(invalidReferenceEvidence.taskTimingComparison, null);
assert.equal(invalidReferenceEvidence.presenceEnvelopeComparison, null);
assert.equal(invalidReferenceEvidence.mainFlowComparison, null);
assert.equal(invalidReferenceEvidence.itinerantComparison, null);
assert.equal(invalidReferenceEvidence.acceptance.decision, "NOT_READY_FOR_HUMAN_REVIEW");
assert.equal(invalidReferenceEvidence.acceptance.acceptedExactRouteActive, true);
assert.deepEqual(repeated.baseline, first.baseline); assert.deepEqual(repeated.candidate, first.candidate);
assert.deepEqual(reversed.baseline, first.baseline); assert.deepEqual(reversed.candidate, first.candidate);
assert.deepEqual(repeatedEvidence, firstEvidence); assert.deepEqual(reversedEvidence, firstEvidence);
const executionChecks = { deterministicPlan: true, orderInvariantPlan: true, deterministicEvidence: true, orderInvariantEvidence: true,
  inputUnchanged: first.inputUnchanged && repeated.inputUnchanged && reversed.inputUnchanged };

assert.equal(first.baseline.status, "COMPLETE"); assert.equal(first.baseline.scheduledTasks.length, 53); assert.equal(first.baseline.remainingTaskIds.length, 0); assert.equal(first.baselineValidation.hardValid, true);
assert.equal(first.baseline.evidence.branchesExplored, 85_557); assert.equal(first.baseline.evidence.fullFingerprint, BASELINE_FULL);
assert.equal(first.baseline.evidence.selectedCoreFingerprint, BASELINE_CORE);
assert.equal(first.baseline.evidence.completeSelectionMode, "FIRST_HARD_VALID");
assert.equal(first.candidate.status, "COMPLETE"); assert.equal(first.candidate.scheduledTasks.length, 53); assert.equal(first.candidate.remainingTaskIds.length, 0); assert.equal(first.candidateValidation.hardValid, true);
assert.equal(first.candidate.evidence.branchesExplored, 300_000); assert.equal(first.candidate.evidence.coreBranches, 48_224); assert.equal(first.candidate.evidence.standaloneBranches, 251_776);
assert.equal(first.candidate.evidence.completePlansObserved, 78); assert.equal(first.candidate.evidence.completeIncumbentReplacements, 2); assert.equal(first.candidate.evidence.completeSelectionStoppedByBudget, true);
assert.equal(first.candidate.evidence.completeSelectionMode, "BEST_DOMINATING_WITHIN_BUDGET");
assert.equal(first.candidate.evidence.firstCompleteFingerprint, "38309867fb51dcb14515d152035b7076a4738cac04d3d8cea721ec7be0749fa8");
assert.equal(first.candidate.evidence.fullFingerprint, CANDIDATE_FULL); assert.equal(first.candidate.evidence.selectedCompleteFingerprint, CANDIDATE_FULL);
assert.equal(firstEvidence.baseline.qualityFingerprint, BASELINE_QUALITY); assert.equal(firstEvidence.candidate.qualityFingerprint, CANDIDATE_QUALITY);
assert.equal(compareCompleteParticipantQuality(
  evaluateParticipantItineraryQuality(first.problem, first.candidate.scheduledTasks).summary,
  evaluateParticipantItineraryQuality(first.problem, first.baseline.scheduledTasks).summary,
), 1);
assert.deepEqual(first.human.integrity, { taskCount: 53, uniqueTaskCount: 53, sameProblemIds: true, missingIds: [], additionalIds: [], duplicateIds: [], durationMismatchIds: [],
  mainCount: 19, vocalCount: 19, standaloneCount: 9, anchoredSegmentCount: 6, completeAnchoredContractCount: 3, itinerantOperationCount: 12,
  itinerantMinutes: 375, anchorsExactlyOnce: true, segmentsExactlyOnce: true, reconstructionErrors: [], hardValid: true, validationReasonCodes: [], valid: true });
assert.equal(first.human.integrity.valid, true);
assert.deepEqual(firstEvidence.baseline.metrics, { totalPresence:3515, productive:900, idle:2615, idleRatio:0.7439544807965861, maximumPresence:440, maximumIdle:380, maximumGap:225, participantsWithInternalGaps:19, gaps:28, spaceChanges:34 });
assert.deepEqual(firstEvidence.candidate.metrics, { totalPresence:3290, productive:900, idle:2390, idleRatio:0.7264437689969605, maximumPresence:425, maximumIdle:365, maximumGap:225, participantsWithInternalGaps:19, gaps:28, spaceChanges:34 });
assert.deepEqual(firstEvidence.human.metrics, { totalPresence:3590, productive:900, idle:2690, idleRatio:0.7493036211699164, maximumPresence:480, maximumIdle:435, maximumGap:315, participantsWithInternalGaps:19, gaps:28, spaceChanges:34 });
assert.equal(firstEvidence.candidateVsBaseline.classification, "CANDIDATE_DOMINATES_BASELINE"); assert.equal(firstEvidence.candidateVsHuman.classification, comparison.candidateDominates);
assert.deepEqual(firstEvidence.participantComparison.summary, { improved:8, worsened:4, mixed:1, unchanged:6, grossPresenceReduction:570, grossPresenceIncrease:345, grossIdleReduction:570, grossIdleIncrease:345,
  fiveLargestImprovements:firstEvidence.participantComparison.summary.fiveLargestImprovements, fiveLargestHarms:firstEvidence.participantComparison.summary.fiveLargestHarms });
for (const [id, expected] of Object.entries({ "jose-javier-cuenca":{presence:120,idle:120,maximumGap:120,classification:"WORSENED"}, "marta-fonrali":{presence:90,idle:90,maximumGap:30,classification:"WORSENED"},
  "pere-portero":{presence:90,idle:90,maximumGap:30,classification:"WORSENED"}, "cristina-zuloaga":{presence:30,idle:30,maximumGap:30,classification:"WORSENED"}, "nela-garcia":{presence:15,idle:15,maximumGap:-15,classification:"MIXED"} })) {
  const item = firstEvidence.participantComparison.participants.find(({ participantId }) => participantId === id)!;
  assert.deepEqual({ presence:item.presence, idle:item.idle, maximumGap:item.maximumGap, classification:item.classification }, expected);
}
assert.deepEqual(firstEvidence.presenceEnvelopeComparison.summary, { beforeHumanStart:0, afterHumanEnd:2, fullyInside:17, largerSpan:0, equalSpan:0, smallerSpan:19 });
assert.equal(firstEvidence.presenceEnvelopeComparison.participants.find(({participantId})=>participantId==="linet-varela")?.endDifference,15);
assert.equal(firstEvidence.presenceEnvelopeComparison.participants.find(({participantId})=>participantId==="marta-fonrali")?.endDifference,45);
assert.equal(firstEvidence.taskTimingComparison.tasks.length,53); assert.equal(firstEvidence.taskTimingComparison.tasks.filter(({category})=>category==="UNKNOWN").length,0);
assert.deepEqual(firstEvidence.taskTimingComparison.categories, [
  {category:"MAIN",taskCount:19,sameStart:2,earlier:8,later:9,meanAbsoluteStartDifference:45.78947368421053,maximumAbsoluteStartDifference:225,meanAbsoluteEndDifference:45.78947368421053,maximumAbsoluteEndDifference:225},
  {category:"VOCAL",taskCount:19,sameStart:6,earlier:6,later:7,meanAbsoluteStartDifference:49.473684210526315,maximumAbsoluteStartDifference:305,meanAbsoluteEndDifference:49.473684210526315,maximumAbsoluteEndDifference:305},
  {category:"STANDALONE",taskCount:9,sameStart:2,earlier:5,later:2,meanAbsoluteStartDifference:48.333333333333336,maximumAbsoluteStartDifference:90,meanAbsoluteEndDifference:48.333333333333336,maximumAbsoluteEndDifference:90},
  {category:"ANCHORED_SEGMENT",taskCount:6,sameStart:0,earlier:0,later:6,meanAbsoluteStartDifference:30,maximumAbsoluteStartDifference:45,meanAbsoluteEndDifference:30,maximumAbsoluteEndDifference:45},
]);
for (const flow of Object.values(firstEvidence.mainFlowComparison)) assert.deepEqual({mainTaskCount:flow.mainTaskCount,uniqueMainParticipantCount:flow.uniqueMainParticipantCount,morningDuration:flow.morningDuration,meal:[flow.meal?.start,flow.meal?.end],
  unauthorizedGapCount:flow.unauthorizedGapCount,unauthorizedGapMinutes:flow.unauthorizedGapMinutes,blockChanges:flow.blockChanges,requiredContinuityPreserved:flow.requiredContinuityPreserved},
  {mainTaskCount:19,uniqueMainParticipantCount:19,morningDuration:165,meal:[840,915],unauthorizedGapCount:0,unauthorizedGapMinutes:0,blockChanges:3,requiredContinuityPreserved:true});
assert.equal(firstEvidence.itinerantComparison.operations.length,12); assert.deepEqual(firstEvidence.itinerantComparison.baseline,{sameStart:3,earlier:4,later:5,meanAbsoluteStartDifference:30,maximumAbsoluteStartDifference:90});
assert.deepEqual(firstEvidence.itinerantComparison.candidate,{sameStart:2,earlier:5,later:5,meanAbsoluteStartDifference:43.75,maximumAbsoluteStartDifference:90});
for (const planOperations of [operations(first.problem,first.human.tasks),operations(first.problem,first.baseline.scheduledTasks),operations(first.problem,first.candidate.scheduledTasks)]) {
  assert.equal(planOperations.length,12); assert.equal(planOperations.reduce((sum,item)=>sum+item.duration,0),375);
  assert.deepEqual(planOperations.map(({operationId})=>operationId),focalA2HumanItinerantReference.map(({operationId})=>operationId).sort());
  for (const item of planOperations) assert.equal(item.duration,focalA2HumanItinerantReference.find(({operationId})=>operationId===item.operationId)!.end-focalA2HumanItinerantReference.find(({operationId})=>operationId===item.operationId)!.start);
}
assert.deepEqual(firstEvidence.acceptance,{decision:"READY_FOR_HUMAN_REVIEW",operationalWarnings:true,acceptedExactRouteActive:true,finalDecisionOwner:"HUMAN"});
assert.deepEqual(executionChecks,{deterministicPlan:true,orderInvariantPlan:true,deterministicEvidence:true,orderInvariantEvidence:true,inputUnchanged:true});
process.stdout.write(`${JSON.stringify({ ...firstEvidence, executionChecks }, null, 2)}\n`);
