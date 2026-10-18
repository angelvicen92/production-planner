/** G0: real Auth/HTTP/PostgREST/native PostgreSQL, exclusively in the owned rehearsal. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

type User = { id: string; token: string };
export async function runProductionScopeJourney({ appUrl, url, anon, users, db, planId, pass }: {
  appUrl: string; url: string; anon: string; users: Record<string, User>; db: pg.Client; planId: number; pass: (name: string) => void;
}) {
  assert.equal(db.host,'127.0.0.1');assert.equal(new URL(url).hostname,'127.0.0.1');
  const outcomes: { name:string; status:number }[]=[];
  const request=async(role:string,path:string,method='GET',body?:unknown)=>{
    if (method === 'PATCH' && /\/tasks\/\d+\/status$/.test(path) && body && (body as any).expectedVersion === undefined) {
      const taskId = Number(path.split('/')[3]);
      const observed = (await db.query('SELECT execution_version FROM daily_tasks WHERE id=$1', [taskId])).rows[0];
      body = { ...(body as object), expectedVersion: observed?.execution_version };
    }
    const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anon'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,body:await r.json() as any};
  };
  const root=`/api/plans/${planId}/incidents`;
  const execution=(role='aux')=>request(role,`/api/plans/${planId}/execution`);
  const incident=()=>({requestId:randomUUID(),type:'technical',severity:'warn',description:'G0 prueba local',taskId:Number(a.id)});
  const status=(task:any,role:string,value:string,extra={})=>request(role,`/api/tasks/${task.id}/status`,'PATCH',{status:value,expectedStatus:value==='in_progress'?'pending':'in_progress',...extra});
  const material=async()=>(await db.query(`SELECT
    (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t) tasks,
    (SELECT jsonb_agg(e ORDER BY id) FROM task_status_events e) execution,
    (SELECT jsonb_agg(l ORDER BY id) FROM locks l) locks,
    (SELECT jsonb_agg(i ORDER BY id) FROM operational_incidents i) incidents,
    (SELECT jsonb_agg(e ORDER BY id) FROM operational_incident_events e) events`)).rows;
  const planning=async()=>(await db.query(`SELECT
    (SELECT jsonb_agg(jsonb_build_object('id',id,'plan',plan_id,'template',template_id,'contestant',contestant_id,'start',start_planned,'end',end_planned,'space',space_id,'zone',zone_id,'resources',assigned_resource_ids,'duration',duration_override,'cameras',cameras_override,'location',location_label) ORDER BY id) FROM daily_tasks) tasks,
    (SELECT jsonb_agg(g ORDER BY id) FROM assisted_planning_stages g) stages,
    (SELECT jsonb_agg(s ORDER BY id) FROM assisted_planning_sessions s) sessions,
    (SELECT jsonb_agg(p ORDER BY id) FROM plans p) plans,
    (SELECT jsonb_agg(p ORDER BY id) FROM program_settings p) clock`)).rows;
  const original=await planning();
  assert.equal(original[0].tasks.filter((t:any)=>Number(t.plan)===planId).length,266);
  const tasks=(await db.query(`SELECT DISTINCT ON(t.space_id) t.id,t.space_id,coalesce(t.zone_id,s.zone_id) zone_id FROM daily_tasks t
    JOIN plan_space_settings s ON s.plan_id=t.plan_id AND s.space_id=t.space_id
    WHERE t.plan_id=$1 AND t.status='pending' AND t.start_planned IS NOT NULL AND coalesce(t.zone_id,s.zone_id) IS NOT NULL ORDER BY t.space_id,t.id`,[planId])).rows;
  const a=tasks.find(t=>tasks.some(x=>x.space_id!==t.space_id&&x.zone_id===t.zone_id))!;
  assert.ok(a,'accepted A2 supplies a zone with multiple spaces');
  const b=tasks.find(t=>t.space_id!==a.space_id&&t.zone_id===a.zone_id)!;
  const c=tasks.find(t=>t.zone_id!==a.zone_id)!;assert.ok(b&&c);
  const deny=async(name:string,action:()=>Promise<{status:number}>,expected=403)=>{
    const before=await material(),r=await action();assert.equal(r.status,expected,name);assert.deepEqual(await material(),before,name+' leaves tables/events intact');outcomes.push({name,status:r.status});
  };
  const global=await request('production',root,'POST',incident());assert.equal(global.status,201);
  const path=`${root}/${global.body.id}`;
  const noAuthority=async(label:string)=>{
    const ctx=(await execution()).body;assert.equal(ctx.hasScope,false,label);assert.ok(ctx.tasks.every((t:any)=>!t.inScope&&!t.hasAuthority&&!t.canExecute),label);
    const ictx=(await request('aux',root+'/context')).body;assert.equal(ictx.canCreate,false);assert.ok(ictx.tasks.every((t:any)=>!t.canReport));
    await deny(label+' Start',()=>status(a,'aux','in_progress'));await deny(label+' Finish',()=>status(a,'aux','done'));
    await deny(label+' create',()=>request('aux',root,'POST',incident()));
    for(const [action,method,body] of [['update','PATCH',{expectedVersion:1,description:'No'}],['resolve','POST',{expectedVersion:1,note:'No'}],['reopen','POST',{expectedVersion:1,note:'No'}],['escalate','POST',{expectedVersion:1,note:'No'}]] as const)
      await deny(label+' '+action,()=>request('aux',path+(action==='update'?'':'/'+action),method,body));
    assert.deepEqual((await request('aux',root)).body,[]);await deny(label+' detail',()=>request('aux',path));
  };
  await noAuthority('unlinked aux');
  const staff=(await db.query("INSERT INTO staff_people(name,role_type) VALUES('G0 ayudante','production'),('G0 solape','production') RETURNING id")).rows;
  await db.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE key='aux'",[users.norole.id]);
  for(const [role,person] of [['aux',staff[0]],['norole',staff[1]],['viewer',staff[0]]] as const)
    await db.query("INSERT INTO user_entity_links(user_id,entity_type,entity_id) VALUES($1,'staff_person',$2)",[users[role].id,person.id]);
  const assign=async(person:any,scope:'zone'|'space',target:any,staffRole='production')=>db.query(`INSERT INTO plan_staff_assignments(plan_id,staff_role,staff_person_id,scope_type,zone_id,space_id) VALUES($1,$2,$3,$4,$5,$6)`,[planId,staffRole,person.id,scope,scope==='zone'?target.zone_id:null,scope==='space'?target.space_id:null]);
  const mode=async(zone:any,value:string)=>db.query("INSERT INTO plan_zone_staff_mode(plan_id,zone_id,mode) VALUES($1,$2,$3) ON CONFLICT(plan_id,zone_id) DO UPDATE SET mode=excluded.mode",[planId,zone,value]);
  await mode(a.zone_id,'zone');await assign(staff[0],'zone',a,'editorial');
  await noAuthority('editorial only');
  await deny('forged HTTP actor/role/scope',()=>status(a,'aux','in_progress',{p_actor:users.admin.id,userId:users.admin.id,role:'admin',staffRole:'production'}));
  for(const table of ['operational_incidents','operational_incident_events']) {
    const r=await fetch(`${url}/rest/v1/${table}?select=*`,{headers:{apikey:anon,Authorization:`Bearer ${users.aux.token}`}});assert.equal(r.status,200);assert.deepEqual(await r.json(),[]);
  }
  pass('G0 editorial-only/unlinked HTTP, War Room context/list/detail and native RLS deny without writes');
  const exercise=async(task:any,role='aux')=>{
    const before=(await db.query('SELECT count(*) n FROM task_status_events WHERE task_id=$1',[task.id])).rows[0].n;
    assert.equal((await status(task,role,'in_progress')).status,200);assert.equal((await status(task,role,'done')).status,200);
    assert.equal(Number((await db.query('SELECT count(*) n FROM task_status_events WHERE task_id=$1',[task.id])).rows[0].n),Number(before)+2);
    assert.equal((await db.query('SELECT * FROM locks WHERE task_id=$1 AND execution_owned',[task.id])).rows.length,1);
    const made=await request(role,root,'POST',{...incident(),taskId:Number(task.id)});assert.equal(made.status,201);
    let version=1;
    for(const [action,method,fields] of [['update','PATCH',{cause:'Cable'}],['escalate','POST',{note:'Coordinar'}],['resolve','POST',{note:'Resuelto'}],['reopen','POST',{note:'Reaparece'}]] as const) {
      const changed=await request(role,`${root}/${made.body.id}`+(action==='update'?'':'/'+action),method,{expectedVersion:version++,...fields});assert.equal(changed.status,200,role+' '+action);
    }
    assert.equal((await request(role,`${root}/${made.body.id}`)).body.events.length,5);
    assert.equal((await request('admin',`/api/tasks/${task.id}/reset`,'POST',{})).status,200);
  };
  await db.query("UPDATE plan_staff_assignments SET staff_role='production' WHERE staff_person_id=$1",[staff[0].id]);
  for(const t of [a,b]) await exercise(t);
  await deny('viewer with nominal production assignment',()=>status(a,'viewer','in_progress'));
  await deny('viewer Finish',()=>status(a,'viewer','done'));
  await deny('viewer incident write',()=>request('viewer',root,'POST',incident()));
  assert.ok((await request('viewer',root)).body.length>0);
  await mode(a.zone_id,'space');
  await noAuthority('zone assignment dormant in space mode');
  await assign(staff[0],'space',a);await assign(staff[0],'space',b);
  for(const t of [a,b]) await exercise(t);
  await deny('other space Start',()=>status(c,'aux','in_progress'));await deny('other space Finish',()=>status(c,'aux','done'));
  await deny('other space incident',()=>request('aux',root,'POST',{...incident(),taskId:Number(c.id)}));
  await deny('incident retarget outside scope',()=>request('aux',path,'PATCH',{expectedVersion:1,taskId:Number(c.id)}));
  await mode(c.zone_id,'zone');await assign(staff[0],'zone',c);await exercise(c);
  const ctx=(await execution()).body;assert.equal(ctx.hasScope,true);
  for(const t of [a,b,c]) assert.ok(ctx.tasks.find((x:any)=>x.taskId===Number(t.id))?.canExecute);
  await assign(staff[1],'space',a);
  const race=await Promise.all(['aux','norole'].map(role=>status(a,role,'in_progress')));assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  const finish=await Promise.all(['aux','norole'].map(role=>status(a,role,'done')));assert.deepEqual(finish.map(r=>r.status).sort(),[200,409]);
  assert.equal((await request('admin',`/api/tasks/${a.id}/reset`,'POST',{})).status,200);
  await exercise(a,'norole');
  const shared=await request('aux',root,'POST',incident());assert.equal(shared.status,201);
  const incidentRace=await Promise.all(['aux','norole'].map(role=>request(role,`${root}/${shared.body.id}`,'PATCH',{expectedVersion:1,cause:'Concurrente'})));
  assert.deepEqual(incidentRace.map(r=>r.status).sort(),[200,409]);
  assert.equal((await request('aux',`${root}/${shared.body.id}`)).body.events.length,2);
  pass('G0 whole zone, multiple spaces/zones, overlapping helpers, Start/Finish and complete incident lifecycle');
  // Revocation between middleware and the SQL write: deliberately queue behind a plan lock.
  const blocker=new pg.Client((db as any).connectionParameters);await blocker.connect();
  const revokeQueued=async(rpc:string,action:()=>Promise<{status:number}>)=>{
    await blocker.query('BEGIN');await blocker.query('SELECT 1 FROM plans WHERE id=$1 FOR UPDATE',[planId]);
    const before=await material();const pending=action();
    try {
      const until=Date.now()+15_000;
      while(true) {
        const waiting=(await db.query("SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE $1",['%'+rpc+'%'])).rows.length;
        if(waiting)break;assert.ok(Date.now()<until,'RPC reached real plan lock');await new Promise(r=>setTimeout(r,25));
      }
      await db.query('DELETE FROM plan_staff_assignments WHERE staff_person_id=$1',[staff[0].id]);
    } finally {await blocker.query('COMMIT');}
    assert.equal((await pending).status,403);assert.deepEqual(await material(),before);
    await assign(staff[0],'space',a);
  };
  try {
    await revokeQueued('execute_task_transition',()=>status(a,'aux','in_progress'));
    await revokeQueued('incident_command',()=>request('aux',root,'POST',incident()));
  } finally {await blocker.end();}
  await status(a,'aux','in_progress');
  await db.query('DELETE FROM plan_staff_assignments WHERE staff_person_id=$1',[staff[0].id]);
  await deny('revoked Finish',()=>status(a,'aux','done'));
  assert.equal((await request('admin',`/api/tasks/${a.id}/reset`,'POST',{})).status,200);
  await noAuthority('revoked assignment');
  for(const role of ['admin','production']) await exercise(a,role);
  // Resource identities keep their independent pre-existing authority, even with editorial staff.
  await assign(staff[0],'space',a,'editorial');
  const resource=(await db.query("INSERT INTO resource_items(type_id,name) SELECT id,'G0 recurso nominal' FROM resource_types ORDER BY id LIMIT 1 RETURNING id,type_id")).rows[0];
  assert.ok(resource,'local nominal resource fixture');
  const snapshot=(await db.query("INSERT INTO plan_resource_items(plan_id,type_id,resource_item_id,name) VALUES($1,$2,$3,'G0 recurso nominal') RETURNING id",[planId,resource.type_id,resource.id])).rows[0];
  await db.query('INSERT INTO plan_space_resource_assignments(plan_id,space_id,plan_resource_item_id) VALUES($1,$2,$3)',[planId,a.space_id,snapshot.id]);
  await db.query("INSERT INTO user_entity_links(user_id,entity_type,entity_id) VALUES($1,'resource_item',$2)",[users.aux.id,resource.id]);
  await exercise(a);
  await db.query("DELETE FROM user_entity_links WHERE user_id=$1 AND entity_type='resource_item'",[users.aux.id]);
  await db.query('DELETE FROM plan_space_resource_assignments WHERE plan_resource_item_id=$1',[snapshot.id]);
  await db.query('DELETE FROM plan_resource_items WHERE id=$1',[snapshot.id]);
  await db.query('DELETE FROM resource_items WHERE id=$1',[resource.id]);
  await db.query("UPDATE plan_staff_assignments SET staff_role='production' WHERE staff_person_id=$1",[staff[0].id]);
  pass('G0 concurrent revocation rechecked after lock; global roles and legitimate nominal resources preserved');
  for(const table of ['task_status_events','locks','operational_incident_events']) {
    await db.query(`CREATE FUNCTION g0_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'G0 injected persistence error';END;$$;CREATE TRIGGER g0_fail BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION g0_fail();`);
    try {
      await deny(table+' rollback',()=>table==='operational_incident_events'?request('aux',root,'POST',incident()):status(a,'aux','in_progress'),503);
      if(table==='operational_incident_events') await deny('incident update rollback',()=>request('aux',path,'PATCH',{expectedVersion:1,cause:'No persistir'}),503);
    } finally {await db.query(`DROP TRIGGER g0_fail ON ${table};DROP FUNCTION g0_fail();`);}
  }
  for(const [rpc,body] of [['execute_task_transition',{p_task_id:Number(a.id),p_actor:users.admin.id,p_status:'in_progress'}],['incident_command',{p_plan:planId,p_actor:users.admin.id,p_action:'create',p_fields:incident()}]] as const) {
    const before=await material();const r=await fetch(`${url}/rest/v1/rpc/${rpc}`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${users.aux.token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(r.status>=400);assert.deepEqual(await material(),before);
  }
  const permissions=()=>db.query("SELECT oid::regprocedure::text signature,proacl,prosecdef,proconfig FROM pg_proc WHERE proname IN ('execution_task_scope','execution_context') ORDER BY proname");
  const acl=(await permissions()).rows;
  await db.query(readFileSync('supabase/migrations/096_production_execution_scope.sql','utf8'));
  assert.deepEqual((await permissions()).rows,acl);assert.ok(acl.every((f:any)=>!f.prosecdef));
  assert.deepEqual(await planning(),original);
  const planningSha256=createHash('sha256').update(JSON.stringify(original)).digest('hex');
  pass('G0 persistence failures/forged direct RPC leave no partial writes; 266 accepted A2 placements, all Stages/Drafts/plans/clock remain literal');
  return {outcomes,startRace:race.map(r=>r.status).sort(),finishRace:finish.map(r=>r.status).sort(),incidentRace:incidentRace.map(r=>r.status).sort(),acceptedTaskCount:266,planningSha256,preservedPlanning:true,newSolverRun:false,remoteWrites:0};
}
