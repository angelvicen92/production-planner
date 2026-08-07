import assert from "node:assert/strict";
import test from "node:test";
import {
  PLAN_OPTIMIZER_HEURISTIC_KEYS_V1,
  PlanOptimizerSnapshotError,
  normalizePlanOptimizerSnapshotV1,
} from "./planOptimizerSnapshot";

function baseSettings(overrides: Record<string, unknown> = {}) {
  return {
    optimizationMode: "basic",
    mainZoneId: 7,
    prioritizeMainZone: true,
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
    contestantTotalSpanLevel: 2,
    contestantTotalSpanAdvancedValue: 6,
    groupingZoneIds: [9, 3, 9, 5],
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

const transportRefs = {
  arrivalPlanTemplateSnapshotId: 101,
  departurePlanTemplateSnapshotId: 102,
} as const;

test("normalizes the complete V1 heuristic set in BASIC mode", () => {
  const snapshot = normalizePlanOptimizerSnapshotV1(baseSettings(), transportRefs);

  assert.equal(snapshot.contractVersion, 1);
  assert.equal(snapshot.source, "INHERITED");
  assert.equal(snapshot.editingMode, "BASIC");
  assert.equal(snapshot.mainZoneId, 7);
  assert.deepEqual(Object.keys(snapshot.heuristics), [...PLAN_OPTIMIZER_HEURISTIC_KEYS_V1]);
  assert.equal(snapshot.heuristics.MAIN_ZONE_PRIORITY.effectiveWeight, 6);
  assert.equal(snapshot.heuristics.MAIN_ZONE_FINISH_EARLY.effectiveWeight, 3);
  assert.equal(snapshot.heuristics.MAIN_ZONE_KEEP_BUSY.effectiveWeight, 9);
  assert.equal(snapshot.heuristics.CONTESTANT_COMPACT.effectiveWeight, 3);
  assert.equal(snapshot.heuristics.GROUP_BY_SPACE_TEMPLATE_MATCH.effectiveWeight, 6);
  assert.equal(snapshot.heuristics.GROUP_BY_SPACE_ACTIVE.effectiveWeight, 6);
  assert.equal(snapshot.heuristics.CONTESTANT_STAY_IN_ZONE.effectiveWeight, 9);
  assert.equal(snapshot.heuristics.CONTESTANT_TOTAL_SPAN.effectiveWeight, 6);
  assert.deepEqual(snapshot.groupingZoneIds, [3, 5, 9]);
});

test("ADVANCED mode uses advanced values for mode-controlled heuristics", () => {
  const snapshot = normalizePlanOptimizerSnapshotV1(
    baseSettings({ optimizationMode: "advanced" }),
    transportRefs,
  );

  assert.equal(snapshot.editingMode, "ADVANCED");
  assert.equal(snapshot.heuristics.MAIN_ZONE_PRIORITY.effectiveWeight, 8);
  assert.equal(snapshot.heuristics.MAIN_ZONE_FINISH_EARLY.effectiveWeight, 4);
  assert.equal(snapshot.heuristics.MAIN_ZONE_KEEP_BUSY.effectiveWeight, 10);
  assert.equal(snapshot.heuristics.CONTESTANT_COMPACT.effectiveWeight, 5);
  assert.equal(snapshot.heuristics.GROUP_BY_SPACE_TEMPLATE_MATCH.effectiveWeight, 7);
  assert.equal(snapshot.heuristics.CONTESTANT_STAY_IN_ZONE.effectiveWeight, 9);
});

test("transport grouping preserves the current direct 0..10 weight independently of edit mode", () => {
  const basic = normalizePlanOptimizerSnapshotV1(baseSettings({ optimizationMode: "basic" }), transportRefs);
  const advanced = normalizePlanOptimizerSnapshotV1(baseSettings({ optimizationMode: "advanced" }), transportRefs);

  assert.equal(basic.transport.groupingWeight, 5);
  assert.equal(advanced.transport.groupingWeight, 5);
  assert.equal(basic.heuristics.ARRIVAL_DEPARTURE_GROUPING.advancedValue, 5);
  assert.equal(basic.heuristics.ARRIVAL_DEPARTURE_GROUPING.effectiveWeight, 5);
  assert.equal(advanced.heuristics.ARRIVAL_DEPARTURE_GROUPING.effectiveWeight, 5);
  assert.equal(basic.heuristics.ARRIVAL_DEPARTURE_GROUPING.basicLevel, 2);
});

test("legacy fallbacks are normalized deterministically without mutating input", () => {
  const input = {
    optimization_mode: "basic",
    prioritize_main_zone: true,
    group_by_space_and_template: false,
    grouping_zone_ids: "[8,2,8,4]",
    weight_arrival_departure_grouping: 0,
  };
  const before = JSON.stringify(input);
  const snapshot = normalizePlanOptimizerSnapshotV1(input);

  assert.equal(JSON.stringify(input), before);
  assert.equal(snapshot.heuristics.MAIN_ZONE_PRIORITY.basicLevel, 2);
  assert.equal(snapshot.heuristics.GROUP_BY_SPACE_TEMPLATE_MATCH.basicLevel, 0);
  assert.deepEqual(snapshot.groupingZoneIds, [2, 4, 8]);
});

test("output is deeply frozen", () => {
  const snapshot = normalizePlanOptimizerSnapshotV1(baseSettings(), transportRefs);

  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.heuristics));
  assert.ok(Object.isFrozen(snapshot.heuristics.MAIN_ZONE_PRIORITY));
  assert.ok(Object.isFrozen(snapshot.groupingZoneIds));
  assert.ok(Object.isFrozen(snapshot.transport));
});

test("fingerprint is deterministic across equivalent grouping-zone order and duplicates", () => {
  const left = normalizePlanOptimizerSnapshotV1(
    baseSettings({ groupingZoneIds: [9, 3, 5, 3] }),
    transportRefs,
  );
  const right = normalizePlanOptimizerSnapshotV1(
    baseSettings({ groupingZoneIds: [5, 9, 3] }),
    transportRefs,
  );

  assert.equal(left.configurationFingerprint, right.configurationFingerprint);
});

test("provenance source does not change the configuration fingerprint", () => {
  const inherited = normalizePlanOptimizerSnapshotV1(baseSettings(), transportRefs, "INHERITED");
  const legacy = normalizePlanOptimizerSnapshotV1(baseSettings(), transportRefs, "LEGACY_BACKFILL");

  assert.notEqual(inherited.source, legacy.source);
  assert.equal(inherited.configurationFingerprint, legacy.configurationFingerprint);
});

test("behavioral changes alter the configuration fingerprint", () => {
  const baseline = normalizePlanOptimizerSnapshotV1(baseSettings(), transportRefs);
  const changed = normalizePlanOptimizerSnapshotV1(
    baseSettings({ mainZoneKeepBusyAdvancedValue: 9 }),
    transportRefs,
  );

  assert.notEqual(baseline.configurationFingerprint, changed.configurationFingerprint);
});

test("active transport grouping requires the corresponding daily template snapshot identity", () => {
  assert.throws(
    () => normalizePlanOptimizerSnapshotV1(
      baseSettings({ departureGroupingTarget: 0 }),
      { departurePlanTemplateSnapshotId: 102 },
    ),
    (error: unknown) => {
      assert.ok(error instanceof PlanOptimizerSnapshotError);
      assert.equal(error.code, "MISSING_ACTIVE_TRANSPORT_TEMPLATE_SNAPSHOT");
      assert.equal(error.details.direction, "arrival");
      return true;
    },
  );
});

test("inactive transport directions may keep a null template identity", () => {
  const snapshot = normalizePlanOptimizerSnapshotV1(
    baseSettings({
      arrivalGroupingTarget: 0,
      departureGroupingTarget: 0,
      weightArrivalDepartureGrouping: 5,
    }),
  );

  assert.equal(snapshot.transport.arrivalPlanTemplateSnapshotId, null);
  assert.equal(snapshot.transport.departurePlanTemplateSnapshotId, null);
});

test("numeric compatibility inputs are clamped to contract ranges", () => {
  const snapshot = normalizePlanOptimizerSnapshotV1(
    baseSettings({
      contestantCompactLevel: 99,
      contestantCompactAdvancedValue: -5,
      weightArrivalDepartureGrouping: 99,
      nearHardBreaksMax: 99,
      arrivalGroupingTarget: -3,
      departureGroupingTarget: -2,
      vanCapacity: -1,
    }),
  );

  assert.equal(snapshot.heuristics.CONTESTANT_COMPACT.basicLevel, 3);
  assert.equal(snapshot.heuristics.CONTESTANT_COMPACT.advancedValue, 0);
  assert.equal(snapshot.transport.groupingWeight, 10);
  assert.equal(snapshot.nearHardBreaksMax, 10);
  assert.equal(snapshot.transport.arrivalGroupingTarget, 0);
  assert.equal(snapshot.transport.departureGroupingTarget, 0);
  assert.equal(snapshot.transport.vanCapacity, 0);
});
