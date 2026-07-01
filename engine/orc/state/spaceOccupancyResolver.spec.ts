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
