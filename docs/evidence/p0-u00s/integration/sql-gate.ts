/** Owned PostgreSQL 17 only. Historical compatibility, native forgery and catalog audit. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import pg from 'pg';
import {dataApiCatalog,privilegeContract} from '../../../../script/demo/dataApiCatalog';
import {seedA2HistoricalRehearsal} from '../../../../script/demo/seedA2HistoricalRehearsal';
import {buildEffectivePlanConfigRevisionV1,projectEffectiveAuthoritiesFromEngineInputV1} from '../../../../server/effectivePlanConfigRevision';
import {buildEffectivePlanConfigReplaySnapshotV1} from '../../../../server/assistedPlanningConfigRevision';
const directory=resolve(process.argv[2]);mkdirSync(directory,{recursive:true});
const save=(name:string,value:unknown)=>writeFileSync(directory+'/'+name+'.json',JSON.stringify(value,null,2));
const dockerEnv={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
const docker=(...args:string[])=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{env:dockerEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const container='u00s-integration-sql-'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
const image='postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
let db:pg.Client|undefined;
try{
 docker('run','-d','--name',container,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD='+password,image);
 const port=Number(JSON.parse(docker('inspect',container))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort);
 for(let i=0;i<100;i++){
  const client=new pg.Client({host:'127.0.0.1',port,user:'postgres',password,database:'postgres'});
  try{await client.connect();db=client;break;}catch{await client.end();await new Promise(r=>setTimeout(r,100));}
 }
 assert.ok(db);assert.equal((db as any).host,'127.0.0.1');
 await db.query(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;
  GRANT USAGE ON SCHEMA public,auth,extensions TO anon,authenticated,service_role;
  ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`);
 const ledger=[];
 for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&Number(f.slice(0,3))<115).sort()){
  const sql=readFileSync('supabase/migrations/'+file,'utf8');await db.query(sql);
  ledger.push({file,sha256:createHash('sha256').update(sql).digest('hex')});
 }
 const before=await dataApiCatalog(db);save('catalog-114',before);
 const triggers=async()=> (await db!.query("SELECT t.tgname name,c.relname relation,pg_get_triggerdef(t.oid) definition,t.tgenabled enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows;
 save('triggers-114',await triggers());
 const names=['apply_day_config_operation_v5','assisted_expected_obligation_sources','assisted_preview_s0_additions','assisted_read_bootstrap_sources'];
 const definitions=async()=> (await db!.query("SELECT proname name,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY($1) ORDER BY proname",[[...names,'apply_day_config_operation_before_technical_chains']])).rows;
 save('rpc-114',await definitions());
 const actor='00000000-0000-0000-0000-000000000001';
 await db.query('INSERT INTO auth.users VALUES($1);',[actor]);
 await db.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE key='admin'",[actor]);
 await db.query(`SET optiplan.confirmed_demo_project='dyqusivzgxebkxkwohwn';SET optiplan.backup_sha256='${'a'.repeat(64)}';SET optiplan.schema_approved='yes';SET optiplan.security_approved='yes';SET optiplan.import_approved='yes';SET optiplan.demo_actor='${actor}';`);
 const historical=await seedA2HistoricalRehearsal(db,actor);
 const original=(await db.query('SELECT snapshot_json,snapshot_fingerprint,config_revision_id FROM assisted_planning_stages WHERE plan_id=27001 ORDER BY ordinal')).rows;
 const replayBefore=(await db.query('SELECT replay_snapshot_json FROM plan_config_revisions WHERE plan_id=27001')).rows;
 const sourcesBefore=(await db.query('SELECT assisted_read_bootstrap_sources(27001) sources')).rows[0].sources;
 const session=(await db.query('SELECT id FROM assisted_planning_sessions WHERE plan_id=27001')).rows[0].id;
 const readersBefore=(await db.query('SELECT assisted_expected_obligation_sources($1) expected,assisted_preview_s0_additions(27001) preview',[session])).rows;
 const sql=readFileSync('supabase/migrations/115_daily_required_technical_chains.sql','utf8');await db.query(sql);
 ledger.push({file:'115_daily_required_technical_chains.sql',sha256:createHash('sha256').update(sql).digest('hex')});
 const after=await dataApiCatalog(db);save('catalog-115',after);save('privileges-observed',privilegeContract(after));save('rpc-115',await definitions());
 save('triggers-115',await triggers());
 assert.deepEqual((await db.query('SELECT snapshot_json,snapshot_fingerprint,config_revision_id FROM assisted_planning_stages WHERE plan_id=27001 ORDER BY ordinal')).rows,original);
 assert.deepEqual((await db.query('SELECT replay_snapshot_json FROM plan_config_revisions WHERE plan_id=27001')).rows,replayBefore);
 assert.deepEqual((await db.query('SELECT assisted_read_bootstrap_sources(27001) sources')).rows[0].sources,sourcesBefore);
 assert.deepEqual((await db.query('SELECT assisted_expected_obligation_sources($1) expected,assisted_preview_s0_additions(27001) preview',[session])).rows,readersBefore);
 assert.deepEqual(replayBefore,[{replay_snapshot_json:{contractVersion:1}}]);
 // Re-insert the unchanged historical representation after 115, with a different
 // source label: eligibility comes from the immutable authority, never source.
 await db.query("INSERT INTO plan_config_revisions(plan_id,source,fingerprint,identity_json,replay_snapshot_json,created_by) SELECT plan_id,'EDIT',fingerprint,identity_json,replay_snapshot_json,created_by FROM plan_config_revisions WHERE plan_id=27001 ORDER BY id LIMIT 1");
 const receipts=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u00s/native/receipts.json.gz')).toString());
 const input=structuredClone(receipts['A-before-input.json']),record=receipts['A-configuration-receipt.json'][0];
 const canonical=(value:any)=>{
  const args={planId:input.planId,taskTemplateSnapshots:record.replay_snapshot_json.taskTemplateSnapshots,optimizerSnapshot:record.replay_snapshot_json.optimizerSnapshot,
   taskTemplateProvenance:{authority:'plan_task_template_snapshots',authorityContractVersion:1},optimizerProvenance:{authority:'plan_optimizer_snapshots',authorityContractVersion:1},authorities:projectEffectiveAuthoritiesFromEngineInputV1(value)};
  return {identity:buildEffectivePlanConfigRevisionV1(args),replay:buildEffectivePlanConfigReplaySnapshotV1(args)};
 };
 const current=canonical(input),forgedInput=structuredClone(input);
 forgedInput.technicalChains=receipts['A-input.json'].technicalChains;forgedInput.workDay.end='17:00';
 const forged=canonical(forgedInput);
 assert.notEqual(current.identity.configurationFingerprint,forged.identity.configurationFingerprint);
 await db.query(`INSERT INTO plans(id,date,work_start,work_end,meal_start,meal_end,meal_mode,participant_transition_minutes,
  work_baseline_start,work_baseline_end,work_config_source,meal_baseline_start,meal_baseline_end,meal_baseline_mode,meal_config_source,planner_next_profile)
  OVERRIDING SYSTEM VALUE VALUES($1,'2026-11-29',$2,$3,$4,$5,$6,$7,$2,$3,'INHERITED',$4,$5,$6,'INHERITED',
  '{"contractVersion":1,"configuration":{"scenario":"STANDALONE_ONLY","setup":"NONE","transport":"NONE"}}')`,
  [input.planId,input.workDay.start,input.workDay.end,input.meal.start,input.meal.end,input.mealMode,input.defaultParticipantTransitionMinutes]);
 const material=async()=> (await db!.query('SELECT (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM plans p) plans,(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM plan_config_revisions r) revisions,(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM assisted_planning_stages s) stages')).rows;
 const baseline=await material(),results:any[]=[];
 const reject=async(name:string,work:()=>Promise<unknown>,message:string)=>{
  await db!.query('BEGIN');let receipt:any;
  try{await work();receipt={accepted:true};}catch(e:any){receipt={accepted:false,code:e.code,message:e.message};}finally{await db!.query('ROLLBACK');}
  assert.equal(receipt.accepted,false,name);assert.equal(receipt.message,message,name);assert.deepEqual(await material(),baseline,name);
  results.push({name,...receipt,atomicRollback:true});
 };
 for(const writer of ['apply_day_config_operation_v5','apply_day_config_operation_before_technical_chains']){
  await reject(writer+'-coherent-native-forgery',async()=>{
   await db!.query('SET LOCAL ROLE service_role');
   await db!.query('SELECT public.'+writer+'($1,$2,\'EDIT\',$3,NULL,$4,$5,$6,$7,\'{}\')',[input.planId,actor,{workday:{start:input.workDay.start,end:'17:00'}},current.identity,current.replay,forged.identity,forged.replay]);
  },'TECHNICAL_CHAIN_AUTHORITY_NOT_MATERIALIZED');
 }
 await reject('native-forged-historical-source',()=>db!.query("INSERT INTO plan_config_revisions(plan_id,source,fingerprint,identity_json,replay_snapshot_json,created_by) VALUES($1,'DISPOSABLE_BASELINE',$2,$3,$4,$5)",[input.planId,forged.identity.configurationFingerprint,forged.identity,forged.replay,actor]),'TECHNICAL_CHAIN_AUTHORITY_NOT_MATERIALIZED');
 await reject('088-immutable',()=>db!.query("UPDATE plans SET planner_next_configuration='{}' WHERE id=27001"),'PLANNER_NEXT_CONFIGURATION_IMMUTABLE');
 await reject('native-stale-revision',async()=>{
  await db!.query('SET LOCAL ROLE service_role');
  await db!.query("SELECT apply_day_config_operation_v5($1,$2,'EDIT','{}',999999,$3,$4,$3,$4,'{}')",[input.planId,actor,current.identity,current.replay]);
 },'STALE_CONFIG_REVISION');
 await db.query("INSERT INTO plan_config_revisions(plan_id,source,fingerprint,identity_json,replay_snapshot_json,created_by) VALUES($1,'EDIT',$2,$3,$4,$5)",[input.planId,current.identity.configurationFingerprint,current.identity,current.replay,actor]);
 save('revision-results',{postgres:(await db.query('SELECT version()')).rows[0],ledger,remoteWrites:0,historical:historical.summary,originalStages:original,originalReplay:replayBefore,
  historicalSparseReplayAccepted:true,historicalSnapshotsPreserved:true,nullColumnSourceCaptureIdentical:true,historicalReadersIdentical:true,nativeAbsentPolicyAccepted:true,forgedIdentity:forged.identity,forgedReplay:forged.replay,results});
 console.log('PASS PostgreSQL historical replay, unchanged snapshots/sources, native coherent forgery, atomic rollback, stale revision and 088 immutability');
}finally{await db?.end();docker('rm','-f',container);}
