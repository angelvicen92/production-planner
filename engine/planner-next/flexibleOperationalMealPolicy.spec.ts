import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { executePlannerNext } from "./executePlannerNext";
import { adaptEngineInputToPlannerNextProblem } from "./integration/engineInputAdapter";
import { createSupportedEngineInputAdapterFixture } from "./integration/engineInputAdapter.fixture";
import { preflightEngineInputForPlannerNext } from "./integration/engineInputPreflight";
import { resolveFlexibleOperationalMealPolicies } from "./integration/flexibleOperationalMealPolicies";
import { operationalMealCandidates } from "./operationalMeals";
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

function exactMealProblem(): PlannerNextProblem {
  const availability = [{ start: 0, end: 120 }];
  return {
    day: { start: 0, end: 120 },
    protectedMeal: { start: 110, end: 120 },
    spaces: ["main", "vocal", "meal-room"].map((id) => ({ id, availability })),
    resources: [{ id: "unit", availability, presencePreference: "OFF", transitionMinutes: 0 }],
    participants: [{ id: "core", availability }],
    coaches: [{ id: "coach", availability }],
    tasks: [
      { id: "vocal", kind: "vocal", participantId: "core", coachId: "coach", duration: 10, spaceId: "vocal", dependencies: [] },
      { id: "main", kind: "main", participantId: "core", coachId: "coach", duration: 10, spaceId: "main", dependencies: ["vocal"], blockKey: "coach", requiredResourceIds: ["unit"] },
    ],
    mainFlow: { spaceId: "main", preferredEnd: 100, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0,
    resourceTransitionMinutes: 0,
    auxiliaryPolicy: { participantPresencePreference: "OFF" },
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 20, maxBranchExpansions: 20_000 },
    searchPolicy: "EXACT_CONSTRUCTIVE",
    operationalMealPolicies: [{ id: "scoped-meal", window: { start: 20, end: 40 }, duration: 10, resourceIds: ["unit"], spaceIds: ["meal-room"] }],
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
  const conflictingTask = { ...source.tasks.find(({ id }) => id === "main")!, start: 20, end: 30 } as ScheduledTask;
  const candidates = operationalMealCandidates(source, policy, [conflictingTask], []);
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
