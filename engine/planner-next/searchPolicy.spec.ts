import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { AnchoredAccompaniment, PlannerNextProblem, PlannerSearchPolicy } from "./contracts";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import type { PlannerCapabilityRequirement } from "./searchPolicy";
import {
  detectPlannerCapabilities,
  isPlannerCapabilitySupported,
  PLANNER_CAPABILITY_REQUIREMENTS,
  resolvePlannerSearchPolicy,
} from "./searchPolicy";

const contract = (id: string): AnchoredAccompaniment => ({
  id,
  anchorTaskId: `anchor-${id}`,
  beforeTaskIds: [`before-${id}`],
  afterTaskIds: [`after-${id}`],
  adjacency: "REQUIRED",
  internalTransition: "INCLUDED",
  resourceContinuity: "REQUIRED",
});

function problem(searchPolicy?: PlannerSearchPolicy): PlannerNextProblem {
  const value = mainFlowVocalScenario();
  if (searchPolicy !== undefined) value.searchPolicy = searchPolicy;
  return value;
}

test("explicit policies are retained and capability-free problems support both", () => {
  for (const policy of ["COMPATIBILITY_PRESERVING", "EXACT_CONSTRUCTIVE"] as const) {
    const resolution = resolvePlannerSearchPolicy(problem(policy));
    assert.equal(resolution.requestedPolicy, policy);
    assert.equal(resolution.effectivePolicy, policy);
    assert.equal(resolution.selectionSource, "EXPLICIT");
    assert.equal(resolution.compatible, true);
    assert.deepEqual(resolution.requiredCapabilities, []);
    assert.deepEqual(resolution.unsupportedCapabilities, []);
  }
});

test("an omitted policy uses the explicit migration default and deprecation warning", () => {
  const resolution = resolvePlannerSearchPolicy(problem());
  assert.equal(resolution.requestedPolicy, undefined);
  assert.equal(resolution.effectivePolicy, "COMPATIBILITY_PRESERVING");
  assert.equal(resolution.selectionSource, "MIGRATION_DEFAULT");
  assert.deepEqual(resolution.warnings, ["IMPLICIT_SEARCH_POLICY_DEPRECATED"]);
});

test("anchored accompaniment is detected canonically and requires the exact policy", () => {
  assert.deepEqual(PLANNER_CAPABILITY_REQUIREMENTS.ANCHORED_ACCOMPANIMENT, {
    capability: "ANCHORED_ACCOMPANIMENT",
    supportedPolicies: ["EXACT_CONSTRUCTIVE"],
    requiredPolicy: "EXACT_CONSTRUCTIVE",
  });
  assert.equal(
    isPlannerCapabilitySupported(
      PLANNER_CAPABILITY_REQUIREMENTS.ANCHORED_ACCOMPANIMENT,
      "EXACT_CONSTRUCTIVE",
    ),
    true,
  );
  assert.equal(
    isPlannerCapabilitySupported(
      PLANNER_CAPABILITY_REQUIREMENTS.ANCHORED_ACCOMPANIMENT,
      "COMPATIBILITY_PRESERVING",
    ),
    false,
  );
  const exact = problem("EXACT_CONSTRUCTIVE");
  exact.anchoredAccompaniments = [contract("b"), contract("a"), contract("b")];
  assert.deepEqual(detectPlannerCapabilities(exact), ["ANCHORED_ACCOMPANIMENT"]);
  assert.deepEqual(resolvePlannerSearchPolicy(exact), {
    requestedPolicy: "EXACT_CONSTRUCTIVE",
    effectivePolicy: "EXACT_CONSTRUCTIVE",
    selectionSource: "EXPLICIT",
    requiredCapabilities: ["ANCHORED_ACCOMPANIMENT"],
    supportedCapabilities: ["ANCHORED_ACCOMPANIMENT"],
    unsupportedCapabilities: [],
    compatible: true,
    reasonCodes: [],
    warnings: [],
  });
});

test("transport grouping is supported only by the implemented exact policy", () => {
  assert.deepEqual(PLANNER_CAPABILITY_REQUIREMENTS.TRANSPORT_GROUPING, {
    capability: "TRANSPORT_GROUPING", supportedPolicies: ["EXACT_CONSTRUCTIVE"], requiredPolicy: "EXACT_CONSTRUCTIVE",
  });
  for (const policy of ["COMPATIBILITY_PRESERVING", "EXACT_CONSTRUCTIVE"] as const) {
    const value = problem(policy);
    value.transportPolicy = {
      arrival: { taskIds: ["arrival"], minimumGroupSize: 3, maximumGroupSize: 6, minGapMinutes: 35, groupingWeight: 3 },
      departure: { taskIds: ["departure"], minimumGroupSize: 3, maximumGroupSize: 6, minGapMinutes: 20, groupingWeight: 3 },
    };
    assert.deepEqual(detectPlannerCapabilities(value), ["TRANSPORT_GROUPING"]);
    const resolution = resolvePlannerSearchPolicy(value);
    assert.equal(resolution.compatible, policy === "EXACT_CONSTRUCTIVE");
    assert.deepEqual(resolution.unsupportedCapabilities, policy === "EXACT_CONSTRUCTIVE" ? [] : ["TRANSPORT_GROUPING"]);
    assert.deepEqual(resolution.reasonCodes, policy === "EXACT_CONSTRUCTIVE" ? [] : ["SEARCH_POLICY_CAPABILITY_UNSUPPORTED"]);
  }
});

test("the requirement contract can support both policies without requiring either", () => {
  const requirement: PlannerCapabilityRequirement = {
    capability: "ANCHORED_ACCOMPANIMENT",
    supportedPolicies: ["COMPATIBILITY_PRESERVING", "EXACT_CONSTRUCTIVE"],
  };
  assert.equal(requirement.requiredPolicy, undefined);
  assert.equal(isPlannerCapabilitySupported(requirement, "COMPATIBILITY_PRESERVING"), true);
  assert.equal(isPlannerCapabilitySupported(requirement, "EXACT_CONSTRUCTIVE"), true);
  assert.deepEqual(
    PLANNER_CAPABILITY_REQUIREMENTS.ANCHORED_ACCOMPANIMENT.supportedPolicies,
    ["EXACT_CONSTRUCTIVE"],
  );
  const supportedPolicies =
    PLANNER_CAPABILITY_REQUIREMENTS.ANCHORED_ACCOMPANIMENT.supportedPolicies;
  assert.deepEqual(supportedPolicies, [...new Set(supportedPolicies)].sort());
});

test("an incompatible explicit policy is explained and never silently replaced", () => {
  const value = problem("COMPATIBILITY_PRESERVING");
  value.anchoredAccompaniments = [contract("a")];
  const resolution = resolvePlannerSearchPolicy(value);
  assert.equal(resolution.requestedPolicy, "COMPATIBILITY_PRESERVING");
  assert.equal(resolution.effectivePolicy, "COMPATIBILITY_PRESERVING");
  assert.equal(resolution.compatible, false);
  assert.deepEqual(resolution.supportedCapabilities, []);
  assert.deepEqual(resolution.unsupportedCapabilities, ["ANCHORED_ACCOMPANIMENT"]);
  assert.deepEqual(resolution.reasonCodes, ["SEARCH_POLICY_CAPABILITY_UNSUPPORTED"]);
});

test("resolution is deterministic, immutable, and invariant to all irrelevant input order", () => {
  const original = problem("EXACT_CONSTRUCTIVE");
  original.anchoredAccompaniments = [contract("a"), contract("b")];
  const before = structuredClone(original);
  const reordered = structuredClone(original);
  reordered.anchoredAccompaniments!.reverse();
  reordered.tasks.reverse();
  reordered.spaces.reverse();
  reordered.resources.reverse();
  reordered.participants.reverse();
  const first = resolvePlannerSearchPolicy(original);
  assert.deepEqual(first, resolvePlannerSearchPolicy(original));
  assert.deepEqual(first, resolvePlannerSearchPolicy(reordered));
  assert.deepEqual(original, before);
  for (const values of [
    first.requiredCapabilities,
    first.supportedCapabilities,
    first.unsupportedCapabilities,
    first.reasonCodes,
    first.warnings,
  ]) {
    assert.deepEqual(values, [...new Set(values)].sort());
  }
});

test("scenario-like IDs and task text never imply a capability", () => {
  const value = problem("COMPATIBILITY_PRESERVING");
  value.tasks[0]!.id = "FOCAL-A2-ANCHORED_ACCOMPANIMENT";
  value.participants[0]!.id = "anchored-accompaniment-participant";
  assert.deepEqual(detectPlannerCapabilities(value), []);
  assert.equal(resolvePlannerSearchPolicy(value).compatible, true);
});

test("the current planner does not import or invoke the policy resolver", () => {
  const plannerSource = readFileSync(
    new URL("./planMainFlowAndFeeders.ts", import.meta.url),
    "utf8",
  );
  assert.equal(plannerSource.includes("resolvePlannerSearchPolicy"), false);
  assert.equal(plannerSource.includes('from "./searchPolicy"'), false);
});
