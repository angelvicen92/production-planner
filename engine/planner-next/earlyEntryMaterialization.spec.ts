import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import type { FutureJointCompletionWitnessV1 } from "./anonymousPipelineWitness";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "./assistedPlanning";
import { buildCanonicalA2AssistedStage1Fixture } from "./benchmarks/canonicalA2AssistedStage1Fixture";
import { materializeEarlyEntries } from "./earlyEntryMaterialization";
import { createExactSearchLedger, ExactSearchTimeLimitReached } from "./exactMainAndFeederCore";
import { validatePlan } from "./validate";
import { runExactItinerantPlanSearch } from "./exactItinerantPlan";
import { PreparedFutureCollectiveParticipantClosure } from "./futureCollectiveParticipantClosure";
import { fingerprintJointCompletionWitness, revalidateJointCompletionWitness } from "./jointCompletionWitness";

function fixture() {
  const availability = [{ start: 0, end: 180 }];
  const source: PlannerNextProblem = { day: availability[0]!, spaces: ["arrival", "entry", "vocal", "main", "close", "exit"].map(id => ({ id, availability })),
    participants: ["a", "b"].map(id => ({ id, availability })), coaches: [{ id: "coach", availability }], resources: [],
    mainFlow: { spaceId: "main", preferredEnd: 180, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    auxiliaryPolicy: { participantPresencePreference: "OFF" }, searchPolicy: "EXACT_CONSTRUCTIVE",
    participantTransitionMinutes: 5, resourceTransitionMinutes: 0,
    budget: { bestK: 1, maxPatterns: 20, maxBacktracks: 0, maxBranchExpansions: 10000 },
    tasks: ["a", "b"].flatMap(id => [
      { id: `in-${id}`, kind: "auxiliary" as const, participantId: id, duration: 5, spaceId: "arrival", blocksSpace: false, dependencies: [] },
      { id: `entry-${id}`, kind: "auxiliary" as const, participantId: id, duration: 10, spaceId: "entry", dependencies: [`in-${id}`] },
      { id: `vocal-${id}`, kind: "vocal" as const, participantId: id, duration: 5, spaceId: "vocal", coachId: "coach", dependencies: [`in-${id}`] },
      { id: `main-${id}`, kind: "main" as const, participantId: id, duration: 10, spaceId: "main", coachId: "coach", blockKey: "coach", dependencies: [`entry-${id}`, `vocal-${id}`] },
      { id: `close-${id}`, kind: "auxiliary" as const, participantId: id, duration: 5, spaceId: "close", dependencies: [`main-${id}`, `meal-${id}`] },
      { id: `out-${id}`, kind: "auxiliary" as const, participantId: id, duration: 5, spaceId: "exit", blocksSpace: false, dependencies: [`close-${id}`] },
    ]),
    participantMealCapacity: { maxSimultaneous: 2 },
    participantMeals: ["a", "b"].map(id => ({ id: `meal-policy-${id}`, sourceTaskId: `meal-${id}`, participantId: id,
      duration: 10, window: { start: 125, end: 145 }, status: "pending" as const, dependencies: [`main-${id}`] })),
    transportPolicy: { arrival: { taskIds: ["in-a", "in-b"], minimumGroupSize: 1, maximumGroupSize: 2, minGapMinutes: 0, groupingWeight: 0 },
      departure: { taskIds: ["out-a", "out-b"], minimumGroupSize: 1, maximumGroupSize: 2, minGapMinutes: 0, groupingWeight: 0 } } };
  const starts: Record<string, number> = { "in-a": 0, "in-b": 0, "entry-a": 40, "entry-b": 50, "vocal-a": 80, "vocal-b": 85,
    "main-a": 100, "main-b": 110, "close-a": 140, "close-b": 150, "out-a": 150, "out-b": 160 };
  const body: Omit<FutureJointCompletionWitnessV1, "fingerprint"> = { kind: "JOINT_COMPLETION", version: 1,
    tasks: source.tasks.map(task => ({ ...task, start: starts[task.id]!, end: starts[task.id]! + task.duration })),
    preparations: [], roundPreparations: [], operationalMeals: [], spaceMeals: [],
    participantMeals: source.participantMeals!.map((meal, index) => ({ ...meal, start: 125 + index * 10, end: 135 + index * 10 })) };
  return { source, witness: { ...body, fingerprint: fingerprintJointCompletionWitness(body) } };
}

function materialize(source: PlannerNextProblem, witness: FutureJointCompletionWitnessV1,
  visible = ["entry-a", "entry-b"], fixed: readonly ScheduledTask[] = [], limit = 10000, checkpoint?: () => void,
  acceptsProjection = (_witness: FutureJointCompletionWitnessV1) => true) {
  assert.equal(revalidateJointCompletionWitness(source, witness, fixed, () => true), "PASS",
    JSON.stringify(validatePlan(source, [...witness.tasks], [], [], [...witness.participantMeals])));
  const closure = new PreparedFutureCollectiveParticipantClosure(source).evaluate(witness.tasks, witness.participantMeals);
  assert.equal(closure.certified, true);
  const ledger = createExactSearchLedger(limit, checkpoint);
  const result = materializeEarlyEntries(source, witness, closure, visible, fixed, ledger, acceptsProjection);
  assert.equal(result.evidence.branchesConsumed, ledger.branchesExplored);
  assert.ok(ledger.branchesExplored <= limit);
  assert.equal(revalidateJointCompletionWitness(source, result.witness, fixed, () => true), "PASS");
  assert.equal(result.closure.certified, true);
  return result;
}

test("visible entries advance deterministically with shared capacity; every other vertex and input is preserved", () => {
  const { source, witness } = fixture(), before = structuredClone({ source, witness });
  const first = materialize(source, witness), second = materialize(source, witness);
  assert.deepEqual(first, second);
  assert.deepEqual(first.evidence.moves.map(move => move.to), [10, 20]);
  assert.deepEqual(first.witness.tasks.filter(task => !task.id.startsWith("entry-")), witness.tasks.filter(task => !task.id.startsWith("entry-")));
  assert.deepEqual(first.witness.participantMeals, witness.participantMeals);
  assert.deepEqual({ source, witness }, before);
  assert.notEqual(first.witness.fingerprint, witness.fingerprint);
});

test("an invisible or accepted entry is never rematerialized", () => {
  const { source, witness } = fixture();
  assert.deepEqual(materialize(source, witness, []).witness, witness);
  const fixed = witness.tasks.filter(task => task.id === "entry-a");
  const result = materialize(source, witness, ["entry-a", "entry-b"], fixed);
  assert.deepEqual(result.witness.tasks.find(task => task.id === "entry-a"), fixed[0]);
  assert.deepEqual(result.evidence.moves.map(move => move.taskId), ["entry-b"]);
});

test("no earlier slot preserves the original; invalid early meal overlaps are rejected by the full certificate", () => {
  const { source, witness } = fixture();
  source.tasks.find(task => task.id === "entry-a")!.availability = [{ start: 40, end: 50 }];
  assert.deepEqual(materialize(source, witness, ["entry-a"]).witness, witness);
  const meal = source.participantMeals![0]!;
  meal.window = { start: 10, end: 20 }; meal.dependencies = [];
  const { fingerprint: _old, ...body } = witness;
  const changed = { ...body, participantMeals: witness.participantMeals.map(item => item.participantId === "a" ? { ...item, start: 10, end: 20 } : item) };
  const earlyMeal = { ...changed, fingerprint: fingerprintJointCompletionWitness(changed) };
  delete source.tasks.find(task => task.id === "entry-a")!.availability;
  const result = materialize(source, earlyMeal, ["entry-a"]);
  assert.equal(result.evidence.attempts[0]!.start, 10);
  assert.equal(result.evidence.attempts[0]!.outcome, "STALE");
  assert.equal(result.evidence.moves[0]!.to, 20);
});

test("an early entry cannot silently break a future REQUIRED adjacency or move its neighbour", () => {
  const { source, witness } = fixture();
  source.technicalChains = [{ id: "preparation-chain", orderedTaskIds: ["entry-a", "entry-b"], adjacency: "REQUIRED",
    resourceContinuity: "REQUIRED", requiredResourceIds: [] }];
  const result = materialize(source, witness, ["entry-a"]);
  assert.deepEqual(result.witness, witness);
  assert.ok(result.evidence.attempts.length > 0);
  assert.ok(result.evidence.attempts.every(attempt => attempt.outcome === "STALE"));
});

test("configured margins, availability, space and resources govern the early domain", () => {
  for (const [margin, expected] of [[0, 5], [10, 15]] as const) {
    const { source, witness } = fixture();
    source.tasks.find(task => task.id === "entry-a")!.participantMarginBeforeMinutes = margin;
    const { fingerprint: _old, ...body } = witness;
    const updated = { ...body, tasks: witness.tasks.map(task => task.id === "entry-a" ? { ...task, participantMarginBeforeMinutes: margin } : task) };
    assert.equal(materialize(source, { ...updated, fingerprint: fingerprintJointCompletionWitness(updated) }, ["entry-a"]).evidence.moves[0]!.to, expected);
  }
  const { source, witness } = fixture();
  source.spaces.find(space => space.id === "entry")!.availability = [{ start: 15, end: 180 }];
  source.resources = [{ id: "wardrobe", availability: [{ start: 25, end: 180 }], presencePreference: "OFF" }];
  source.tasks.find(task => task.id === "entry-a")!.requiredResourceIds = ["wardrobe"];
  const { fingerprint: _old, ...body } = witness;
  const updated = { ...body, tasks: witness.tasks.map(task => task.id === "entry-a" ? { ...task, requiredResourceIds: ["wardrobe"] } : task) };
  assert.equal(materialize(source, { ...updated, fingerprint: fingerprintJointCompletionWitness(updated) }, ["entry-a"]).evidence.moves[0]!.to, 25);
});

test("branch exhaustion, runtime interruption and projection rejection preserve a certified incumbent", () => {
  const { source, witness } = fixture();
  for (const limit of [0, 1, 5, 17]) {
    const result = materialize(source, witness, undefined, [], limit);
    assert.deepEqual(result.witness, witness);
    assert.equal(result.evidence.stopReason, "BRANCH_BUDGET_EXHAUSTED");
  }
  let checks = 0;
  const timed = materialize(source, witness, undefined, [], 10000, () => { if (++checks === 8) throw new ExactSearchTimeLimitReached(); });
  assert.deepEqual(timed.witness, witness);
  assert.equal(timed.evidence.stopReason, "TIME_LIMIT_REACHED");
  assert.deepEqual(materialize(source, witness, undefined, [], 10000, undefined, () => false).witness, witness);
  // Enough for one candidate, but not the next: keep the improvement already certified.
  const first = materialize(source, witness, ["entry-a"]);
  const partial = materialize(source, witness, undefined, [], first.evidence.branchesConsumed + 1);
  assert.equal(partial.evidence.moves.length, 1);
  assert.equal(partial.evidence.stopReason, "BRANCH_BUDGET_EXHAUSTED");
});

test("Assisted replay rematerializes only the visible entry and carries the new full witness into later scopes", () => {
  const { source, witness } = fixture();
  const fixed = witness.tasks.filter(task => task.kind === "main" || task.kind === "vocal");
  const eligible = new Set([...source.tasks.map(task => task.id), ...source.participantMeals!.map(meal => meal.sourceTaskId)]);
  const scope = createPlanningScope({ kind: "ids", value: "opening" }, {}, ["entry-a"]);
  const built = buildAssistedProblem(source, scope, fixed, eligible, [], [], [], [], [witness]);
  const before = structuredClone(built);
  const result = executeAssistedPlanning(built);
  assert.equal(result.evidence.completeForScope, true);
  assert.deepEqual(result.proposal?.map(task => [task.id, task.start]), [["entry-a", 10]]);
  assert.deepEqual(built, before);
  const softSource = structuredClone(source);
  softSource.mainFlow.preferredBlockCount = 1;
  const soft = buildAssistedProblem(softSource, scope, fixed, eligible, [], [], [], [], [witness]);
  assert.deepEqual(executeAssistedPlanning(soft).proposal, result.proposal, "SOFT also retains the same entry rematerialization and ledger");
  const updated = result.evidence.futureStructuralWitnesses!.find(item => item.kind === "JOINT_COMPLETION")!;
  assert.equal(updated.kind, "JOINT_COMPLETION");
  assert.notEqual(updated.fingerprint, witness.fingerprint);
  const accepted = [...fixed, result.proposal![0]!];
  const next = buildAssistedProblem(source, scope, accepted, eligible, [], [], [], [], [updated]);
  assert.equal(executeAssistedPlanning(next).evidence.protectedPlacementsPreserved, true);
  // Exhausting improvement work after original replay must still return its proposal.
  const control = runExactItinerantPlanSearch(built.problem, { fixedPlacements: fixed, priorFutureStructuralWitnesses: [witness] });
  built.problem.budget.maxBranchExpansions = control.evidence.branchesExplored + 1;
  const limited = executeAssistedPlanning(built);
  assert.equal(limited.evidence.completeForScope, true);
  assert.deepEqual(limited.proposal?.map(task => [task.id, task.start]), [["entry-a", 40]]);
});

test("the certified PR 1164 C03 case reaches 09:10 with the other 265 obligations unchanged", () => {
  const { adapter, input } = buildCanonicalA2AssistedStage1Fixture();
  const witness: FutureJointCompletionWitnessV1 = JSON.parse(readFileSync(new URL("../../docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/baseline-witness.json", import.meta.url), "utf8"));
  const participantId = adapter.problem.participants.map(person => person.id).sort()[2]!;
  const entryIds = new Set(input.tasks.filter(task => task.templateName === "ESTILISMO_ENTRADA").map(task => `task:${task.id}`));
  const id = witness.tasks.find(task => task.participantId === participantId && entryIds.has(task.id))!.id;
  const fixed = witness.tasks.filter(task => task.id !== id);
  const result = materialize(adapter.problem, witness, [id], fixed);
  assert.deepEqual(result.evidence.moves, [{ taskId: id, from: 685, to: 550 }]);
  assert.equal(result.witness.tasks.length + result.witness.participantMeals.length, 266);
  assert.deepEqual(result.witness.tasks.filter(task => task.id !== id), fixed);
});
