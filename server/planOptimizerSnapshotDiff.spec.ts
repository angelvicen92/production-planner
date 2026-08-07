import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePlanOptimizerSnapshotV1,
  type PlanOptimizerTransportSnapshotReferencesV1,
} from "./planOptimizerSnapshot";
import { diffPlanOptimizerSnapshotsV1 } from "./planOptimizerSnapshotDiff";

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
    groupingZoneIds: [9, 3, 5],
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

const references: PlanOptimizerTransportSnapshotReferencesV1 = {
  arrivalPlanTemplateSnapshotId: 101,
  departurePlanTemplateSnapshotId: 102,
};

function snapshot(
  overrides: Record<string, unknown> = {},
  source: "INHERITED" | "LEGACY_BACKFILL" | "DAY_OVERRIDE" = "INHERITED",
  refs: PlanOptimizerTransportSnapshotReferencesV1 = references,
) {
  return normalizePlanOptimizerSnapshotV1(settings(overrides), refs, source);
}

test("source/provenance change alone is not a semantic optimizer diff", () => {
  const current = snapshot({}, "INHERITED");
  const candidate = snapshot({}, "DAY_OVERRIDE");
  const diff = diffPlanOptimizerSnapshotsV1(current, candidate);

  assert.equal(current.configurationFingerprint, candidate.configurationFingerprint);
  assert.equal(diff.provenanceChanged, true);
  assert.equal(diff.hasSemanticChanges, false);
  assert.equal(diff.replanningRequiredForEffect, false);
  assert.deepEqual(diff.changes, []);
});

test("diff order is canonical across mode, zone, heuristics, grouping, transport and near-hard", () => {
  const current = snapshot();
  const candidate = snapshot({
    optimizationMode: "basic",
    mainZoneId: 8,
    mainZonePriorityLevel: 1,
    mainZonePriorityAdvancedValue: 3,
    groupingZoneIds: [11, 5],
    arrivalGroupingTarget: 4,
    departureMinGapMinutes: 25,
    vanCapacity: 12,
    weightArrivalDepartureGrouping: 7,
    nearHardBreaksMax: 6,
  }, "DAY_OVERRIDE", {
    arrivalPlanTemplateSnapshotId: 201,
    departurePlanTemplateSnapshotId: 102,
  });
  const diff = diffPlanOptimizerSnapshotsV1(current, candidate);

  assert.equal(diff.hasSemanticChanges, true);
  assert.equal(diff.replanningRequiredForEffect, true);
  assert.deepEqual(diff.changes.map((change) => change.path), [
    "editingMode",
    "mainZoneId",
    "heuristics.MAIN_ZONE_PRIORITY",
    "heuristics.MAIN_ZONE_FINISH_EARLY",
    "heuristics.MAIN_ZONE_KEEP_BUSY",
    "heuristics.CONTESTANT_COMPACT",
    "heuristics.GROUP_BY_SPACE_TEMPLATE_MATCH",
    "heuristics.GROUP_BY_SPACE_ACTIVE",
    "heuristics.ARRIVAL_DEPARTURE_GROUPING",
    "groupingZoneIds",
    "transport.arrivalPlanTemplateSnapshotId",
    "transport.arrivalGroupingTarget",
    "transport.departureMinGapMinutes",
    "transport.vanCapacity",
    "transport.groupingWeight",
    "nearHardBreaksMax",
  ]);
});

test("heuristic diff exposes basic, advanced and effective values without flattening authority", () => {
  const current = snapshot();
  const candidate = snapshot({ contestantCompactAdvancedValue: 9 }, "DAY_OVERRIDE");
  const diff = diffPlanOptimizerSnapshotsV1(current, candidate);
  const change = diff.changes.find((entry) => entry.heuristicKey === "CONTESTANT_COMPACT");

  assert.ok(change);
  assert.equal(change?.category, "HEURISTIC");
  assert.deepEqual(change?.currentValue, { basicLevel: 1, advancedValue: 5, effectiveWeight: 5 });
  assert.deepEqual(change?.candidateValue, { basicLevel: 1, advancedValue: 9, effectiveWeight: 9 });
});

test("contestant total span is visible in diff even though the legacy adapter still neutralizes it", () => {
  const current = snapshot();
  const candidate = snapshot({ contestantTotalSpanLevel: 2, contestantTotalSpanAdvancedValue: 6 }, "DAY_OVERRIDE");
  const diff = diffPlanOptimizerSnapshotsV1(current, candidate);

  assert.deepEqual(diff.changes.map((change) => change.path), ["heuristics.CONTESTANT_TOTAL_SPAN"]);
  assert.equal(diff.hasSemanticChanges, true);
});

test("grouping zones compare canonical sets, not caller order or duplicates", () => {
  const current = snapshot({ groupingZoneIds: [9, 3, 5, 9] });
  const candidate = snapshot({ groupingZoneIds: [5, 9, 3] }, "DAY_OVERRIDE");
  const diff = diffPlanOptimizerSnapshotsV1(current, candidate);

  assert.deepEqual(current.groupingZoneIds, [3, 5, 9]);
  assert.deepEqual(candidate.groupingZoneIds, [3, 5, 9]);
  assert.equal(diff.hasSemanticChanges, false);
  assert.deepEqual(diff.changes, []);
});

test("legacy provenance is explicit but does not manufacture a semantic change", () => {
  const current = snapshot({}, "LEGACY_BACKFILL");
  const candidate = snapshot({}, "DAY_OVERRIDE");
  const diff = diffPlanOptimizerSnapshotsV1(current, candidate);

  assert.deepEqual(diff.warnings, ["CURRENT_OPTIMIZER_SNAPSHOT_LEGACY_BACKFILL"]);
  assert.equal(diff.provenanceChanged, true);
  assert.equal(diff.hasSemanticChanges, false);
});

test("diff output is deeply frozen and inputs remain untouched", () => {
  const current = snapshot();
  const candidate = snapshot({ nearHardBreaksMax: 8 }, "DAY_OVERRIDE");
  const currentFingerprint = current.configurationFingerprint;
  const candidateFingerprint = candidate.configurationFingerprint;
  const diff = diffPlanOptimizerSnapshotsV1(current, candidate);

  assert.equal(current.configurationFingerprint, currentFingerprint);
  assert.equal(candidate.configurationFingerprint, candidateFingerprint);
  assert.ok(Object.isFrozen(diff));
  assert.ok(Object.isFrozen(diff.current));
  assert.ok(Object.isFrozen(diff.candidate));
  assert.ok(Object.isFrozen(diff.changes));
  assert.ok(Object.isFrozen(diff.changes[0]));
  assert.ok(Object.isFrozen(diff.warnings));
});