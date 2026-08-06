import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL("../supabase/migrations/074_plan_task_template_snapshots.sql", import.meta.url),
  "utf8",
);
const schemaSource = await readFile(new URL("../shared/schema.ts", import.meta.url), "utf8");

test("074 creates the versioned per-plan snapshot without a destructive template FK", () => {
  for (const text of [
    "CREATE TABLE IF NOT EXISTS public.plan_task_template_snapshots",
    "REFERENCES public.plans(id) ON DELETE CASCADE",
    "UNIQUE (plan_id, source_template_id)",
    "contract_version = 1",
    "default_duration > 0",
    "default_cameras >= 0",
    "itinerant_team_requirement IN ('none', 'any', 'specific')",
  ]) assert.ok(sql.includes(text), text);
  assert.doesNotMatch(sql, /source_template_id\s+INTEGER[^\n]*REFERENCES\s+public\.task_templates/i);
  assert.doesNotMatch(sql, /source_fingerprint/i);
});

test("074 backfills the complete legacy catalog idempotently", () => {
  assert.match(sql, /FROM public\.plans p\s+CROSS JOIN public\.task_templates t/i);
  assert.match(sql, /'legacy_backfill'/);
  assert.match(sql, /ON CONFLICT \(plan_id, source_template_id\) DO NOTHING/);
  assert.match(sql, /depends_on_template_ids/);
  assert.match(sql, /depends_on_template_id/);
  assert.match(sql, /itinerantTeamAllowedIds/);
  assert.match(sql, /itinerant_team_allowed_ids/);
  assert.match(sql, /jsonb_typeof\(pg_temp\.spec11_safe_jsonb\(t\.resource_requirements #>> '\{\}'\)\) = 'object'/);
  assert.match(sql, /CASE WHEN t\.default_duration > 0 THEN t\.default_duration ELSE 30 END/);
});

test("074 is server-only and protects table and sequence", () => {
  assert.match(sql, /ALTER TABLE public\.plan_task_template_snapshots ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.plan_task_template_snapshots FROM anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON SEQUENCE public\.plan_task_template_snapshots_id_seq FROM anon, authenticated/);
  assert.match(sql, /GRANT ALL ON TABLE public\.plan_task_template_snapshots TO service_role/);
  assert.match(sql, /GRANT ALL ON SEQUENCE public\.plan_task_template_snapshots_id_seq TO service_role/);
  assert.doesNotMatch(sql, /CREATE\s+POLICY/i);
  assert.doesNotMatch(sql, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
});

test("Drizzle schema mirrors the migration constraints and omits a stored fingerprint", () => {
  for (const text of [
    'pgTable("plan_task_template_snapshots"',
    'plan_task_template_snapshots_plan_template_key',
    'plan_task_template_snapshots_contract_version_check',
    'plan_task_template_snapshots_source_check',
    'plan_task_template_snapshots_dependency_array_check',
    'plan_task_template_snapshots_allowed_team_array_check',
    'plan_task_template_snapshots_itinerant_requirement_check',
    'plan_task_template_snapshots_specific_team_check',
  ]) assert.ok(schemaSource.includes(text), text);
  assert.doesNotMatch(schemaSource, /sourceFingerprint:|source_fingerprint/);
});
