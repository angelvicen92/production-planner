import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../supabase/migrations/078_assisted_planning_workflow.sql", import.meta.url), "utf8");
const service = await readFile(new URL("./assistedPlanningService.ts", import.meta.url), "utf8");
const routes = await readFile(new URL("./routes.ts", import.meta.url), "utf8");

test("accept is a single server-only transaction with concurrency and validation gates", () => {
  assert.match(sql, /assisted_accept_stage[\s\S]*FOR UPDATE/);
  for (const code of ["STALE_DRAFT", "STALE_BASE_STAGE", "VALIDATION_REQUIRED", "STALE_VALIDATION", "VALIDATION_NOT_ACCEPTABLE", "TASK_SET_MISMATCH", "CONCURRENT_ACCEPT"])
    assert.ok(sql.includes(code), code);
  assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
});

test("snapshot application owns only assisted planning columns", () => {
  const apply = sql.slice(sql.indexOf("assisted_apply_snapshot"), sql.indexOf("END $$;", sql.indexOf("assisted_apply_snapshot")));
  for (const column of ["start_planned", "end_planned", "zone_id", "space_id", "location_label", "duration_override", "cameras_override"])
    assert.ok(apply.includes(column), column);
  for (const forbidden of ["status=", "start_real", "end_real", "comment", "pause"])
    assert.equal(apply.includes(forbidden), false, forbidden);
});

test("rollback/redo preserve config and divergence archives the complete old future", () => {
  const move = sql.slice(sql.indexOf("assisted_move_stage"));
  assert.doesNotMatch(move, /current_config_revision_id\s*=/);
  assert.match(sql, /WITH RECURSIVE obsolete/);
  assert.match(sql, /coalesce\(max\(ordinal\),-1\)\+1/);
  assert.match(sql, /assisted_planning_stages_one_live_child/);
});

test("API exposes only authenticated workflow endpoints and no proposal operation", () => {
  for (const suffix of ["assisted\"", "assisted/session", "assisted/draft", "assisted/accept-stage", "assisted/rollback", "assisted/redo", "assisted/history"])
    assert.ok(routes.includes(suffix), suffix);
  assert.doesNotMatch(service, /proposal|planning_runs/i);
  assert.match(routes, /app\.use\("\/api"[\s\S]*requireAuth/);
});
