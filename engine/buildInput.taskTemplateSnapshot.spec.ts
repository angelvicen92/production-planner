import assert from "node:assert/strict";
import test from "node:test";
import { buildEngineInput } from "./buildInput";
import { normalizeTaskTemplateCatalogEntry } from "../server/taskTemplateSnapshot";
import { normalizePlanOptimizerSnapshotV1 } from "../server/planOptimizerSnapshot";

function fakeStorage(options: {
  snapshots?: readonly ReturnType<typeof normalizeTaskTemplateCatalogEntry>[];
  durationOverride?: number | null;
  status?: "pending" | "in_progress" | "done" | "interrupted" | "cancelled";
} = {}) {
  let globalTemplateReadCount = 0;
  const snapshot = normalizeTaskTemplateCatalogEntry({
    id: 4,
    name: "Snapshot task",
    defaultDuration: 37,
    defaultCameras: 2,
    zoneId: 2,
    spaceId: 10,
    hasDependency: false,
    resourceRequirements: { byType: { 8: 1 }, anyOf: [{ quantity: 1, resourceItemIds: [21, 20] }] },
    itinerantTeamRequirement: "specific",
    itinerantTeamId: 6,
    rulesJson: { itinerantTeamAllowedIds: [7, 6] },
  }, "inherited");
  const snapshots = options.snapshots ?? [snapshot];
  const task = Object.freeze({
    id: 40,
    plan_id: 1,
    template_id: 4,
    contestant_id: null,
    duration_override: options.durationOverride ?? null,
    cameras_override: null,
    zone_id: null,
    space_id: null,
    status: options.status ?? "pending",
    assigned_resource_ids: null,
  });
  const plan = Object.freeze({
    id: 1,
    work_start: "09:00",
    work_end: "18:00",
    meal_start: "14:00",
    meal_end: "15:00",
    meal_mode: "flexible_meal_window",
    contestant_meal_duration_minutes: 60,
    contestant_meal_max_simultaneous: 3,
  });
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
    contestantTotalSpanLevel: 0,
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
  const storage = {
    getPlanEngineInputDetails: async () => ({ plan, tasks: [task], locks: [], availability: [], breaks: [] }),
    getPlanTaskTemplateSnapshots: async () => snapshots,
    getPlanOptimizerSnapshot: async () => normalizePlanOptimizerSnapshotV1(optimizer),
    getContestantsByPlan: async () => [],
    getCamerasAvailableForPlan: async () => 4,
    getResourceBundles: async () => [],
    getResourceBundleComponents: async () => [],
    getResourceBundleSpaceAffinities: async () => [],
    getZoneResourceAssignmentsForPlan: async () => ({}),
    getSpaceResourceAssignmentsForPlan: async () => ({}),
    getOptimizerSettings: async () => optimizer,
    getSpaces: async () => [{ id: 10, name: "Space", zoneId: 2, capacity: 1, priorityLevel: 1 }],
    getZones: async () => [{ id: 2, name: "Zone" }],
    getZoneResourceTypeRequirementsForPlan: async () => ({}),
    getSpaceResourceTypeRequirementsForPlan: async () => ({}),
    getPlanResourceItemsForPlan: async () => [],
    getPlanZoneSettings: async () => [{ id: 1, zoneId: 2, availabilityStart: null, availabilityEnd: null, source: "inherited" }],
    getPlanSpaceSettings: async () => [{ id: 1, spaceId: 10, zoneId: 2, availabilityStart: null, availabilityEnd: null, source: "inherited" }],
    getResourceItemComponentsMap: async () => ({}),
    getTaskTemplates: async () => { globalTemplateReadCount += 1; throw new Error("forbidden global read"); },
  };
  return { storage: storage as any, snapshot, getGlobalTemplateReadCount: () => globalTemplateReadCount };
}

test("buildEngineInput projects operational template semantics only from the daily snapshot", async () => {
  const fixture = fakeStorage();
  const input = await buildEngineInput(1, fixture.storage);
  assert.equal(fixture.getGlobalTemplateReadCount(), 0);
  assert.equal(input.taskTemplateSnapshotCount, 1);
  assert.equal(input.taskTemplateSnapshotSources?.inherited, 1);
  assert.match(String(input.taskTemplateSnapshotFingerprint), /^[a-f0-9]{64}$/);
  const task = input.tasks.find((entry) => entry.id === 40)!;
  assert.equal(task.templateName, "Snapshot task");
  assert.equal(task.durationOverrideMin, 37);
  assert.equal(task.camerasOverride, 2);
  assert.equal(task.zoneId, 2);
  assert.equal(task.spaceId, 10);
  assert.deepEqual(task.resourceRequirements, {
    byType: { 8: 1 },
    anyOf: [{ quantity: 1, resourceItemIds: [20, 21] }],
  });
  assert.equal(task.itinerantTeamRequirement, "specific");
  assert.equal(task.itinerantTeamId, 6);
  assert.deepEqual(task.allowedItinerantTeamIds, [6, 7]);
  assert.notEqual(task.resourceRequirements, fixture.snapshot.resourceRequirements);
});

test("instance duration override wins and protected statuses are preserved", async () => {
  const fixture = fakeStorage({ durationOverride: 19, status: "in_progress" });
  const input = await buildEngineInput(1, fixture.storage);
  const task = input.tasks.find((entry) => entry.id === 40)!;
  assert.equal(task.durationOverrideMin, 19);
  assert.equal(task.status, "in_progress");
});

test("missing daily snapshot is a hard error and never falls back to the global catalog", async () => {
  const fixture = fakeStorage({ snapshots: [] });
  await assert.rejects(
    () => buildEngineInput(1, fixture.storage),
    /MISSING_PLAN_TASK_TEMPLATE_SNAPSHOT/,
  );
  assert.equal(fixture.getGlobalTemplateReadCount(), 0);
});

test("snapshot order does not change metadata or task semantics", async () => {
  const first = normalizeTaskTemplateCatalogEntry({ id: 1, name: "Unused", defaultDuration: 10, defaultCameras: 0 }, "legacy_backfill");
  const base = fakeStorage();
  const left = await buildEngineInput(1, fakeStorage({ snapshots: [first, base.snapshot] }).storage);
  const right = await buildEngineInput(1, fakeStorage({ snapshots: [base.snapshot, first] }).storage);
  assert.equal(left.taskTemplateSnapshotFingerprint, right.taskTemplateSnapshotFingerprint);
  assert.deepEqual(left.tasks, right.tasks);
});

test("dependencies are resolved from the daily snapshot for the same contestant", async () => {
  const prerequisite = normalizeTaskTemplateCatalogEntry({
    id: 3,
    name: "Prerequisite",
    defaultDuration: 10,
    defaultCameras: 0,
  }, "inherited");
  const target = normalizeTaskTemplateCatalogEntry({
    id: 4,
    name: "Target",
    defaultDuration: 20,
    defaultCameras: 0,
    hasDependency: true,
    dependsOnTemplateIds: [3],
  }, "inherited");
  const fixture = fakeStorage({ snapshots: [target, prerequisite] });
  fixture.storage.getContestantsByPlan = async () => [{ id: 5, name: "Participant" }];
  fixture.storage.getPlanEngineInputDetails = async () => ({
    plan: {
      id: 1,
      work_start: "09:00",
      work_end: "18:00",
      meal_start: "14:00",
      meal_end: "15:00",
      meal_mode: "flexible_meal_window",
    },
    tasks: [
      { id: 30, plan_id: 1, template_id: 3, contestant_id: 5, status: "pending" },
      { id: 40, plan_id: 1, template_id: 4, contestant_id: 5, status: "pending" },
    ],
    locks: [],
    availability: [],
    breaks: [],
  });
  const input = await buildEngineInput(1, fixture.storage);
  const dependent = input.tasks.find((entry) => entry.id === 40)!;
  assert.deepEqual(dependent.dependsOnTemplateIds, [3]);
  assert.deepEqual(dependent.dependsOnTaskIds, [30]);
  assert.equal(dependent.dependsOnTaskId, 30);
});
