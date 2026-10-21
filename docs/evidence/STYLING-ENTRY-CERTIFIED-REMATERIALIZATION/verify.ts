import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FutureJointCompletionWitnessV1 } from "../../../engine/planner-next/anonymousPipelineWitness";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "../../../engine/planner-next/assistedPlanning";
import { buildCanonicalA2AssistedStage1Fixture } from "../../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";
import { createExactSearchLedger } from "../../../engine/planner-next/exactMainAndFeederCore";
import { PreparedFutureCollectiveParticipantClosure } from "../../../engine/planner-next/futureCollectiveParticipantClosure";
import { jointCompletionCanonicalJson, revalidateJointCompletionWitness } from "../../../engine/planner-next/jointCompletionWitness";
import { participantGapMinutes } from "../../../engine/planner-next/participantTransition";
import { collectA2TopologyMetrics } from "../../../script/demo/a2TopologyMetrics";
import { materializeAssistedSnapshotOccupations, validateManualAssistedDelta } from "../../../server/assistedProposalService";
import type { AssistedPlanningSnapshotV1 } from "../../../server/assistedPlanningSnapshot";

const baselineDirectory = resolve(process.argv[2]!);
const candidateDirectory = resolve(process.argv[3]!);
const repeatDirectory = resolve(process.argv[4]!);
const output = resolve(process.argv[5] ?? candidateDirectory);
mkdirSync(output, { recursive: true });
const read = (directory: string, name: string) => JSON.parse(readFileSync(resolve(directory, name), "utf8"));
const before = read(baselineDirectory, "run.json"), after = read(candidateDirectory, "run.json"), repeat = read(repeatDirectory, "run.json");
const snapshotsBefore: AssistedPlanningSnapshotV1[] = read(baselineDirectory, "snapshots.json");
const snapshotsAfter: AssistedPlanningSnapshotV1[] = read(candidateDirectory, "snapshots.json");
const fixture = buildCanonicalA2AssistedStage1Fixture(), { input, adapter } = fixture;
const source = adapter.problem;
const metadata = new Map(input.tasks.map(task => [`task:${task.id}`, task]));
const entryIds = new Set(input.tasks.filter(task => task.templateName === "ESTILISMO_ENTRADA").map(task => `task:${task.id}`));
const joint = (stage: any): FutureJointCompletionWitnessV1 => stage.futureStructuralWitnesses.find((item: any) => item.kind === "JOINT_COMPLETION");
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const material = (run: any) => ({ ...run, iterations: run.iterations.map(({ durationMs: _time, ...stage }: any) => stage) });
assert.deepEqual(material(after), material(repeat), "entire repeated run must match except Stage duration");
assert.deepEqual(snapshotsAfter, read(repeatDirectory, "snapshots.json"));
assert.deepEqual(read(baselineDirectory, "runtime.json"), read(candidateDirectory, "runtime.json"));
assert.deepEqual(read(candidateDirectory, "runtime.json"), read(repeatDirectory, "runtime.json"));
assert.deepEqual(material(before).iterations.slice(0, 7), material(after).iterations.slice(0, 7));
assert.deepEqual(snapshotsBefore.slice(0, 7), snapshotsAfter.slice(0, 7));

function audit(run: any, snapshots: AssistedPlanningSnapshotV1[]) {
  assert.equal(run.status, "PASS"); assert.equal(run.completedObligationCount, 266); assert.equal(run.stageCount, 11);
  assert.equal(run.finalHardViolationCount, 0); assert.equal(run.finalRequiredViolationCount, 0);
  assert.equal(run.dailyTasksMatchesLastAcceptedStage, true);
  assert.equal(run.duplicateFinalIds, 0); assert.equal(run.finalObligationIdsMatchSource, true);
  return run.iterations.map((stage: any, index: number) => {
    const w = joint(stage), fixed = index ? materializeAssistedSnapshotOccupations(source, adapter.identityMap, snapshots[index - 1]!) : null;
    const ledger = createExactSearchLedger(source.budget.maxBranchExpansions);
    const consume = () => ledger.consume("STANDALONE");
    const replay = revalidateJointCompletionWitness(source, w, fixed?.protectedPlacements ?? [], consume);
    assert.equal(replay, "PASS");
    const closure = new PreparedFutureCollectiveParticipantClosure(source).evaluate(w.tasks, w.participantMeals, consume, "CERTIFY", w.spaceMeals);
    assert.equal(closure.certified, true);
    assert.equal(w.tasks.length + w.participantMeals.length, 266);
    assert.equal(stage.hardRequiredValidation.hardValid, true); assert.equal(stage.hardRequiredValidation.requiredValid, true);
    assert.equal(stage.protectedEqualityProof.equal, true); assert.equal(stage.participantMealPreservationProof.equal, true);
    assert.deepEqual(stage.acceptedSupportingPlacements, []);
    assert.ok(stage.branchesExplored <= source.budget.maxBranchExpansions);
    assert.equal(stage.branchesExplored, stage.work.coreBranches + stage.work.standaloneBranches);
    const priorRows = index ? snapshots[index - 1]!.tasks.filter(row => row.startPlanned) : [];
    for (const row of priorRows) assert.deepEqual(snapshots[index]!.tasks.find(item => item.taskId === row.taskId), row);
    return { ordinal: stage.ordinal, selector: stage.scopeSelector, resolvedTaskIds: stage.resolvedTaskIds,
      orchestration: stage.orchestration, visibleTaskCount: stage.visibleScopeCount, supportingTaskCount: stage.supportingTaskCount,
      acceptedSupportingPlacements: stage.acceptedSupportingPlacements, protected: stage.protectedEqualityProof,
      validation: stage.hardRequiredValidation, completed: stage.completedObligationCount, branches: stage.branchesExplored,
      coreBranches: stage.work.coreBranches, standaloneBranches: stage.work.standaloneBranches, durationMs: stage.durationMs,
      jointFingerprint: w.fingerprint, stageFingerprint: stage.acceptedStageFingerprint,
      earlyEntryMaterialization: stage.standaloneDiagnostic?.earlyEntryMaterialization ?? null,
      independentAudit: { replay, closureCertified: closure.certified, closureFingerprint: closure.witnessFingerprint,
        branches: ledger.branchesExplored, accounting: "OFFLINE_AUDIT_SEPARATE_FROM_PRODUCT_LEDGER" } };
  });
}
const stagesBefore = audit(before, snapshotsBefore), stagesAfter = audit(after, snapshotsAfter);
assert.deepEqual(before.iterations.map((stage: any) => stage.resolvedTaskIds), after.iterations.map((stage: any) => stage.resolvedTaskIds));
const original = joint(before.iterations.at(-1)), selected = joint(after.iterations.at(-1));
const changes = selected.tasks.flatMap(task => {
  const old = original.tasks.find(item => item.id === task.id)!;
  if (jointCompletionCanonicalJson(task) === jointCompletionCanonicalJson(old)) return [];
  assert.ok(entryIds.has(task.id), "only entry placements may change");
  assert.ok(task.start < old.start);
  assert.deepEqual({ ...task, start: old.start, end: old.end }, old);
  return [{ taskId: task.id, participantId: task.participantId, before: old.start, after: task.start, advanceMinutes: old.start - task.start }];
});
assert.ok(changes.length > 0);
for (const key of ["preparations", "roundPreparations", "participantMeals", "operationalMeals", "spaceMeals"] as const)
  assert.deepEqual(selected[key], original[key]);
const manualValidation = validateManualAssistedDelta(input, snapshotsAfter.at(-1)!, input.tasks.map(task => task.id));
assert.equal(manualValidation.hardValid, true); assert.deepEqual(manualValidation.validationSummary.violations, []);

const topology = (snapshot: AssistedPlanningSnapshotV1) => collectA2TopologyMetrics(input.tasks, snapshot.tasks, input.contestantAvailabilityById ?? {});
const waits = (w: FutureJointCompletionWitnessV1) => [...entryIds].map(id => {
  const entry = w.tasks.find(task => task.id === id)!;
  const arrival = w.tasks.find(task => source.transportPolicy!.arrival.taskIds.includes(task.id) && task.participantId === entry.participantId)!;
  return { taskId: id, participantId: entry.participantId, minutes: entry.start - arrival.end };
});
const boundaries = (w: FutureJointCompletionWitnessV1) => source.participants.flatMap(person => {
  const timeline = w.tasks.filter(task => task.participantId === person.id).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  return timeline.slice(1).map((task, index) => {
    const prior = timeline[index]!, required = participantGapMinutes(source, prior, task);
    return { participantId: person.id, before: prior.id, after: task.id, gap: task.start - prior.end, required, slack: task.start - prior.end - required };
  });
});
const topologyBefore = topology(snapshotsBefore.at(-1)!), topologyAfter = topology(snapshotsAfter.at(-1)!);
assert.equal(topologyAfter.participantPresenceTotalMinutes, topologyBefore.participantPresenceTotalMinutes);
assert.equal(topologyAfter.dayClosureMinute, topologyBefore.dayClosureMinute);
assert.equal(topologyAfter.styling.productiveMinutes, topologyBefore.styling.productiveMinutes);
const firstWaitsBefore = waits(original), firstWaitsAfter = waits(selected);

// Reuse the certified causal case in its actual S7 protected context. Selecting
// only that visible entry isolates its attainable position from shared competition.
const participant = source.participants.map(person => person.id).sort()[2]!;
const entry = original.tasks.find(task => entryIds.has(task.id) && task.participantId === participant)!;
const context = materializeAssistedSnapshotOccupations(source, adapter.identityMap, snapshotsBefore[6]!);
const scope = createPlanningScope({ kind: "ids", value: "causal-entry" }, {}, [entry.id]);
const assisted = buildAssistedProblem(source, scope, context.protectedPlacements, fixture.futureEligible,
  context.protectedOperationalMeals, context.protectedSetupPreparations, context.protectedParticipantMeals, context.protectedRoundPreparations, [original]);
const focal = executeAssistedPlanning(assisted);
assert.equal(focal.evidence.hardValid, true); assert.equal(focal.evidence.completeForScope, true);
assert.equal(focal.proposal!.length, 1); assert.equal(focal.proposal![0]!.start, 550);
const focalWitness = focal.evidence.futureStructuralWitnesses!.find((w): w is FutureJointCompletionWitnessV1 => w.kind === "JOINT_COMPLETION")!;
assert.deepEqual(focalWitness.tasks.filter(task => task.id !== entry.id), original.tasks.filter(task => task.id !== entry.id));
const productId = metadata.get(entry.id)!.id;
const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const manualSnapshot = { ...snapshotsBefore.at(-1)!, tasks: snapshotsBefore.at(-1)!.tasks.map(row => row.taskId === productId
  ? { ...row, startPlanned: hhmm(focal.proposal![0]!.start), endPlanned: hhmm(focal.proposal![0]!.end) } : row) };
const focalManual = validateManualAssistedDelta(input, manualSnapshot, [productId]);
assert.equal(focalManual.hardValid, true);

const total = (run: any) => ({ branches: run.iterations.reduce((sum: number, stage: any) => sum + stage.branchesExplored, 0),
  durationMs: run.iterations.reduce((sum: number, stage: any) => sum + stage.durationMs, 0),
  stageCount: run.stageCount, completed: run.completedObligationCount, hard: run.finalHardViolationCount,
  required: run.finalRequiredViolationCount, fingerprint: run.deterministicFingerprint });
const report = { status: "PASS", base: "7620449e77f280f6fb2341376aa12653eaffdf16",
  authority: "OFFLINE_EXISTING_REQUEST_RUN_APPLY_VALIDATE_ACCEPT_SERVICES_WITH_IN_MEMORY_PERSISTENCE",
  runtime: read(candidateDirectory, "runtime.json"), branchBudgetPerStage: source.budget.maxBranchExpansions,
  fixtureHashes: { input: sha(JSON.stringify(input)), problem: sha(JSON.stringify(source)) },
  runtimeHashes: Object.fromEntries(["engine/planner-next/earlyEntryMaterialization.ts", "engine/planner-next/exactItinerantPlan.ts",
    "engine/planner-next/assistedPlanning.ts", "engine/planner-next/executePlannerNext.ts", "package.json", "package-lock.json"]
    .map(path => [path, sha(readFileSync(path))])),
  baseline: total(before), candidate: total(after), repeat: total(repeat),
  determinism: { entireRunEqualExceptStageDuration: true, acceptedSnapshotsEqual: true, sha256: sha(JSON.stringify(material(after))) },
  preserved: { stagesS1ToS7Literal: true, scopeSequence: true, protectedHistory: true, allNonEntryTasksLiteral: true,
    mealsAndPreparationsLiteral: true, transportINAndOUTLiteral: true, finalProductManualValidation: manualValidation.hardValid },
  changes, stagesBefore, stagesAfter,
  focal: { participant: "C03", taskId: entry.id, from: entry.start, to: focal.proposal![0]!.start,
    protectedTaskCount: context.protectedPlacements.length, other265ObligationsPreserved: true,
    manualValidation: focalManual.hardValid, work: focal.evidence.work, evidence: focal.evidence.standaloneDiagnostic?.earlyEntryMaterialization,
    fingerprint: focalWitness.fingerprint },
  quality: { topologyBefore, topologyAfter, firstWaitsBefore, firstWaitsAfter,
    firstWaitTotalBefore: firstWaitsBefore.reduce((sum, row) => sum + row.minutes, 0),
    firstWaitTotalAfter: firstWaitsAfter.reduce((sum, row) => sum + row.minutes, 0),
    taskBoundariesBefore: boundaries(original), taskBoundariesAfter: boundaries(selected),
    limitation: "Elapsed task-boundary slack excludes meals as synthetic tasks; not the official P10 KPI. No new robustness threshold or continuity policy. First waits are raw waits, not a global proof of avoidability." },
  rawArtifacts: Object.fromEntries([baselineDirectory, candidateDirectory, repeatDirectory].map((directory, index) => [
    ["baseline", "candidate", "repeat"][index]!, { runSha256: sha(readFileSync(resolve(directory, "run.json"))),
      snapshotsSha256: sha(readFileSync(resolve(directory, "snapshots.json"))) }])) };
writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(resolve(output, "candidate-witness.json"), JSON.stringify(selected, null, 2) + "\n");
writeFileSync(resolve(output, "causal-case-witness.json"), JSON.stringify(focalWitness, null, 2) + "\n");
console.log(JSON.stringify({ status: report.status, baseline: report.baseline, candidate: report.candidate,
  repeat: report.repeat, changedEntries: changes.length, focal: report.focal.evidence }));
