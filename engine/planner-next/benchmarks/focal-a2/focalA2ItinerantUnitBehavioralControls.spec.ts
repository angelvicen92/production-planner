import assert from "node:assert/strict";
import test from "node:test";
import { createItinerantBehaviorProblem, runFocalA2ItinerantUnitBehavioralControls } from "./focalA2ItinerantUnitBehavioralControls";

test("generic execution demonstrates exact A/B composition, parallelism, and later C recomposition", () => {
  const control = runFocalA2ItinerantUnitBehavioralControls();
  assert.equal(control.status, "BEHAVIORALLY_SUPPORTED");
  assert.deepEqual(control.exactResourceSets["unit-a-1"], ["camera-a", "sound-a"]);
  assert.deepEqual(control.exactResourceSets["unit-b-1"], ["camera-b", "sound-b"]);
  assert.deepEqual(control.exactResourceSets["unit-c-1"], ["camera-a", "camera-b", "sound-a"]);
  assert.equal(control.parallelUnits, true); assert.equal(control.recomposition, true); assert.equal(control.exclusivity, true);
  assert.equal(control.availability, true); assert.equal(control.variableDurations, true); assert.equal(control.locationChange, true);
  assert.equal(control.deterministic, true); assert.equal(control.orderInvariant, true); assert.equal(control.inputUnchanged, true);
});

test("control input uses distinct availability and never models unit ids as resources", () => {
  const problem = createItinerantBehaviorProblem();
  assert.equal(problem.resources.some(({ id }) => id.startsWith("unit-")), false);
  assert.notDeepEqual(problem.resources.find(({ id }) => id === "camera-a")!.availability, problem.resources.find(({ id }) => id === "camera-b")!.availability);
});
