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
