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

test("necessary-only feasibility does not spend ledger branches or false-prune an inconclusive ordinary case", () => {
  const input = fixture(7, { start: 0, end: 20 });
  const result = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core);
  assert.equal(result.feasible, true); assert.equal(result.branchesExplored, 0);
});

test("future feasibility selects no starts and leaves materialization to normal search", () => {
  const input = fixture(2); const placed = [...input.core];
  const result = maintainDeferredPrerequisiteReservation(input.problem, input.pending, placed);
  assert.equal(result.feasible, true); assert.deepEqual(placed, input.core);
  assert.equal(result.branchesExplored, 0);
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

test("the initial virtual reservation is built from the effective core deadline", () => {
  const input = arrivalFixture(4, { maximum: 2, target: 2, gap: 10 });
  const arrival = input.pending[0]!;
  const macro: ScheduledTask = { id: "macro", kind: "auxiliary", participantId: arrival.participantId,
    duration: 5, spaceId: "core-space", dependencies: [], start: 15, end: 20 };
  const next = maintainDeferredPrerequisiteReservation(input.problem, input.pending, [...input.core, macro]);
  assert.equal(next.feasible, true);
  assert.ok(next.arrivalBranchesExplored > 0);
  assert.equal(next.arrivalRepaired, false);
  assert.ok(next.reservation.groups.length > 0);
  assert.equal(next.reservation.deadlines[arrival.id], 15);
});

test("ordinary reservation prunes a pending-IN deadline deficit before exact DFS", () => {
  const input = arrivalFixture(3, { maximum: 1, gap: 20, arrivalWindow: { start: 0, end: 30 } });
  const result = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core);
  assert.equal(result.feasible, false);
  assert.equal(result.arrivalPruned, true);
  assert.equal(result.arrivalBranchesExplored, 0);
  assert.equal(result.branchesExplored, 0);
  assert.equal(result.pendingArrivalDeadline.prunes, 1);
  assert.equal(result.exactPrerequisiteSearchesAvoided, 1);
  assert.deepEqual(result.pendingArrivalDeadline.firstCertificate, { cutoff: 30, demand: 3,
    maximumPossible: 2, participantIds: ["arrival-p-0", "arrival-p-1", "arrival-p-2"] });
});

test("transport demand equal to optimistic hard capacity remains viable", () => {
  const input = arrivalFixture(2, { maximum: 1, gap: 20, arrivalWindow: { start: 0, end: 30 } });
  const result = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core);
  assert.equal(result.feasible, true);
  assert.ok(result.arrivalBranchesExplored > 0);
  assert.equal(result.pendingArrivalDeadline.prunes, 0);
});

test("an inconclusive transport certificate keeps the branch open", () => {
  const input = arrivalFixture(2, { maximum: 2, gap: 0, arrivalWindow: { start: 0, end: 20 } });
  const result = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core);
  assert.equal(result.feasible, true);
  assert.equal(result.arrivalPruned, false);
});

test("arrival future feasibility is deterministic and invariant to input order", () => {
  const input = arrivalFixture(4, { maximum: 2, target: 2, gap: 10 });
  const first = maintainDeferredPrerequisiteReservation(input.problem, input.pending, input.core);
  const reversedProblem = { ...input.problem, tasks: [...input.problem.tasks].reverse(), transportPolicy: {
    ...input.problem.transportPolicy!, arrival: { ...input.problem.transportPolicy!.arrival,
      taskIds: [...input.problem.transportPolicy!.arrival.taskIds].reverse() } } };
  const second = maintainDeferredPrerequisiteReservation(reversedProblem, [...input.pending].reverse(), input.core);
  assert.deepEqual(second, first);
});

test("arrival feasibility remains checked after its intervening non-transport predecessor materializes", () => {
  const input = arrivalFixture(1);
  const arrival = input.pending[0]!;
  const styling: Task = { id: "styling", kind: "auxiliary", participantId: arrival.participantId, duration: 10,
    spaceId: "core-space", dependencies: [arrival.id], availability: [{ start: 20, end: 30 }] };
  const coreDefinition = input.problem.tasks.find(({ id }) => id === "arrival-core")!;
  coreDefinition.dependencies = [styling.id]; input.problem.tasks.splice(1, 0, styling);
  const first = maintainDeferredPrerequisiteReservation(input.problem, [arrival, styling], input.core);
  assert.equal(first.feasible, true);
  const placedStyling = { ...styling, start: 20, end: 30 };
  const afterMaterialization = maintainDeferredPrerequisiteReservation(input.problem, [arrival],
    [...input.core, placedStyling]);
  assert.equal(afterMaterialization.feasible, true);
});

test("feasibility includes a hard-predecessor arrival omitted from the standalone pending frontier", () => {
  const input = arrivalFixture(1);
  const preserved = maintainDeferredPrerequisiteReservation(input.problem, [], input.core);
  assert.equal(preserved.feasible, true);
  assert.equal(preserved.arrivalWitnessDropped, false);
});

test("an unrelated configured arrival omitted from pending is not reserved", () => {
  const input = arrivalFixture(1);
  const unrelated: Task = { ...input.pending[0]!, id: "unrelated-arrival", participantId: "unrelated-p" };
  input.problem.tasks.push(unrelated);
  input.problem.participants.push({ id: "unrelated-p", availability: interval });
  input.problem.transportPolicy!.arrival.taskIds = [...input.problem.transportPolicy!.arrival.taskIds, unrelated.id];
  const result = maintainDeferredPrerequisiteReservation(input.problem, [], input.core);
  assert.equal(result.feasible, true);
});

test("an already materialized configured arrival is not reserved again", () => {
  const input = arrivalFixture(1); const arrival = input.pending[0]!;
  const result = maintainDeferredPrerequisiteReservation(input.problem, [arrival],
    [...input.core, { ...arrival, start: 0, end: arrival.duration }]);
  assert.equal(result.feasible, true);
});

test("arrival propagation leaves problem, pending, and placed inputs immutable", () => {
  const input = arrivalFixture(2);
  const before = JSON.stringify(input);
  maintainDeferredPrerequisiteReservation(input.problem, [], input.core);
  assert.equal(JSON.stringify(input), before);
});

test("a valid virtual witness is reused without search and unrelated work preserves it", () => {
  const input=arrivalFixture(2,{maximum:2,target:2});
  const initial=maintainDeferredPrerequisiteReservation(input.problem,input.pending,input.core);
  const unrelated:ScheduledTask={id:"unrelated",kind:"auxiliary",participantId:"core",duration:5,
    spaceId:"core-space",dependencies:[],start:50,end:55};
  const next=maintainDeferredPrerequisiteReservation(input.problem,input.pending,[...input.core,unrelated],[],initial.reservation);
  assert.equal(next.feasible,true);assert.equal(next.arrivalBranchesExplored,0);
  assert.equal(next.arrivalRepaired,false);assert.equal(next.reservation.fingerprint,initial.reservation.fingerprint);
});

test("an earlier participant obligation deterministically repairs the virtual witness", () => {
  const input=arrivalFixture(2,{maximum:1,target:1,gap:10,arrivalWindow:{start:0,end:30}});
  const initial=maintainDeferredPrerequisiteReservation(input.problem,input.pending,input.core);
  const arrival=input.pending[1]!;const earlier:ScheduledTask={id:"earlier",kind:"auxiliary",
    participantId:arrival.participantId,duration:5,spaceId:"core-space",dependencies:[],start:25,end:30};
  const repaired=maintainDeferredPrerequisiteReservation(input.problem,input.pending,[...input.core,earlier],[],initial.reservation,()=>true,earlier.id);
  assert.equal(repaired.feasible,true);assert.equal(repaired.arrivalRepaired,true);
  assert.notEqual(repaired.reservation.fingerprint,initial.reservation.fingerprint);
  assert.equal(repaired.causalDiagnostic?.causingTaskId,earlier.id);
});

test("an exact no-witness repair rejects instead of dropping a viable branch", () => {
  const input=arrivalFixture(2,{maximum:1,target:1,gap:20,arrivalWindow:{start:0,end:30}});
  const initial=maintainDeferredPrerequisiteReservation(input.problem,input.pending,input.core);
  const arrival=input.pending[1]!;const impossible:ScheduledTask={id:"too-early",kind:"auxiliary",
    participantId:arrival.participantId,duration:5,spaceId:"core-space",dependencies:[],start:5,end:10};
  const result=maintainDeferredPrerequisiteReservation(input.problem,input.pending,[...input.core,impossible],[],initial.reservation);
  assert.equal(result.feasible,false);assert.equal(result.arrivalPruned,true);assert.equal(result.arrivalWitnessDropped,true);
});
