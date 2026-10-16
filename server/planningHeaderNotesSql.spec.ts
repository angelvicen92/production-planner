import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const actor = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
test("native header migration: constraints, daily scopes, CAS, RLS, invoker RPC and operational preservation", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE roles(id int,key text); CREATE TABLE user_roles(user_id uuid,role_id int);
      INSERT INTO roles VALUES(1,'admin'),(2,'production'),(3,'aux'),(4,'viewer');
      CREATE TABLE plans(id bigint PRIMARY KEY,planner_next_configuration jsonb); INSERT INTO plans VALUES(1,'{"itinerantTeamAvailability":[{"itinerantTeamId":8}]}'),(2,null);
      CREATE TABLE plan_zone_settings(plan_id bigint,zone_id bigint); INSERT INTO plan_zone_settings VALUES(1,14),(2,15);
      CREATE TABLE plan_space_settings(plan_id bigint,space_id bigint); INSERT INTO plan_space_settings VALUES(1,3),(2,4);
      CREATE TABLE itinerant_teams(id bigint); INSERT INTO itinerant_teams VALUES(8),(9);
      CREATE TABLE daily_tasks(id bigint,plan_id bigint);INSERT INTO daily_tasks VALUES(1,1);
      CREATE TABLE plan_breaks(plan_id bigint,itinerant_team_id bigint);
      CREATE TABLE plan_staff_assignments(plan_id bigint,itinerant_team_id bigint,scope_type text);
      CREATE FUNCTION public.has_role(k text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id WHERE u.user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid AND r.key=k) $$;
      GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;`);
    for (let i=1;i<=5;i++) await db.exec(`INSERT INTO auth.users VALUES('${actor(i)}');${i<=4?`INSERT INTO user_roles VALUES('${actor(i)}',${i});`:''}`);
    const migration=readFileSync('supabase/migrations/095_planning_header_notes.sql','utf8');await db.exec(migration);await db.exec(migration);
    const material=async()=>JSON.stringify((await db.query("SELECT (SELECT jsonb_agg(p) FROM plans p) plans,(SELECT jsonb_agg(t) FROM daily_tasks t) tasks,(SELECT jsonb_agg(z) FROM plan_zone_settings z) zones,(SELECT jsonb_agg(s) FROM plan_space_settings s) spaces")).rows);
    const before=await material();
    const save=(scope:string,scopeId:number,version:number,lines:any[],user=actor(2),plan=1)=>db.query<any>('SELECT save_planning_header_notes($1,$2,$3,$4,$5,$6) note',[plan,user,scope,scopeId,version,JSON.stringify(lines)]);
    assert.equal((await save('zone',14,0,[{label:'Sonido',text:'Sin sonido'}])).rows[0].note.version,1);
    await save('space',3,0,[{text:'Espacio'}],actor(1));await save('itinerant_team',8,0,[{text:'Unidad'}]);
    for(const [scope,id] of [['space',4],['zone',15],['itinerant_team',9],['unknown',14]] as const) await assert.rejects(()=>save(scope,id,0,[{text:'No'}]),/HEADER_INVALID/);
    for(const user of [actor(3),actor(4),actor(5)])await assert.rejects(()=>save('zone',14,1,[],user),/HEADER_FORBIDDEN/);
    await assert.rejects(()=>save('zone',14,0,[]),/HEADER_STALE/);
    for(const lines of [[{text:''}],[{text:'x'.repeat(4001)}],[{text:'x',label:'x'.repeat(81)}],Array(21).fill({text:'x'}),Array(5).fill({text:'x'.repeat(4000)}),[{text:'x',resourceId:7}]])await assert.rejects(()=>save('zone',14,1,lines),/HEADER_INVALID/);
    await save('zone',14,1,[]);await assert.rejects(()=>save('zone',14,1,[]),/HEADER_STALE/);
    for(let role=1;role<=5;role++){
      await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${actor(role)}'`);
      assert.equal((await db.query('SELECT * FROM plan_header_notes')).rows.length,role<=4?3:0);
      await assert.rejects(()=>db.exec('UPDATE plan_header_notes SET lines=\'[]\''),/permission denied/);
      await assert.rejects(()=>db.exec('DELETE FROM plan_header_notes'),/permission denied/);
      await assert.rejects(()=>db.exec(`INSERT INTO plan_header_notes(plan_id,scope_type,scope_id,lines,updated_by) VALUES(2,'zone',15,'[]','${actor(role)}')`),/permission denied/);
      await assert.rejects(()=>save('zone',14,2,[],actor(2)),/permission denied/);
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE anon');await assert.rejects(()=>db.exec('SELECT * FROM plan_header_notes'),/permission denied/);await db.exec('RESET ROLE');
    await db.exec('SET ROLE service_role');await save('zone',14,2,[{text:'Guardado por API'}]);await assert.rejects(()=>save('zone',14,3,[],actor(4)),/HEADER_FORBIDDEN/);await db.exec('RESET ROLE');
    assert.equal(await material(),before);
  } finally {await db.close();}
});
