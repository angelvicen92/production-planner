import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { stableStringify } from "../structuralEquality";
import { analyzeOperationalQualityRootCauses } from "./operationalQualityRootCauseAnalyzer";

const input = (): EngineInput => ({
  planId: 185,
  workDay: { start: "09:00", end: "18:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 2,
  tasks: [
    { id: 1, planId: 185, templateId: 1, templateName: "Vocal", status: "pending", contestantId: 11, spaceId: 101, assignedResourceIds: [2] },
    { id: 2, planId: 185, templateId: 2, templateName: "Plató", status: "pending", contestantId: 11, spaceId: 102, dependsOnTaskIds: [1], assignedResourceIds: [2] },
    { id: 3, planId: 185, templateId: 3, templateName: "Coach", status: "pending", contestantId: 12, spaceId: 101, assignedResourceIds: [3] },
    { id: 4, planId: 185, templateId: 4, templateName: "Foto", status: "pending", contestantId: 12, spaceId: 103, assignedResourceIds: [3] },
  ],
  locks: [{ id: 1, planId: 185, taskId: 2, lockType: "time", lockedStart: "12:00", lockedEnd: "13:00" }],
  optimizerMainZoneId: 1,
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [
    { id: 2, resourceItemId: 20, typeId: 1, name: "Coach 2", isAvailable: true },
    { id: 3, resourceItemId: 30, typeId: 1, name: "Coach 3", isAvailable: true },
  ],
  resourceItemComponents: {},
  groupingZoneIds: [],
});

test("root cause analyzer reports compact planning with no idle root cause", () => {
  const report = analyzeOperationalQualityRootCauses(input(), [
    { taskId: 1, startPlanned: "09:00", endPlanned: "10:00", assignedResources: [2] },
    { taskId: 2, startPlanned: "10:00", endPlanned: "11:00", assignedResources: [2] },
  ]);
  assert.equal(report.topResourcesByIdleTime[0].value, 0);
  assert.equal(report.diagnoses.find((item) => item.metric === "resourceIdleTime")?.severity, "none");
  assert.equal(report.planningInfluence, "none");
});

test("root cause analyzer ranks fragmented resources, chains, spaces, and gaps", () => {
  const report = analyzeOperationalQualityRootCauses(input(), [
    { taskId: 1, startPlanned: "09:00", endPlanned: "10:00", assignedResources: [2] },
    { taskId: 3, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [3] },
    { taskId: 2, startPlanned: "12:00", endPlanned: "13:00", assignedResources: [2] },
    { taskId: 4, startPlanned: "16:00", endPlanned: "17:00", assignedResources: [3] },
  ]);
  assert.equal(report.topResourcesByIdleTime[0].id, "3");
  assert.equal(report.topTalentsByPermanence[0].id, "contestant:12");
  assert.equal(report.topChainsByFragmentation[0].id, "contestant:11");
  assert.equal(report.topSpacesByDispersion[0].id, "101");
  assert.equal(report.diagnoses.find((item) => item.metric === "mainFlowContinuity")?.problematicTimeRange?.gapMinutes, 180);
});

test("root cause analyzer is deterministic, serializable, and does not mutate input", () => {
  const source = input();
  const assignments = [
    { taskId: 1, startPlanned: "09:00", endPlanned: "10:00", assignedResources: [2] },
    { taskId: 2, startPlanned: "12:00", endPlanned: "13:00", assignedResources: [2] },
    { taskId: 3, startPlanned: "14:00", endPlanned: "15:00", assignedResources: [3] },
  ];
  const before = stableStringify(source);
  const a = analyzeOperationalQualityRootCauses(source, assignments);
  const b = analyzeOperationalQualityRootCauses(source, assignments);
  assert.equal(stableStringify(a), stableStringify(b));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.equal(stableStringify(source), before);
});
