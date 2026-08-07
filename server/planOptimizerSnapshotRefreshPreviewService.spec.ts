import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlanOptimizerSnapshotV1 } from "./planOptimizerSnapshot";
import { getPlanOptimizerRefreshPreviewV1 } from "./planOptimizerSnapshotRefreshPreviewService";

function baseSettings() {
  return {
    optimizationMode: "advanced", mainZoneId: 7,
    mainZonePriorityLevel: 2, mainZonePriorityAdvancedValue: 8,
    mainZoneFinishEarlyLevel: 1, mainZoneFinishEarlyAdvancedValue: 4,
    mainZoneKeepBusyLevel: 3, mainZoneKeepBusyAdvancedValue: 10,
    groupingLevel: 2, groupingAdvancedValue: 7,
    contestantCompactLevel: 1, contestantCompactAdvancedValue: 5,
    contestantStayInZoneLevel: 3, contestantStayInZoneAdvancedValue: 9,
    contestantTotalSpanLevel: 0, contestantTotalSpanAdvancedValue: 0,
    groupingZoneIds: [7], arrivalTaskTemplateName: "IN", departureTaskTemplateName: "OUT",
    arrivalGroupingTarget: 2, departureGroupingTarget: 2,
    arrivalMinGapMinutes: 10, departureMinGapMinutes: 15,
    vanCapacity: 8, weightArrivalDepartureGrouping: 5, nearHardBreaksMax: 4,
  };
}

function fixture() {
  const calls: string[] = [];
  const current = normalizePlanOptimizerSnapshotV1(baseSettings(), {
    arrivalPlanTemplateSnapshotId: 101, departurePlanTemplateSnapshotId: 102,
  }, "INHERITED");
  const storage = {
    getPlanOptimizerSnapshot: async (planId: number) => { calls.push(`snapshot:${planId}`); return current; },
    getOptimizerSettings: async () => { calls.push("global"); return baseSettings(); },
    getPlanTaskTemplateSnapshots: async (planId: number) => { calls.push(`templates:${planId}`); return [
      { planTemplateSnapshotId: 101, sourceTemplateId: 1, templateName: "IN" },
      { planTemplateSnapshotId: 102, sourceTemplateId: 2, templateName: "OUT" },
    ] as any; },
    getPlanZoneSettings: async (planId: number) => { calls.push(`zones:${planId}`); return [{ zone_id: 7 }]; },
  };
  return { storage: storage as any, current, calls };
}

test("service loads exactly the four authoritative read sources and returns the pure preview", async () => {
  const f = fixture();
  const preview = await getPlanOptimizerRefreshPreviewV1(44, f.storage);
  assert.equal(preview.status, "READY");
  assert.equal(preview.diff?.hasSemanticChanges, false);
  assert.deepEqual(new Set(f.calls), new Set(["snapshot:44", "global", "templates:44", "zones:44"]));
  assert.equal(f.calls.length, 4);
});

test("invalid plan id fails before any storage read", async () => {
  const f = fixture();
  await assert.rejects(() => getPlanOptimizerRefreshPreviewV1("bad", f.storage), /INVALID_PLAN_ID/);
  assert.deepEqual(f.calls, []);
});

test("daily zone rows accept storage snake_case and camelCase without global catalog lookup", async () => {
  const f = fixture();
  f.storage.getPlanZoneSettings = async () => [{ zoneId: 7 }] as any;
  const preview = await getPlanOptimizerRefreshPreviewV1(44, f.storage);
  assert.equal(preview.status, "READY");
});
