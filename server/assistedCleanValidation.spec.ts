import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration=await readFile(new URL("../supabase/migrations/080_assisted_clean_validation.sql",import.meta.url),"utf8");
const service=await readFile(new URL("./assistedPlanningService.ts",import.meta.url),"utf8");
const routes=await readFile(new URL("./routes.ts",import.meta.url),"utf8");
test("clean validation is computed server-side without moving tasks",()=>{assert.match(service,/validatePlan\(adapted\.problem, scheduled\)/);assert.match(service,/scheduled\.length === adapted\.problem\.tasks\.length/);assert.doesNotMatch(service.slice(service.indexOf("async validateDraft")),/assisted_apply_snapshot|patchDraft\(/);assert.match(routes,/assisted\/validate/);});
test("080 locks and rechecks every optimistic authority before atomic insert and link",()=>{const compact=migration.replace(/\s+/g," ");assert.match(compact,/FOR UPDATE/);for(const code of ["STALE_DRAFT","STALE_BASE_STAGE","STALE_CONFIG_REVISION"])assert.match(migration,new RegExp(code));assert.match(compact,/INSERT INTO planning_stage_validations.*UPDATE assisted_planning_sessions/);assert.match(compact,/0,0,0,p_report/);});
test("clean validation RPC is service-role-only",()=>{assert.match(migration,/REVOKE ALL ON FUNCTION public\.assisted_record_clean_validation.*PUBLIC,anon,authenticated/);assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.assisted_record_clean_validation.*service_role/);});
