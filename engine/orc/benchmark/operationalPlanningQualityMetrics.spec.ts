import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { stableStringify } from "../structuralEquality";
import { calculateOperationalPlanningQualityMetrics } from "./operationalPlanningQualityMetrics";

const input = (): EngineInput => ({
  planId: 183,
  workDay: { start: "09:00", end: "18:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 2,
  tasks: [
    { id: 1, planId: 183, templateId: 1, status: "pending", contestantId: 1, startPlanned: "09:00", endPlanned: "10:00", assignedResourceIds: [7] },
    { id: 2, planId: 183, templateId: 2, status: "pending", contestantId: 1, startPlanned: "10:00", endPlanned: "11:00", assignedResourceIds: [7] },
    { id: 3, planId: 183, templateId: 3, status: "pending", contestantId: 2, startPlanned: "13:00", endPlanned: "14:00", assignedResourceIds: [8] },
  ],
  locks: [],
  optimizerMainZoneId: 1,
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [
    { id: 7, resourceItemId: 70, typeId: 1, name: "Coach 1", isAvailable: true },
    { id: 8, resourceItemId: 80, typeId: 1, name: "Coach 2", isAvailable: true },
  ],
  resourceItemComponents: {},
  groupingZoneIds: [],
});

test("OPQM measures compact planning", () => {
  const report = calculateOperationalPlanningQualityMetrics(input(), [
    { taskId: 1, startPlanned: "09:00", endPlanned: "10:00", assignedResources: [7] },
    { taskId: 2, startPlanned: "10:00", endPlanned: "11:00", assignedResources: [7] },
  ]);
  assert.equal(report.resourceActiveSpan["7"], 120);
  assert.equal(report.resourceEffectiveWork["7"], 120);
  assert.equal(report.resourceIdleTime["7"], 0);
  assert.equal(report.resourceFragmentation["7"], 1);
  assert.equal(report.talentIdleTime["contestant:1"], 0);
  assert.equal(report.mainFlowContinuityQuality.interruptions, 0);
});

test("OPQM measures fragmented resources and talents", () => {
  const report = calculateOperationalPlanningQualityMetrics(input(), [
    { taskId: 1, startPlanned: "09:00", endPlanned: "10:00", assignedResources: [7] },
    { taskId: 2, startPlanned: "12:00", endPlanned: "13:00", assignedResources: [7] },
    { taskId: 3, startPlanned: "16:00", endPlanned: "17:00", assignedResources: [8] },
  ]);
  assert.equal(report.resourceActiveSpan["7"], 240);
  assert.equal(report.resourceIdleTime["7"], 120);
  assert.equal(report.resourceFragmentation["7"], 2);
  assert.equal(report.talentIdleTime["contestant:1"], 120);
  assert.equal(report.mainFlowContinuityQuality.gaps, 300);
  assert.ok(report.operationalCompactness < 1);
});

test("OPQM supports multiple resources, multiple talents, deterministic serialization, and no mutation", () => {
  const source = input();
  const before = stableStringify(source);
  const assignments = [
    { taskId: 1, startPlanned: "09:00", endPlanned: "10:00", assignedResources: [7, 8] },
    { taskId: 2, startPlanned: "11:00", endPlanned: "12:00", assignedResources: [7] },
    { taskId: 3, startPlanned: "12:00", endPlanned: "12:30", assignedResources: [8] },
  ];
  const a = calculateOperationalPlanningQualityMetrics(source, assignments, { idleTime: true, fragmentation: true, spread: false });
  const b = calculateOperationalPlanningQualityMetrics(source, assignments, { idleTime: true, fragmentation: true, spread: false });
  assert.equal(stableStringify(a), stableStringify(b));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.equal(stableStringify(source), before);
  assert.deepEqual(a.criticalResourceSpread.resourceIds, ["7"]);
  assert.equal(a.operationalCompactnessConfig.spread, false);
});
