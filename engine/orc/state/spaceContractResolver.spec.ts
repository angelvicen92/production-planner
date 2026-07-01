import test from "node:test";
import assert from "node:assert/strict";
import { resolveORCSpaceContract } from "./spaceContractResolver";

test("resolveORCSpaceContract keeps spaces exclusive by default", () => {
  const c = resolveORCSpaceContract({ spaceId: 49, spaceConfig: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} } });
  assert.equal(c.capacity, 1);
  assert.equal(c.occupancyMode, "exclusive");
});

test("resolveORCSpaceContract honors structured capacity and simultaneity", () => {
  const c = resolveORCSpaceContract({ spaceId: 1, space: { maxConcurrentTasks: 3, allowsSimultaneity: true } });
  assert.equal(c.capacity, 3);
  assert.equal(c.occupancyMode, "shared");
});
