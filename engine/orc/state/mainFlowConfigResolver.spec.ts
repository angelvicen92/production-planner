import test from "node:test";
import assert from "node:assert/strict";
import { resolveORCMainFlowConfig } from "./mainFlowConfigResolver";

const base = { planId: 1, tasks: [], locks: [], workDay: { start: "09:00", end: "18:00" }, meal: { start: "13:00", end: "14:00" }, camerasAvailable: 1, zoneResourceAssignments: {}, spaceResourceAssignments: {}, zoneResourceTypeRequirements: {}, spaceResourceTypeRequirements: {}, planResourceItems: [], resourceItemComponents: {}, groupingZoneIds: [] } as any;

test("detects direct constraints optimizer mainZoneId and does not mutate", () => {
  const input = { ...base, constraints: { optimizer: { mainZoneId: 7 } } };
  const before = JSON.stringify(input);
  assert.deepEqual(resolveORCMainFlowConfig(input), { configured: true, mainFlowId: 7, source: "constraints.optimizer.mainZoneId", warnings: [], readOnly: true, planningInfluence: "configuration-resolution-only" });
  assert.equal(JSON.stringify(input), before);
});

test("adapts V4 equivalent aliases and priority config deterministically", () => {
  assert.equal(resolveORCMainFlowConfig({ ...base, mainFlowSpaceId: "8" }).mainFlowId, 8);
  assert.deepEqual(resolveORCMainFlowConfig({ ...base, spacePriorityById: { 4: 10, 9: 10 } }), { configured: true, mainFlowId: 4, source: "spacePriorityById:max", warnings: [], readOnly: true, planningInfluence: "configuration-resolution-only" });
});

test("does not infer by space name and reports stable warning", () => {
  const result = resolveORCMainFlowConfig({ ...base, spaceNameById: { 7: "Plató 7" } });
  assert.equal(result.configured, false);
  assert.equal(result.mainFlowId, null);
  assert.deepEqual(result.warnings, ["main_flow_not_configured"]);
});
