import test from "node:test";
import assert from "node:assert/strict";
import { resolveORCSpaceOccupancy } from "./spaceOccupancyResolver";
import { resolveORCPlanningEntryOperationalRoleMetadata } from "./nonWorkTaskClassifier";

test("resolveORCSpaceOccupancy distinguishes productive exclusive and arrival non-blocking", () => {
  const productive = resolveORCSpaceOccupancy({ task: { id: 1, planId: 1, templateId: 1, status: "pending" } as any });
  assert.equal(productive.blocksSpace, true);
  assert.equal(productive.spaceOccupancyMode, "exclusive");
  const role = resolveORCPlanningEntryOperationalRoleMetadata({ task: { id: -1, planId: 1, templateId: -1, status: "pending", isArrival: true, isPlaceholder: true } as any });
  const arrival = resolveORCSpaceOccupancy({ roleMetadata: role });
  assert.equal(arrival.blocksSpace, false);
  assert.equal(arrival.spaceOccupancyMode, "non_blocking");
});

test("transport occupancy is shared by role while space contract remains exclusive", () => {
  const occ = resolveORCSpaceOccupancy({ entry: { taskId: 1, startPlanned: "09:00", endPlanned: "09:05", assignedResourceIds: [], spaceId: 49 }, task: { id: 1, planId: 1, templateId: 77, status: "pending" } as any, transportContract: { configured: true, arrivalTemplateId: 77, departureTemplateId: null, vehicleCapacity: 6, source: "test" } });
  assert.equal(occ.blocksSpace, false);
  assert.equal(occ.allowsSpaceOverlap, true);
  assert.equal(occ.transportGroupCapacity, 6);
});
