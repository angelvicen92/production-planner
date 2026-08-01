import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, Task } from "./contracts";
import { constructExactMainAndFeederCore } from "./exactMainAndFeederCore";
import { constructExactItinerantPlan } from "./exactItinerantPlan";
import { validatePlan } from "./validate";

function problem(auxiliaries: Task[]): PlannerNextProblem {
  const availability = [{ start: 0, end: 120 }];
  const participantIds = ["core", ...auxiliaries.flatMap((task) => task.kind === "technical" ? [] : [task.participantId])];
  const spaceIds = ["main", "vocal", ...auxiliaries.map(({ spaceId }) => spaceId)];
  return {
    day: { start: 0, end: 120 }, protectedMeal: { start: 110, end: 120 },
    spaces: [...new Set(spaceIds)].map((id) => ({ id, availability })),
    resources: [{ id: "unit", availability, presencePreference: "OFF", transitionMinutes: 0 }],
    participants: [...new Set(participantIds)].map((id) => ({ id, availability })),
    coaches: [{ id: "coach", availability }],
    tasks: [
      { id: "vocal", kind: "vocal", participantId: "core", coachId: "coach", duration: 10, spaceId: "vocal", dependencies: [] },
      { id: "main", kind: "main", participantId: "core", coachId: "coach", duration: 10, spaceId: "main", dependencies: ["vocal"], blockKey: "coach" },
      ...auxiliaries,
    ],
    mainFlow: { spaceId: "main", preferredEnd: 100, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    auxiliaryPolicy: { participantPresencePreference: "OFF" },
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 20, maxBranchExpansions: 20_000 },
    searchPolicy: "EXACT_CONSTRUCTIVE",
  };
}

const auxiliary = (id: string, participantId: string, availability: Array<{ start: number; end: number }>,
  requiredResourceIds: string[] = []): Task => ({ id, kind: "auxiliary", participantId, duration: 10,
  spaceId: `space-${id}`, dependencies: [], availability, requiredResourceIds });

test("compatible standalone tasks complete atomically and preserve the exact core", () => {
  const input = problem([auxiliary("a", "a", [{ start: 0, end: 20 }]), auxiliary("b", "b", [{ start: 20, end: 40 }])]);
  const before = structuredClone(input), core = constructExactMainAndFeederCore(input), result = constructExactItinerantPlan(input);
  assert.equal(result.status, "COMPLETE"); assert.equal(result.scheduledTasks.length, 4);
  assert.deepEqual(result.scheduledTasks.filter(({ id }) => new Set(core.scheduledTasks.map((task) => task.id)).has(id)), core.scheduledTasks);
  assert.equal(validatePlan(input, result.scheduledTasks, [], result.scheduledSpaceMeals).hardValid, true);
  assert.deepEqual(input, before); assert.deepEqual(result.remainingTaskIds, []);
});

test("shared resources never overlap and the narrower task is selected first", () => {
  const input = problem([
    auxiliary("flexible", "a", [{ start: 0, end: 60 }], ["unit"]),
    auxiliary("narrow", "b", [{ start: 10, end: 20 }], ["unit"]),
  ]);
  const result = constructExactItinerantPlan(input);
  assert.equal(result.status, "COMPLETE"); assert.equal(result.evidence.selectedStandaloneTaskIds[0], "flexible");
  const tasks = result.scheduledTasks.filter(({ id }) => id === "flexible" || id === "narrow").sort((a, b) => a.start - b.start);
  assert.ok(tasks[0]!.end <= tasks[1]!.start); assert.equal(result.evidence.standaloneMaximumDepth, 2);
});

test("bestK=1 retains a deferred start and exact DFS backtracks", () => {
  const input = problem([
    auxiliary("a-first", "shared", [{ start: 0, end: 30 }], ["unit"]),
    auxiliary("z-fixed", "other", [{ start: 0, end: 10 }], ["unit"]),
  ]);
  input.tasks.find(({ id }) => id === "a-first")!.duration = 20;
  const result = constructExactItinerantPlan(input);
  assert.equal(result.status, "COMPLETE"); assert.equal(input.budget.bestK, 1);
  assert.equal(result.scheduledTasks.find(({ id }) => id === "z-fixed")!.start, 0);
});

test("zero alternatives are infeasible and failures publish no partial core", () => {
  const input = problem([auxiliary("impossible", "a", [{ start: 0, end: 5 }])]);
  const result = constructExactItinerantPlan(input);
  assert.equal(result.status, "INFEASIBLE"); assert.equal(result.evidence.standaloneZeroAlternativePrunes, 1);
  assert.deepEqual(result.scheduledTasks, []); assert.deepEqual(result.scheduledSpaceMeals, []);
});

test("unsupported standalone shapes are explicit and atomic", () => {
  const input = problem([{ id: "technical", kind: "technical", duration: 10, spaceId: "technical", dependencies: [] }]);
  const result = constructExactItinerantPlan(input);
  assert.equal(result.status, "UNSUPPORTED_STANDALONE_SHAPE");
  assert.ok(result.evidence.reasonCodes.includes("UNSUPPORTED_STANDALONE_TASK_KIND:technical"));
  assert.deepEqual(result.scheduledTasks, []);
});

test("the global branch threshold completes at B and B-1 exhausts exactly", () => {
  const baseline = problem([auxiliary("a", "a", [{ start: 0, end: 10 }])]);
  const complete = constructExactItinerantPlan(baseline); assert.equal(complete.status, "COMPLETE");
  const threshold = complete.evidence.branchesExplored;
  const exact = problem([auxiliary("a", "a", [{ start: 0, end: 10 }])]); exact.budget.maxBranchExpansions = threshold;
  assert.equal(constructExactItinerantPlan(exact).status, "COMPLETE");
  const below = problem([auxiliary("a", "a", [{ start: 0, end: 10 }])]); below.budget.maxBranchExpansions = threshold - 1;
  const exhausted = constructExactItinerantPlan(below);
  assert.equal(exhausted.status, "BRANCH_BUDGET_EXHAUSTED"); assert.equal(exhausted.evidence.branchesExplored, threshold - 1);
  assert.deepEqual(exhausted.scheduledTasks, []);
});

test("results are deterministic and invariant to input collection order", () => {
  const create = () => problem([auxiliary("a", "a", [{ start: 0, end: 20 }]), auxiliary("b", "b", [{ start: 20, end: 40 }])]);
  const first = constructExactItinerantPlan(create()), second = constructExactItinerantPlan(create()), reversedInput = create();
  reversedInput.tasks.reverse(); reversedInput.participants.reverse(); reversedInput.spaces.reverse(); reversedInput.resources.reverse();
  const reversed = constructExactItinerantPlan(reversedInput);
  assert.deepEqual(first, second); assert.equal(first.evidence.fullFingerprint, reversed.evidence.fullFingerprint);
  assert.deepEqual(first.scheduledTasks, reversed.scheduledTasks);
});
