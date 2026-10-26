/** Evidence harness only. Called after the literal ledger through 103 on an owned local DB. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import type pg from 'pg';
import {seedA2HistoricalRehearsal} from '../../../script/demo/seedA2HistoricalRehearsal';
import {dataApiCatalog,privilegeContract} from '../../../script/demo/dataApiCatalog';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
const sha=(v:unknown)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const ident=(s:string)=>'"'+s.replaceAll('"','""')+'"';
export async function upgrade103To115(db:pg.Client,directory:string,{preparedSecurity=true}={}){
 assert.equal(db.host,'127.0.0.1');
 const out=directory+'/upgrade';mkdirSync(out,{recursive:true});
 const save=(name:string,value:unknown)=>writeFileSync(`${out}/${name}.json`,JSON.stringify(value,null,2));
 const version=(await db.query('SHOW server_version_num')).rows[0].server_version_num;
 assert.ok(Number(version)>=170000&&Number(version)<180000);
 assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='planner_next_profile'")).rows[0].n,0);
 const actor='00000000-0000-0000-0000-000000000001';
 await db.query('INSERT INTO auth.users(id) VALUES($1)',[actor]);
 await db.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE key='admin'",[actor]);
 // The existing importer requires these local assertions. They attest only this owned fixture,
 // never a production backup or official Replit preparation.
 await db.query(`SET optiplan.confirmed_demo_project='dyqusivzgxebkxkwohwn';SET optiplan.backup_sha256='${'a'.repeat(64)}';SET optiplan.schema_approved='yes';SET optiplan.security_approved='yes';SET optiplan.import_approved='yes';SET optiplan.demo_actor='${actor}';`);
 const historical=await seedA2HistoricalRehearsal(db,actor);
 // Supplemental persisted pre-upgrade records, explicitly synthetic. No native acceptance is claimed.
 const s=(await db.query('SELECT * FROM assisted_planning_sessions WHERE plan_id=27001')).rows[0];
 const task=(await db.query('SELECT id FROM daily_tasks WHERE plan_id=26999 ORDER BY id LIMIT 1')).rows[0].id;
 await db.query(`INSERT INTO planning_stage_validations(plan_id,session_id,base_stage_id,draft_fingerprint,config_revision_id,hard_count,required_count,preferred_count,report_json)
 VALUES(27001,$1,$2,$3,$4,0,0,0,'{"fixture":"persisted-before-104","hardValid":true}')`,[s.id,s.active_stage_id,s.draft_fingerprint,s.current_config_revision_id]);
 await db.query(`INSERT INTO planning_accepted_exceptions(plan_id,stage_id,severity,rule_code,violation_key,affected_task_ids_json,details_json,status,accepted_by,accepted_at,config_revision_id,snapshot_fingerprint)
 VALUES(27001,$1,'HARD','HISTORICAL_FIXTURE','historical-fixture','[]','{"fixture":"persisted-before-104"}','STALE',$2,now(),$3,$4)`,[s.active_stage_id,actor,s.current_config_revision_id,s.draft_fingerprint]);
 await db.query("INSERT INTO task_status_events(plan_id,task_id,status,changed_by,time_real) VALUES(26999,$1,'pending',$2,'09:00')",[task,actor]);
 await db.query("INSERT INTO locks(plan_id,task_id,lock_type,created_by,reason) VALUES(26999,$1,'time',$2,'Synthetic pre-104 persisted lock')",[task,actor]);
 await db.query("UPDATE daily_tasks SET status='done',start_real='09:00',end_real='09:10' WHERE id=$1",[task]);
 await db.query("INSERT INTO planning_runs(plan_id,status,message,engine_version,engine_metadata) VALUES(26999,'success','Synthetic pre-104 persisted run','historical-fixture','{\"fixture\":\"persisted-before-104\"}')");
 // A second old session has a dirty Draft: 113 must initialize its working origin
 // from S0 while preserving the distinct mutable Draft and its original fingerprint.
 const pending=buildAssistedPlanningSnapshotV1((await db.query('SELECT id,zone_id,space_id FROM daily_tasks WHERE plan_id=26999 ORDER BY id')).rows.map((r:any)=>({id:Number(r.id),zoneId:Number(r.zone_id),spaceId:Number(r.space_id),startPlanned:null,endPlanned:null})));
 const fp='e'.repeat(64);
 const rev=(await db.query("INSERT INTO plan_config_revisions(plan_id,source,fingerprint,identity_json,replay_snapshot_json,created_by) VALUES(26999,'SYNTHETIC_PRE104',$1,$2,'{\"contractVersion\":1}',$3) RETURNING id",[fp,{contractVersion:1,planId:26999,configurationFingerprint:fp},actor])).rows[0].id;
 const session=(await db.query("INSERT INTO assisted_planning_sessions(plan_id,status,current_config_revision_id,draft_snapshot_json,draft_fingerprint) VALUES(26999,'ACTIVE',$1,$2,$3) RETURNING id",[rev,pending,fingerprintAssistedPlanningSnapshotV1(pending)])).rows[0].id;
 const stage=(await db.query("INSERT INTO assisted_planning_stages(session_id,plan_id,ordinal,scope_json,config_revision_id,snapshot_json,snapshot_fingerprint,validation_summary_json,accepted_by,accepted_at) VALUES($1,26999,0,'{}',$2,$3,$4,'{}',$5,now()) RETURNING id",[session,rev,pending,fingerprintAssistedPlanningSnapshotV1(pending),actor])).rows[0].id;
 const dirty={...pending,tasks:pending.tasks.map((t,i)=>i===0?{...t,startPlanned:'09:00',endPlanned:'09:10'}:t)};
 await db.query('UPDATE assisted_planning_sessions SET active_stage_id=$1,draft_base_stage_id=$1,draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$4',[stage,dirty,fingerprintAssistedPlanningSnapshotV1(dirty),session]);
 const noRoleRead=async()=>{
  await db.query('BEGIN');
  try{
   await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:'00000000-0000-0000-0000-000000000099',role:'authenticated'})]);
   await db.query('SET LOCAL ROLE authenticated');
   return (await db.query('SELECT count(*)::int n FROM daily_tasks')).rows[0].n;
  }finally{await db.query('ROLLBACK');}
 };
 const raw103NoRoleRows=await noRoleRead();
 const securitySQL=readFileSync('script/demo/sql/security.sql','utf8');
 if(preparedSecurity)await db.query(securitySQL);
 const baseline103NoRoleRows=await noRoleRead();
 if(preparedSecurity)assert.equal(baseline103NoRoleRows,0);
 const columns=(await db.query("SELECT table_name,array_agg(column_name::text ORDER BY ordinal_position) columns FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name ORDER BY table_name")).rows;
 const baseline:Record<string,any>={};
 const inventory=async()=>{
  const rows:Record<string,any>={};
  for(const t of columns){
   const result=(await db.query(`SELECT row_to_json(x)::text row FROM (SELECT ${t.columns.map(ident).join(',')} FROM public.${ident(t.table_name)}) x ORDER BY row_to_json(x)::text`)).rows;
   rows[t.table_name]={count:result.length,sha256:sha(result.map(r=>r.row))};
  }
  return rows;
 };
 Object.assign(baseline,await inventory());save('inventory-103',baseline);
 const catalog=async()=>({...(await dataApiCatalog(db)),
  columns:(await db.query("SELECT table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows,
  triggers:(await db.query("SELECT c.relname relation,t.tgname name,pg_get_triggerdef(t.oid) definition,t.tgenabled enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY relation,name")).rows,
  constraints:(await db.query("SELECT c.relname relation,n.conname name,pg_get_constraintdef(n.oid) definition,n.convalidated validated FROM pg_constraint n JOIN pg_class c ON c.oid=n.conrelid WHERE c.relnamespace='public'::regnamespace ORDER BY relation,name")).rows,
  definitions:(await db.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' ORDER BY signature")).rows,
  roles:(await db.query("SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator') ORDER BY rolname")).rows,
  defaults:(await db.query('SELECT defaclrole::regrole::text owner,defaclnamespace::regnamespace::text namespace,defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY 1,2,3')).rows
 });
 const catalogs:Record<string,any>={'103':await catalog()},steps:any[]=[];
 const counts=(v:any)=>Object.fromEntries(Object.entries(v).filter(([,x]:any)=>x.count>0).map(([k,x]:any)=>[k,x.count]));
 const all=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 const ledger=all.filter(f=>Number(f.slice(0,3))<=103).map(file=>({file,sha256:sha(readFileSync('supabase/migrations/'+file,'utf8'))}));
 for(const file of all.filter(f=>Number(f.slice(0,3))>=104&&Number(f.slice(0,3))<=115)){
  const number=file.slice(0,3),sql=readFileSync('supabase/migrations/'+file,'utf8'),start=performance.now();
  try{await db.query(sql);}catch(e:any){save('failure',{file,code:e.code,message:e.message,position:e.position});throw e;}
  const observed=await inventory();assert.deepEqual(observed,baseline,'original 103 columns/rows after '+file);
  const current=await catalog(),previous=catalogs[String(Number(number)-1)];catalogs[number]=current;
  const key=(v:any)=>v.signature??v.table_name+'.'+v.column_name;
  const delta=(before:any[],after:any[])=>{const b=new Map(before.map(x=>[key(x),x]));return after.filter(x=>JSON.stringify(b.get(key(x)))!==JSON.stringify(x));};
  const policyBefore=new Map(previous.policies.map((p:any)=>[p.tablename+'.'+p.policyname,p]));
  const existingPoliciesUnchanged=previous.policies.every((p:any)=>current.policies.some((x:any)=>JSON.stringify(x)===JSON.stringify(p)));
  assert.ok(existingPoliciesUnchanged,'existing RLS changed '+file);
  const step={file,sha256:sha(sql),status:'PASS',milliseconds:Math.round(performance.now()-start),original103ColumnsAndRowsIdentical:true,
   historicalCounts:counts(observed),existingPoliciesUnchanged,newPolicies:current.policies.filter((p:any)=>!policyBefore.has(p.tablename+'.'+p.policyname)),
   columnsAddedOrChanged:delta(previous.columns,current.columns),functionsAddedOrChanged:delta(previous.definitions,current.definitions).map((f:any)=>({signature:f.signature,sha256:sha(f.definition)})),
   newTables:current.tables.filter((t:any)=>t.role==='service_role'&&!previous.tables.some((p:any)=>p.name===t.name)),
   catalogSha256:sha(current),nextStep: Number(number)<115?'demonstrated by next literal SQL application':'native product gates follow'};
  steps.push(step);ledger.push({file,sha256:sha(sql)});save('steps',steps);
  console.log('PASS 103 historical integrity after '+file);
 }
 // 113 intentionally initializes only new operational-origin columns from the accepted checkpoint.
 save('inventory-115',await inventory());
 const origins=(await db.query('SELECT s.id,s.working_snapshot_json=b.snapshot_json snapshot_equal,s.working_fingerprint=b.snapshot_fingerprint fingerprint_equal,s.draft_snapshot_json IS DISTINCT FROM s.working_snapshot_json dirty_draft,s.obligation_transition_id FROM assisted_planning_sessions s JOIN assisted_planning_stages b ON b.id=s.active_stage_id')).rows;
 assert.ok(origins.length>0&&origins.every((x:any)=>x.snapshot_equal&&x.fingerprint_equal&&x.obligation_transition_id===null));
 assert.ok(origins.some((x:any)=>x.dirty_draft));
 const noAdoption=(await db.query("SELECT id,planner_next_profile,itinerant_composition_version,operation_continuity_overrides,daily_round_synchronization,daily_technical_chains FROM plans ORDER BY id")).rows;
 for(const p of noAdoption){assert.equal(p.planner_next_profile,null);assert.equal(p.itinerant_composition_version,null);assert.deepEqual(p.operation_continuity_overrides,[]);assert.equal(p.daily_round_synchronization,null);assert.equal(p.daily_technical_chains,null);}
 const expected=JSON.parse(readFileSync('script/demo/fixtures/data-api-privileges.json','utf8'));
 // security.sql explicitly grants authenticated SELECT on these exact existing
 // objects. Bind that separate, documented bootstrap profile without relaxing
 // the repository's raw-ledger fixture or changing its verifier/assertions.
 const securityTables=[...securitySQL.match(/FOREACH t IN ARRAY ARRAY\[([^\]]+)\]/)![1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 if(preparedSecurity)for(const t of expected.tables)if(t.role==='authenticated'&&securityTables.includes(t.name)&&!t.privileges.includes('SELECT'))t.privileges.unshift('SELECT');
 assert.deepEqual(privilegeContract(catalogs['115']),expected,'exact privilege contract for the declared bootstrap profile');
 await db.query("INSERT INTO plan_config_revisions(plan_id,source,fingerprint,identity_json,replay_snapshot_json,created_by) SELECT plan_id,'EDIT',fingerprint,identity_json,replay_snapshot_json,created_by FROM plan_config_revisions WHERE plan_id=27001 ORDER BY id LIMIT 1");
 const replay=(await db.query('SELECT replay_snapshot_json FROM plan_config_revisions WHERE plan_id=27001 ORDER BY id')).rows;
 assert.ok(replay.every((r:any)=>JSON.stringify(r.replay_snapshot_json)==='{"contractVersion":1}'));
 const after115NoRoleRows=await noRoleRead();assert.equal(after115NoRoleRows,baseline103NoRoleRows);
 const result={status:'PASS',version,remoteWrites:0,fixture:historical.summary,representativity:'public canonical historical fixture plus explicitly synthetic persisted validation/exception/event/lock/run/dirty Draft; not production rows',
  securityBaseline:{preparedSecurity,source:'script/demo/sql/security.sql',sha256:sha(securitySQL),selectGrantTables:securityTables,raw103NoRoleRows,baseline103NoRoleRows,after115NoRoleRows,classification:'existing 001 permissive read; approved existing bootstrap bounds it before upgrade; not a 104-115 regression'},
  historicalCounts:counts(baseline),ledger,steps,origins,noAdoption,historical088LiteralReplayAccepted:true,exactCurrentPrivilegeContract:true};
 save('summary',result);writeFileSync(out+'/catalogs.json.gz',gzipSync(JSON.stringify(catalogs),{level:9}));
 return result;
}
