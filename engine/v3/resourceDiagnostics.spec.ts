import assert from "node:assert/strict";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { diagnoseCompositeResources } from "./resourceDiagnostics";

const CAMERA_1 = 101;
const CAMERA_2 = 102;
const SOUND_1 = 201;
const SOUND_2 = 202;

const input = (tasks: EngineV3Input["tasks"]): EngineV3Input => ({
  planId: 17,
  workDay: { start: "09:00", end: "12:00" },
  meal: { start: "12:00", end: "12:30" },
  camerasAvailable: 2,
  tasks,
  locks: [],
  groupingZoneIds: [],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [
    { id: CAMERA_1, resourceItemId: 1001, typeId: 12, name: "Camera 1", isAvailable: true },
    { id: CAMERA_2, resourceItemId: 1002, typeId: 12, name: "Camera 2", isAvailable: true },
    { id: SOUND_1, resourceItemId: 2001, typeId: 13, name: "Sound 1", isAvailable: true },
    { id: SOUND_2, resourceItemId: 2002, typeId: 13, name: "Sound 2", isAvailable: true },
  ],
  resourceItemComponents: {},
  spaceNameById: { 1: "Main Stage", 2: "Reality Set A", 3: "Reality Set B" },
});

const output = (plannedTasks: EngineOutput["plannedTasks"]): EngineOutput => ({
  feasible: true,
  complete: true,
  hardFeasible: true,
  plannedTasks,
  unplanned: [],
  warnings: [],
});

{
  const diagnostic = diagnoseCompositeResources(input([
    { id: 1, planId: 17, templateId: 1, status: "pending", spaceId: 1, resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [1001, 1002] }] } },
    { id: 2, planId: 17, templateId: 1, status: "pending", spaceId: 2, resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [1001, 1002] }] } },
    { id: 3, planId: 17, templateId: 1, status: "pending", spaceId: 3, resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [1001, 1002] }] } },
  ]), output([
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [CAMERA_1] },
    { taskId: 2, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [CAMERA_2] },
    { taskId: 3, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [CAMERA_1] },
  ]));
  assert.equal(diagnostic.resourcePoolPressure.length, 1);
  assert.equal(diagnostic.maxAnyOfPoolConcurrency, 2);
  assert.equal(diagnostic.resourcePoolPressure[0].competingTaskCount, 3);
  assert.equal(diagnostic.resourcePoolPressure[0].maxUtilizationPercent, 100);
  assert.ok(diagnostic.resourcePoolPressure[0].fragileTaskCount > 0);
}

{
  const diagnostic = diagnoseCompositeResources(input([
    { id: 10, planId: 17, templateId: 1, status: "pending", spaceId: 1 },
    { id: 11, planId: 17, templateId: 1, status: "pending", spaceId: 1 },
    { id: 12, planId: 17, templateId: 1, status: "pending", spaceId: 2 },
  ]), output([
    { taskId: 10, startPlanned: "09:00", endPlanned: "09:20", assignedResources: [CAMERA_1, SOUND_1] },
    { taskId: 11, startPlanned: "09:20", endPlanned: "09:40", assignedResources: [CAMERA_1, SOUND_1] },
    { taskId: 12, startPlanned: "09:40", endPlanned: "10:00", assignedResources: [CAMERA_2, SOUND_2] },
  ]));
  const pairCandidate = diagnostic.compositeResourceCandidates.find((candidate) => candidate.kind === "resource_pair" && candidate.left.includes("Camera 1") && candidate.right.includes("Sound 1"));
  assert.ok(pairCandidate);
  assert.equal(pairCandidate.occurrenceCount, 2);
  assert.equal(pairCandidate.observedCount, 2);
  assert.equal(pairCandidate.suggestedBundleName, "Camera 1 + Sound 1");
  assert.deepEqual(pairCandidate.componentResourceIds, [1001, 2001]);
  assert.deepEqual(pairCandidate.componentRoles, ["camera", "sound"]);
  assert.equal(pairCandidate.confidence, 1);
  assert.ok(diagnostic.compositeResourceCandidateCount > 0);
}

{
  const diagnostic = diagnoseCompositeResources(input([
    { id: 20, planId: 17, templateId: 1, status: "pending", spaceId: 1 },
    { id: 21, planId: 17, templateId: 1, status: "pending", spaceId: 1 },
    { id: 22, planId: 17, templateId: 1, status: "pending", spaceId: 1 },
  ]), output([
    { taskId: 20, startPlanned: "09:00", endPlanned: "09:20", assignedResources: [CAMERA_1] },
    { taskId: 21, startPlanned: "09:20", endPlanned: "09:40", assignedResources: [CAMERA_2] },
    { taskId: 22, startPlanned: "09:40", endPlanned: "10:00", assignedResources: [CAMERA_1] },
  ]));
  assert.equal(diagnostic.resourceSwitchCount, 2);
  assert.deepEqual(diagnostic.resourceSwitchDetails.map((detail) => [detail.spaceName, detail.resourceCategory, detail.switchCount]), [["Main Stage", "camera", 2]]);
}

const declaredBundleInput = (tasks: EngineV3Input["tasks"]): EngineV3Input => ({
  ...input(tasks),
  resourceBundles: [
    { id: "bundle-a", name: "Camera 1 + Sound 1", isActive: true },
    { id: "bundle-b", name: "Camera 2 + Sound 2", isActive: true },
  ],
  resourceBundleComponents: [
    { bundleId: "bundle-a", resourceItemId: 1001, componentRole: "camera", quantity: 1, isRequired: true },
    { bundleId: "bundle-a", resourceItemId: 2001, componentRole: "sound", quantity: 1, isRequired: true },
    { bundleId: "bundle-b", resourceItemId: 1002, componentRole: "camera", quantity: 1, isRequired: true },
    { bundleId: "bundle-b", resourceItemId: 2002, componentRole: "sound", quantity: 1, isRequired: true },
  ],
  resourceBundleSpaceAffinities: [
    { bundleId: "bundle-a", spaceId: 2, affinityScore: 5 },
    { bundleId: "bundle-b", spaceId: 3, affinityScore: 5 },
  ],
});

{
  const diagnostic = diagnoseCompositeResources(declaredBundleInput([
    { id: 30, planId: 17, templateId: 1, status: "pending", spaceId: 2 },
    { id: 31, planId: 17, templateId: 1, status: "pending", spaceId: 1 },
  ]), output([
    { taskId: 30, startPlanned: "09:00", endPlanned: "09:20", assignedResources: [CAMERA_1, SOUND_1] },
    { taskId: 31, startPlanned: "09:20", endPlanned: "09:40", assignedResources: [CAMERA_2] },
  ]));
  assert.equal(diagnostic.declaredResourceBundleCount, 2);
  assert.equal(diagnostic.bundleComponentUsageCount, 3);
  assert.equal(diagnostic.partialBundleUsageWarnings, 1);
  assert.equal(diagnostic.bundleSpaceAffinityMatches, 1);
  assert.equal(diagnostic.bundleSpaceAffinityMismatches, 1);
  assert.ok(diagnostic.resourceDiagnosticWarnings.some((warning) => warning.code === "PARTIAL_DECLARED_BUNDLE"));
  assert.ok(diagnostic.resourceDiagnosticWarnings.some((warning) => warning.code === "BUNDLE_SPACE_AFFINITY_MISMATCH"));
}
