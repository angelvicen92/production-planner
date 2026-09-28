import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql=await readFile(new URL("../supabase/migrations/086_assisted_itinerant_resource_persistence.sql",import.meta.url),"utf8");
const schema=await readFile(new URL("../shared/schema.ts",import.meta.url),"utf8");
const workflow=await readFile(new URL("../supabase/migrations/078_assisted_planning_workflow.sql",import.meta.url),"utf8");

test("forward migration persists explicit assignments through bootstrap, accept, rollback and redo",()=>{
  assert.match(schema,/assignedResourceIds:\s*jsonb\("assigned_resource_ids"\)/);
  const apply=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.assisted_apply_snapshot"),sql.indexOf("CREATE OR REPLACE FUNCTION public.assisted_bootstrap_session"));
  assert.match(apply,/assigned_resource_ids=CASE WHEN item \? 'assignedResourceIds' THEN item->'assignedResourceIds' ELSE assigned_resource_ids END/);
  const bootstrap=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.assisted_bootstrap_session"),sql.indexOf("CREATE OR REPLACE FUNCTION public.assisted_accept_stage"));
  assert.match(bootstrap,/'assignedResourceIds',coalesce\(assigned_resource_ids,'\[\]'::jsonb\)/);
  const accept=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.assisted_accept_stage"));
  assert.match(accept,/assigned_resource_ids=CASE WHEN task_item \? 'assignedResourceIds' THEN task_item->'assignedResourceIds' ELSE assigned_resource_ids END/);
  const move=workflow.slice(workflow.indexOf("CREATE OR REPLACE FUNCTION public.assisted_move_stage"));
  assert.match(move,/PERFORM assisted_apply_snapshot\(p_plan_id,target\.snapshot_json\)/);
});

test("legacy rows do not erase assignments while explicit empty rows restore pooled state",()=>{
  assert.match(sql,/WHEN item \? 'assignedResourceIds'/);
  assert.match(sql,/ELSE assigned_resource_ids/);
  assert.match(sql,/'assignedResourceIds',coalesce\(assigned_resource_ids,'\[\]'::jsonb\)/);
});
