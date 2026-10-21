import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const actor = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
test("U06a PostgreSQL RPC enforces roles, revisions, references, atomic failure and local restore", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION public.positive_integer_jsonb_array(v jsonb) RETURNS boolean LANGUAGE SQL IMMUTABLE AS $$ SELECT jsonb_typeof(v)='array' $$;`);
    await db.exec(readFileSync("script/demo/fixtures/application-schema.sql", "utf8"));
    await db.exec(`CREATE TABLE public.roles(id integer PRIMARY KEY,key text); CREATE TABLE public.user_roles(user_id uuid,role_id integer);
      INSERT INTO roles VALUES(1,'admin'),(2,'production'),(3,'viewer');
      INSERT INTO user_roles VALUES('${actor(1)}',1),('${actor(2)}',2),('${actor(3)}',3);
      INSERT INTO auth.users VALUES('${actor(1)}'),('${actor(2)}'),('${actor(3)}');
      CREATE SEQUENCE plan_config_revisions_id_seq; ALTER TABLE plan_config_revisions ALTER COLUMN id SET DEFAULT nextval('plan_config_revisions_id_seq');
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;`);
    await db.exec(readFileSync("supabase/migrations/092_main_flow_soft_preference.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/099_transport_group_config_integrity.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/102_round_preparation_day_override.sql", "utf8"));
    const immutable = readFileSync("supabase/migrations/088_plan_planner_next_configuration.sql", "utf8");
    await db.exec(immutable.slice(immutable.indexOf("CREATE FUNCTION")));
    await db.exec(`INSERT INTO program_settings(id,meal_start,meal_end) VALUES(1,'13:00','14:00');
      INSERT INTO zones(id,name) VALUES(10,'Zone'); INSERT INTO spaces(id,zone_id,name) VALUES(20,10,'Left'),(21,10,'Right');
      INSERT INTO task_templates(id,name,default_duration) VALUES(1,'Operation',30);
`);
    const rounds = [{ id: "operation-pair", synchronization: "START_TOGETHER_WHILE_ALL_LANES_ACTIVE", lanes: [
      { spaceId: 20, taskIds: [1, 2], preparationMinutesBetweenRounds: 5 }, { spaceId: 21, taskIds: [3, 4], preparationMinutesBetweenRounds: 5 },
    ] }];
    await db.query("INSERT INTO plans(id,date,work_start,work_end,meal_start,meal_end,meal_mode,participant_transition_minutes,work_baseline_start,work_baseline_end,work_config_source,meal_baseline_start,meal_baseline_end,meal_baseline_mode,meal_config_source,planner_next_configuration) VALUES(1,'2026-10-30','09:00','21:00','13:00','14:00','flexible_meal_window',5,'09:00','21:00','LEGACY_BACKFILL','13:00','14:00','flexible_meal_window','LEGACY_BACKFILL',$1)", [{ contractVersion: 1, taskOperations: [], roundSynchronizations: rounds }]);
    await db.exec(`INSERT INTO plans(id,date,work_start,work_end,meal_start,meal_end,meal_mode,participant_transition_minutes,work_baseline_start,work_baseline_end,work_config_source,meal_baseline_start,meal_baseline_end,meal_baseline_mode,meal_config_source) VALUES(2,'2026-01-01','09:00','21:00','13:00','14:00','flexible_meal_window',5,'09:00','21:00','LEGACY_BACKFILL','13:00','14:00','flexible_meal_window','LEGACY_BACKFILL');
      INSERT INTO plan_space_settings(id,plan_id,space_id,zone_id,name) VALUES(1,1,20,10,'Left'),(2,1,21,10,'Right');
      INSERT INTO daily_tasks(id,plan_id,template_id,space_id,zone_id) VALUES(1,1,1,20,10),(2,1,1,20,10),(3,1,1,21,10),(4,1,1,21,10);
      SET ROLE service_role`);
    let revisionId: number | null = null;
    let effective = structuredClone(rounds);
    const identity = (n: number) => ({ contractVersion: 1, planId: 1, configurationFingerprint: String(n).padStart(64, "0") });
    const replay = (value: typeof rounds) => ({ contractVersion: 1, authorities: { plan_workday: [{ workDay: { start: "09:00", end: "21:00" }, mealWindow: { start: "13:00", end: "14:00" }, mealMode: "flexible_meal_window", defaultParticipantTransitionMinutes: 5, plannerNextAuthorities: { roundSynchronizations: value } }] } });
    const mutate = (minutes: number | undefined, user = actor(2), expected = revisionId, candidate = replay(effective), target = { policyId: "operation-pair", spaceId: 20 }) => db.query<{ id: number }>(
      "SELECT public.apply_day_config_operation_v4(1,$1,$2,$3,$4,$5,$6,$7,$8,'{}') AS id",
      [user, minutes === undefined ? "RESTORE" : "EDIT", { ...(minutes === undefined ? { capability: "SYNCHRONIZED_ROUNDS" } : {}), roundPreparation: { ...target, ...(minutes === undefined ? {} : { preparationMinutesBetweenRounds: minutes }) }, expectedRevisionId: expected }, expected, identity(1), replay(effective), identity(2), candidate]);
    const material = async () => (await db.query("SELECT (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM plans p) plans,(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM plan_config_revisions r) revisions")).rows;
    const before = await material();
    await assert.rejects(() => mutate(10, actor(3)), /PERMISSION_DENIED/);
    for (const target of [{ policyId: "absent", spaceId: 20 }, { policyId: "operation-pair", spaceId: 21_000 }]) await assert.rejects(() => mutate(10, actor(2), null, replay(effective), target), /CONFIGURATION_CONFLICT/);
    for (const minutes of [-1, 1.5]) await assert.rejects(() => mutate(minutes), /INVALID_ROUND_PREPARATION_OVERRIDE/);
    assert.deepEqual(await material(), before);
    const next = structuredClone(effective); next[0].lanes[0].preparationMinutesBetweenRounds = 10;
    revisionId = Number((await mutate(10, actor(1), null, replay(next))).rows[0].id); effective = next;
    const saved = await material();
    assert.equal((saved[0] as any).plans[0].round_preparation_overrides[0].by, actor(1));
    assert.equal((saved[0] as any).plans[1].round_preparation_overrides.length, 0);
    await assert.rejects(() => mutate(0, actor(2), null), /STALE_CONFIG_REVISION/);
    await assert.rejects(() => mutate(0), /STALE_ROUND_PREPARATION_CANDIDATE/);
    const badCandidate = replay(structuredClone(rounds)); badCandidate.authorities.plan_workday[0].plannerNextAuthorities.roundSynchronizations[0].lanes[0].preparationMinutesBetweenRounds = 0;
    badCandidate.authorities.plan_workday[0].workDay.end = "18:00";
    await assert.rejects(() => mutate(0, actor(2), revisionId, badCandidate), /STALE_CONFIG_CANDIDATE/);
    assert.deepEqual(await material(), saved, "failed nested RPC must leave neither overrides nor revisions");
    await assert.rejects(() => db.exec("UPDATE plans SET round_preparation_overrides='[]' WHERE id=1"), /REQUIRES_VERSIONED_OPERATION/);
    await assert.rejects(() => db.exec("UPDATE plans SET planner_next_configuration=NULL WHERE id=1"), /IMMUTABLE/);
    const zero = structuredClone(effective); zero[0].lanes[0].preparationMinutesBetweenRounds = 0;
    revisionId = Number((await mutate(0, actor(2), revisionId, replay(zero))).rows[0].id); effective = zero;
    revisionId = Number((await mutate(undefined, actor(2), revisionId, replay(rounds))).rows[0].id); effective = rounds;
    const restored = (await material())[0] as any;
    assert.deepEqual(restored.plans[0].round_preparation_overrides, []);
    assert.equal(restored.revisions.at(-1).source, "RESTORE");
    assert.deepEqual(restored.plans[1], (before[0] as any).plans[1]);
    await db.exec("RESET ROLE; SET ROLE authenticated");
    await assert.rejects(() => mutate(10), /permission denied for function/);
  } finally { await db.close(); }
});
