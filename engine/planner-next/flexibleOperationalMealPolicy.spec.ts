import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { executePlannerNext } from "./executePlannerNext";
import { adaptEngineInputToPlannerNextProblem } from "./integration/engineInputAdapter";
import { createSupportedEngineInputAdapterFixture } from "./integration/engineInputAdapter.fixture";
import { preflightEngineInputForPlannerNext } from "./integration/engineInputPreflight";
import { resolveFlexibleOperationalMealPolicies } from "./integration/flexibleOperationalMealPolicies";
import { operationalMealCandidates, operationalMealFreeIntervals, probeOperationalMealFutureFeasibility } from "./operationalMeals";
import { validatePlan } from "./validate";

// Core-leaf validation intentionally precedes operational-meal materialization; this regression
// proves the final exact continuation owns and validates the scoped meal witness atomically.
function fixture() {
  const input = createSupportedEngineInputAdapterFixture();
  input.mealMode = "flexible_meal_window";
  input.mealWindow = { start: "13:00", end: "16:30" };
  input.operationalMealPolicies = [
    { id: "space-meal", window: { start: "13:00", end: "16:30" }, durationMinutes: 75, planResourceItemIds: [504], spaceIds: [301] },
    { id: "reality-meal", window: { start: "13:00", end: "16:30" }, durationMinutes: 75, planResourceItemIds: [503, 502], spaceIds: [] },
  ];
  return input;
}

test("operational meal scope accepts space-only and resource-only policies but rejects an empty scope", () => {
  const input = fixture();
  input.operationalMealPolicies = [
    { id: "space-only", window: { start: "13:00", end: "16:30" }, durationMinutes: 75, planResourceItemIds: [], spaceIds: [301] },
    { id: "resource-only", window: { start: "13:00", end: "16:30" }, durationMinutes: 45, planResourceItemIds: [503], spaceIds: [] },
  ];
  assert.deepEqual(resolveFlexibleOperationalMealPolicies(input).map(({ id, status }) => ({ id, status })), [
    { id: "resource-only", status: "SUPPORTED" }, { id: "space-only", status: "SUPPORTED" },
  ]);
  input.operationalMealPolicies.push({ id: "empty", window: { start: "13:00", end: "16:30" }, durationMinutes: 45, planResourceItemIds: [], spaceIds: [] });
  assert.equal(resolveFlexibleOperationalMealPolicies(input).find(({ id }) => id === "empty")?.status, "UNSUPPORTED");
});

test("operational meals use real productive boundaries and keep non-preferred alternatives", () => {
  const problem = exactMealProblem();
  const policy = problem.operationalMealPolicies![0]!;
  const tasks = [
    { ...problem.tasks[1]!, id: "a", blockKey: "one", start: 10, end: 20 },
    { ...problem.tasks[1]!, id: "b", blockKey: "two", start: 30, end: 40 },
    { ...problem.tasks[1]!, id: "c", blockKey: "two", start: 50, end: 60 },
  ] as ScheduledTask[];
  policy.window = { start: 20, end: 60 };
  const candidates = operationalMealCandidates(problem, policy, tasks, []);
  assert.deepEqual(candidates.map(({ start, preferredBoundary }) => ({ start, preferredBoundary })), [
    { start: 20, preferredBoundary: true }, { start: 40, preferredBoundary: false },
  ]);
  assert.ok(candidates.every((meal) => tasks.every((task) => task.end <= meal.start || meal.end <= task.start)));
  tasks[1]!.start = 25;
  assert.deepEqual(operationalMealCandidates(problem, policy, tasks, []).map(({ start }) => start), [40]);
});

test("CORE meal probe rejects a closed 45-minute operational domain and preserves a full interval", () => {
  const problem = exactMealProblem();
  problem.tasks[0]!.spaceId = "main";
  problem.operationalMealPolicies = [{ id: "operations-meal", window: { start: 10, end: 65 }, duration: 45,
    resourceIds: [], spaceIds: ["main"] }];
  const closed = [
    { ...problem.tasks[0]!, start: 0, end: 10 },
    { ...problem.tasks[1]!, start: 50, end: 60 },
  ] as ScheduledTask[];
  assert.equal(probeOperationalMealFutureFeasibility(problem, closed).feasible, false);
  closed[1] = { ...closed[1]!, start: 55, end: 65 };
  assert.equal(probeOperationalMealFutureFeasibility(problem, closed).feasible, true);
});

function boundaryPolicyProblem(): PlannerNextProblem {
  const problem = exactMealProblem();
  problem.tasks = [
    { id: "left", kind: "auxiliary", participantId: "core", duration: 10, spaceId: "main", dependencies: [] },
    { id: "right", kind: "auxiliary", participantId: "core", duration: 10, spaceId: "main", dependencies: [] },
    { id: "unrelated", kind: "main", participantId: "core", blockKey: "core", duration: 10, spaceId: "vocal", dependencies: [] },
  ];
  problem.operationalMealPolicies = [{ id: "operations", window: { start: 10, end: 100 }, duration: 75,
    resourceIds: [], spaceIds: ["main"] }];
  problem.mainFlow = { ...problem.mainFlow, spaceId: "vocal" };
  return problem;
}

test("future operational reservation prunes only when the last possible 75 minutes are proven closed", () => {
  const problem = boundaryPolicyProblem();
  const closed = [
    { ...problem.tasks[0]!, start: 0, end: 10 },
    { ...problem.tasks[1]!, start: 84, end: 94 },
  ] as ScheduledTask[];
  const result = probeOperationalMealFutureFeasibility(problem, closed);
  assert.equal(result.feasible, false);
  assert.deepEqual(result.pruneProofs, [{ policyId: "operations", requiredDuration: 75,
    window: { start: 10, end: 100 }, cause: "NO_VALID_OPERATIONAL_MEAL_INTERVAL",
    longestRemainingFreeIntervalAfter: 74 }]);
  assert.equal(result.branchesExplored, 0);
});

test("future operational reservation permits an exact interval and does not materialize a meal", () => {
  const problem = boundaryPolicyProblem();
  const result = probeOperationalMealFutureFeasibility(problem, [
    { ...problem.tasks[0]!, start: 0, end: 10 },
    { ...problem.tasks[1]!, start: 85, end: 95 },
  ] as ScheduledTask[]);
  assert.equal(result.feasible, true);
  assert.deepEqual(result.pruneProofs, []);
  assert.equal("scheduled" in result, false);
});

test("future operational reservation is existential before any productive boundary exists", () => {
  const problem = boundaryPolicyProblem();
  const onlyLeft = [{ ...problem.tasks[0]!, start: 0, end: 10 }] as ScheduledTask[];
  assert.ok(operationalMealCandidates(problem, problem.operationalMealPolicies![0]!, onlyLeft, []).length > 0);
  const result = probeOperationalMealFutureFeasibility(problem, onlyLeft);
  assert.equal(result.feasible, true);
  assert.deepEqual(result.checkedPolicyIds, ["operations"]);
});

test("future operational reservation ignores unrelated work and is deterministic under order reversal", () => {
  const problem = boundaryPolicyProblem();
  const scoped = [
    { ...problem.tasks[0]!, start: 0, end: 10 },
    { ...problem.tasks[1]!, start: 85, end: 95 },
  ] as ScheduledTask[];
  const unrelated = { ...problem.tasks[2]!, start: 20, end: 30 } as ScheduledTask;
  const baseline = probeOperationalMealFutureFeasibility(problem, scoped);
  assert.deepEqual(probeOperationalMealFutureFeasibility(problem, [unrelated, ...scoped].reverse()), baseline);
});

test("future operational reservation never turns a non-terminal or coach grid failure into a prune", () => {
  const problem = boundaryPolicyProblem();
  problem.operationalMealPolicies!.push({ id: "coach-grid", window: { start: 10, end: 55 }, duration: 45,
    resourceIds: ["coach"], spaceIds: [] });
  const partial = [{ ...problem.tasks[0]!, start: 0, end: 10 }] as ScheduledTask[];
  const result = probeOperationalMealFutureFeasibility(problem, partial);
  assert.equal(result.feasible, true);
  assert.deepEqual(result.checkedPolicyIds, ["operations"]);
  assert.deepEqual(result.blockingPolicyIds, []);
});

test("analytic reservation repairs its witness, handles exact and fragmented gaps, and never consumes branches", () => {
  const problem = boundaryPolicyProblem(), policy = problem.operationalMealPolicies![0]!;
  policy.duration = 20; policy.window = { start: 10, end: 100 };
  const initial = probeOperationalMealFutureFeasibility(problem, []);
  assert.deepEqual(initial.reservations[0]?.witnessInterval, { start: 10, end: 30 });
  const moved = probeOperationalMealFutureFeasibility(problem,
    [{ ...problem.tasks[0]!, start: 10, end: 35 }] as ScheduledTask[], undefined, initial.reservations);
  assert.equal(moved.feasible, true); assert.equal(moved.repairs, 1);
  assert.deepEqual(moved.reservations[0]?.witnessInterval, { start: 35, end: 55 });
  assert.equal(moved.branchesExplored, 0);
  const exact = [{ ...problem.tasks[0]!, start: 10, end: 40 }, { ...problem.tasks[1]!, start: 60, end: 100 }] as ScheduledTask[];
  assert.deepEqual(operationalMealFreeIntervals(problem, policy, exact), [{ start: 40, end: 60 }]);
  exact[1]!.start = 59;
  assert.deepEqual(operationalMealFreeIntervals(problem, policy, exact), []);
});

test("reservation intersects every scoped availability and subtracts fragmented occupations", () => {
  const problem = boundaryPolicyProblem(), policy = problem.operationalMealPolicies![0]!;
  policy.duration = 10; policy.resourceIds = ["unit"]; policy.spaceIds = ["main", "meal-room"];
  problem.resources[0]!.availability = [{ start: 15, end: 90 }];
  problem.spaces.find(({ id }) => id === "main")!.availability = [{ start: 10, end: 80 }];
  problem.spaces.find(({ id }) => id === "meal-room")!.availability = [{ start: 20, end: 70 }];
  const occupied = [
    { ...problem.tasks[0]!, spaceId: "main", start: 25, end: 30 },
    { ...problem.tasks[1]!, requiredResourceIds: ["unit"], start: 40, end: 50 },
  ] as ScheduledTask[];
  assert.deepEqual(operationalMealFreeIntervals(problem, policy, occupied), [
    { start: 30, end: 40 }, { start: 50, end: 70 },
  ]);
});

test("terminal candidates prefer structural then task boundaries and retain safe free-window fallbacks", () => {
  const problem = boundaryPolicyProblem(), policy = problem.operationalMealPolicies![0]!;
  policy.duration = 10; policy.window = { start: 10, end: 70 };
  const tasks = [
    { ...problem.tasks[0]!, blockKey: "a", start: 10, end: 20 },
    { ...problem.tasks[1]!, blockKey: "b", start: 30, end: 40 },
    { ...problem.tasks[1]!, id: "third", blockKey: "b", start: 50, end: 60 },
  ] as ScheduledTask[];
  const candidates = operationalMealCandidates(problem, policy, tasks, []);
  assert.equal(candidates[0]?.start, 20); assert.equal(candidates[0]?.preferredBoundary, true);
  assert.equal(candidates[1]?.start, 40); assert.equal(candidates[1]?.preferredBoundary, false);
  assert.ok(candidates.some(({ start }) => start === 60));
  assert.ok(candidates.every((meal) => tasks.every((task) => !((task.start < meal.end) && (meal.start < task.end)))));
});

test("every between-task operational policy participates without opt-in while an individual coach stays terminal", () => {
  const problem = boundaryPolicyProblem();
  problem.tasks.push(
    { id: "other-left", kind: "auxiliary", participantId: "core", duration: 10, spaceId: "meal-room", dependencies: [] },
    { id: "other-right", kind: "auxiliary", participantId: "core", duration: 10, spaceId: "meal-room", dependencies: [] },
  );
  problem.operationalMealPolicies!.push(
    { id: "other-operations", window: { start: 10, end: 100 }, duration: 75, resourceIds: [], spaceIds: ["meal-room"] },
    { id: "coach-grid", window: { start: 10, end: 55 }, duration: 45, resourceIds: ["coach"], spaceIds: [] },
  );
  const scheduled = [
    { ...problem.tasks[0]!, start: 0, end: 10 }, { ...problem.tasks[1]!, start: 85, end: 95 },
    { ...problem.tasks[3]!, start: 0, end: 10 }, { ...problem.tasks[4]!, start: 85, end: 95 },
  ] as ScheduledTask[];
  const result = probeOperationalMealFutureFeasibility(problem, scheduled);
  assert.deepEqual(result.checkedPolicyIds, ["operations", "other-operations"]);
  assert.equal(result.feasible, true);
  assert.equal(result.branchesExplored, 0);
});

test("analytic proof matches terminal boundary authority for completely fixed schedules, including zero and one scoped task", () => {
  for (const rightStart of [84, 85, 90]) {
    const problem = boundaryPolicyProblem();
    const scheduled = [
      { ...problem.tasks[0]!, start: 0, end: 10 },
      { ...problem.tasks[1]!, start: rightStart, end: rightStart + 10 },
    ] as ScheduledTask[];
    const analytic = probeOperationalMealFutureFeasibility(problem, scheduled);
    const terminalHasCandidate = operationalMealCandidates(problem, problem.operationalMealPolicies![0]!, scheduled, []).length > 0;
    assert.equal(analytic.feasible, terminalHasCandidate);
    assert.equal(analytic.branchesExplored, 0);
  }
  for (const scopedCount of [0, 1]) {
    const problem = boundaryPolicyProblem();
    problem.tasks = problem.tasks.slice(0, scopedCount);
    const scheduled = problem.tasks.map((task, index) => ({ ...task, start: index * 20, end: index * 20 + task.duration })) as ScheduledTask[];
    assert.equal(probeOperationalMealFutureFeasibility(problem, scheduled).feasible,
      operationalMealCandidates(problem, problem.operationalMealPolicies![0]!, scheduled, []).length > 0);
  }
});

function exactMealProblem(): PlannerNextProblem {
  const availability = [{ start: 0, end: 120 }];
  const productiveAvailability = [{ start: 0, end: 10 }, { start: 20, end: 120 }];
  return {
    day: { start: 0, end: 120 },
    spaces: ["main", "vocal", "meal-room"].map((id) => ({ id, availability })),
    resources: [{ id: "unit", availability, presencePreference: "OFF", transitionMinutes: 0 }],
    participants: [{ id: "core", availability: productiveAvailability }],
    coaches: [{ id: "coach", availability: productiveAvailability }],
    tasks: [
      { id: "vocal", kind: "vocal", participantId: "core", coachId: "coach", duration: 10, spaceId: "vocal", dependencies: [] },
      { id: "main", kind: "main", participantId: "core", coachId: "coach", duration: 10, spaceId: "main", dependencies: ["vocal"], blockKey: "coach", requiredResourceIds: ["unit"] },
    ],
    mainFlow: { spaceId: "main", preferredEnd: 30, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0,
    resourceTransitionMinutes: 0,
    auxiliaryPolicy: { participantPresencePreference: "OFF" },
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 20, maxBranchExpansions: 20_000 },
    searchPolicy: "EXACT_CONSTRUCTIVE",
    operationalMealPolicies: [{ id: "scoped-meal", window: { start: 10, end: 20 }, duration: 10, resourceIds: [], spaceIds: ["main", "vocal"] }],
  };
}

test("flexible operational meals project losslessly and deterministically", () => {
  const input = fixture(), snapshot = structuredClone(input);
  const resolved = resolveFlexibleOperationalMealPolicies(input);
  assert.deepEqual(resolved.map((meal) => ({ id: meal.id, status: meal.status, resources: meal.resourceIds, spaces: meal.spaceIds, window: meal.window, duration: meal.duration })), [
    { id: "reality-meal", status: "SUPPORTED", resources: [502, 503], spaces: [], window: { start: 780, end: 990 }, duration: 75 },
    { id: "space-meal", status: "SUPPORTED", resources: [504], spaces: [301], window: { start: 780, end: 990 }, duration: 75 },
  ]);
  const preflight = preflightEngineInputForPlannerNext(input);
  assert.equal(preflight.status, "SUPPORTED", JSON.stringify(preflight.issues));
  const adapted = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapted.status, "SUPPORTED", JSON.stringify(adapted.issues));
  assert.deepEqual(adapted.problem!.operationalMealPolicies, [
    { id: "break:reality-meal", window: { start: 780, end: 990 }, duration: 75, resourceIds: ["plan-resource:502", "plan-resource:503"], spaceIds: [] },
    { id: "break:space-meal", window: { start: 780, end: 990 }, duration: 75, resourceIds: ["plan-resource:504"], spaceIds: ["space:301"] },
  ]);
  const reversed = fixture();
  reversed.operationalMealPolicies!.reverse();
  reversed.operationalMealPolicies!.forEach((policy) => { policy.planResourceItemIds.reverse(); policy.spaceIds?.reverse(); });
  reversed.planResourceItems.reverse();
  const adaptedReversed = adaptEngineInputToPlannerNextProblem(reversed);
  assert.equal(adaptedReversed.status, "SUPPORTED");
  assert.equal(adapted.problemFingerprint, adaptedReversed.problemFingerprint);
  assert.deepEqual(input, snapshot);
});

test("exact search materializes the scoped meal and enforces its resource across spaces", () => {
  const source = exactMealProblem();
  const policy = source.operationalMealPolicies![0]!;
  const conflictingTask = { ...source.tasks.find(({ id }) => id === "main")!, start: 0, end: 10 } as ScheduledTask;
  const followingTask = { ...conflictingTask, id: "following", spaceId: "vocal", start: 20, end: 30 };
  const candidates = operationalMealCandidates(source, policy, [conflictingTask, followingTask], []);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((meal) => conflictingTask.end <= meal.start || meal.end <= conflictingTask.start));

  const execution = executePlannerNext(source);
  assert.equal(execution.kind, "EXACT_CONSTRUCTIVE");
  assert.equal(execution.result?.complete, true, JSON.stringify(execution.result?.evidence));
  const result = execution.result!;
  const meals = result.scheduledOperationalMeals ?? [];
  assert.equal(meals.length, 1);
  const scheduledMeal = meals[0]!;
  const scheduledResourceTask = result.scheduledTasks.find(({ id }) => id === "main")!;
  assert.ok(scheduledResourceTask.end <= scheduledMeal.start || scheduledMeal.end <= scheduledResourceTask.start);
  const validation = validatePlan(source, result.scheduledTasks, result.scheduledSetupPreparations, result.scheduledSpaceMeals, result.scheduledParticipantMeals, result.scheduledResourceMeals, result.scheduledItinerantUnitMeals, result.scheduledRoundPreparations, meals);
  assert.equal(validation.hardValid, true, validation.reasonCodes.join(","));
});

// A single physical resource may participate in only one operational meal policy.
test("shared resources cannot receive duplicate operational meals", () => {
  const input = fixture();
  input.operationalMealPolicies!.push({ id: "duplicate-resource-meal", window: { start: "13:00", end: "16:30" }, durationMinutes: 75, planResourceItemIds: [503], spaceIds: [] });
  const preflight = preflightEngineInputForPlannerNext(input);
  assert.equal(preflight.status, "UNSUPPORTED");
  assert.ok(preflight.reasonCodes.includes("UNSUPPORTED_OPERATIONAL_MEAL_POLICY"));
});
