import assert from "node:assert/strict";
import test from "node:test";
import { executePlannerNext } from "./executePlannerNext";
import { adaptEngineInputToPlannerNextProblem } from "./integration/engineInputAdapter";
import { createSupportedEngineInputAdapterFixture } from "./integration/engineInputAdapter.fixture";
import { preflightEngineInputForPlannerNext } from "./integration/engineInputPreflight";
import { resolveFlexibleOperationalMealPolicies } from "./integration/flexibleOperationalMealPolicies";

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

test("flexible operational meals project losslessly, deterministically, and remain fail-closed before search support", () => {
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
  const execution = executePlannerNext(adapted.problem!);
  assert.equal(execution.kind, "POLICY_REJECTED");
  assert.ok(execution.policyResolution.unsupportedCapabilities.includes("OPERATIONAL_MEAL_POLICY"));

  const reversed = fixture();
  reversed.operationalMealPolicies!.reverse();
  reversed.operationalMealPolicies!.forEach((policy) => { policy.planResourceItemIds.reverse(); policy.spaceIds?.reverse(); });
  reversed.planResourceItems.reverse();
  const adaptedReversed = adaptEngineInputToPlannerNextProblem(reversed);
  assert.equal(adaptedReversed.status, "SUPPORTED");
  assert.equal(adapted.problemFingerprint, adaptedReversed.problemFingerprint);
  assert.deepEqual(input, snapshot);
});

test("shared resources cannot receive duplicate operational meals", () => {
  const input = fixture();
  input.operationalMealPolicies!.push({ id: "duplicate-resource-meal", window: { start: "13:00", end: "16:30" }, durationMinutes: 75, planResourceItemIds: [503], spaceIds: [] });
  const preflight = preflightEngineInputForPlannerNext(input);
  assert.equal(preflight.status, "UNSUPPORTED");
  assert.ok(preflight.reasonCodes.includes("UNSUPPORTED_OPERATIONAL_MEAL_POLICY"));
});
