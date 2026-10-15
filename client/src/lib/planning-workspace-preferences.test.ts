import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizedPlanningViews,
  planningViews,
  toggledPlanningViews,
} from "./planning-workspace-preferences";
test("all seven nonempty view combinations are representable and the final pane remains recoverable", () => {
  for (let mask = 1; mask < 8; mask++) {
    const wanted = planningViews.filter((_, index) => mask & (1 << index));
    assert.deepEqual(normalizedPlanningViews(wanted), wanted);
    for (const view of planningViews) {
      const next = toggledPlanningViews(wanted, view);
      assert.ok(next.length > 0);
      if (wanted.length === 1 && wanted.includes(view))
        assert.deepEqual(next, wanted);
    }
  }
  for (const invalid of [null, [], ["legacy"], {}, "resources"])
    assert.deepEqual(normalizedPlanningViews(invalid), ["contestants"]);
});
test("operator order survives normalization, toggles and stale storage", () => {
  assert.deepEqual(normalizedPlanningViews(["resources", "spaces", "resources", "unknown", "contestants"]), ["resources", "spaces", "contestants"]);
  assert.deepEqual(toggledPlanningViews(["spaces", "contestants"], "resources"), ["spaces", "contestants", "resources"]);
  assert.deepEqual(toggledPlanningViews(["spaces", "contestants", "resources"], "contestants"), ["spaces", "resources"]);
});
