import assert from "node:assert/strict";
import test from "node:test";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { evaluateResourcePresence } from "./resourcePresence";
import { dividedRequiredSchedule, requiredContinuousResourceScenario } from "./scenarios/requiredContinuousResourceScenario";
import { preflight, validatePlan } from "./validate";

test("generic REQUIRED controls complete contiguously and across their assigned meal", () => {
  for (const variant of ["FEASIBLE_CONTIGUOUS", "FEASIBLE_WITH_AUTHORIZED_MEAL"] as const) {
    const problem = requiredContinuousResourceScenario(variant), before = JSON.stringify(problem);
    const result = planMainFlowAndFeeders(problem);
    assert.equal(result.complete && result.metrics.hardValid, true);
    const presence = evaluateResourcePresence(problem.resources.find((r) => r.id === "resource-one")!, result.scheduledTasks, result.scheduledSpaceMeals);
    assert.equal(presence.operationalBlockCount, 1);
    assert.equal(presence.requiredPolicySatisfied, true);
    if (variant === "FEASIBLE_WITH_AUTHORIZED_MEAL") {
      assert.equal(presence.crossesAuthorizedMeal, true);
      assert.equal(presence.authorizedMealMinutes, 60);
      assert.equal(presence.internalGapMinutes, 0);
    }
    assert.equal(JSON.stringify(problem), before);
  }
});

test("OFF and PREFERRED permit a split that REQUIRED rejects without duplicate reasons", () => {
  for (const policy of ["OFF", "PREFERRED", "REQUIRED"] as const) {
    const problem = requiredContinuousResourceScenario("SPLIT_INVALID");
    problem.resources[0]!.presenceConcentrationPolicy = policy;
    const schedule = dividedRequiredSchedule(problem);
    const validation = validatePlan({ ...problem, tasks: schedule.tasks }, schedule.tasks, [], schedule.meals);
    assert.equal(validation.hardValid, policy !== "REQUIRED");
    assert.equal(new Set(validation.reasonCodes).size, validation.reasonCodes.length);
    const presence = evaluateResourcePresence(problem.resources[0]!, schedule.tasks);
    assert.equal(presence.operationalBlockCount, 2);
    assert.equal(presence.requiredPolicySatisfied, policy !== "REQUIRED");
  }
});

test("impossible REQUIRED construction fails atomically, deterministically, and order independently", () => {
  const problem = requiredContinuousResourceScenario("IMPOSSIBLE_ATOMIC"), before = JSON.stringify(problem);
  const reverse = { ...problem, tasks: [...problem.tasks].reverse(), participants: [...problem.participants].reverse(), coaches: [...problem.coaches].reverse(), spaces: [...problem.spaces].reverse(), resources: [...problem.resources].reverse() };
  const results = [planMainFlowAndFeeders(problem), planMainFlowAndFeeders(problem), planMainFlowAndFeeders(reverse)];
  for (const result of results) {
    assert.equal(result.complete, false);
    assert.equal(result.metrics.searchStopReason, "NO_COMPLETE_HARD_VALID_PLAN");
    assert.deepEqual([result.scheduledTasks, result.scheduledSetupPreparations, result.scheduledSpaceMeals], [[], [], []]);
  }
  assert.deepEqual(results.map((r) => [r.metrics.planFingerprint, r.metrics.branchesExplored]), Array(3).fill([results[0]!.metrics.planFingerprint, results[0]!.metrics.branchesExplored]));
  assert.equal(JSON.stringify(problem), before);
});

test("multiple REQUIRED resources retain independent state and validate shared tasks", () => {
  const problem = requiredContinuousResourceScenario("MULTIPLE_REQUIRED_RESOURCES");
  const result = planMainFlowAndFeeders(problem);
  assert.equal(result.complete, true);
  for (const resource of problem.resources) assert.equal(evaluateResourcePresence(resource, result.scheduledTasks).requiredPolicySatisfied, true);
  assert.deepEqual(validatePlan(problem, result.scheduledTasks).reasonCodes, []);
});

test("REQUIRED preflight and zero/one-task edge cases are explicit", () => {
  const invalid = requiredContinuousResourceScenario("FEASIBLE_CONTIGUOUS");
  invalid.resources[0]!.presenceConcentrationPolicy = "UNKNOWN" as never;
  assert.ok(preflight(invalid).includes("INVALID_RESOURCE_PRESENCE_CONCENTRATION_POLICY"));
  const missing = requiredContinuousResourceScenario("FEASIBLE_CONTIGUOUS");
  missing.resources[0]!.assignedSpaceId = "missing";
  assert.ok(preflight(missing).includes("MISSING_RESOURCE_ASSIGNED_SPACE_REFERENCE"));
  const p = requiredContinuousResourceScenario("FEASIBLE_CONTIGUOUS");
  assert.equal(evaluateResourcePresence(p.resources[0]!, []).requiredPolicySatisfied, true);
  const task = dividedRequiredSchedule(p).tasks[0]!;
  assert.equal(evaluateResourcePresence(p.resources[0]!, [task]).requiredPolicySatisfied, true);
});
