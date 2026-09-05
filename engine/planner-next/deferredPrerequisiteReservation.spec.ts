import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { maintainDeferredPrerequisiteReservation } from "./deferredPrerequisiteReservation";

const interval = [{ start: 0, end: 60 }];
function fixture(count: number, window = { start: 0, end: 30 }): { problem: PlannerNextProblem; pending: Task[]; core: ScheduledTask[] } {
  const pending = Array.from({ length: count }, (_, index): Task => ({ id: `pre-${index}`, kind: "auxiliary",
    participantId: `p-${index}`, duration: 10, spaceId: "shared", dependencies: [], availability: [window] }));
  const successor: Task = { id: "core", kind: "auxiliary", participantId: "core", duration: 10,
    spaceId: "core-space", dependencies: pending.map(({ id }) => id) };
  return { pending, core: [{ ...successor, start: 40, end: 50 }], problem: {
    day: { start: 0, end: 60 }, spaces: [{ id: "shared", availability: interval }, { id: "core-space", availability: interval }],
    resources: [], participants: [...pending.map(({ participantId }) => ({ id: participantId!, availability: interval })),
      { id: "core", availability: interval }, { id: "blocker", availability: interval }], coaches: [],
    tasks: [...pending, successor], participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    auxiliaryPolicy: { participantPresencePreference: "OFF" }, budget: { bestK: 1, maxBacktracks: 0,
      maxPatterns: 1, maxBranchExpansions: 10_000 }, searchPolicy: "EXACT_CONSTRUCTIVE",
  } };
}

const blocker = (id: string, start: number, end: number): ScheduledTask => ({ id, kind: "auxiliary", participantId: "blocker",
  duration: end - start, spaceId: "shared", dependencies: [], start, end });

test("joint reservation rejects more than six individually nonempty predecessors that cannot share the exclusive space", () => {
  const input = fixture(7, { start: 0, end: 20 }); let consumed = 0;
  const result = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core, [], null, () => { consumed++; return true; });
  assert.equal(result.feasible, false); assert.equal(result.branchesExplored, consumed); assert.ok(consumed > 0);
});

test("an invalidated witness is repaired branch-locally when another joint distribution exists", () => {
  const input = fixture(2); let consumed = 0;
  const first = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core, [], null, () => { consumed++; return true; });
  assert.equal(first.feasible, true); assert.deepEqual(first.reservation!.witness.map(({ start }) => start), [20, 10]);
  const repaired = maintainDeferredPrerequisiteReservation(input.problem, input.pending, [...input.core, blocker("later", 20, 30)], [], first.reservation, () => { consumed++; return true; });
  assert.equal(repaired.feasible, true); assert.equal(repaired.repaired, true);
  assert.deepEqual(repaired.reservation!.witness.map(({ start }) => start), [10, 0]);
});

test("the exact candidate that destroys the final joint distribution is pruned", () => {
  const input = fixture(2); const first = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core, [], null, () => true);
  const failed = maintainDeferredPrerequisiteReservation(input.problem, input.pending,
    [...input.core, blocker("early", 0, 10), blocker("late", 20, 30)], [], first.reservation, () => true);
  assert.equal(failed.feasible, false); assert.equal(failed.repaired, true);
});

test("reservation is virtual and its late compact witness is not added to materialized placements", () => {
  const input = fixture(2); const placed = [...input.core];
  const result = maintainDeferredPrerequisiteReservation(input.problem, input.pending, placed, [], null, () => true);
  assert.equal(result.feasible, true); assert.deepEqual(placed, input.core);
  assert.deepEqual(result.reservation!.witness.map(({ start }) => start), [20, 10]);
});

test("unchanged branch-local witnesses require no hidden exploration and are deterministic", () => {
  const input = fixture(2); const first = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core, [], null, () => true);
  let consumed = 0;
  const reused = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core, [], first.reservation, () => { consumed++; return true; });
  assert.equal(reused.reservation, first.reservation); assert.equal(reused.branchesExplored, 0); assert.equal(consumed, 0);
});
