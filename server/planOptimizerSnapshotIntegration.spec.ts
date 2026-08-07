import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const storageSource = await readFile(new URL("./storage.ts", import.meta.url), "utf8");
const buildInputSource = await readFile(new URL("../engine/buildInput.ts", import.meta.url), "utf8");

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("plan creation validates optimizer settings before persisting the plan", () => {
  const source = between(storageSource, "  async createPlan(", "  async deletePlan(");
  const globalLoadIndex = source.indexOf('supabaseAdmin.from("optimizer_settings").select("*")');
  const transportValidationIndex = source.indexOf("resolvePlanOptimizerTransportReferencesV1");
  const optimizerValidationIndex = source.indexOf("normalizePlanOptimizerSnapshotV1");
  const planInsertIndex = source.indexOf('.from("plans")');
  assert.ok(globalLoadIndex >= 0);
  assert.ok(transportValidationIndex > globalLoadIndex && transportValidationIndex < planInsertIndex);
  assert.ok(optimizerValidationIndex > transportValidationIndex && optimizerValidationIndex < planInsertIndex);
  assert.match(source, /validatePlanOptimizerSnapshotZoneReferencesV1/);
});

test("plan creation persists daily template identities, spatial scope, then the optimizer snapshot atomically by compensation", () => {
  const source = between(storageSource, "  async createPlan(", "  async deletePlan(");
  const planInsertIndex = source.indexOf('.from("plans")');
  const templateInsertIndex = source.indexOf('.from("plan_task_template_snapshots")');
  const templateSelectIndex = source.indexOf('.select("id, source_template_id, template_name")', templateInsertIndex);
  const spatialInsertIndex = source.indexOf('.from("plan_zone_settings")');
  const optimizerInsertIndex = source.indexOf('.from("plan_optimizer_snapshots")');
  const heuristicInsertIndex = source.indexOf('.from("plan_optimizer_snapshot_heuristics")');
  const groupingInsertIndex = source.indexOf('.from("plan_optimizer_snapshot_grouping_zones")');

  assert.ok(planInsertIndex >= 0);
  assert.ok(templateInsertIndex > planInsertIndex);
  assert.ok(templateSelectIndex > templateInsertIndex);
  assert.ok(spatialInsertIndex > templateSelectIndex);
  assert.ok(optimizerInsertIndex > spatialInsertIndex);
  assert.ok(heuristicInsertIndex > optimizerInsertIndex);
  assert.ok(groupingInsertIndex > optimizerInsertIndex);
  assert.match(source, /buildPlanOptimizerSnapshotPersistenceBundleV1/);
  assert.match(source, /throwAfterPlanCreationFailure/);
});

test("typed optimizer snapshot storage reads only per-plan snapshot tables", () => {
  const source = between(
    storageSource,
    "  async getPlanOptimizerSnapshot(",
    "  async getPlanTaskTemplateSnapshots(",
  );
  assert.match(source, /from\("plan_optimizer_snapshots"\)/);
  assert.match(source, /from\("plan_optimizer_snapshot_heuristics"\)/);
  assert.match(source, /from\("plan_optimizer_snapshot_grouping_zones"\)/);
  assert.match(source, /hydratePlanOptimizerSnapshotV1/);
  assert.doesNotMatch(source, /from\("optimizer_settings"\)/);
  assert.doesNotMatch(source, /getOptimizerSettings\(/);
});

test("checkpoint 2 deliberately leaves buildEngineInput on the legacy global adapter", () => {
  assert.match(buildInputSource, /storage\.getOptimizerSettings\(\)/);
  assert.doesNotMatch(buildInputSource, /storage\.getPlanOptimizerSnapshot\(/);
});
