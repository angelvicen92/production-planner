import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import type { FutureJointCompletionWitnessV1 } from "./anonymousPipelineWitness";
import { materializeEarlyClosure } from "./earlyClosureMaterialization";
import { createExactSearchLedger, ExactSearchTimeLimitReached } from "./exactMainAndFeederCore";
import { runExactItinerantPlanSearch } from "./exactItinerantPlan";
import { PreparedFutureCollectiveParticipantClosure } from "./futureCollectiveParticipantClosure";
import { fingerprintJointCompletionWitness, revalidateJointCompletionWitness } from "./jointCompletionWitness";
import { buildCanonicalA2AssistedStage1Fixture } from "./benchmarks/canonicalA2AssistedStage1Fixture";
import { validatePlan } from "./validate";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "./assistedPlanning";

function fixture() {
  const availability = [{ start: 0, end: 200 }];
  const source: PlannerNextProblem = { day: availability[0]!, spaces: ["work", "styling", "transport"].map(id => ({ id, availability })),
    participants: ["a", "b", "c", "d"].map(id => ({ id, availability })), coaches: [], resources: [],
    mainFlow: { spaceId: "work", preferredEnd: 200, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    auxiliaryPolicy: { participantPresencePreference: "OFF" }, searchPolicy: "EXACT_CONSTRUCTIVE",
    participantTransitionMinutes: 5, resourceTransitionMinutes: 0,
    budget: { bestK: 1, maxPatterns: 20, maxBacktracks: 0, maxBranchExpansions: 10000 },
    tasks: ["a", "b", "c", "d"].flatMap(id => [
      { id: `work-${id}`, kind: "auxiliary" as const, participantId: id, duration: 5, spaceId: "work", dependencies: [] },
      { id: `close-${id}`, kind: "auxiliary" as const, participantId: id, duration: 5, spaceId: "styling", participantMarginAfterMinutes: 0, dependencies: [`work-${id}`] },
      { id: `out-${id}`, kind: "auxiliary" as const, participantId: id, duration: 5, spaceId: "transport", blocksSpace: false, participantMarginBeforeMinutes: 0, dependencies: [`close-${id}`] },
    ]),
    transportPolicy: { arrival: { taskIds: [], minimumGroupSize: 1, maximumGroupSize: 2, minGapMinutes: 0, groupingWeight: 0 },
      departure: { taskIds: ["out-a", "out-b", "out-c", "out-d"], minimumGroupSize: 2, maximumGroupSize: 2, targetGroupSize: 2, minGapMinutes: 20, groupingWeight: 0 } } };
  const body: Omit<FutureJointCompletionWitnessV1, "fingerprint"> = { kind: "JOINT_COMPLETION", version: 1,
    tasks: source.tasks.map(task => {
      const index = ["a", "b", "c", "d"].indexOf(task.participantId!);
      const start = task.id.startsWith("work") ? [15, 20, 40, 45][index]! : task.id.startsWith("close") ? 100 + index * 5 : index < 2 ? 120 : 140;
      return { ...task, start, end: start + task.duration };
    }), preparations: [], roundPreparations: [], operationalMeals: [], spaceMeals: [], participantMeals: [] };
  return { source, witness: { ...body, fingerprint: fingerprintJointCompletionWitness(body) } };
}

function materialize(source: PlannerNextProblem, witness: FutureJointCompletionWitnessV1,
  visible = source.tasks.map(task => task.id), fixed: readonly ScheduledTask[] = [], limit = 10000,
  checkpoint?: () => void, acceptsProjection = (_witness: FutureJointCompletionWitnessV1) => true) {
  assert.equal(revalidateJointCompletionWitness(source, witness, fixed, () => true), "PASS", JSON.stringify(validatePlan(source, [...witness.tasks], [], [], [...witness.participantMeals])));
  const closure = new PreparedFutureCollectiveParticipantClosure(source).evaluate(witness.tasks, witness.participantMeals);
  assert.equal(closure.certified, true);
  const ledger = createExactSearchLedger(limit, checkpoint);
  const result = materializeEarlyClosure(source, witness, closure, visible, fixed, ledger, acceptsProjection);
  assert.equal(result.evidence.branchesConsumed, ledger.branchesExplored);
  assert.ok(ledger.branchesExplored <= limit);
  assert.equal(revalidateJointCompletionWitness(source, result.witness, fixed, () => true), "PASS");
  assert.equal(result.closure.certified, true);
  return result;
}

test("joint closure releases multi-person OUT groups early without imposing a fixed departure grid", () => {
  const { source, witness } = fixture(), before = structuredClone({ source, witness });
  const result = materialize(source, witness);
  assert.deepEqual(result, materialize(source, witness));
  assert.equal(result.evidence.outcome, "CERTIFIED");
  assert.deepEqual(result.witness.tasks.filter(task => task.id.startsWith("out")).map(task => task.start), [35, 35, 60, 60]);
  assert.deepEqual(result.witness.tasks.filter(task => task.id.startsWith("work")), witness.tasks.filter(task => task.id.startsWith("work")));
  assert.deepEqual({ source, witness }, before);
});

test("protected and invisible closures and OUT remain literal, including a protected member of a group", () => {
  const { source, witness } = fixture();
  assert.deepEqual(materialize(source, witness, []).witness, witness);
  for (const ids of [["close-a"], ["out-a"], ["close-a", "out-a", "out-b"], source.tasks.map(task => task.id)]) {
    const fixed = witness.tasks.filter(task => ids.includes(task.id));
    const result = materialize(source, witness, undefined, fixed);
    for (const row of fixed) assert.deepEqual(result.witness.tasks.find(task => task.id === row.id), row);
  }
});

test("target is preferred rather than a hard minimum and heterogeneous domains retain exact transport fallback", () => {
  const { source, witness } = fixture();
  source.transportPolicy!.departure.minimumGroupSize = 1;
  source.transportPolicy!.departure.maximumGroupSize = 3;
  source.transportPolicy!.departure.targetGroupSize = 3;
  source.participants[0]!.availability = [{ start: 10, end: 200 }];
  const result = materialize(source, witness);
  assert.equal(result.evidence.outcome, "CERTIFIED");
  const groups = result.evidence.transport!.directions.find(row => row.direction === "departure")!;
  assert.deepEqual([...groups.packetSizes].sort(), [1, 3]);
});

test("unit OUT with zero separation leaves as soon as its effective closure finishes", () => {
  const { source, witness } = fixture();
  Object.assign(source.transportPolicy!.departure, { minimumGroupSize: 1, maximumGroupSize: 1, targetGroupSize: 1, minGapMinutes: 0 });
  // Original simultaneous pairs would violate maximum=1; retain a valid,
  // staggered incumbent before testing the nominal materialization.
  const { fingerprint: _old, ...body } = witness;
  const updated = { ...body, tasks: witness.tasks.map(task => task.id === "out-b" || task.id === "out-d"
    ? { ...task, start: task.start + 5, end: task.end + 5 } : task) };
  const result = materialize(source, { ...updated, fingerprint: fingerprintJointCompletionWitness(updated) });
  assert.equal(result.evidence.outcome, "CERTIFIED");
  for (const task of result.witness.tasks.filter(task => task.id.startsWith("out")))
    assert.equal(task.start, result.witness.tasks.find(row => row.id === task.dependencies[0])!.end);
});

test("unsupported non-unit-slot closure geometry abstains and retains the original certificate", () => {
  const { source, witness } = fixture();
  source.tasks = source.tasks.map(task => task.id.startsWith("close") ? { ...task, duration: 10 } : task);
  const { fingerprint: _old, ...body } = witness;
  const updated = { ...body, tasks: source.tasks.map(task => {
    const old = witness.tasks.find(row => row.id === task.id)!;
    const index = ["a", "b", "c", "d"].indexOf(task.participantId!);
    const start = task.id.startsWith("close") ? 100 + index * 10 : task.id.startsWith("out") ? index < 2 ? 140 : 160 : old.start;
    return { ...task, start, end: start + task.duration };
  }) };
  const original = { ...updated, fingerprint: fingerprintJointCompletionWitness(updated) };
  const result = materialize(source, original);
  assert.equal(result.evidence.outcome, "MATCHING_UNCERTIFIED_GEOMETRY");
  assert.deepEqual(result.witness, original);
});

test("configured margins, availability and meals constrain the coordinated proposal", () => {
  const { source, witness } = fixture();
  source.participantTransitionMinutes = 10;
  source.spaces.find(space => space.id === "styling")!.availability = [{ start: 35, end: 200 }];
  const result = materialize(source, witness);
  assert.equal(result.evidence.outcome, "CERTIFIED");
  assert.ok(result.witness.tasks.find(task => task.id === "close-a")!.start >= 35);
  assert.equal(result.witness.tasks.find(task => task.id === "out-a")!.start, 45);
  const meal = { id: "meal-a", sourceTaskId: "meal-source-a", participantId: "a", duration: 10,
    window: { start: 35, end: 45 }, dependencies: [], status: "pending" as const };
  source.participantMeals = [meal];
  source.participantMealCapacity = { maxSimultaneous: 1 };
  const { fingerprint: _old, ...body } = witness;
  const updated = { ...body, participantMeals: [{ ...meal, start: 35, end: 45 }] };
  const withMeal = { ...updated, fingerprint: fingerprintJointCompletionWitness(updated) };
  const afterMeal = materialize(source, withMeal);
  assert.deepEqual(afterMeal.witness.participantMeals, withMeal.participantMeals);
  assert.ok(afterMeal.witness.tasks.find(task => task.id === "close-a")!.start >= 45);
});

test("invalid early slots, unsupported closure geometry and product rejection keep the certified original", () => {
  const { source, witness } = fixture();
  source.technicalChains = [{ id: "terminal-chain", orderedTaskIds: ["close-a", "close-b"], adjacency: "REQUIRED", resourceContinuity: "REQUIRED", requiredResourceIds: [] }];
  // Original adjacency is valid; the earliest matching separates these rows.
  source.tasks.find(task => task.id === "work-b")!.availability = [{ start: 20, end: 25 }];
  source.spaces.find(space => space.id === "styling")!.availability = [{ start: 0, end: 30 }, { start: 50, end: 200 }];
  const result = materialize(source, witness);
  assert.equal(result.evidence.outcome, "STALE");
  assert.deepEqual(result.witness, witness);
  const normal = fixture();
  assert.deepEqual(materialize(normal.source, normal.witness, undefined, [], 10000, undefined, () => false).witness, normal.witness);
  normal.source.spaces.find(space => space.id === "styling")!.availability = [{ start: 100, end: 200 }];
  const noEarlierStyling = materialize(normal.source, normal.witness);
  assert.ok(noEarlierStyling.evidence.moves.every(move => move.taskId.startsWith("out")));
});

test("budget exhaustion and cooperative timeout at any improvement phase retain a complete certificate", () => {
  const { source, witness } = fixture();
  const complete = materialize(source, witness);
  for (const limit of [0, 1, 8, complete.evidence.branchesConsumed - 1]) {
    const result = materialize(source, witness, undefined, [], limit);
    assert.deepEqual(result.witness, witness);
    assert.equal(result.evidence.stopReason, "BRANCH_BUDGET_EXHAUSTED");
  }
  for (const at of [1, 10, complete.evidence.branchesConsumed]) {
    let calls = 0;
    const result = materialize(source, witness, undefined, [], 10000, () => { if (++calls === at) throw new ExactSearchTimeLimitReached(); });
    assert.deepEqual(result.witness, witness);
    assert.equal(result.evidence.stopReason, "TIME_LIMIT_REACHED");
  }
});

test("the certified #1164 focal closure advances C03 with the other 264 task and meal obligations intact", () => {
  const { adapter } = buildCanonicalA2AssistedStage1Fixture();
  const witness: FutureJointCompletionWitnessV1 = JSON.parse(readFileSync(new URL("../../docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/baseline-witness.json", import.meta.url), "utf8"));
  const participantId = adapter.problem.participants.map(person => person.id).sort()[2]!;
  const out = witness.tasks.find(task => task.participantId === participantId && adapter.problem.transportPolicy!.departure.taskIds.includes(task.id))!;
  const closureIds = new Set(new PreparedFutureCollectiveParticipantClosure(adapter.problem).closureTaskIds());
  const close = witness.tasks.find(task => closureIds.has(task.id) && task.participantId === participantId)!;
  const ids = [close.id, out.id], fixed = witness.tasks.filter(task => !ids.includes(task.id));
  const result = materialize(adapter.problem, witness, ids, fixed);
  assert.equal(result.evidence.outcome, "CERTIFIED", JSON.stringify(result.evidence));
  assert.deepEqual(result.evidence.moves.map(move => [move.from, move.to]), [[1045, 885], [1050, 890]]);
  assert.deepEqual(result.witness.tasks.filter(task => !ids.includes(task.id)), fixed);
  assert.deepEqual(result.witness.participantMeals, witness.participantMeals);
});

test("Assisted projects the certified closure and replay preserves it once accepted", () => {
  const { source, witness } = fixture();
  const fixed = witness.tasks.filter(task => task.id.startsWith("work"));
  const ids = source.tasks.filter(task => !task.id.startsWith("work")).map(task => task.id);
  const scope = createPlanningScope({ kind: "ids", value: "closure" }, {}, ids);
  const built = buildAssistedProblem(source, scope, fixed, new Set(source.tasks.map(task => task.id)), [], [], [], [], [witness]);
  const result = executeAssistedPlanning(built);
  assert.equal(result.evidence.completeForScope, true);
  assert.equal(result.evidence.standaloneDiagnostic?.earlyClosureMaterialization?.outcome, "CERTIFIED");
  const softSource = structuredClone(source);
  softSource.mainFlow.preferredBlockCount = 1;
  const soft = buildAssistedProblem(softSource, scope, fixed, new Set(source.tasks.map(task => task.id)), [], [], [], [], [witness]);
  assert.deepEqual(executeAssistedPlanning(soft).proposal, result.proposal);
  const updated = result.evidence.futureStructuralWitnesses!.find((item): item is FutureJointCompletionWitnessV1 => item.kind === "JOINT_COMPLETION")!;
  const accepted = [...fixed, ...result.proposal!];
  const next = buildAssistedProblem(source, scope, accepted, new Set(ids), [], [], [], [], [updated]);
  assert.equal(executeAssistedPlanning(next).evidence.protectedPlacementsPreserved, true);
  const control = runExactItinerantPlanSearch(built.problem, { fixedPlacements: fixed, priorFutureStructuralWitnesses: [witness] });
  built.problem.budget.maxBranchExpansions = control.evidence.branchesExplored + 1;
  const limited = executeAssistedPlanning(built);
  assert.equal(limited.evidence.completeForScope, true);
  assert.deepEqual(limited.proposal, witness.tasks.filter(task => ids.includes(task.id)));
});
