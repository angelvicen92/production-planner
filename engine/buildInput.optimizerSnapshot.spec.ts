import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlanOptimizerSnapshotV1 } from "../server/planOptimizerSnapshot";
import { normalizeTaskTemplateCatalogEntry } from "../server/taskTemplateSnapshot";
import { buildEngineInput, EngineInputSourceLoadError } from "./buildInput";

function optimizerSettings(overrides: Record<string, unknown> = {}) {
  return {
    optimizationMode: "advanced",
    mainZoneId: 2,
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
    groupingZoneIds: [2],
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

function fixture(options: { optimizerFailure?: Error } = {}) {
  let globalOptimizerReadCount = 0;
  const arrival = Object.freeze({
    ...normalizeTaskTemplateCatalogEntry({
      id: 1,
      name: "Llegada diaria",
      defaultDuration: 20,
      defaultCameras: 0,
      zoneId: 2,
      spaceId: 10,
    }, "inherited"),
    planTemplateSnapshotId: 101,
  });
  const departure = Object.freeze({
    ...normalizeTaskTemplateCatalogEntry({
      id: 2,
      name: "Salida diaria",
      defaultDuration: 20,
      defaultCameras: 0,
      zoneId: 2,
      spaceId: 10,
    }, "inherited"),
    planTemplateSnapshotId: 102,
  });
  const optimizerSnapshot = normalizePlanOptimizerSnapshotV1(
    optimizerSettings(),
    {
      arrivalPlanTemplateSnapshotId: 101,
      departurePlanTemplateSnapshotId: 102,
    },
    "INHERITED",
  );
  const plan = {
    id: 1,
    work_start: "09:00",
    work_end: "18:00",
    meal_start: "14:00",
    meal_end: "15:00",
    meal_mode: "flexible_meal_window",
    contestant_meal_duration_minutes: 60,
    contestant_meal_max_simultaneous: 3,
  };
  const task = {
    id: 40,
    plan_id: 1,
    template_id: 1,
    contestant_id: null,
    zone_id: null,
    space_id: null,
    status: "pending",
    assigned_resource_ids: null,
  };
  const storage = {
    getPlanEngineInputDetails: async () => ({ plan, tasks: [task], locks: [], availability: [], breaks: [] }),
    getPlanTaskTemplateSnapshots: async () => [arrival, departure],
    getPlanOptimizerSnapshot: async () => {
      if (options.optimizerFailure) throw options.optimizerFailure;
      return optimizerSnapshot;
    },
    getOptimizerSettings: async () => {
      globalOptimizerReadCount += 1;
      throw new Error("FORBIDDEN_GLOBAL_OPTIMIZER_READ");
    },
    getContestantsByPlan: async () => [],
    getCamerasAvailableForPlan: async () => 4,
    getResourceBundles: async () => [],
    getResourceBundleComponents: async () => [],
    getResourceBundleSpaceAffinities: async () => [],
    getZoneResourceAssignmentsForPlan: async () => ({}),
    getSpaceResourceAssignmentsForPlan: async () => ({}),
    getSpaces: async () => [{ id: 10, name: "Transporte diario", zoneId: 2, capacity: 1, priorityLevel: 1 }],
    getZones: async () => [{ id: 2, name: "Otros" }],
    getZoneResourceTypeRequirementsForPlan: async () => ({}),
    getSpaceResourceTypeRequirementsForPlan: async () => ({}),
    getPlanResourceItemsForPlan: async () => [],
    getPlanZoneSettings: async () => [{ id: 1, zoneId: 2, availabilityStart: null, availabilityEnd: null, source: "inherited" }],
    getPlanSpaceSettings: async () => [{ id: 1, spaceId: 10, zoneId: 2, availabilityStart: null, availabilityEnd: null, source: "inherited" }],
    getResourceItemComponentsMap: async () => ({}),
  } as any;
  return {
    storage,
    optimizerSnapshot,
    getGlobalOptimizerReadCount: () => globalOptimizerReadCount,
  };
}

test("buildEngineInput uses the daily optimizer snapshot as the only optimizer authority", async () => {
  const f = fixture();
  const input = await buildEngineInput(1, f.storage);

  assert.equal(f.getGlobalOptimizerReadCount(), 0);
  assert.equal(input.optimizerSnapshotContractVersion, 1);
  assert.equal(input.optimizerSnapshotSource, "INHERITED");
  assert.equal(input.optimizerSnapshotEditingMode, "ADVANCED");
  assert.equal(input.optimizerSnapshotFingerprint, f.optimizerSnapshot.configurationFingerprint);
  assert.equal(input.optimizerLegacyAdapterVersion, 1);
  assert.ok(input.optimizerCompatibilityWarnings?.includes("OPTIMIZER_LEGACY_ENGINE_ADAPTER_V1"));
  assert.deepEqual(input.optimizerIgnoredActiveHeuristics, ["CONTESTANT_TOTAL_SPAN"]);

  assert.equal(input.optimizerMainZoneId, 2);
  assert.equal(input.optimizerMainZoneOptFinishEarly, true);
  assert.equal(input.optimizerMainZoneOptKeepBusy, true);
  assert.equal(input.optimizerGroupBySpaceAndTemplate, true);
  assert.deepEqual(input.groupingZoneIds, [2]);
  assert.deepEqual(input.optimizerWeights, {
    mainZoneFinishEarly: 4,
    mainZoneKeepBusy: 10,
    contestantCompact: 5,
    groupBySpaceTemplateMatch: 7,
    groupBySpaceActive: 7,
    contestantStayInZone: 9,
    arrivalDepartureGrouping: 5,
    contestantTotalSpan: 0,
  });
});

test("transport is resolved from daily snapshot identities, not mutable global names", async () => {
  const input = await buildEngineInput(1, fixture().storage);

  assert.equal(input.arrivalTaskTemplateName, "Llegada diaria");
  assert.equal(input.departureTaskTemplateName, "Salida diaria");
  assert.equal(input.transportSettings?.arrivalTemplateId, 1);
  assert.equal(input.transportSettings?.departureTemplateId, 2);
  assert.equal(input.transportSettings?.arrivalTemplateName, "Llegada diaria");
  assert.equal(input.transportSettings?.departureTemplateName, "Salida diaria");
  assert.equal(input.transportSettings?.transportSpaceId, 10);
  assert.equal(input.transportSettings?.groupingWeight, 5);
  assert.equal(input.transportSpaceId, 10);

  const task = input.tasks.find((entry) => entry.id === 40)!;
  assert.equal(task.templateId, 1);
  assert.equal(task.zoneId, 2);
  assert.equal(task.spaceId, 10);
});

test("optimizer snapshot load failure is a typed hard EngineInput source error", async () => {
  const f = fixture({ optimizerFailure: new Error("daily optimizer unavailable") });
  await assert.rejects(
    () => buildEngineInput(1, f.storage),
    (error: unknown) => {
      assert.ok(error instanceof EngineInputSourceLoadError);
      assert.equal(error.sourceId, "EIS-020");
      assert.equal(error.reasonCode, "ENGINE_INPUT_OPTIMIZER_SNAPSHOT_UNAVAILABLE");
      assert.equal(error.planId, 1);
      assert.match(String((error.cause as Error)?.message), /daily optimizer unavailable/);
      return true;
    },
  );
  assert.equal(f.getGlobalOptimizerReadCount(), 0);
});
