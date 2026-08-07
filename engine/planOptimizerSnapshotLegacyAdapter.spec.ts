import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlanOptimizerSnapshotV1 } from "../server/planOptimizerSnapshot";
import {
  PlanOptimizerLegacyAdapterError,
  adaptPlanOptimizerSnapshotToLegacyEngineV1,
} from "./planOptimizerSnapshotLegacyAdapter";

function settings(overrides: Record<string, unknown> = {}) {
  return {
    optimizationMode: "basic",
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
    arrivalGroupingTarget: 2,
    departureGroupingTarget: 3,
    arrivalMinGapMinutes: 10,
    departureMinGapMinutes: 15,
    vanCapacity: 8,
    weightArrivalDepartureGrouping: 5,
    nearHardBreaksMax: 4,
    ...overrides,
  };
}

const references = {
  arrivalPlanTemplateSnapshotId: 101,
  departurePlanTemplateSnapshotId: 102,
} as const;

const identities = [
  { planTemplateSnapshotId: 101, sourceTemplateId: 1, templateName: "IN" },
  { planTemplateSnapshotId: 102, sourceTemplateId: 2, templateName: "OUT" },
] as const;

test("BASIC snapshot projects canonical effective values without rereading global settings", () => {
  const snapshot = normalizePlanOptimizerSnapshotV1(settings(), references, "INHERITED");
  const projection = adaptPlanOptimizerSnapshotToLegacyEngineV1(snapshot, identities);

  assert.equal(projection.snapshot.contractVersion, 1);
  assert.equal(projection.snapshot.source, "INHERITED");
  assert.equal(projection.snapshot.editingMode, "BASIC");
  assert.equal(projection.snapshot.configurationFingerprint, snapshot.configurationFingerprint);
  assert.equal(projection.mainZoneId, 7);
  assert.equal(projection.prioritizeMainZone, true);
  assert.equal(projection.mainZonePriorityLevel, 2);
  assert.equal(projection.mainZoneOptFinishEarly, true);
  assert.equal(projection.mainZoneOptKeepBusy, true);
  assert.equal(projection.groupBySpaceAndTemplate, true);
  assert.equal(projection.groupingLevel, 2);
  assert.equal(projection.contestantCompactLevel, 1);
  assert.equal(projection.contestantStayInZoneLevel, 3);
  assert.deepEqual(projection.groupingZoneIds, [3, 5, 9]);
  assert.deepEqual(projection.weights, {
    mainZoneFinishEarly: 3,
    mainZoneKeepBusy: 9,
    contestantCompact: 3,
    groupBySpaceTemplateMatch: 6,
    groupBySpaceActive: 6,
    contestantStayInZone: 9,
    contestantTotalSpan: 0,
    arrivalDepartureGrouping: 5,
  });
  assert.deepEqual(projection.transport, {
    arrivalPlanTemplateSnapshotId: 101,
    departurePlanTemplateSnapshotId: 102,
    arrivalSourceTemplateId: 1,
    departureSourceTemplateId: 2,
    arrivalTemplateName: "IN",
    departureTemplateName: "OUT",
    arrivalGroupingTarget: 2,
    departureGroupingTarget: 3,
    arrivalMinGapMinutes: 10,
    departureMinGapMinutes: 15,
    vanCapacity: 8,
    groupingWeight: 5,
  });
});

test("ADVANCED snapshot projects advanced effective weights and structured transport identities", () => {
  const snapshot = normalizePlanOptimizerSnapshotV1(
    settings({ optimizationMode: "advanced" }),
    references,
    "DAY_OVERRIDE",
  );
  const projection = adaptPlanOptimizerSnapshotToLegacyEngineV1(snapshot, identities);

  assert.equal(projection.snapshot.source, "DAY_OVERRIDE");
  assert.equal(projection.snapshot.editingMode, "ADVANCED");
  assert.equal(projection.weights.mainZoneFinishEarly, 4);
  assert.equal(projection.weights.mainZoneKeepBusy, 10);
  assert.equal(projection.weights.contestantCompact, 5);
  assert.equal(projection.weights.groupBySpaceTemplateMatch, 7);
  assert.equal(projection.weights.groupBySpaceActive, 7);
  assert.equal(projection.weights.contestantStayInZone, 9);
  assert.equal(projection.transport.arrivalSourceTemplateId, 1);
  assert.equal(projection.transport.departureSourceTemplateId, 2);
});

test("legacy backfill is explicitly marked and does not change the configuration fingerprint", () => {
  const inherited = normalizePlanOptimizerSnapshotV1(settings(), references, "INHERITED");
  const legacy = normalizePlanOptimizerSnapshotV1(settings(), references, "LEGACY_BACKFILL");
  const projection = adaptPlanOptimizerSnapshotToLegacyEngineV1(legacy, identities);

  assert.equal(legacy.configurationFingerprint, inherited.configurationFingerprint);
  assert.ok(projection.snapshot.compatibilityWarnings.includes("OPTIMIZER_LEGACY_ENGINE_ADAPTER_V1"));
  assert.ok(projection.snapshot.compatibilityWarnings.includes("OPTIMIZER_SNAPSHOT_LEGACY_BACKFILL"));
});

test("active contestant total span remains disabled in the legacy projection and is disclosed", () => {
  const snapshot = normalizePlanOptimizerSnapshotV1(settings(), references);
  assert.ok(snapshot.heuristics.CONTESTANT_TOTAL_SPAN.effectiveWeight > 0);

  const projection = adaptPlanOptimizerSnapshotToLegacyEngineV1(snapshot, identities);
  assert.equal(projection.weights.contestantTotalSpan, 0);
  assert.deepEqual(projection.snapshot.ignoredActiveHeuristics, ["CONTESTANT_TOTAL_SPAN"]);
  assert.ok(projection.snapshot.compatibilityWarnings.includes("OPTIMIZER_ACTIVE_HEURISTIC_NOT_PROJECTED"));
});

test("inactive transport may stay null without inventing a template identity", () => {
  const snapshot = normalizePlanOptimizerSnapshotV1(
    settings({ arrivalGroupingTarget: 0, departureGroupingTarget: 0, weightArrivalDepartureGrouping: 5 }),
    {},
  );
  const projection = adaptPlanOptimizerSnapshotToLegacyEngineV1(snapshot, identities);
  assert.equal(projection.transport.arrivalPlanTemplateSnapshotId, null);
  assert.equal(projection.transport.departurePlanTemplateSnapshotId, null);
  assert.equal(projection.transport.arrivalSourceTemplateId, null);
  assert.equal(projection.transport.departureSourceTemplateId, null);
  assert.equal(projection.transport.arrivalTemplateName, "");
  assert.equal(projection.transport.departureTemplateName, "");
});

test("persisted transport references must resolve inside the same daily template catalog", () => {
  const snapshot = normalizePlanOptimizerSnapshotV1(settings(), references);
  assert.throws(
    () => adaptPlanOptimizerSnapshotToLegacyEngineV1(snapshot, identities.slice(1)),
    (error: unknown) => {
      assert.ok(error instanceof PlanOptimizerLegacyAdapterError);
      assert.equal(error.code, "OPTIMIZER_TRANSPORT_TEMPLATE_IDENTITY_UNAVAILABLE");
      assert.equal(error.details.direction, "arrival");
      assert.equal(error.details.planTemplateSnapshotId, 101);
      return true;
    },
  );
});

test("daily template identities are unique and output is deeply frozen", () => {
  const snapshot = normalizePlanOptimizerSnapshotV1(settings(), references);
  assert.throws(
    () => adaptPlanOptimizerSnapshotToLegacyEngineV1(snapshot, [...identities, identities[0]]),
    (error: unknown) => error instanceof PlanOptimizerLegacyAdapterError && error.code === "DUPLICATE_DAILY_TEMPLATE_IDENTITY",
  );

  const projection = adaptPlanOptimizerSnapshotToLegacyEngineV1(snapshot, identities);
  assert.ok(Object.isFrozen(projection));
  assert.ok(Object.isFrozen(projection.snapshot));
  assert.ok(Object.isFrozen(projection.snapshot.compatibilityWarnings));
  assert.ok(Object.isFrozen(projection.groupingZoneIds));
  assert.ok(Object.isFrozen(projection.weights));
  assert.ok(Object.isFrozen(projection.transport));
});
