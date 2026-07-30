import assert from "node:assert/strict";
import test from "node:test";
import {
  itinerantOperationProfiles,
  itinerantUnitProfiles,
  projectStandaloneFocalA2RealityProblem,
  realityReferenceValidation,
} from "./focalA2RealityReference";

test("generic itinerant contract separates standalone and wrapped operations", () => {
  assert.deepEqual(realityReferenceValidation, {
    operationProfileCount: 12, wrappedOperationCount: 3, standaloneOperationCount: 9,
    wrappedBeforeSegmentCount: 3, wrappedAfterSegmentCount: 3, wrappedAnchorCount: 3,
    totalItinerantResourceMinutes: 375, projectedTaskCountWhenSupported: 53,
  });
  const wrapped = itinerantOperationProfiles.filter((operation) => operation.type === "WRAP_ANCHOR");
  assert.deepEqual(wrapped.map((operation) => operation.participantId).sort(), ["cristina-zuloaga", "jose-javier-cuenca", "julio-gomez"]);
  assert.ok(wrapped.every((operation) => operation.before.duration === 15 && operation.after.duration === 15 && operation.adjacency === "REQUIRED"));
});

test("unit IDs group configuration but never become required resources", () => {
  assert.deepEqual(itinerantUnitProfiles.map((unit) => unit.memberResourceIds), [
    ["reality-camera-3", "reality-sound-1"],
    ["reality-camera-4", "reality-sound-2"],
    ["reality-camera-3", "reality-camera-4", "reality-sound-1"],
  ]);
  const problem = projectStandaloneFocalA2RealityProblem();
  const unitIds = new Set(itinerantUnitProfiles.map((unit) => unit.id));
  assert.equal(problem.tasks.filter((task) => task.id.startsWith("reality-operation")).length, 9);
  assert.ok(problem.tasks.every((task) => task.requiredResourceIds?.every((id) => !unitIds.has(id)) ?? true));
  assert.equal(problem.tasks.length, 47);
});
