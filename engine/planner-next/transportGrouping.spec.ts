import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task, TransportGroupingPolicy } from "./contracts";
import { executePlannerNext } from "./executePlannerNext";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import {
  transportGroupCandidates,
  validateTransportGrouping,
} from "./transportGrouping";
import { preflight } from "./validate";
import { validatePlan } from "./validate";

const policy = (minimumGroupSize = 3, maximumGroupSize = 4, minGapMinutes = 20): TransportGroupingPolicy => ({
  taskIds: [], minimumGroupSize, maximumGroupSize, minGapMinutes, groupingWeight: 3,
});
const tasks = (count: number): Task[] => Array.from({ length: count }, (_, index) => ({
  id: `transport-${String(index).padStart(2, "0")}`, kind: "auxiliary", participantId: `p-${index}`,
  duration: 10, spaceId: "transport", dependencies: [],
}));

test("candidate partitions honor minimum, maximum, and never leave a small residual", () => {
  const seven = transportGroupCandidates(tasks(7), policy());
  assert.ok(seven.length > 0);
  assert.ok(seven.every((group) => group.length === 3 || group.length === 4));
  assert.deepEqual(transportGroupCandidates(tasks(5), policy()), []);
  assert.ok(transportGroupCandidates(tasks(6), policy()).every((group) => group.length === 3));
});

function validationProblem(count = 7): PlannerNextProblem {
  const transportTasks = tasks(count);
  return {
    ...mainFlowVocalScenario(),
    transportPolicy: {
      arrival: { ...policy(), taskIds: transportTasks.map(({ id }) => id) },
      departure: { ...policy(2, 4, 10), taskIds: [] },
    },
    tasks: transportTasks,
  };
}
const scheduled = (task: Task, start: number): ScheduledTask => ({ ...task, start, end: start + task.duration });

test("independent validation enforces coverage, synchronization, bounds, and consecutive-start gap", () => {
  const problem = validationProblem();
  const [a, b, c, d, e, f, g] = problem.tasks;
  const valid = [a, b, c].map((task) => scheduled(task!, 600)).concat([d, e, f, g].map((task) => scheduled(task!, 620)));
  assert.equal(validateTransportGrouping(problem, valid).violationCount, 0);
  assert.ok(validateTransportGrouping(problem, valid.slice(1)).violationCount > 0, "missing task");
  assert.ok(validateTransportGrouping(problem, valid.map((task) => task.id === c!.id ? { ...task, start: 605, end: 615 } : task)).violationCount > 0, "unsynchronized residual");
  assert.ok(validateTransportGrouping(problem, valid.map((task) => task.start === 620 ? { ...task, start: 615, end: 625 } : task)).violationCount > 0, "gap");
});

test("simultaneous groups are partitionable with zero gap and rejected with a positive gap", () => {
  const zeroGap = validationProblem(6);
  zeroGap.transportPolicy!.arrival = { ...policy(2, 3, 0), taskIds: zeroGap.tasks.map(({ id }) => id) };
  const simultaneous = zeroGap.tasks.map((task) => scheduled(task, 600));
  assert.equal(validateTransportGrouping(zeroGap, simultaneous).violationCount, 0);
  const positiveGap = structuredClone(zeroGap);
  positiveGap.transportPolicy!.arrival.minGapMinutes = 5;
  assert.ok(validateTransportGrouping(positiveGap, simultaneous).violationCount > 0);
});

function exactProblem(orderReversed = false): PlannerNextProblem {
  const window = [{ start: 0, end: 120 }];
  const transportParticipants = Array.from({ length: 6 }, (_, index) => ({ id: `transport-p-${index}`, availability: window }));
  const transportTasks = transportParticipants.map((participant, index): Task => ({
    id: `arrival-${participant.id}`, kind: "auxiliary", participantId: participant.id,
    duration: 10, spaceId: `transport-${index}`, dependencies: [], availability: [{ start: index < 3 ? 0 : 20, end: index < 3 ? 10 : 30 }],
  }));
  const problem: PlannerNextProblem = {
    day: { start: 0, end: 120 }, protectedMeal: { start: 110, end: 120 }, resources: [],
    spaces: ["main", "vocal", ...transportParticipants.map((_, index) => `transport-${index}`)]
      .map((id) => ({ id, availability: window })),
    participants: [{ id: "core", availability: window }, ...transportParticipants],
    coaches: [{ id: "coach", availability: window }],
    tasks: [
      { id: "vocal", kind: "vocal", participantId: "core", coachId: "coach", duration: 10, spaceId: "vocal", dependencies: [] },
      { id: "main", kind: "main", participantId: "core", coachId: "coach", duration: 10, spaceId: "main", dependencies: ["vocal"], blockKey: "coach" },
      ...transportTasks,
    ],
    mainFlow: { spaceId: "main", preferredEnd: 100, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    budget: { bestK: 1, maxBacktracks: 100, maxPatterns: 20, maxBranchExpansions: 20_000 },
    auxiliaryPolicy: { participantPresencePreference: "OFF" }, searchPolicy: "EXACT_CONSTRUCTIVE",
    transportPolicy: {
    arrival: { ...policy(3, 3, 20), taskIds: transportTasks.map(({ id }) => id) },
    departure: { ...policy(2, 4, 10), taskIds: [] },
    },
  };
  if (orderReversed) {
    problem.tasks.reverse(); problem.participants.reverse(); problem.spaces.reverse();
    problem.transportPolicy.arrival.taskIds.reverse();
  }
  return problem;
}

test("exact constructive jointly chooses conflict-free synchronized groups deterministically and order-invariantly", () => {
  const original = exactProblem(), snapshot = structuredClone(original);
  assert.deepEqual(preflight(original), []);
  const manual = original.tasks.map((task, index) => scheduled(task,
    task.id.startsWith("arrival-") ? (Number(task.id.at(-1)) < 3 ? 0 : 20) : task.id === "vocal" ? 80 : 90));
  assert.equal(validatePlan(original, manual).hardValid, true, JSON.stringify(validatePlan(original, manual)));
  const first = executePlannerNext(original), again = executePlannerNext(exactProblem()), reversed = executePlannerNext(exactProblem(true));
  assert.equal(first.kind, "EXACT_CONSTRUCTIVE");
  assert.equal(again.kind, "EXACT_CONSTRUCTIVE");
  assert.equal(reversed.kind, "EXACT_CONSTRUCTIVE");
  assert.equal(first.result?.complete, true, JSON.stringify(first.result && { status: first.result.status, reasons: first.result.evidence.reasonCodes, coreReasons: first.result.evidence.coreReasonCodes, branches: first.result.evidence.branchesExplored }));
  assert.equal(first.result?.evidence.fullFingerprint, again.result?.evidence.fullFingerprint);
  assert.equal(first.result?.evidence.fullFingerprint, reversed.result?.evidence.fullFingerprint);
  assert.deepEqual(original, snapshot);
  const transport = first.result!.scheduledTasks.filter(({ id }) => id.startsWith("arrival-"));
  assert.equal(validateTransportGrouping(original, transport).violationCount, 0);
  assert.equal(new Set(transport.map(({ start }) => start)).size, 2);
});

function arrivalWorkStyleDepartureProblem(reverse = false, departureCount = 2): PlannerNextProblem {
  const window = [{ start: 0, end: 140 }];
  const people = Array.from({ length: departureCount }, (_, index) => `p-${index}`);
  const auxiliaryTasks: Task[] = people.flatMap((participantId, index) => {
    const departureStart = departureCount === 2 || index < departureCount / 2 ? 80 : 100;
    return [
      { id: `in-${participantId}`, kind: "auxiliary", participantId, duration: 10, spaceId: `in-${index}`, dependencies: [], availability: [{ start: 0, end: 10 }] },
      { id: `work-${participantId}`, kind: "auxiliary", participantId, duration: 10, spaceId: `work-${index}`, dependencies: [], availability: [{ start: 20, end: 30 }] },
      { id: `style-${participantId}`, kind: "auxiliary", participantId, duration: 10, spaceId: `style-${index}`, dependencies: [], availability: [{ start: 40, end: 50 }] },
      { id: `out-${participantId}`, kind: "auxiliary", participantId, duration: 10, spaceId: `out-${index}`, dependencies: [`style-${participantId}`], availability: [{ start: departureStart, end: departureStart + 10 }] },
    ];
  });
  const allSpaces = ["main", "vocal", ...auxiliaryTasks.map(({ spaceId }) => spaceId)];
  const problem: PlannerNextProblem = {
    day: { start: 0, end: 140 }, protectedMeal: { start: 130, end: 140 }, resources: [],
    spaces: [...new Set(allSpaces)].map((id) => ({ id, availability: window })),
    participants: [{ id: "core", availability: window }, ...people.map((id) => ({ id, availability: window }))],
    coaches: [{ id: "coach", availability: window }],
    tasks: [
      { id: "vocal", kind: "vocal", participantId: "core", coachId: "coach", duration: 10, spaceId: "vocal", dependencies: [] },
      { id: "main", kind: "main", participantId: "core", coachId: "coach", duration: 10, spaceId: "main", dependencies: ["vocal"], blockKey: "coach" },
      ...auxiliaryTasks,
    ],
    mainFlow: { spaceId: "main", preferredEnd: 120, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    budget: { bestK: 1, maxBacktracks: 100, maxPatterns: 20, maxBranchExpansions: 100_000 },
    auxiliaryPolicy: { participantPresencePreference: "OFF" }, searchPolicy: "EXACT_CONSTRUCTIVE",
    transportPolicy: {
      arrival: { ...policy(2, 2, 0), taskIds: people.map((id) => `in-${id}`) },
      departure: { ...policy(departureCount === 2 ? 2 : 2, departureCount === 2 ? 2 : 4, 20), taskIds: people.map((id) => `out-${id}`) },
    },
  };
  if (reverse) {
    problem.tasks.reverse(); problem.participants.reverse(); problem.spaces.reverse();
    problem.transportPolicy!.arrival.taskIds.reverse(); problem.transportPolicy!.departure.taskIds.reverse();
  }
  return problem;
}

test("independent transport validation enforces IN first and OUT last even beyond dependency edges", () => {
  const problem = arrivalWorkStyleDepartureProblem();
  const execution = executePlannerNext(problem);
  assert.equal(execution.kind, "EXACT_CONSTRUCTIVE");
  assert.equal(execution.result?.complete, true);
  const valid = execution.result!.scheduledTasks;
  assert.equal(validateTransportGrouping(problem, valid).violationCount, 0);

  const lateArrival = valid.map((task) => task.id.startsWith("in-") ? { ...task, start: 60, end: 70 } : task);
  assert.ok(validateTransportGrouping(problem, lateArrival).violationCount > 0, "IN after participant work must fail");
  const earlyDeparture = valid.map((task) => task.id.startsWith("out-") ? { ...task, start: 30, end: 40 } : task);
  assert.ok(validateTransportGrouping(problem, earlyDeparture).violationCount > 0, "OUT before participant work must fail");
});

test("exact continuation constructs IN first, work, ESTILISMO_SALIDA, then dependent OUT last immutably and order-invariantly", () => {
  const problem = arrivalWorkStyleDepartureProblem(), snapshot = structuredClone(problem);
  const first = executePlannerNext(problem), repeated = executePlannerNext(arrivalWorkStyleDepartureProblem());
  const reversed = executePlannerNext(arrivalWorkStyleDepartureProblem(true));
  assert.equal(first.kind, "EXACT_CONSTRUCTIVE"); assert.equal(first.result?.complete, true);
  assert.equal(repeated.kind, "EXACT_CONSTRUCTIVE"); assert.equal(reversed.kind, "EXACT_CONSTRUCTIVE");
  assert.equal(first.result!.evidence.fullFingerprint, repeated.result!.evidence.fullFingerprint);
  assert.equal(first.result!.evidence.fullFingerprint, reversed.result!.evidence.fullFingerprint);
  for (const incoming of first.result!.scheduledTasks.filter(({ id }) => id.startsWith("in-"))) {
    const other = first.result!.scheduledTasks.filter((task) => task.participantId === incoming.participantId && task.id !== incoming.id);
    assert.ok(other.every((task) => incoming.end <= task.start), `${incoming.id} must be first`);
  }
  for (const out of first.result!.scheduledTasks.filter(({ id }) => id.startsWith("out-"))) {
    const style = first.result!.scheduledTasks.find(({ id }) => id === out.dependencies[0])!;
    assert.ok(out.start >= style.end);
    const other = first.result!.scheduledTasks.filter((task) => task.participantId === out.participantId && task.id !== out.id);
    assert.ok(other.every((task) => task.end <= out.start), `${out.id} must be last`);
  }
  assert.deepEqual(problem, snapshot);
});

test("an unusable preferred OUT grouping backtracks to a valid partition under the shared ledger", () => {
  const problem = arrivalWorkStyleDepartureProblem(false, 6);
  problem.transportPolicy!.arrival.taskIds = [];
  problem.transportPolicy!.departure = { ...policy(2, 4, 20), taskIds: problem.transportPolicy!.departure.taskIds };
  const result = executePlannerNext(problem);
  assert.equal(result.kind, "EXACT_CONSTRUCTIVE"); assert.equal(result.result?.complete, true);
  assert.ok(result.result!.evidence.standaloneBacktracks > 0);
  const outs = result.result!.scheduledTasks.filter(({ id }) => id.startsWith("out-"));
  assert.deepEqual([...new Set(outs.map(({ start }) => start))], [80, 100]);
  assert.deepEqual([...new Set(outs.map(({ start }) => outs.filter((other) => other.start === start).length))], [3]);
});
