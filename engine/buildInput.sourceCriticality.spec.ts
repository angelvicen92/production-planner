import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEngineInput,
  EngineInputSourceLoadError,
} from "./buildInput";
import { normalizeTaskTemplateCatalogEntry } from "../server/taskTemplateSnapshot";
import { normalizePlanOptimizerSnapshotV1 } from "../server/planOptimizerSnapshot";

type HardSourceId =
  | "EIS-003"
  | "EIS-007"
  | "EIS-008"
  | "EIS-012"
  | "EIS-013"
  | "EIS-014"
  | "EIS-017";

const expectedReasonCodes: Readonly<Record<HardSourceId, string>> = {
  "EIS-003": "ENGINE_INPUT_CAMERA_SNAPSHOT_LOAD_FAILED",
  "EIS-007": "ENGINE_INPUT_ZONE_RESOURCE_ASSIGNMENTS_UNAVAILABLE",
  "EIS-008": "ENGINE_INPUT_SPACE_RESOURCE_ASSIGNMENTS_UNAVAILABLE",
  "EIS-012": "ENGINE_INPUT_ZONE_RESOURCE_REQUIREMENTS_UNAVAILABLE",
  "EIS-013": "ENGINE_INPUT_SPACE_RESOURCE_REQUIREMENTS_UNAVAILABLE",
  "EIS-014": "ENGINE_INPUT_PLAN_RESOURCES_UNAVAILABLE",
  "EIS-017": "ENGINE_INPUT_RESOURCE_COMPONENTS_UNAVAILABLE",
};

function fakeStorage(options: {
  failSource?: HardSourceId;
  nullSource?: Exclude<HardSourceId, "EIS-003" | "EIS-014">;
  cameraResult?: number | null;
  failBundleSignal?: boolean;
} = {}) {
  const snapshot = normalizeTaskTemplateCatalogEntry({
    id: 4,
    name: "Task",
    defaultDuration: 20,
    defaultCameras: 0,
    zoneId: 2,
    spaceId: 10,
    resourceRequirements: { byItem: { 70: 1 } },
  }, "inherited");
  const snapshots = [snapshot];
  const plan = {
    id: 1,
    work_start: "09:00",
    work_end: "18:00",
    meal_start: "14:00",
    meal_end: "15:00",
    meal_mode: "flexible_meal_window",
    cameras_available: 6,
    contestant_meal_duration_minutes: 60,
    contestant_meal_max_simultaneous: 3,
  };
  const task = {
    id: 40,
    plan_id: 1,
    template_id: 4,
    contestant_id: null,
    status: "pending",
    assigned_resource_ids: null,
  };
  const optimizer = {
    mainZoneId: null,
    optimizationMode: "basic",
    heuristics: {},
    prioritizeMainZone: false,
    groupBySpaceAndTemplate: false,
    mainZonePriorityLevel: 0,
    groupingLevel: 0,
    contestantCompactLevel: 0,
    contestantStayInZoneLevel: 0,
    groupingZoneIds: [],
    mainZoneOptFinishEarly: false,
    mainZoneOptKeepBusy: false,
    arrivalTaskTemplateName: "",
    departureTaskTemplateName: "",
    arrivalGroupingTarget: 0,
    departureGroupingTarget: 0,
    arrivalMinGapMinutes: 0,
    departureMinGapMinutes: 0,
    vanCapacity: 0,
    weightArrivalDepartureGrouping: 0,
    nearHardBreaksMax: 0,
  };
  const failure = (sourceId: HardSourceId) => {
    if (options.failSource === sourceId) {
      throw new Error(`forced ${sourceId} failure`);
    }
  };

  return {
    getPlanEngineInputDetails: async () => ({ plan, tasks: [task], locks: [], availability: [], breaks: [] }),
    getPlanTaskTemplateSnapshots: async () => snapshots,
    getPlanOptimizerSnapshot: async () => normalizePlanOptimizerSnapshotV1(optimizer),
    getContestantsByPlan: async () => [],
    getCamerasAvailableForPlan: async () => {
      failure("EIS-003");
      return options.cameraResult === undefined ? 2 : options.cameraResult;
    },
    getResourceBundles: async () => {
      if (options.failBundleSignal) throw new Error("optional bundle signal unavailable");
      return [];
    },
    getResourceBundleComponents: async () => [],
    getResourceBundleSpaceAffinities: async () => [],
    getZoneResourceAssignmentsForPlan: async () => {
      failure("EIS-007");
      return options.nullSource === "EIS-007" ? null : {};
    },
    getSpaceResourceAssignmentsForPlan: async () => {
      failure("EIS-008");
      return options.nullSource === "EIS-008" ? null : {};
    },
    getOptimizerSettings: async () => optimizer,
    getSpaces: async () => [{ id: 10, name: "Space", zoneId: 2, capacity: 1, priorityLevel: 1 }],
    getZones: async () => [{ id: 2, name: "Zone" }],
    getZoneResourceTypeRequirementsForPlan: async () => {
      failure("EIS-012");
      return options.nullSource === "EIS-012" ? null : {};
    },
    getSpaceResourceTypeRequirementsForPlan: async () => {
      failure("EIS-013");
      return options.nullSource === "EIS-013" ? null : {};
    },
    getPlanResourceItemsForPlan: async () => {
      failure("EIS-014");
      return [{
        id: 7,
        resourceItemId: 70,
        typeId: 1,
        typeCode: "crew",
        typeName: "Crew",
        name: "Resource",
        isAvailable: true,
        availabilityStart: null,
        availabilityEnd: null,
      }];
    },
    getPlanZoneSettings: async () => [{ id: 1, zoneId: 2, availabilityStart: null, availabilityEnd: null, source: "inherited" }],
    getPlanSpaceSettings: async () => [{ id: 1, spaceId: 10, zoneId: 2, availabilityStart: null, availabilityEnd: null, source: "inherited" }],
    getResourceItemComponentsMap: async () => {
      failure("EIS-017");
      return options.nullSource === "EIS-017" ? null : {};
    },
  } as any;
}

for (const sourceId of Object.keys(expectedReasonCodes) as HardSourceId[]) {
  test(`${sourceId} load failure aborts EngineInput instead of becoming neutral`, async () => {
    await assert.rejects(
      () => buildEngineInput(1, fakeStorage({ failSource: sourceId })),
      (error: unknown) => {
        assert.ok(error instanceof EngineInputSourceLoadError);
        assert.equal(error.sourceId, sourceId);
        assert.equal(error.reasonCode, expectedReasonCodes[sourceId]);
        assert.equal(error.planId, 1);
        assert.equal(error.phase, "LOAD");
        assert.match(String((error.cause as Error)?.message), new RegExp(sourceId));
        return true;
      },
    );
  });
}

test("successful null map responses remain neutral empty maps", async () => {
  for (const sourceId of ["EIS-007", "EIS-008", "EIS-012", "EIS-013", "EIS-017"] as const) {
    const input = await buildEngineInput(1, fakeStorage({ nullSource: sourceId }));
    if (sourceId === "EIS-007") assert.deepEqual(input.zoneResourceAssignments, {});
    if (sourceId === "EIS-008") assert.deepEqual(input.spaceResourceAssignments, {});
    if (sourceId === "EIS-012") assert.deepEqual(input.zoneResourceTypeRequirements, {});
    if (sourceId === "EIS-013") assert.deepEqual(input.spaceResourceTypeRequirements, {});
    if (sourceId === "EIS-017") assert.deepEqual(input.resourceItemComponents, {});
  }
});

test("successful empty legacy camera snapshot still uses the explicit legacy plan fallback", async () => {
  const input = await buildEngineInput(1, fakeStorage({ cameraResult: null }));
  assert.equal(input.camerasAvailable, 6);
});

test("optional bundle load failure remains a warning and does not weaken hard resource inputs", async () => {
  const input = await buildEngineInput(1, fakeStorage({ failBundleSignal: true }));
  assert.deepEqual(input.resourceBundles, []);
  assert.equal(input.resourceBundleLoadWarnings?.length, 1);
  assert.equal(input.resourceBundleLoadWarnings?.[0]?.source, "resource_bundles");
  assert.deepEqual(input.zoneResourceAssignments, {});
  assert.equal(input.planResourceItems.length, 1);
});
