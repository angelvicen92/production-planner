import test from "node:test";
import assert from "node:assert/strict";
import { analyzeStrategicScenario } from "./index";
import type { EngineInput } from "../../types";

const baseInput = (overrides: Partial<EngineInput> = {}): EngineInput => ({
  planId: 1,
  workDay: { start: "09:00", end: "12:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 1,
  tasks: [
    { id: 1, planId: 1, templateId: 1, templateName: "Main", zoneId: 10, spaceId: 10, contestantId: 100, contestantName: "Ana", status: "pending", durationOverrideMin: 90, resourceRequirements: { byItem: { 501: 1 } } },
    { id: 2, planId: 1, templateId: 2, templateName: "Feed", zoneId: 20, spaceId: 20, contestantId: 100, contestantName: "Ana", status: "pending", durationOverrideMin: 60, dependsOnTaskIds: [1] },
    { id: 3, planId: 1, templateId: 3, templateName: "Done", zoneId: 20, spaceId: 20, contestantId: 101, status: "done", durationOverrideMin: 120 },
  ],
  locks: [],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  groupingZoneIds: [],
  planResourceItems: [{ id: 501, resourceItemId: 501, typeId: 1, name: "Camera A", isAvailable: true }],
  resourceItemComponents: {},
  spaceNameById: { 10: "Plató principal", 20: "Feeder" },
  spaceCapacityById: { 10: 1, 20: 1 },
  spacePriorityById: { 10: 5, 20: 2 },
  optimizerMainZoneId: 10,
  optimizerPrioritizeMainZone: true,
  optimizerMainZonePriorityLevel: 3,
  optimizerMainZoneOptKeepBusy: true,
  contestantAvailabilityById: { 100: { start: "09:00", end: "11:00" } },
  ...overrides,
});

test("V4 strategic analysis detects main flow, continuous spaces, pressures and risk", () => {
  const analysis = analyzeStrategicScenario(baseInput());
  assert.equal(analysis.mainFlow?.id, 10);
  assert.equal(analysis.continuousSpaces[0]?.id, 10);
  assert.equal(analysis.criticalTalents[0]?.id, 100);
  assert.equal(analysis.criticalResources[0]?.id, 501);
  assert.equal(analysis.criticalSpaces[0]?.id, 10);
  assert.ok(["MEDIUM", "HIGH", "CRITICAL"].includes(analysis.riskScore));
});

test("V4 strategic analysis warns but continues without a main flow", () => {
  const analysis = analyzeStrategicScenario(baseInput({ optimizerMainZoneId: null, optimizerPrioritizeMainZone: false, optimizerMainZonePriorityLevel: 0 }));
  assert.equal(analysis.mainFlow, null);
  assert.ok(analysis.warnings.some((warning) => warning.code === "V4_MAIN_FLOW_NOT_CONFIGURED"));
  assert.ok(Array.isArray(analysis.criticalSpaces));
});
