import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlanOptimizerSnapshotV1 } from "./planOptimizerSnapshot";
import { buildPlanOptimizerRefreshPreviewV1 } from "./planOptimizerSnapshotRefreshPreview";

function settings(overrides: Record<string, unknown> = {}) {
  return {
    optimizationMode: "advanced",
    mainZoneId: 7,
    mainZonePriorityLevel: 2,
    mainZonePriorityAdvancedValue: 8,
    mainZoneFinishEarlyLevel: 1,
    mainZoneFinishEarlyAdvancedValue: 4,
    mainZoneKeepBusyLevel: 3,
    mainZoneKeepBusyAdvancedValue: 10,
    groupingLevel: 2,
    groupingAdvancedValue: 7,
    contestantCompactLevel: 1,
    contestantCompactAdvancedValue: 5,
    contestantStayInZoneLevel: 3,
    contestantStayInZoneAdvancedValue: 9,
    contestantTotalSpanLevel: 0,
    contestantTotalSpanAdvancedValue: 0,
    groupingZoneIds: [3, 5, 9],
    arrivalTaskTemplateName: "IN",
    departureTaskTemplateName: "OUT",
    arrivalGroupingTarget: 2,
    departureGroupingTarget: 2,
    arrivalMinGapMinutes: 10,
    departureMinGapMinutes: 15,
    vanCapacity: 8,
    weightArrivalDepartureGrouping: 5,
    nearHardBreaksMax: 4,
    ...overrides,
  };
}

const dailyTemplates = [
  { sourceTemplateId: 1, templateName: "IN", planTemplateSnapshotId: 101 },
  { sourceTemplateId: 2, templateName: "OUT", planTemplateSnapshotId: 102 },
] as const;

const dailyZones = [3, 5, 7, 9] as const;

function current(overrides: Record<string, unknown> = {}, source: "INHERITED" | "LEGACY_BACKFILL" | "DAY_OVERRIDE" = "INHERITED") {
  return normalizePlanOptimizerSnapshotV1(
    settings(overrides),
    { arrivalPlanTemplateSnapshotId: 101, departurePlanTemplateSnapshotId: 102 },
    source,
  );
}

test("equivalent global defaults produce READY preview with provenance-only candidate", () => {
  const existing = current();
  const preview = buildPlanOptimizerRefreshPreviewV1({
    currentSnapshot: existing,
    globalOptimizerSettings: settings(),
    dailyTemplateSnapshots: dailyTemplates,
    dailyZoneIds: dailyZones,
  });

  assert.equal(preview.status, "READY");
  assert.equal(preview.candidate?.source, "DAY_OVERRIDE");
  assert.equal(preview.diff?.hasSemanticChanges, false);
  assert.equal(preview.diff?.provenanceChanged, true);
  assert.equal(preview.diff?.replanningRequiredForEffect, false);
  assert.deepEqual(preview.incompatibilities, []);
});

test("changed global defaults produce canonical semantic diff but do not mutate the current snapshot", () => {
  const existing = current();
  const fingerprint = existing.configurationFingerprint;
  const preview = buildPlanOptimizerRefreshPreviewV1({
    currentSnapshot: existing,
    globalOptimizerSettings: settings({
      mainZonePriorityAdvancedValue: 10,
      arrivalGroupingTarget: 4,
      nearHardBreaksMax: 6,
    }),
    dailyTemplateSnapshots: dailyTemplates,
    dailyZoneIds: dailyZones,
  });

  assert.equal(preview.status, "READY");
  assert.equal(existing.configurationFingerprint, fingerprint);
  assert.equal(preview.diff?.hasSemanticChanges, true);
  assert.equal(preview.diff?.replanningRequiredForEffect, true);
  assert.deepEqual(preview.diff?.changes.map((change) => change.path), [
    "heuristics.MAIN_ZONE_PRIORITY",
    "transport.arrivalGroupingTarget",
    "nearHardBreaksMax",
  ]);
});

test("transport names are resolved only to unambiguous daily snapshot identities", () => {
  const preview = buildPlanOptimizerRefreshPreviewV1({
    currentSnapshot: current(),
    globalOptimizerSettings: settings({ arrivalTaskTemplateName: " in ", departureTaskTemplateName: "out" }),
    dailyTemplateSnapshots: dailyTemplates,
    dailyZoneIds: dailyZones,
  });

  assert.equal(preview.status, "READY");
  assert.equal(preview.candidate?.transport.arrivalPlanTemplateSnapshotId, 101);
  assert.equal(preview.candidate?.transport.departurePlanTemplateSnapshotId, 102);
});

test("active ambiguous transport is BLOCKED and never chooses the first daily identity", () => {
  const preview = buildPlanOptimizerRefreshPreviewV1({
    currentSnapshot: current(),
    globalOptimizerSettings: settings(),
    dailyTemplateSnapshots: [
      ...dailyTemplates,
      { sourceTemplateId: 3, templateName: " in ", planTemplateSnapshotId: 103 },
    ],
    dailyZoneIds: dailyZones,
  });

  assert.equal(preview.status, "BLOCKED");
  assert.equal(preview.candidate, null);
  assert.equal(preview.diff, null);
  assert.equal(preview.incompatibilities[0]?.code, "ACTIVE_TRANSPORT_TEMPLATE_UNRESOLVED");
  assert.equal(preview.incompatibilities[0]?.details.matchCount, 2);
});

test("candidate zone outside the daily spatial snapshot is BLOCKED", () => {
  const preview = buildPlanOptimizerRefreshPreviewV1({
    currentSnapshot: current(),
    globalOptimizerSettings: settings({ mainZoneId: 11 }),
    dailyTemplateSnapshots: dailyTemplates,
    dailyZoneIds: dailyZones,
  });

  assert.equal(preview.status, "BLOCKED");
  assert.equal(preview.incompatibilities[0]?.code, "PLAN_OPTIMIZER_ZONE_OUT_OF_SCOPE");
  assert.deepEqual(preview.incompatibilities[0]?.details.zoneIds, [11]);
});

test("inactive ambiguous transport may preview as null instead of blocking", () => {
  const preview = buildPlanOptimizerRefreshPreviewV1({
    currentSnapshot: current(),
    globalOptimizerSettings: settings({ arrivalGroupingTarget: 0 }),
    dailyTemplateSnapshots: [
      ...dailyTemplates,
      { sourceTemplateId: 3, templateName: "IN", planTemplateSnapshotId: 103 },
    ],
    dailyZoneIds: dailyZones,
  });

  assert.equal(preview.status, "READY");
  assert.equal(preview.candidate?.transport.arrivalPlanTemplateSnapshotId, null);
});

test("known invalid global optimizer input becomes deterministic BLOCKED preview", () => {
  const preview = buildPlanOptimizerRefreshPreviewV1({
    currentSnapshot: current(),
    globalOptimizerSettings: null,
    dailyTemplateSnapshots: dailyTemplates,
    dailyZoneIds: dailyZones,
  });

  assert.equal(preview.status, "BLOCKED");
  assert.equal(preview.incompatibilities[0]?.code, "INVALID_GLOBAL_OPTIMIZER_SETTINGS");
});

test("preview result is deeply frozen", () => {
  const preview = buildPlanOptimizerRefreshPreviewV1({
    currentSnapshot: current(),
    globalOptimizerSettings: settings({ nearHardBreaksMax: 8 }),
    dailyTemplateSnapshots: dailyTemplates,
    dailyZoneIds: dailyZones,
  });

  assert.ok(Object.isFrozen(preview));
  assert.ok(Object.isFrozen(preview.current));
  assert.ok(Object.isFrozen(preview.incompatibilities));
  if (preview.status === "READY") {
    assert.ok(Object.isFrozen(preview.candidate));
    assert.ok(Object.isFrozen(preview.diff));
  }
});
