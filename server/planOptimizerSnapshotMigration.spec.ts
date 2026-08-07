import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL("../supabase/migrations/075_plan_optimizer_snapshots.sql", import.meta.url),
  "utf8",
);
const schemaSource = await readFile(new URL("../shared/schema.ts", import.meta.url), "utf8");

test("075 creates the three structured V1 snapshot tables with bounded values", () => {
  for (const text of [
    "CREATE TABLE IF NOT EXISTS public.plan_optimizer_snapshots",
    "CREATE TABLE IF NOT EXISTS public.plan_optimizer_snapshot_heuristics",
    "CREATE TABLE IF NOT EXISTS public.plan_optimizer_snapshot_grouping_zones",
    "UNIQUE (plan_id)",
    "contract_version = 1",
    "source IN ('INHERITED', 'LEGACY_BACKFILL', 'DAY_OVERRIDE')",
    "editing_mode IN ('BASIC', 'ADVANCED')",
    "basic_level BETWEEN 0 AND 3",
    "advanced_value BETWEEN 0 AND 10",
    "grouping_weight BETWEEN 0 AND 10",
    "near_hard_breaks_max BETWEEN 0 AND 10",
  ]) assert.ok(sql.includes(text), text);
  assert.doesNotMatch(sql, /configuration_fingerprint|effective_weight/i);
});

test("075 references daily task-template identities and enforces same-plan scope", () => {
  assert.match(sql, /arrival_plan_template_snapshot_id BIGINT REFERENCES public\.plan_task_template_snapshots\(id\)/);
  assert.match(sql, /departure_plan_template_snapshot_id BIGINT REFERENCES public\.plan_task_template_snapshots\(id\)/);
  assert.match(sql, /spec11_validate_plan_optimizer_snapshot_scope/);
  assert.match(sql, /t\.id = NEW\.arrival_plan_template_snapshot_id AND t\.plan_id = NEW\.plan_id/);
  assert.match(sql, /t\.id = NEW\.departure_plan_template_snapshot_id AND t\.plan_id = NEW\.plan_id/);
  assert.match(sql, /spec11_validate_plan_optimizer_grouping_zone_scope/);
  assert.match(sql, /z\.plan_id = owning_plan_id AND z\.zone_id = NEW\.zone_id/);
  assert.doesNotMatch(sql, /main_zone_id\s+INTEGER[^\n]*REFERENCES\s+public\.zones/i);
  assert.doesNotMatch(sql, /zone_id\s+INTEGER[^\n]*REFERENCES\s+public\.zones/i);
  assert.doesNotMatch(sql, /REFERENCES\s+public\.optimizer_settings/i);
});

test("075 backfill is explicit legacy reconstruction and never chooses the first nominal match", () => {
  assert.match(sql, /'LEGACY_BACKFILL'/);
  assert.match(sql, /lower\(btrim\(t\.template_name\)\) = lower\(btrim\(o\.arrival_task_template_name\)\)/);
  assert.match(sql, /lower\(btrim\(t\.template_name\)\) = lower\(btrim\(o\.departure_task_template_name\)\)/);
  assert.match(sql, /match_count = 1/);
  assert.match(sql, /ON CONFLICT \(plan_id\) DO NOTHING/);
  assert.match(sql, /ON CONFLICT \(snapshot_id, heuristic_key\) DO NOTHING/);
  assert.match(sql, /ON CONFLICT \(snapshot_id, zone_id\) DO NOTHING/);
  assert.match(sql, /RAISE WARNING 'SPEC11-010 legacy plan/);
  assert.doesNotMatch(sql, /LIMIT\s+1/i);
});

test("075 is server-only for all snapshot tables and sequences", () => {
  for (const table of [
    "plan_optimizer_snapshots",
    "plan_optimizer_snapshot_heuristics",
    "plan_optimizer_snapshot_grouping_zones",
  ]) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`));
    assert.match(sql, new RegExp(`GRANT ALL ON TABLE public\\.${table} TO service_role`));
    assert.match(sql, new RegExp(`REVOKE ALL ON SEQUENCE public\\.${table}_id_seq FROM anon, authenticated`));
    assert.match(sql, new RegExp(`GRANT ALL ON SEQUENCE public\\.${table}_id_seq TO service_role`));
  }
  assert.doesNotMatch(sql, /CREATE\s+POLICY/i);
  assert.doesNotMatch(sql, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
});

test("Drizzle schema mirrors the optimizer snapshot persistence without derived authorities", () => {
  for (const text of [
    'pgTable("plan_optimizer_snapshots"',
    'pgTable("plan_optimizer_snapshot_heuristics"',
    'pgTable("plan_optimizer_snapshot_grouping_zones"',
    'plan_optimizer_snapshots_plan_key',
    'plan_optimizer_snapshots_contract_version_check',
    'plan_optimizer_snapshots_source_check',
    'plan_optimizer_snapshots_editing_mode_check',
    'plan_optimizer_snapshot_heuristics_key',
    'plan_optimizer_snapshot_heuristics_key_check',
    'plan_optimizer_snapshot_grouping_zones_key',
  ]) assert.ok(schemaSource.includes(text), text);
  assert.doesNotMatch(schemaSource, /configurationFingerprint:\s*text\(|effectiveWeight:\s*integer\(/);
});
