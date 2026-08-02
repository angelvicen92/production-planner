import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../supabase/migrations/073_workday_space_availability_snapshots.sql", import.meta.url), "utf8");

test("073 keeps snapshot schema, constraints, FKs and idempotent backfill", () => {
  for (const text of ["CREATE TABLE IF NOT EXISTS public.plan_zone_settings", "CREATE TABLE IF NOT EXISTS public.plan_space_settings", "REFERENCES public.plans(id) ON DELETE CASCADE", "REFERENCES public.zones(id)", "REFERENCES public.spaces(id)", "UNIQUE (plan_id, zone_id)", "UNIQUE (plan_id, space_id)", "ON CONFLICT (plan_id, zone_id) DO NOTHING", "ON CONFLICT (plan_id, space_id) DO NOTHING"]) assert.ok(sql.includes(text), text);
});
test("073 enables server-only RLS and revokes client table and sequence access", () => {
  assert.match(sql, /ALTER TABLE public\.plan_zone_settings ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.plan_space_settings ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.plan_zone_settings, public\.plan_space_settings FROM anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON SEQUENCE public\.plan_zone_settings_id_seq, public\.plan_space_settings_id_seq FROM anon, authenticated/);
  assert.match(sql, /GRANT ALL ON TABLE public\.plan_zone_settings, public\.plan_space_settings TO service_role/);
  assert.doesNotMatch(sql, /CREATE\s+POLICY/i);
  assert.doesNotMatch(sql, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
});
