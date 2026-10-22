import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const actor=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const groupId="3e178fb3-258e-484b-89bf-d81987ce253b";
test("U06c SQL: catalog CAS, immutable history, daily EDIT/RESTORE, stale revisions and atomic replay",async()=>{
  const db=new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
      CREATE FUNCTION public.has_role(text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
      CREATE FUNCTION public.positive_integer_jsonb_array(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT jsonb_typeof(v)='array'$$;`);
    await db.exec(readFileSync("script/demo/fixtures/application-schema.sql","utf8"));
    await db.exec(`CREATE TABLE roles(id integer PRIMARY KEY,key text);CREATE TABLE user_roles(user_id uuid,role_id integer);
      INSERT INTO roles VALUES(1,'admin'),(2,'production'),(3,'viewer');
      INSERT INTO user_roles VALUES('${actor(1)}',1),('${actor(2)}',2),('${actor(3)}',3);
      INSERT INTO auth.users VALUES('${actor(1)}'),('${actor(2)}'),('${actor(3)}');
      CREATE SEQUENCE plan_config_revisions_id_seq;ALTER TABLE plan_config_revisions ALTER COLUMN id SET DEFAULT nextval('plan_config_revisions_id_seq');
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;`);
    for(const migration of ["087_participant_transition_margins","092_main_flow_soft_preference","099_transport_group_config_integrity","102_round_preparation_day_override","103_atomic_task_template_inverse","104_operation_continuity"])
      await db.exec(readFileSync(`supabase/migrations/${migration}.sql`,"utf8"));
    const immutable=readFileSync("supabase/migrations/088_plan_planner_next_configuration.sql","utf8");await db.exec(immutable.slice(immutable.indexOf("CREATE FUNCTION")));
    await db.exec(`INSERT INTO program_settings(id,meal_start,meal_end) VALUES(1,'13:00','14:00');
      INSERT INTO zones(id,name) VALUES(10,'Production');INSERT INTO spaces(id,zone_id,name) VALUES(20,10,'Shared room');
      INSERT INTO task_templates(id,name,default_duration) VALUES(1,'Secondary family one',10),(2,'Secondary family two',10);
      INSERT INTO plans(id,date,work_start,work_end,meal_start,meal_end,meal_mode,work_baseline_start,work_baseline_end,work_config_source,meal_baseline_start,meal_baseline_end,meal_baseline_mode,meal_config_source)
      SELECT n,'2026-10-30','09:00','21:00','13:00','14:00','flexible_meal_window','09:00','21:00','LEGACY_BACKFILL','13:00','14:00','flexible_meal_window','LEGACY_BACKFILL' FROM generate_series(1,2) n;
      INSERT INTO daily_tasks(id,plan_id,template_id,space_id,zone_id) VALUES(1,1,1,20,10),(2,1,2,20,10);
      SET ROLE service_role;`);
    const save=(expectedRevision:number|null,policy="OFF",user=actor(1))=>db.query("SELECT save_operation_continuity_group($1,$2,$3)",[groupId,user,{name:"Shared preparations",policy,gapWeight:2,expectedRevision}]);
    await assert.rejects(()=>save(null,"OFF",actor(2)),/FORBIDDEN/);await save(null);
    await assert.rejects(()=>save(null),/CONFLICT/);
    const atomic=await db.query<any>("SELECT save_task_template_with_inverse(1,$1,$2,$3,ARRAY[2]::bigint[],ARRAY[]::bigint[]) result",[actor(1),{continuity_group_id:groupId},[{id:1,revision:0},{id:2,revision:0}]]);
    assert.equal(atomic.rows[0].result.revision,1);assert.equal(atomic.rows[0].result.continuity_group_id,groupId);
    const catalogBefore=(await db.query("SELECT to_jsonb(t) t FROM task_templates t ORDER BY id")).rows;
    await assert.rejects(()=>db.query("SELECT save_task_template_with_inverse(1,$1,$2,$3,ARRAY[]::bigint[],ARRAY[2]::bigint[])",[actor(1),{continuity_group_id:actor(9)},[{id:1,revision:1},{id:2,revision:1}]]),/foreign key/);
    assert.deepEqual((await db.query("SELECT to_jsonb(t) t FROM task_templates t ORDER BY id")).rows,catalogBefore);
    await db.query("UPDATE task_templates SET continuity_group_id=$1",[groupId]);
    const snapshot={id:groupId,name:"Shared preparations",policy:"OFF",gapWeight:2,revision:0};
    for(const id of [1,2]) await db.query(`INSERT INTO plan_task_template_snapshots(id,plan_id,source_template_id,contract_version,source,template_name,default_duration,continuity_group)
      VALUES($1::integer,1,$1::integer,2,'inherited',$2,10,$3)`,[id,`Family ${id}`,snapshot]);
    await save(0,"PREFERRED");
    const baseline=[{id:groupId,taskIds:[1,2],policy:"OFF",gapWeight:2}];
    assert.deepEqual((await db.query<any>("SELECT effective_operation_continuity(1,'[]') groups")).rows[0].groups,baseline,"global edits do not alter daily snapshots");
    const replay=(groups:any[])=>({contractVersion:1,authorities:{plan_workday:[{workDay:{start:"09:00",end:"21:00"},mealWindow:{start:"13:00",end:"14:00"},mealMode:"flexible_meal_window",defaultParticipantTransitionMinutes:5,plannerNextAuthorities:{operationContinuityGroups:groups}}]}});
    const identity=(n:number)=>({contractVersion:1,planId:1,configurationFingerprint:String(n).padStart(64,"0")});
    let revision:number|null=null,effective=baseline;
    const mutate=(policy:string|undefined,user=actor(2),expected=revision,candidate?:any)=>{
      const next=policy?effective.map(group=>({...group,policy})):baseline;
      return db.query<{id:number}>("SELECT apply_day_config_operation_v5(1,$1,$2,$3,$4,$5,$6,$7,$8,'{}') id",[user,policy?"EDIT":"RESTORE",{
        ...(policy?{}:{capability:"OPERATION_CONTINUITY"}),operationContinuity:{groupId,...(policy?{policy,gapWeight:2}:{})},expectedRevisionId:expected},expected,identity(1),replay(effective),identity(2),candidate??replay(next)]);
    };
    const before=(await db.query("SELECT to_jsonb(p) p FROM plans p ORDER BY id")).rows;
    await assert.rejects(()=>mutate("REQUIRED",actor(3)),/PERMISSION_DENIED/);
    revision=Number((await mutate("PREFERRED")).rows[0].id);effective=baseline.map(group=>({...group,policy:"PREFERRED"}));
    const saved=(await db.query("SELECT to_jsonb(p) p FROM plans p ORDER BY id")).rows;
    assert.deepEqual(saved[1],before[1]);
    await assert.rejects(()=>mutate("REQUIRED",actor(2),null),/STALE_CONFIG_REVISION/);
    const invalid=replay(effective.map(group=>({...group,policy:"REQUIRED"})));invalid.authorities.plan_workday[0].workDay.end="18:00";
    await assert.rejects(()=>mutate("REQUIRED",actor(2),revision,invalid),/STALE_CONFIG_CANDIDATE/);
    assert.deepEqual((await db.query("SELECT to_jsonb(p) p FROM plans p ORDER BY id")).rows,saved,"a failed nested writer rolls back the overlay and revision");
    await assert.rejects(()=>db.exec("UPDATE plans SET operation_continuity_overrides='[]' WHERE id=1"),/REQUIRES_VERSIONED_OPERATION/);
    await assert.rejects(()=>db.exec("UPDATE plans SET planner_next_configuration='{}' WHERE id=1"),/IMMUTABLE/);
    revision=Number((await mutate(undefined)).rows[0].id);effective=baseline;
    assert.deepEqual((await db.query<any>("SELECT operation_continuity_overrides FROM plans WHERE id=1")).rows[0].operation_continuity_overrides,[]);
    assert.equal((await db.query<any>("SELECT source FROM plan_config_revisions ORDER BY id DESC LIMIT 1")).rows[0].source,"RESTORE");
    await db.exec("RESET ROLE;SET ROLE authenticated");
    await assert.rejects(()=>save(1),/permission denied for function/);
    await assert.rejects(()=>mutate("REQUIRED"),/permission denied for function/);
    await assert.rejects(()=>db.exec("UPDATE operation_continuity_groups SET policy='REQUIRED'"),/permission denied/);
  } finally {await db.close();}
});
