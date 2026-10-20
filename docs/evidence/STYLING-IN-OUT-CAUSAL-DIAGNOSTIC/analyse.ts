import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCanonicalA2AssistedStage1Fixture } from "../../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";
import type { FutureJointCompletionWitnessV1 } from "../../../engine/planner-next/anonymousPipelineWitness";
import { fingerprintJointCompletionWitness, revalidateJointCompletionWitness } from "../../../engine/planner-next/jointCompletionWitness";
import { validatePlan } from "../../../engine/planner-next/validate";
import { diagnoseTaskPlacement } from "../../../engine/planner-next/placement";
import { materializeScheduledItinerantUnitMeals } from "../../../engine/planner-next/itinerantUnitMeals";
import { PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES as grid } from "../../../engine/planner-next/integration/plannerNextCapabilities";
import { materializeAssistedSnapshotOccupations, validateManualAssistedDelta } from "../../../server/assistedProposalService";
import type { AssistedPlanningSnapshotV1 } from "../../../server/assistedPlanningSnapshot";
import { PreparedFutureCollectiveParticipantClosure } from "../../../engine/planner-next/futureCollectiveParticipantClosure";
import { participantGapMinutes } from "../../../engine/planner-next/participantTransition";
import { collectA2TopologyMetrics } from "../../../script/demo/a2TopologyMetrics";
import { evaluatePlanningQuality } from "../../../engine/planner-next/benchmarks/focal-a2/full-day/planningQuality";

// An exhaustive, offline audit of single-task earlier starts and one closure
// pair. This is not a scheduler, a product candidate producer or a search hook.
// Every certified alternative retains a full, independently validated witness.
const directory = resolve(process.argv[2] ?? "/tmp/styling-causal-baseline");
const output = resolve(process.argv[3] ?? directory);
const run = JSON.parse(readFileSync(resolve(directory, "run.json"), "utf8"));
const snapshots: AssistedPlanningSnapshotV1[] = JSON.parse(readFileSync(resolve(directory, "snapshots.json"), "utf8"));
const { input, adapter, canonical } = buildCanonicalA2AssistedStage1Fixture();
const problem = adapter.problem;
const witness: FutureJointCompletionWitnessV1 = run.iterations.at(-1).futureStructuralWitnesses.find((w: any) => w.kind === "JOINT_COMPLETION");
const resourceMeals = (problem.resourceMeals ?? []).map(meal => ({ id: meal.id, sourceTaskId: meal.sourceTaskId,
  resourceIds: [...meal.resourceIds], start: meal.interval.start, end: meal.interval.end, duration: meal.interval.end - meal.interval.start }));
const validate = (w: FutureJointCompletionWitnessV1) => validatePlan(problem, [...w.tasks], [...w.preparations], [...w.spaceMeals],
  [...w.participantMeals], resourceMeals, materializeScheduledItinerantUnitMeals(problem), [...w.roundPreparations], [...w.operationalMeals]);
const baselineValidation = validate(witness);
assert.equal(baselineValidation.hardValid, true);
assert.deepEqual(baselineValidation.violations, []);
const context = materializeAssistedSnapshotOccupations(problem, adapter.identityMap, snapshots.at(-1)!);
assert.deepEqual([...context.protectedPlacements].sort((a, b) => a.id.localeCompare(b.id)), [...witness.tasks].sort((a, b) => a.id.localeCompare(b.id)));
assert.deepEqual([...context.protectedParticipantMeals].sort((a, b) => a.id.localeCompare(b.id)), [...witness.participantMeals].sort((a, b) => a.id.localeCompare(b.id)));
const metadata = new Map(input.tasks.map(task => [`task:${task.id}`, task]));
const canonicalToProduct = new Map(adapter.identityMap.filter(row => row.namespace === "task").map(row => [row.canonicalId, Number(row.sourceId)]));
const participants = problem.participants.map(person => person.id).sort();
const ordinal = (id: string) => `C${String(participants.indexOf(id) + 1).padStart(2, "0")}`;
const taskType = (id: string) => metadata.get(id)?.templateName ?? "UNKNOWN";
const stageOf = (id: string) => run.iterations.find((stage: any) => stage.resolvedTaskIds.includes(canonicalToProduct.get(id)))?.ordinal;
const hhmm = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const expansionIdBySource = new Map([...canonical.taskId].map(([id, source]) => [`task:${source}`, id]));
const expansionSpaceBySource = new Map([...canonical.spaceId].map(([id, source]) => [`space:${source}`, id]));
const quality = (w: FutureJointCompletionWitnessV1) => evaluatePlanningQuality(canonical.expansion,
  [...w.tasks.map(task => ({ taskId: expansionIdBySource.get(task.id)!, start: task.start, end: task.end, duration: task.duration })),
    ...w.participantMeals.map(meal => ({ taskId: expansionIdBySource.get(meal.sourceTaskId)!, start: meal.start, end: meal.end, duration: meal.duration }))],
  { authorizedMainFlowBreaks: w.operationalMeals.filter(meal => meal.spaceIds.includes(problem.mainFlow.spaceId)).map(({ start, end }) => ({ start, end })),
    scheduledPreparations: [...w.preparations.map(prep => ({ id: prep.id, kind: "setup_preparation" as const, spaceId: expansionSpaceBySource.get(prep.spaceId)!, start: prep.start, end: prep.end, duration: prep.duration })),
      ...w.roundPreparations.map(prep => ({ id: prep.id, kind: "round_preparation" as const, spaceId: expansionSpaceBySource.get(prep.spaceId)!, start: prep.start, end: prep.end, duration: prep.duration }))] });
const topologyMetrics = collectA2TopologyMetrics(input.tasks, snapshots.at(-1)!.tasks, input.contestantAvailabilityById ?? {});
const summarize = (w: FutureJointCompletionWitnessV1) => {
  const rows = participants.map(id => {
    const tasks = w.tasks.filter(task => task.participantId === id).sort((a, b) => a.start - b.start);
    const get = (name: string) => tasks.find(task => taskType(task.id) === name)!;
    const arrival = get("IN"), entry = get("ESTILISMO_ENTRADA"), exit = get("ESTILISMO_SALIDA"), out = get("OUT");
    const meals = w.participantMeals.filter(meal => meal.participantId === id);
    const substantive = tasks.filter(task => ![arrival.id, entry.id, exit.id, out.id].includes(task.id));
    const last = substantive.at(-1)!;
    const lastIncludingMeal = Math.max(last.end, ...meals.map(meal => meal.end));
    const active = tasks.reduce((n, task) => n + task.duration, 0) + meals.reduce((n, meal) => n + meal.duration, 0);
    return { participant: ordinal(id), canonicalId: id, availability: problem.participants.find(person => person.id === id)!.availability,
      firstTaskId: tasks[0]!.id, firstType: taskType(tasks[0]!.id), firstStart: tasks[0]!.start,
      lastTaskId: tasks.at(-1)!.id, lastType: taskType(tasks.at(-1)!.id), lastEnd: tasks.at(-1)!.end,
      in: arrival.start, inEnd: arrival.end, entry: entry.start, entryEnd: entry.end,
      inEndToEntryMinutes: entry.start - arrival.end, lastSubstantiveTaskId: last.id, lastSubstantiveEnd: last.end,
      lastIncludingMealEnd: lastIncludingMeal, exit: exit.start, exitEnd: exit.end, out: out.start, outEnd: out.end,
      lastSubstantiveToExitMinutes: exit.start - last.end, lastIncludingMealToExitMinutes: exit.start - lastIncludingMeal,
      exitEndToOutMinutes: out.start - exit.end, presenceMinutes: out.end - arrival.start,
      activeIncludingMealMinutes: active, unoccupiedPresenceMinutes: out.end - arrival.start - active,
      openingStage: stageOf(entry.id), closureStage: stageOf(exit.id) };
  });
  const style = w.tasks.filter(task => ["ESTILISMO_ENTRADA", "ESTILISMO_SALIDA"].includes(taskType(task.id))).sort((a, b) => a.start - b.start);
  const gaps = style.slice(1).flatMap((task, i) => task.start > style[i]!.end ? [{ start: style[i]!.end, end: task.start, minutes: task.start - style[i]!.end }] : []);
  return { completedObligations: w.tasks.length + w.participantMeals.length, dayClosureMinute: Math.max(...rows.map(row => row.outEnd)),
    participantPresenceTotalMinutes: rows.reduce((sum, row) => sum + row.presenceMinutes, 0), participants: rows,
    styling: { productiveMinutes: style.reduce((sum, task) => sum + task.duration, 0), spanMinutes: style.at(-1)!.end - style[0]!.start,
      internalGaps: gaps, dayUtilization: style.reduce((sum, task) => sum + task.duration, 0) / (problem.day.end - problem.day.start) } };
};
const baseline = summarize(witness);
assert.equal(baseline.participantPresenceTotalMinutes, topologyMetrics.participantPresenceTotalMinutes);
assert.equal(baseline.styling.productiveMinutes, topologyMetrics.styling.productiveMinutes);
assert.equal(baseline.styling.spanMinutes, topologyMetrics.styling.spanMinutes);
assert.deepEqual(baseline.styling.internalGaps, topologyMetrics.styling.internalGaps.map(({ start, end, minutes }) => ({ start, end, minutes })));
const moved = (changes: readonly { id: string; start: number }[]) => {
  const byId = new Map(changes.map(change => [change.id, change.start]));
  const { fingerprint: _old, ...body } = witness;
  const next = { ...body, tasks: witness.tasks.map(task => byId.has(task.id) ? { ...task, start: byId.get(task.id)!, end: byId.get(task.id)! + task.duration } : task) };
  return { ...next, fingerprint: fingerprintJointCompletionWitness(next) };
};
const scanTask = (id: string) => {
  const task = witness.tasks.find(task => task.id === id)!;
  const others = witness.tasks.filter(other => other.id !== id);
  const tested = [];
  let earliest: number | null = null;
  for (let start = problem.day.start; start < task.start; start += grid) {
    const placement = diagnoseTaskPlacement(problem, task, start, others, [...witness.spaceMeals]);
    const validation = placement.valid ? validate(moved([{ id, start }])) : null;
    const valid = placement.valid && validation!.hardValid;
    tested.push({ start, placement, fullValidation: validation && { hardValid: validation.hardValid, reasonCodes: validation.reasonCodes, violations: validation.violations } });
    if (valid && earliest === null) earliest = start;
  }
  return { taskId: id, participant: ordinal(task.participantId!), type: taskType(id), baselineStart: task.start, earliestEarlierFullValidStart: earliest, tested };
};
// Representatives are selected from measured gaps, never product ID rules.
const entryPerson = [...baseline.participants].sort((a, b) => b.inEndToEntryMinutes - a.inEndToEntryMinutes || a.participant.localeCompare(b.participant))[0]!;
const closurePerson = [...baseline.participants].sort((a, b) => b.lastIncludingMealToExitMinutes - a.lastIncludingMealToExitMinutes || a.participant.localeCompare(b.participant))[0]!;
const typeFor = (participant: string, type: string) => witness.tasks.find(task => task.participantId === participant && taskType(task.id) === type)!;
const entryScan = scanTask(typeFor(entryPerson.canonicalId, "ESTILISMO_ENTRADA").id);
const closureScan = scanTask(typeFor(closurePerson.canonicalId, "ESTILISMO_SALIDA").id);
const certify = (name: string, changes: readonly { id: string; start: number }[], beforeStage: number) => {
  const alternative = moved(changes);
  const validation = validate(alternative);
  assert.equal(validation.hardValid, true); assert.deepEqual(validation.violations, []);
  const protectedBefore = materializeAssistedSnapshotOccupations(problem, adapter.identityMap, snapshots[beforeStage - 1]!).protectedPlacements;
  let replayCharges = 0;
  const consumeAudit = () => replayCharges < problem.budget.maxBranchExpansions ? (replayCharges++, true) : false;
  const replay = revalidateJointCompletionWitness(problem, alternative, protectedBefore, consumeAudit);
  assert.equal(replay, "PASS");
  const closure = new PreparedFutureCollectiveParticipantClosure(problem).evaluate([...alternative.tasks], [...alternative.participantMeals], consumeAudit, "CERTIFY");
  assert.equal(closure.certified, true);
  const changeByProduct = new Map(changes.map(change => [canonicalToProduct.get(change.id)!, change]));
  const manualSnapshot = { ...snapshots.at(-1)!, tasks: snapshots.at(-1)!.tasks.map(row => {
    const change = changeByProduct.get(row.taskId), source = metadata.get(`task:${row.taskId}`)!;
    return change ? { ...row, startPlanned: hhmm(change.start), endPlanned: hhmm(change.start + source.durationOverrideMin!) } : row;
  }) };
  const productValidation = validateManualAssistedDelta(input, manualSnapshot, [...changeByProduct.keys()]);
  assert.equal(productValidation.hardValid, true);
  assert.deepEqual(productValidation.validationSummary.violations, []);
  const changedIds = new Set(changes.map(change => change.id));
  const unchanged = witness.tasks.filter(task => !changedIds.has(task.id)).every(task => JSON.stringify(task) === JSON.stringify(alternative.tasks.find(other => other.id === task.id)));
  assert.equal(unchanged, true);
  writeFileSync(resolve(output, `${name}-witness.json`), `${JSON.stringify(alternative, null, 2)}\n`);
  const metrics = summarize(alternative);
  const boundarySlack = (w: FutureJointCompletionWitnessV1) => participants.flatMap(participantId => {
    // This is elapsed task-boundary slack, not the official P10 KPI: meals
    // remain separately validated and are not converted into synthetic tasks.
    const timeline = w.tasks.filter(task => task.participantId === participantId).sort((a, b) => a.start - b.start);
    return timeline.slice(1).map((task, i) => {
      const prior = timeline[i]!;
      const required = participantGapMinutes(problem, prior, task);
      return { participant: ordinal(participantId), before: prior.id, after: task.id, gap: task.start - prior.end, required, slack: task.start - prior.end - required };
    });
  });
  const priorSlack = boundarySlack(witness), nextSlack = boundarySlack(alternative);
  const changedBoundaries = nextSlack.filter(row => JSON.stringify(priorSlack.find(prior => prior.before === row.before && prior.after === row.after)) !== JSON.stringify(row));
  return { name, changes, validation, productValidation: { hardValid: productValidation.hardValid, reasonCodes: productValidation.reasonCodes },
    replay, replayCharges, futureClosure: { certified: closure.certified, status: closure.status, reason: closure.reason },
    changedBoundaries, priorBoundariesForChangedParticipant: priorSlack.filter(row => changes.some(change => ordinal(witness.tasks.find(task => task.id === change.id)!.participantId!) === row.participant)),
    minimumBoundarySlackBefore: Math.min(...priorSlack.map(row => row.slack)), minimumBoundarySlackAfter: Math.min(...nextSlack.map(row => row.slack)),
    preservedStage: beforeStage, protectedCount: protectedBefore.length,
    allOtherTasksLiteral: unchanged, allMealsPreparationsResourcesLiteral: true, metrics, existingQualityEvaluator: quality(alternative),
    presenceDeltaMinutes: metrics.participantPresenceTotalMinutes - baseline.participantPresenceTotalMinutes,
    dayClosureDeltaMinutes: metrics.dayClosureMinute - baseline.dayClosureMinute };
};
const counterfactuals = [];
if (entryScan.earliestEarlierFullValidStart !== null)
  counterfactuals.push(certify("entry-earlier", [{ id: entryScan.taskId, start: entryScan.earliestEarlierFullValidStart }], entryPerson.openingStage - 1));
if (closureScan.earliestEarlierFullValidStart !== null) {
  // Holding every other task fixed first isolates space/dependency validity.
  counterfactuals.push(certify("exit-earlier-fixed-out", [{ id: closureScan.taskId, start: closureScan.earliestEarlierFullValidStart }], closurePerson.closureStage - 1));
  const outTask = typeFor(closurePerson.canonicalId, "OUT");
  let pair: { exit: number; out: number } | null = null;
  let pairChecks = 0;
  for (let exit = closureScan.earliestEarlierFullValidStart; exit < closureScan.baselineStart && !pair; exit += grid) {
    for (let out = exit + typeFor(closurePerson.canonicalId, "ESTILISMO_SALIDA").duration; out < outTask.start; out += grid) {
      pairChecks++;
      const alternative = moved([{ id: closureScan.taskId, start: exit }, { id: outTask.id, start: out }]);
      if (validate(alternative).hardValid) { pair = { exit, out }; break; }
    }
  }
  if (pair) counterfactuals.push({ ...certify("closure-earlier", [{ id: closureScan.taskId, start: pair.exit }, { id: outTask.id, start: pair.out }], closurePerson.closureStage - 1), pairChecks });
}
const stageEvidence = run.iterations.map((stage: any) => {
  const joint = stage.futureStructuralWitnesses.find((w: any) => w.kind === "JOINT_COMPLETION");
  return { stage: stage.ordinal, scope: stage.scopeSelector, orchestration: stage.orchestration, completed: stage.completedObligationCount,
    fingerprint: stage.acceptedStageFingerprint, work: stage.work, reasonCodes: stage.reasonCodes, validation: stage.hardRequiredValidation,
    jointFingerprint: joint?.fingerprint, acceptedSupportingPlacements: stage.acceptedSupportingPlacements,
    ephemeralSupportingPlacements: stage.ephemeralSupportingPlacements, internalPlacements: stage.internalPlacements,
    participantFutureReservation: stage.participantFutureReservation, causalDiagnostic: stage.causalDiagnostic,
    standaloneDiagnostic: stage.standaloneDiagnostic, bundleMatching: stage.bundleMatching,
    proposedSnapshotOperationalMeals: stage.proposedSnapshotOperationalMeals };
});
writeFileSync(resolve(output, "baseline-witness.json"), `${JSON.stringify(witness, null, 2)}\n`);
writeFileSync(resolve(output, "final-snapshot.json"), `${JSON.stringify(snapshots.at(-1), null, 2)}\n`);
writeFileSync(resolve(output, "stage-evidence.json"), `${JSON.stringify(stageEvidence, null, 2)}\n`);
const report = { status: run.status, fingerprint: run.deterministicFingerprint, effectiveInConfiguration: run.effectiveInConfiguration,
  baselineValidation, baseline, existingTopologyMetrics: topologyMetrics, existingQualityEvaluator: quality(witness),
  qualityEvaluatorLimitations: { comparisonReady: false,
    blockedKpis: ["P04", "P05", "P06", "P08", "P10"],
    legacyP09SequenceCheck: "planningQuality.specialOperationQuality checks sequenceAfterJointGroupId with exact adjacency. Alfombra ends 1110; Totales Post starts 1115. Full effective validatePlan accepts the independent operation and its 5-minute participant margin. The legacy scorer returns jointViolationCount=1 identically for baseline and alternatives; it cannot certify global parity/Pareto." },
  entryScan, closureScan, counterfactuals,
  availability: { day: problem.day, timeGridMinutes: grid, transport: problem.transportPolicy,
    spaces: problem.spaces, resources: problem.resources, coaches: problem.coaches, itinerantUnits: problem.itinerantUnits, participantTransitionMinutes: problem.participantTransitionMinutes },
  sourceWitnessFingerprint: witness.fingerprint, snapshotEqualsWitness: true,
  rawRunSha256: createHash("sha256").update(readFileSync(resolve(directory, "run.json"))).digest("hex") };
writeFileSync(resolve(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
const rows = [["participant", "IN", "entry", "inEndToEntry", "lastSubstantiveEnd", "lastIncludingMealEnd", "exit", "OUT", "outEnd", "presence", "unoccupied", "openingStage", "closureStage"],
  ...baseline.participants.map(row => [row.participant, hhmm(row.in), hhmm(row.entry), row.inEndToEntryMinutes, hhmm(row.lastSubstantiveEnd), hhmm(row.lastIncludingMealEnd), hhmm(row.exit), hhmm(row.out), hhmm(row.outEnd), row.presenceMinutes, row.unoccupiedPresenceMinutes, row.openingStage, row.closureStage])];
writeFileSync(resolve(output, "participants.csv"), rows.map(row => row.join(",")).join("\n") + "\n");
const schedule = [["participant", "taskId", "type", "start", "end", "spaceId", "resources", "itinerantUnitId", "acceptedStage"],
  ...witness.tasks.map(task => [ordinal(task.participantId!), task.id, taskType(task.id), hhmm(task.start), hhmm(task.end), task.spaceId, (task.requiredResourceIds ?? []).join("|"), task.itinerantUnitId ?? "", stageOf(task.id)]),
  ...witness.participantMeals.map(meal => [ordinal(meal.participantId), meal.sourceTaskId, "SODEXO", hhmm(meal.start), hhmm(meal.end), "", "", "", stageOf(meal.sourceTaskId)])];
writeFileSync(resolve(output, "schedule.csv"), schedule.map(row => row.join(",")).join("\n") + "\n");
console.log(JSON.stringify({ baseline: { ...baseline, participants: undefined }, entry: { participant: entryScan.participant, from: entryScan.baselineStart, to: entryScan.earliestEarlierFullValidStart }, closure: { participant: closureScan.participant, from: closureScan.baselineStart, to: closureScan.earliestEarlierFullValidStart }, alternatives: counterfactuals.map(row => ({ name: row.name, changes: row.changes, presenceDelta: row.presenceDeltaMinutes, replay: row.replay })) }));
