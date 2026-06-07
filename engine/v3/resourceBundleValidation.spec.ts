import assert from "node:assert/strict";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { validateResourceBundles } from "./resourceBundleValidation";
import { diagnoseCompositeResources } from "./resourceDiagnostics";
import { compareCandidateSolutions, explainCandidateComparison, scoreCandidateSolution } from "./solutionScoring";

const baseInput = (overrides: Partial<EngineV3Input> = {}): EngineV3Input => ({
  planId: 20,
  workDay: { start: "09:00", end: "11:00" },
  meal: { start: "12:00", end: "12:30" },
  camerasAvailable: 2,
  tasks: [{ id: 1, planId: 20, templateId: 1, status: "pending", spaceId: 10 }],
  locks: [],
  groupingZoneIds: [],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  spaceNameById: { 10: "Stage" },
  planResourceItems: [
    { id: 101, resourceItemId: 1001, typeId: 12, name: "Camera A", isAvailable: true },
    { id: 201, resourceItemId: 2001, typeId: 13, name: "Sound A", isAvailable: true },
  ],
  resourceItemComponents: {},
  ...overrides,
});

const output = (assignedResources: number[]): EngineOutput => ({
  feasible: true,
  complete: true,
  hardFeasible: true,
  plannedTasks: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:20", assignedSpace: 10, assignedResources }],
  unplanned: [],
  warnings: [],
});

{
  const input = baseInput({ resourceBundles: [{ id: "empty", name: "Empty", isActive: true }] });
  const validation = validateResourceBundles(input);
  assert.equal(validation.invalidBundleCount, 1);
  assert.ok(validation.warnings.some((warning) => warning.code === "BUNDLE_WITHOUT_COMPONENTS"));
  assert.equal(scoreCandidateSolution(input, output([101])).bundleCoherencePenalty, 0);
}

{
  const validation = validateResourceBundles(baseInput({
    resourceBundles: [{ id: "a", name: "A", isActive: true }],
    resourceBundleComponents: [
      { id: "first", bundleId: "a", resourceItemId: 1001, componentRole: "camera", quantity: 1, isRequired: true },
      { id: "duplicate", bundleId: "a", resourceItemId: 1001, componentRole: "camera", quantity: 1, isRequired: true },
    ],
  }));
  assert.equal(validation.usableComponents.length, 1);
  assert.equal(validation.partiallyUsableBundleCount, 1);
  assert.ok(validation.warnings.some((warning) => warning.code === "DUPLICATE_BUNDLE_COMPONENT"));
}

{
  const validation = validateResourceBundles(baseInput({
    resourceBundles: [{ id: "a", name: "A", isActive: true }],
    resourceBundleComponents: [{ bundleId: "a", resourceItemId: 9999, componentRole: "camera", quantity: 1, isRequired: true }],
  }));
  assert.equal(validation.invalidBundleCount, 1);
  assert.ok(validation.warnings.some((warning) => warning.code === "BUNDLE_COMPONENT_UNKNOWN_RESOURCE_ITEM"));
}

{
  const validation = validateResourceBundles(baseInput({
    resourceBundles: [{ id: "a", name: "A", isActive: true }],
    resourceBundleComponents: [{ bundleId: "a", resourceItemId: 1001, componentRole: "camera", quantity: 1, isRequired: true }],
    resourceBundleSpaceAffinities: [{ bundleId: "a", spaceId: 999, affinityScore: 5 }],
  }));
  assert.equal(validation.usableAffinities.length, 0);
  assert.equal(validation.partiallyUsableBundleCount, 1);
  assert.ok(validation.warnings.some((warning) => warning.code === "BUNDLE_AFFINITY_UNKNOWN_SPACE"));
}

{
  const input = baseInput();
  const validation = validateResourceBundles(input);
  const diagnostic = diagnoseCompositeResources(input, output([]));
  assert.equal(validation.usableBundleCount, 0);
  assert.equal(validation.invalidBundleCount, 0);
  assert.equal(validation.warnings.length, 0);
  assert.equal(diagnostic.resourceBundleValidationWarnings, 0);
  assert.equal(scoreCandidateSolution(input, output([])).bundleCoherencePenalty, 0);
}

{
  const validOnly = baseInput({
    resourceBundles: [{ id: "valid", name: "Valid", isActive: true }],
    resourceBundleComponents: [
      { bundleId: "valid", resourceItemId: 1001, componentRole: "camera", quantity: 1, isRequired: true },
      { bundleId: "valid", resourceItemId: 2001, componentRole: "sound", quantity: 1, isRequired: true },
    ],
  });
  const withInvalid = {
    ...validOnly,
    resourceBundles: [...(validOnly.resourceBundles ?? []), { id: "invalid", name: "Invalid", isActive: true }],
    resourceBundleComponents: [
      ...(validOnly.resourceBundleComponents ?? []),
      { bundleId: "invalid", resourceItemId: 9999, componentRole: "camera", quantity: 1, isRequired: true },
    ],
  };
  const completeBundle = output([101, 201]);
  const partialBundle = output([101]);
  assert.equal(scoreCandidateSolution(withInvalid, completeBundle).bundleCoherencePenalty, scoreCandidateSolution(validOnly, completeBundle).bundleCoherencePenalty);
  assert.equal(scoreCandidateSolution(withInvalid, partialBundle).bundleCoherencePenalty, scoreCandidateSolution(validOnly, partialBundle).bundleCoherencePenalty);
  assert.ok(compareCandidateSolutions(withInvalid, completeBundle, partialBundle) > 0);
}

{
  const input = baseInput({ resourceBundles: [{ id: "invalid", name: "Invalid", isActive: true }] });
  const first = output([101]);
  const second = output([201]);
  const firstScore = scoreCandidateSolution(input, first);
  const secondScore = scoreCandidateSolution(input, second);
  assert.equal(firstScore.bundleCoherencePenalty, 0);
  assert.equal(secondScore.bundleCoherencePenalty, 0);
  assert.equal(compareCandidateSolutions(input, first, second), 0);
  assert.doesNotMatch(explainCandidateComparison("phaseA_greedy", "phaseA_backtracking", firstScore, secondScore), /bundle|resource coherence/i);
}

{
  const validation = validateResourceBundles(baseInput({
    resourceBundles: [{ id: "partial", name: "Partial", isActive: true }],
    resourceBundleComponents: [
      { id: "resource-only", bundleId: "partial", resourceId: 77, resourceItemId: null, componentRole: "operator", quantity: 1, isRequired: false },
      { id: "bad-quantity", bundleId: "partial", resourceItemId: 1001, componentRole: "camera", quantity: Number.NaN, isRequired: true },
    ],
  }));
  assert.equal(validation.usableComponents[0]?.quantity, 1);
  assert.ok(validation.warnings.some((warning) => warning.code === "BUNDLE_COMPONENT_WITHOUT_RESOURCE_ITEM"));
  assert.ok(validation.warnings.some((warning) => warning.code === "INVALID_BUNDLE_COMPONENT_QUANTITY"));
}

console.log("engine/v3/resourceBundleValidation.spec.ts: OK");
