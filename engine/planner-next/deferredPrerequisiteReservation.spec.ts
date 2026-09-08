import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { maintainDeferredPrerequisiteReservation } from "./deferredPrerequisiteReservation";
import { validateTransportGrouping } from "./transportGrouping";

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

function arrivalFixture(count: number, options: { maximum?: number; target?: number; gap?: number; arrivalWindow?: {start:number;end:number}; blocker?: boolean } = {}) {
  const arrivalWindow = options.arrivalWindow ?? { start: 0, end: 20 };
  const arrivals = Array.from({ length: count }, (_, index): Task => ({ id: `arrival-${index}`, kind: "auxiliary",
    participantId: `arrival-p-${index}`, duration: 10, spaceId: "arrival-space", dependencies: [], availability: [arrivalWindow] }));
  const flexible = options.blocker ? [{ id: "flexible", kind: "auxiliary", participantId: "flexible-p", duration: 10,
    spaceId: "arrival-space", dependencies: [], availability: [{ start: 0, end: 20 }] } satisfies Task] : [];
  const successor: Task = { id: "arrival-core", kind: "auxiliary", participantId: "core", duration: 10,
    spaceId: "core-space", dependencies: [...arrivals, ...flexible].map(({ id }) => id) };
  const availability = [{ start: 0, end: 50 }];
  const input: PlannerNextProblem = { day: { start: 0, end: 50 }, spaces: [{ id: "arrival-space", availability },
    { id: "core-space", availability }], resources: [], participants: [...arrivals.map(({ participantId }) => ({ id: participantId!, availability })),
      { id: "flexible-p", availability }, { id: "core", availability }], coaches: [], tasks: [...arrivals, ...flexible, successor],
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0, auxiliaryPolicy: { participantPresencePreference: "OFF" },
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 1, maxBranchExpansions: 10_000 }, searchPolicy: "EXACT_CONSTRUCTIVE",
    transportPolicy: { arrival: { taskIds: arrivals.map(({ id }) => id), minimumGroupSize: 1,
      maximumGroupSize: options.maximum ?? count, targetGroupSize: options.target ?? count, minGapMinutes: options.gap ?? 0, groupingWeight: 1 },
      departure: { taskIds: [], minimumGroupSize: 1, maximumGroupSize: 1, targetGroupSize: 1, minGapMinutes: 0, groupingWeight: 1 } } };
  return { problem: input, pending: [...arrivals, ...flexible], core: [{ ...successor, start: 40, end: 50 }] as ScheduledTask[] };
}

test("a changed first boundary uses a certificate without repairing or branching over ARRIVAL", () => {
  const input = arrivalFixture(4, { maximum: 2, target: 2, gap: 10 });
  const first = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core, [], null, () => true);
  const arrival = input.pending[0]!;
  const macro: ScheduledTask = { id: "macro", kind: "auxiliary", participantId: arrival.participantId,
    duration: 5, spaceId: "core-space", dependencies: [], start: 15, end: 20 };
  let consumed = 0;
  const next = maintainDeferredPrerequisiteReservation(input.problem, input.pending, [...input.core, macro], [],
    first.reservation, () => { consumed += 1; return true; });
  assert.equal(next.feasible, true);
  assert.equal(next.arrivalBranchesExplored, 0);
  assert.equal(next.arrivalRepaired, false);
  assert.deepEqual(next.reservation?.arrivalGroups, []);
  assert.equal(consumed, 0);
});

test("transport demand above optimistic hard capacity prunes cheaply", () => {
  const input = arrivalFixture(3, { maximum: 1, gap: 20, arrivalWindow: { start: 0, end: 30 } });
  const result = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core, [], null, () => true);
  assert.equal(result.feasible, false);
  assert.equal(result.arrivalPruned, true);
  assert.equal(result.arrivalBranchesExplored, 0);
  assert.equal(result.transportEvidence.cumulativeCapacityPrunes, 1);
});

test("transport demand equal to optimistic hard capacity remains viable", () => {
  const input = arrivalFixture(2, { maximum: 1, gap: 20, arrivalWindow: { start: 0, end: 30 } });
  const result = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core, [], null, () => true);
  assert.equal(result.feasible, true);
  assert.equal(result.arrivalBranchesExplored, 0);
});

test("an inconclusive transport certificate keeps the branch open", () => {
  const input = arrivalFixture(2, { maximum: 2, gap: 0, arrivalWindow: { start: 0, end: 20 } });
  const result = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core, [], null, () => true);
  assert.equal(result.feasible, true);
  assert.equal(result.arrivalPruned, false);
  assert.deepEqual(result.reservation?.arrivalGroups, []);
});

test("grouped arrival reservation is deterministic and invariant to input order", () => {
  const input = arrivalFixture(4, { maximum: 2, target: 2, gap: 10 });
  const first = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core, [], null, () => true);
  const reversedProblem = { ...input.problem, tasks: [...input.problem.tasks].reverse(), transportPolicy: {
    ...input.problem.transportPolicy!, arrival: { ...input.problem.transportPolicy!.arrival,
      taskIds: [...input.problem.transportPolicy!.arrival.taskIds].reverse() } } };
  const second = maintainDeferredPrerequisiteReservation(reversedProblem, [...input.pending].reverse(), input.core, [], null, () => true);
  assert.deepEqual(second.reservation, first.reservation);
});

test("arrival remains reserved after its intervening non-transport predecessor materializes", () => {
  const input = arrivalFixture(1);
  const arrival = input.pending[0]!;
  const styling: Task = { id: "styling", kind: "auxiliary", participantId: arrival.participantId, duration: 10,
    spaceId: "core-space", dependencies: [arrival.id], availability: [{ start: 20, end: 30 }] };
  const coreDefinition = input.problem.tasks.find(({ id }) => id === "arrival-core")!;
  coreDefinition.dependencies = [styling.id]; input.problem.tasks.splice(1, 0, styling);
  const first = maintainDeferredPrerequisiteReservation(input.problem, [arrival, styling], input.core, [], null, () => true);
  assert.equal(first.feasible, true);
  const placedStyling = { ...styling, start: 20, end: 30 };
  const afterMaterialization = maintainDeferredPrerequisiteReservation(input.problem, [arrival],
    [...input.core, placedStyling], [], first.reservation, () => true);
  assert.equal(afterMaterialization.feasible, true);
  assert.deepEqual(afterMaterialization.reservation!.arrivalTaskIds, [arrival.id]);
});

test("reservation preserves a hard-predecessor arrival omitted from the standalone pending frontier", () => {
  const input = arrivalFixture(1);
  const first = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core, [], null, () => true);
  const preserved = maintainDeferredPrerequisiteReservation(input.problem, [], input.core, [], first.reservation, () => true);
  assert.equal(preserved.feasible, true);
  assert.equal(preserved.arrivalWitnessDropped, false);
  assert.deepEqual(preserved.reservation?.arrivalTaskIds, [input.pending[0]!.id]);
  assert.deepEqual(preserved.reservation?.arrivalGroups, first.reservation?.arrivalGroups);
});

test("an unrelated configured arrival omitted from pending is not reserved", () => {
  const input = arrivalFixture(1);
  const unrelated: Task = { ...input.pending[0]!, id: "unrelated-arrival", participantId: "unrelated-p" };
  input.problem.tasks.push(unrelated);
  input.problem.participants.push({ id: "unrelated-p", availability: interval });
  input.problem.transportPolicy!.arrival.taskIds = [...input.problem.transportPolicy!.arrival.taskIds, unrelated.id];
  const result = maintainDeferredPrerequisiteReservation(input.problem, [], input.core, [], null, () => true);
  assert.deepEqual(result.reservation?.arrivalTaskIds, [input.pending[0]!.id]);
});

test("an already materialized configured arrival is not reserved again", () => {
  const input = arrivalFixture(1); const arrival = input.pending[0]!;
  const result = maintainDeferredPrerequisiteReservation(input.problem, [arrival],
    [...input.core, { ...arrival, start: 0, end: arrival.duration }], [], null, () => true);
  assert.deepEqual(result.reservation?.arrivalTaskIds, []);
  assert.deepEqual(result.reservation?.arrivalGroups, []);
});

test("arrival propagation leaves problem, pending, and placed inputs immutable", () => {
  const input = arrivalFixture(2);
  const before = JSON.stringify(input);
  maintainDeferredPrerequisiteReservation(input.problem, [], input.core, [], null, () => true);
  assert.equal(JSON.stringify(input), before);
});
