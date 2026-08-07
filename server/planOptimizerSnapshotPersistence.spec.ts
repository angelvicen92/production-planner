import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlanOptimizerSnapshotV1 } from "./planOptimizerSnapshot";
import {
  PlanOptimizerSnapshotPersistenceError,
  buildPlanOptimizerSnapshotPersistenceBundleV1,
  hydratePlanOptimizerSnapshotV1,
  resolvePlanOptimizerTransportReferencesV1,
  validatePlanOptimizerSnapshotZoneReferencesV1,
} from "./planOptimizerSnapshotPersistence";

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
    contestantTotalSpanLevel: 2,
    contestantTotalSpanAdvancedValue: 6,
    groupingZoneIds: [9, 3, 9, 5],
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

const candidates = [
  { sourceTemplateId: 1, templateName: "IN", planTemplateSnapshotId: 101 },
  { sourceTemplateId: 2, templateName: "OUT", planTemplateSnapshotId: 102 },
] as const;

test("transport legacy names resolve only through unique daily template snapshot identities", () => {
  const refs = resolvePlanOptimizerTransportReferencesV1(settings(), candidates);
  assert.deepEqual(refs, {
    arrivalPlanTemplateSnapshotId: 101,
    departurePlanTemplateSnapshotId: 102,
  });
});

test("active transport rejects missing and ambiguous legacy names without choosing the first match", () => {
  assert.throws(
    () => resolvePlanOptimizerTransportReferencesV1(settings({ arrivalTaskTemplateName: "missing" }), candidates),
    (error: unknown) => {
      assert.ok(error instanceof PlanOptimizerSnapshotPersistenceError);
      assert.equal(error.code, "ACTIVE_TRANSPORT_TEMPLATE_UNRESOLVED");
      assert.equal(error.details.direction, "arrival");
      assert.equal(error.details.matchCount, 0);
      return true;
    },
  );

  const ambiguous = [
    ...candidates,
    { sourceTemplateId: 3, templateName: " in ", planTemplateSnapshotId: 103 },
  ];
  assert.throws(
    () => resolvePlanOptimizerTransportReferencesV1(settings(), ambiguous),
    (error: unknown) => {
      assert.ok(error instanceof PlanOptimizerSnapshotPersistenceError);
      assert.equal(error.code, "ACTIVE_TRANSPORT_TEMPLATE_UNRESOLVED");
      assert.equal(error.details.direction, "arrival");
      assert.equal(error.details.matchCount, 2);
      return true;
    },
  );
});

test("inactive ambiguous transport direction remains null", () => {
  const ambiguous = [
    ...candidates,
    { sourceTemplateId: 3, templateName: "IN", planTemplateSnapshotId: 103 },
  ];
  const refs = resolvePlanOptimizerTransportReferencesV1(
    settings({ arrivalGroupingTarget: 0 }),
    ambiguous,
  );
  assert.equal(refs.arrivalPlanTemplateSnapshotId, null);
  assert.equal(refs.departurePlanTemplateSnapshotId, 102);
});

test("persistence projection stores canonical inputs but not derived weight or fingerprint", () => {
  const refs = resolvePlanOptimizerTransportReferencesV1(settings(), candidates);
  const snapshot = normalizePlanOptimizerSnapshotV1(settings(), refs, "INHERITED");
  validatePlanOptimizerSnapshotZoneReferencesV1(snapshot, [3, 5, 7, 9]);
  const bundle = buildPlanOptimizerSnapshotPersistenceBundleV1(44, snapshot);

  assert.equal(bundle.snapshot.plan_id, 44);
  assert.equal(bundle.snapshot.source, "INHERITED");
  assert.equal(bundle.heuristics.length, 9);
  assert.deepEqual(bundle.groupingZones.map((row) => row.zone_id), [3, 5, 9]);
  assert.ok(bundle.heuristics.every((row) => !("effective_weight" in row)));
  assert.ok(!("configuration_fingerprint" in bundle.snapshot));

  const hydrated = hydratePlanOptimizerSnapshotV1(
    bundle.snapshot,
    bundle.heuristics,
    bundle.groupingZones,
  );
  assert.deepEqual(hydrated, snapshot);
  assert.equal(hydrated.configurationFingerprint, snapshot.configurationFingerprint);
});

test("hydration rejects incomplete or duplicate heuristic rows", () => {
  const refs = resolvePlanOptimizerTransportReferencesV1(settings(), candidates);
  const snapshot = normalizePlanOptimizerSnapshotV1(settings(), refs, "LEGACY_BACKFILL");
  const bundle = buildPlanOptimizerSnapshotPersistenceBundleV1(44, snapshot);

  assert.throws(
    () => hydratePlanOptimizerSnapshotV1(bundle.snapshot, bundle.heuristics.slice(1), bundle.groupingZones),
    (error: unknown) => error instanceof PlanOptimizerSnapshotPersistenceError && error.code === "INCOMPLETE_PLAN_OPTIMIZER_HEURISTICS",
  );
  assert.throws(
    () => hydratePlanOptimizerSnapshotV1(bundle.snapshot, [...bundle.heuristics, bundle.heuristics[0]], bundle.groupingZones),
    (error: unknown) => error instanceof PlanOptimizerSnapshotPersistenceError && error.code === "INCOMPLETE_PLAN_OPTIMIZER_HEURISTICS",
  );
});

test("zone validation is daily-snapshot scoped", () => {
  const refs = resolvePlanOptimizerTransportReferencesV1(settings(), candidates);
  const snapshot = normalizePlanOptimizerSnapshotV1(settings(), refs);
  assert.doesNotThrow(() => validatePlanOptimizerSnapshotZoneReferencesV1(snapshot, [3, 5, 7, 9]));
  assert.throws(
    () => validatePlanOptimizerSnapshotZoneReferencesV1(snapshot, [3, 5, 9]),
    (error: unknown) => {
      assert.ok(error instanceof PlanOptimizerSnapshotPersistenceError);
      assert.equal(error.code, "PLAN_OPTIMIZER_ZONE_OUT_OF_SCOPE");
      assert.deepEqual(error.details.zoneIds, [7]);
      return true;
    },
  );
});
