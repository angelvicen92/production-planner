import assert from "node:assert/strict";
import test from "node:test";
import type { AnchoredAccompaniment, PlanResult, PlannerNextProblem } from "./contracts";
import { planCompatibilityPreserving } from "./compatibilityPreservingSearch";
import { executePlannerNext } from "./executePlannerNext";
import { constructExactItinerantPlan } from "./exactItinerantPlan";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";

function problem(policy?: PlannerNextProblem["searchPolicy"]): PlannerNextProblem {
  const value = mainFlowVocalScenario();
  if (policy !== undefined) value.searchPolicy = policy;
  return value;
}

const anchored: AnchoredAccompaniment = {
  id: "operation",
  anchorTaskId: "main-a",
  beforeTaskIds: ["before-a"],
  afterTaskIds: ["after-a"],
  adjacency: "REQUIRED",
  internalTransition: "INCLUDED",
  resourceContinuity: "REQUIRED",
};

function withoutRuntime(result: PlanResult): PlanResult {
  return { ...result, metrics: { ...result.metrics, runtimeMs: 0 } };
}

test("explicit compatibility resolves once conceptually and returns only its historical result", () => {
  const input = problem("COMPATIBILITY_PRESERVING"), before = structuredClone(input);
  const execution = executePlannerNext(input);
  assert.equal(execution.kind, "COMPATIBILITY_PRESERVING");
  assert.deepEqual(execution.policyResolution, {
    requestedPolicy: "COMPATIBILITY_PRESERVING", effectivePolicy: "COMPATIBILITY_PRESERVING",
    selectionSource: "EXPLICIT", requiredCapabilities: [], supportedCapabilities: [],
    unsupportedCapabilities: [], compatible: true, reasonCodes: [], warnings: [],
  });
  assert.deepEqual(withoutRuntime(execution.result), withoutRuntime(planCompatibilityPreserving(input)));
  assert.deepEqual(input, before);
});

test("explicit exact dispatches exclusively to the exact constructor", () => {
  const input = problem("EXACT_CONSTRUCTIVE"), before = structuredClone(input);
  const execution = executePlannerNext(input);
  assert.equal(execution.kind, "EXACT_CONSTRUCTIVE");
  assert.equal(execution.policyResolution.requestedPolicy, "EXACT_CONSTRUCTIVE");
  assert.equal(execution.policyResolution.effectivePolicy, "EXACT_CONSTRUCTIVE");
  assert.equal(execution.policyResolution.selectionSource, "EXPLICIT");
  assert.equal(execution.policyResolution.compatible, true);
  assert.deepEqual(execution.result, constructExactItinerantPlan(input));
  assert.equal("metrics" in execution.result, false);
  assert.deepEqual(input, before);
});

test("an omitted policy preserves the migration default and historical route", () => {
  const input = problem(), execution = executePlannerNext(input);
  assert.equal(execution.kind, "COMPATIBILITY_PRESERVING");
  assert.equal(execution.policyResolution.effectivePolicy, "COMPATIBILITY_PRESERVING");
  assert.equal(execution.policyResolution.selectionSource, "MIGRATION_DEFAULT");
  assert.deepEqual(execution.policyResolution.warnings, ["IMPLICIT_SEARCH_POLICY_DEPRECATED"]);
  assert.deepEqual(withoutRuntime(execution.result), withoutRuntime(planCompatibilityPreserving(input)));
});

test("explicit incompatible capability is rejected without a result", () => {
  const input = problem("COMPATIBILITY_PRESERVING"); input.anchoredAccompaniments = [anchored];
  const before = structuredClone(input), execution = executePlannerNext(input);
  assert.equal(execution.kind, "POLICY_REJECTED"); assert.equal(execution.result, null);
  assert.equal(execution.policyResolution.compatible, false);
  assert.deepEqual(execution.policyResolution.unsupportedCapabilities, ["ANCHORED_ACCOMPANIMENT"]);
  assert.deepEqual(execution.policyResolution.reasonCodes, ["SEARCH_POLICY_CAPABILITY_UNSUPPORTED"]);
  assert.deepEqual(input, before);
});

test("implicit incompatible capability is rejected and never promotes itself to exact", () => {
  const input = problem(); input.anchoredAccompaniments = [anchored];
  const execution = executePlannerNext(input);
  assert.equal(execution.kind, "POLICY_REJECTED"); assert.equal(execution.result, null);
  assert.equal(execution.policyResolution.effectivePolicy, "COMPATIBILITY_PRESERVING");
  assert.equal(execution.policyResolution.selectionSource, "MIGRATION_DEFAULT");
  assert.deepEqual(execution.policyResolution.warnings, ["IMPLICIT_SEARCH_POLICY_DEPRECATED"]);
  assert.deepEqual(execution.policyResolution.reasonCodes, ["SEARCH_POLICY_CAPABILITY_UNSUPPORTED"]);
});

test("explicit exact supports the anchored accompaniment capability", () => {
  const input = problem("EXACT_CONSTRUCTIVE"); input.anchoredAccompaniments = [anchored];
  const execution = executePlannerNext(input);
  assert.equal(execution.kind, "EXACT_CONSTRUCTIVE");
  assert.deepEqual(execution.policyResolution.requiredCapabilities, ["ANCHORED_ACCOMPANIMENT"]);
  assert.deepEqual(execution.policyResolution.supportedCapabilities, ["ANCHORED_ACCOMPANIMENT"]);
  assert.deepEqual(execution.policyResolution.unsupportedCapabilities, []);
});

test("execution is deterministic apart from compatibility runtime", () => {
  const first = executePlannerNext(problem("COMPATIBILITY_PRESERVING"));
  const second = executePlannerNext(problem("COMPATIBILITY_PRESERVING"));
  assert.equal(first.kind, "COMPATIBILITY_PRESERVING"); assert.equal(second.kind, first.kind);
  assert.deepEqual(second.policyResolution, first.policyResolution);
  assert.deepEqual(withoutRuntime(second.result), withoutRuntime(first.result));
});

test("execution is order invariant and leaves both inputs unchanged", () => {
  const input = problem("COMPATIBILITY_PRESERVING"), reversed = structuredClone(input);
  reversed.tasks.reverse(); reversed.participants.reverse(); reversed.spaces.reverse(); reversed.resources.reverse();
  const before = structuredClone(input), reversedBefore = structuredClone(reversed);
  const first = executePlannerNext(input), second = executePlannerNext(reversed);
  assert.equal(first.kind, "COMPATIBILITY_PRESERVING"); assert.equal(second.kind, first.kind);
  assert.deepEqual(second.policyResolution, first.policyResolution);
  assert.equal(second.result.metrics.planFingerprint, first.result.metrics.planFingerprint);
  assert.deepEqual(second.result.scheduledTasks, first.result.scheduledTasks);
  assert.deepEqual(input, before); assert.deepEqual(reversed, reversedBefore);
});

test("the historical entrypoint ignores policy and remains the compatibility facade", () => {
  const input = problem("EXACT_CONSTRUCTIVE");
  assert.deepEqual(withoutRuntime(planMainFlowAndFeeders(input)), withoutRuntime(planCompatibilityPreserving(input)));
});
