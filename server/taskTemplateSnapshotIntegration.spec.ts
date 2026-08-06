import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const storageSource = await readFile(new URL("./storage.ts", import.meta.url), "utf8");
const buildInputSource = await readFile(new URL("../engine/buildInput.ts", import.meta.url), "utf8");
const routesSource = await readFile(new URL("./routes.ts", import.meta.url), "utf8");

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("plan creation validates and persists the complete snapshot before dependent initialization", () => {
  const source = between(storageSource, "  async createPlan(", "  async deletePlan(");
  const validationIndex = source.indexOf("normalizeTaskTemplateCatalogEntry");
  const planInsertIndex = source.indexOf('.from("plans")');
  const snapshotInsertIndex = source.indexOf('.from("plan_task_template_snapshots")');
  const spatialInsertIndex = source.indexOf('.from("plan_zone_settings")');
  assert.ok(validationIndex >= 0 && validationIndex < planInsertIndex);
  assert.ok(snapshotInsertIndex > planInsertIndex && snapshotInsertIndex < spatialInsertIndex);
  assert.match(source, /taskTemplateSnapshotToPersistenceRow/);
  assert.match(source, /throwAfterPlanCreationFailure/);
});

test("contestant auto-create reads the daily snapshot and compensates on failure", () => {
  const source = between(storageSource, "  async createContestantForPlan(", "  async updateContestantForPlan(");
  const snapshotBlock = between(
    source,
    "    // Auto-create is governed by the immutable per-plan template snapshot.",
    "    // ✅ Auto-crear tareas por Vocal Coach",
  );
  assert.match(snapshotBlock, /getPlanTaskTemplateSnapshots\(planId\)/);
  assert.match(snapshotBlock, /autoCreateOnContestantCreate/);
  assert.match(snapshotBlock, /throwAfterContestantCreationFailure/);
  assert.doesNotMatch(snapshotBlock, /from\("task_templates"\)/);
});

test("daily task creation inherits operational values from the plan snapshot", () => {
  const source = between(storageSource, "  async createDailyTask(", "  async updateDailyTask(");
  assert.match(source, /ensurePlanTaskTemplateSnapshot\(planId, templateId\)/);
  assert.match(source, /snapshot\.defaultZoneId/);
  assert.match(source, /snapshot\.defaultSpaceId/);
  assert.match(source, /from\("plan_space_settings"\)/);
  assert.match(source, /default_comment1_color, default_comment2_color/);
  assert.doesNotMatch(source, /select\([^)]*default_duration/);
  assert.doesNotMatch(source, /select\([^)]*resource_requirements/);
});

test("ad-hoc initialization is explicit and cannot initialize an empty or missing plan catalog", () => {
  const source = between(
    storageSource,
    "  async ensurePlanTaskTemplateSnapshot(",
    "  async getTaskTemplates(",
  );
  assert.match(source, /MISSING_PLAN_TASK_TEMPLATE_SNAPSHOT_CATALOG/);
  assert.match(source, /already has persisted tasks/);
  assert.match(source, /from\("daily_tasks"\)/);
  assert.match(source, /ad_hoc_from_default/);
  assert.match(source, /onConflict: "plan_id,source_template_id"/);
  assert.match(source, /ignoreDuplicates: true/);
  assert.match(source, /MISSING_PLAN_TASK_TEMPLATE_SNAPSHOT/);
});

test("buildEngineInput treats snapshots as hard input and never reads global templates", () => {
  assert.match(buildInputSource, /storage\.getPlanEngineInputDetails\(planId\)/);
  assert.match(buildInputSource, /storage\.getPlanTaskTemplateSnapshots\(planId\)/);
  assert.match(buildInputSource, /indexTaskTemplateSnapshots/);
  assert.match(buildInputSource, /MISSING_PLAN_TASK_TEMPLATE_SNAPSHOT/);
  assert.doesNotMatch(buildInputSource, /storage\.getTaskTemplates\(/);
  assert.doesNotMatch(buildInputSource, /\?\?\s*30[;,]/);
  for (const field of [
    "taskTemplateSnapshotContractVersion",
    "taskTemplateSnapshotCount",
    "taskTemplateSnapshotSources",
    "taskTemplateSnapshotFingerprint",
  ]) assert.match(buildInputSource, new RegExp(field));
});

test("the EngineInput task path uses snapshot dependencies, resources, duration and location", () => {
  const source = between(buildInputSource, "          tasks: [", "    locks: details.locks.map");
  for (const expression of [
    "tpl.dependencyTemplateIds",
    "tpl.defaultDuration",
    "tpl.defaultZoneId",
    "tpl.defaultSpaceId",
    "tpl.resourceRequirements",
    "tpl.itinerantTeamRequirement",
    "tpl.allowedItinerantTeamIds",
    "tpl.defaultCameras",
  ]) assert.match(source, new RegExp(expression.replaceAll(".", "\\.")));
  assert.doesNotMatch(source, /t\.template\??\./);
});


test("manual blocks explicitly extend the plan snapshot before direct insertion", () => {
  const source = between(routesSource, "      // Manual blocks bypass createDailyTask", "      const taskId = Number((createdTask as any).id);");
  const ensureIndex = source.indexOf("storage.ensurePlanTaskTemplateSnapshot(planId, manualTemplateId)");
  const insertIndex = source.indexOf('.from("daily_tasks")');
  assert.ok(ensureIndex >= 0 && ensureIndex < insertIndex);
});
