import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/076_plan_operational_config_snapshots.sql", import.meta.url), "utf8");
const buildInput = await readFile(new URL("../engine/buildInput.ts", import.meta.url), "utf8");

test("076 snapshots only operational spatial fields and bundle catalogs with legacy provenance", () => {
  for (const token of ["config_source", "LEGACY_BACKFILL", "grouping_level", "parent_space_id", "plan_resource_bundle_snapshots", "space_affinities", "ON CONFLICT (plan_id) DO NOTHING"]) assert.ok(migration.includes(token), token);
  assert.doesNotMatch(migration, /ui_color|ui_order_index/i);
});

test("076 bundle authority is server-only", () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.plan_resource_bundle_snapshots FROM anon, authenticated/);
  assert.doesNotMatch(migration, /CREATE\s+POLICY/i);
});

test("buildEngineInput has no mutable spatial or bundle catalog reads", () => {
  for (const forbidden of ["storage.getSpaces()", "storage.getZones()", "storage.getResourceBundles()", "storage.getResourceBundleComponents()", "storage.getResourceBundleSpaceAffinities()"])
    assert.equal(buildInput.includes(forbidden), false, forbidden);
  assert.match(buildInput, /getPlanResourceBundleSnapshot/);
});
