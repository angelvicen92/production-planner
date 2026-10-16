import assert from "node:assert/strict";
import test from "node:test";
import { assignedPlanningLocations, clampPanelRatio, planningRange, zoomAxes } from "./planning-workspace-geometry";

test("assigned locations include unscheduled work and inherit only its actual physical zone", () => {
  const locations = assignedPlanningLocations([{ spaceId: 8 }, { zoneId: 3 }, { spaceId: null, zoneId: null }, { spaceId: 9, zoneId: 99 }], [{ id: 8, zoneId: 2 }, { id: 9, zoneId: 4 }, { id: 10, zoneId: 5 }]);
  assert.deepEqual([...locations.spaceIds], [8, 9]);
  assert.deepEqual([...locations.zoneIds], [2, 3, 4]);
});
test("both frames retain out-of-day obligations and partial time bounds", () => {
  const tasks = [{ startPlanned: "07:30", endPlanned: "22:30" }, { startPlanned: null, endPlanned: null }];
  assert.deepEqual(planningRange(540, 1260, tasks, "day"), { start: 450, end: 1350 });
  assert.deepEqual(planningRange(540, 1260, tasks, "tasks"), { start: 435, end: 1365 });
  assert.deepEqual(planningRange(540, 1260, [], "tasks"), { start: 540, end: 1260 });
  assert.deepEqual(planningRange(540, 1260, [{startPlanned:"10:00",endPlanned:"11:00"}], "tasks"), { start: 585, end: 675 });
});
test("independent axes and bounded linked zoom preserve proportions", () => {
  assert.deepEqual(zoomAxes(100, 150, "x", 2), { zoomX: 200, zoomY: 150 });
  assert.deepEqual(zoomAxes(100, 150, "y", 2), { zoomX: 100, zoomY: 300 });
  assert.deepEqual(zoomAxes(100, 200, "linked", 2), { zoomX: 150, zoomY: 300 });
  assert.deepEqual(zoomAxes(10, 40, "linked", .5), { zoomX: 10, zoomY: 40 });
  assert.equal(clampPanelRatio(2), 30); assert.equal(clampPanelRatio(90), 70); assert.equal(clampPanelRatio("60"), 50);
});

test("fit uses intrinsic geometry and fixed chrome, independent of previous zoom", async () => {
  const { fitPlanningZoom, resourceColumnWidth } = await import("./planning-workspace-geometry");
  const content = { width: 1440, height: 960, fixedWidth: 192, fixedHeight: 92 };
  assert.deepEqual(fitPlanningZoom({ width: 1200, height: 764 }, content), { zoomX: 70, zoomY: 70 });
  assert.deepEqual(fitPlanningZoom({ width: 912, height: 572 }, content), { zoomX: 50, zoomY: 50 });
  assert.deepEqual(fitPlanningZoom({ width: 0, height: 0 }, content), { zoomX: 10, zoomY: 10 });
  assert.equal(resourceColumnWidth(25), 240);
  assert.equal(resourceColumnWidth(100), 280);
  assert.equal(resourceColumnWidth(250), 400);
});
