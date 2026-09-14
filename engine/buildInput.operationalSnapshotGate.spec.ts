import assert from "node:assert/strict";
import test from "node:test";
import { buildEngineInput } from "./buildInput";
import { normalizePlanOptimizerSnapshotV1 } from "../server/planOptimizerSnapshot";
import { normalizeTaskTemplateCatalogEntry } from "../server/taskTemplateSnapshot";
import {
  buildEffectivePlanConfigRevisionV1,
  projectEffectiveAuthoritiesFromEngineInputV1,
} from "../server/effectivePlanConfigRevision";

const provenance = (authority: string) => ({ authority, authorityContractVersion: 1 });

function gateFixture() {
  let forbiddenGlobalReads = 0;
  const globals = {
    zone: { zone_id: 2, name: "Original zone", meal_start_preferred: "13:00", meal_end_preferred: "14:00", grouping_level: 2, grouping_min_chain: 3, max_template_changes: 5, space_meal_break_minutes: 45 },
    space: { space_id: 10, zone_id: 2, name: "Original space", parent_space_id: null, priority_level: 4, grouping_level: 3, grouping_min_chain: 2, grouping_apply_to_descendants: true },
    bundle: { id: "bundle-original", name: "Original bundle", bundle_type: "composite", is_active: true },
  };
  const capture = (planId: number) => ({
    planId,
    zones: [{ id: planId * 10 + 1, plan_id: planId, availability_start: "09:00", availability_end: "17:00", source: "inherited", ...structuredClone(globals.zone) }],
    spaces: [{ id: planId * 10 + 2, plan_id: planId, availability_start: "09:30", availability_end: "16:30", source: "inherited", ...structuredClone(globals.space) }],
    bundle: { contract_version: 1, source: "INHERITED", bundles: [structuredClone(globals.bundle)], components: [{ id: "component-1", bundle_id: globals.bundle.id, resource_id: 3 }], space_affinities: [{ id: "affinity-1", bundle_id: globals.bundle.id, space_id: 10, affinity_score: 7 }] },
  });
  const daily = new Map([[1, capture(1)]]);
  const template = normalizeTaskTemplateCatalogEntry({ id: 4, name: "Daily task", defaultDuration: 37, defaultCameras: 1, zoneId: 2, spaceId: 10 }, "inherited");
  const optimizer = normalizePlanOptimizerSnapshotV1({});
  const storage = {
    getPlanEngineInputDetails: async (planId: number) => ({ plan: { id: planId, work_start: "09:00", work_end: "18:00", meal_start: "13:00", meal_end: "14:00", meal_mode: "flexible_meal_window" }, tasks: [{ id: 40, template_id: 4, status: "pending" }], locks: [], availability: [], breaks: [] }),
    getPlanTaskTemplateSnapshots: async () => [template],
    getPlanOptimizerSnapshot: async () => optimizer,
    getPlanZoneSettings: async (planId: number) => daily.get(planId)!.zones,
    getPlanSpaceSettings: async (planId: number) => daily.get(planId)!.spaces,
    getPlanResourceBundleSnapshot: async (planId: number) => daily.get(planId)!.bundle,
    getContestantsByPlan: async () => [], getCamerasAvailableForPlan: async () => 1,
    getZoneResourceAssignmentsForPlan: async () => ({}), getSpaceResourceAssignmentsForPlan: async () => ({}),
    getZoneResourceTypeRequirementsForPlan: async () => ({}), getSpaceResourceTypeRequirementsForPlan: async () => ({}),
    getPlanResourceItemsForPlan: async () => [], getResourceItemComponentsMap: async () => ({}),
    getZones: async () => { forbiddenGlobalReads += 1; throw new Error("forbidden zones read"); },
    getSpaces: async () => { forbiddenGlobalReads += 1; throw new Error("forbidden spaces read"); },
    getResourceBundles: async () => { forbiddenGlobalReads += 1; throw new Error("forbidden bundles read"); },
    getResourceBundleComponents: async () => { forbiddenGlobalReads += 1; throw new Error("forbidden components read"); },
    getResourceBundleSpaceAffinities: async () => { forbiddenGlobalReads += 1; throw new Error("forbidden affinities read"); },
  } as any;
  const revision = (planId: number, input: Awaited<ReturnType<typeof buildEngineInput>>) => buildEffectivePlanConfigRevisionV1({
    planId, taskTemplateSnapshots: [template], taskTemplateProvenance: provenance("plan_task_template_snapshots"),
    optimizerSnapshot: optimizer, optimizerProvenance: provenance("plan_optimizer_snapshots"),
    authorities: projectEffectiveAuthoritiesFromEngineInputV1(input),
  });
  return { globals, daily, capture, storage, revision, forbiddenReads: () => forbiddenGlobalReads };
}

test("daily spatial and bundle snapshots causally isolate EngineInput and its effective fingerprint", async () => {
  const f = gateFixture();
  const before = await buildEngineInput(1, f.storage);
  const beforeRevision = f.revision(1, before);

  Object.assign(f.globals.zone, { name: "Changed zone", grouping_level: 9, max_template_changes: 1 });
  Object.assign(f.globals.space, { name: "Changed space", priority_level: 9, grouping_min_chain: 8 });
  Object.assign(f.globals.bundle, { id: "bundle-changed", name: "Changed bundle" });

  const rebuilt = await buildEngineInput(1, f.storage);
  const rebuiltRevision = f.revision(1, rebuilt);
  assert.deepEqual(rebuilt, before);
  assert.equal(rebuiltRevision.configurationFingerprint, beforeRevision.configurationFingerprint);
  assert.equal(f.forbiddenReads(), 0);
  assert.deepEqual(before.planZoneSettings[0], {
    id: 11, zoneId: 2, availabilityStart: "09:00", availabilityEnd: "17:00", source: "inherited", name: "Original zone",
    mealStartPreferred: "13:00", mealEndPreferred: "14:00", groupingLevel: 2, groupingMinChain: 3, maxTemplateChanges: 5, spaceMealBreakMinutes: 45,
  });
  assert.deepEqual(before.planSpaceSettings[0], {
    id: 12, spaceId: 10, zoneId: 2, availabilityStart: "09:30", availabilityEnd: "16:30", source: "inherited", name: "Original space",
    parentSpaceId: null, priorityLevel: 4, groupingLevel: 3, groupingMinChain: 2, groupingApplyToDescendants: true,
  });
  assert.equal(before.resourceBundles?.[0]?.name, "Original bundle");

  f.daily.set(2, f.capture(2));
  const newlyInherited = await buildEngineInput(2, f.storage);
  assert.equal(newlyInherited.planZoneSettings[0]?.name, "Changed zone");
  assert.equal(newlyInherited.planSpaceSettings[0]?.name, "Changed space");
  assert.equal(newlyInherited.resourceBundles?.[0]?.name, "Changed bundle");
  assert.notEqual(f.revision(2, newlyInherited).configurationFingerprint, beforeRevision.configurationFingerprint);
  assert.equal(f.forbiddenReads(), 0);
});
