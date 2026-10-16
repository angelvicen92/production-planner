/** Read-only source replay into the harness's newly owned local database only.
 * Original task identities, snapshot objects and meal decisions are preserved.
 * This certifies presentation, not generation of a new S22. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type pg from "pg";
import { fingerprintAssistedPlanningSnapshotV1 } from "../../server/assistedPlanningSnapshot";

export function operationalMealRehearsalFixture() {
  return JSON.parse(gunzipSync(readFileSync("script/demo/fixtures/ui05-a2-s22.json.gz")).toString());
}

export async function seedOperationalMealRehearsal(db: pg.Client, actor: string) {
  assert.equal((db as any).host, "127.0.0.1");
  const fixture = operationalMealRehearsalFixture();
  const planId = fixture.source.planId;
  assert.equal(planId, 27002);
  assert.equal((await db.query("SELECT count(*) n FROM assisted_planning_sessions WHERE plan_id=$1", [planId])).rows[0].n, "0");
  const localTasks = (await db.query("SELECT id,template_id FROM daily_tasks WHERE plan_id=$1 ORDER BY id", [planId])).rows;
  assert.deepEqual(localTasks.map(t => Number(t.id)), fixture.taskTemplates.map(([id]: number[]) => id).sort((a: number, b: number) => a - b));
  // The importer reuses historical template identities. Recreate the original
  // day template copies so even block/template references keep source IDs.
  const cloned = new Set<number>();
  for (const [taskId, templateId] of fixture.taskTemplates) {
    const original = localTasks.find(t => Number(t.id) === taskId)!;
    if (!cloned.has(templateId)) {
      await db.query("INSERT INTO task_templates OVERRIDING SYSTEM VALUE SELECT (jsonb_populate_record(NULL::task_templates,to_jsonb(t)||jsonb_build_object('id',$2::bigint))).* FROM task_templates t WHERE id=$1 ON CONFLICT(id) DO NOTHING", [original.template_id, templateId]);
      cloned.add(templateId);
    }
    await db.query("UPDATE daily_tasks SET template_id=$1 WHERE id=$2 AND plan_id=$3", [templateId, taskId, planId]);
  }
  assert.deepEqual((await db.query("SELECT planner_next_configuration FROM plans WHERE id=$1", [planId])).rows[0].planner_next_configuration, fixture.configuration);
  const fp = "e".repeat(64);
  const revision = (await db.query("INSERT INTO plan_config_revisions(plan_id,source,fingerprint,identity_json,replay_snapshot_json,created_by) VALUES($1,'DISPOSABLE_UI05_REPLAY',$2,$3,$4,$5) RETURNING id", [planId, fp, { contractVersion: 1, planId, configurationFingerprint: fp }, { contractVersion: 1 }, actor])).rows[0].id;
  const initial = fixture.stages[0].snapshot;
  const session = (await db.query("INSERT INTO assisted_planning_sessions(plan_id,status,current_config_revision_id,draft_snapshot_json,draft_fingerprint) VALUES($1,'ACTIVE',$2,$3,$4) RETURNING id", [planId, revision, initial, fingerprintAssistedPlanningSnapshotV1(initial)])).rows[0].id;
  let parent = null;
  for (const stage of fixture.stages) {
    parent = (await db.query("INSERT INTO assisted_planning_stages(session_id,plan_id,ordinal,parent_stage_id,scope_json,config_revision_id,snapshot_json,snapshot_fingerprint,validation_summary_json,accepted_by,accepted_at) VALUES($1,$2,$3,$4,'{}',$5,$6,$7,'{}',$8,now()) RETURNING id", [session, planId, stage.ordinal, parent, revision, stage.snapshot, fingerprintAssistedPlanningSnapshotV1(stage.snapshot), actor])).rows[0].id;
  }
  const snapshot = fixture.stages.at(-1).snapshot;
  await db.query("UPDATE assisted_planning_sessions SET active_stage_id=$1,draft_base_stage_id=$1,draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$4", [parent, snapshot, fingerprintAssistedPlanningSnapshotV1(snapshot), session]);
  await db.query("SELECT assisted_apply_snapshot($1,$2)", [planId, snapshot]);
  const breaks = JSON.parse(readFileSync("script/demo/fixtures/a2-27002-legacy-breaks.json", "utf8"));
  for (const id of new Set<number>(breaks.flatMap((b: any) => b.itinerant_team_id == null ? [] : [b.itinerant_team_id])))
    await db.query("INSERT INTO itinerant_teams(id,code,name) OVERRIDING SYSTEM VALUE VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING", [id, `legacy-unit-${id}`, `Historical unit ${id}`]);
  for (const b of breaks) {
    const fields = Object.keys(b); assert.ok(fields.every(k => /^[a-z_]+$/.test(k)));
    await db.query(`INSERT INTO plan_breaks (${fields.join(",")}) OVERRIDING SYSTEM VALUE VALUES (${fields.map((_, i) => `$${i + 1}`).join(",")})`, fields.map(k => b[k]));
  }
  // Independent legacy day, outside the preserved historical rehearsal days.
  await db.query("INSERT INTO plans OVERRIDING SYSTEM VALUE SELECT (jsonb_populate_record(NULL::plans,to_jsonb(p)||jsonb_build_object('id',27003,'date','2026-11-01','planner_next_configuration',NULL))).* FROM plans p WHERE id=26999");
  await db.query("INSERT INTO daily_tasks OVERRIDING SYSTEM VALUE SELECT (jsonb_populate_record(NULL::daily_tasks,to_jsonb(t)||jsonb_build_object('id',990001,'plan_id',27003,'start_planned','09:00','end_planned','09:30'))).* FROM daily_tasks t WHERE plan_id=26999 ORDER BY id LIMIT 1");
  await db.query("INSERT INTO plan_breaks OVERRIDING SYSTEM VALUE SELECT (jsonb_populate_record(NULL::plan_breaks,to_jsonb(b)||jsonb_build_object('id',990001,'plan_id',27003))).* FROM plan_breaks b WHERE plan_id=27002 AND kind='space_meal' AND space_id=3 LIMIT 1");
  // Existing legacy session: no operationalMeals field and no structured day
  // configuration. Bootstrap/configuration construction is outside this UI gate.
  const legacySnapshot = { contractVersion: 1 as const, tasks: [{ taskId: 990001, startPlanned: "09:00", endPlanned: "09:30", zoneId: 3, spaceId: 3, locationLabel: null, durationOverride: null, camerasOverride: null }] };
  const legacyFingerprint = fingerprintAssistedPlanningSnapshotV1(legacySnapshot);
  const legacyRevision = (await db.query("INSERT INTO plan_config_revisions(plan_id,source,fingerprint,identity_json,replay_snapshot_json,created_by) VALUES(27003,'DISPOSABLE_LEGACY_UI_REPLAY',$1,'{}','{}',$2) RETURNING id", ["d".repeat(64), actor])).rows[0].id;
  const legacySession = (await db.query("INSERT INTO assisted_planning_sessions(plan_id,status,current_config_revision_id,draft_snapshot_json,draft_fingerprint) VALUES(27003,'ACTIVE',$1,$2,$3) RETURNING id", [legacyRevision, legacySnapshot, legacyFingerprint])).rows[0].id;
  const legacyStage = (await db.query("INSERT INTO assisted_planning_stages(session_id,plan_id,ordinal,scope_json,config_revision_id,snapshot_json,snapshot_fingerprint,validation_summary_json,accepted_by,accepted_at) VALUES($1,27003,0,'{}',$2,$3,$4,'{}',$5,now()) RETURNING id", [legacySession, legacyRevision, legacySnapshot, legacyFingerprint, actor])).rows[0].id;
  await db.query("UPDATE assisted_planning_sessions SET active_stage_id=$1,draft_base_stage_id=$1 WHERE id=$2", [legacyStage, legacySession]);
  return fixture.source;
}
