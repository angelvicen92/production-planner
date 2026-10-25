import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Focused material guard fixture. The native journey separately applies the
// entire literal migration ledger, genuine Auth, writer, validation and Stage.
test('SQL material certificate verifies complete chains, authentic prefixes and context-only futures',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE TABLE plans(id integer,planner_next_configuration jsonb,planner_next_profile jsonb,daily_technical_chains jsonb,daily_round_synchronization jsonb,current_config_revision_id bigint,work_start text,work_end text,meal_start text,meal_end text,meal_mode text);
   CREATE TABLE daily_tasks(id integer,plan_id integer,template_id integer,contestant_id integer,space_id integer,status text,duration_override integer);
   CREATE TABLE plan_task_template_snapshots(plan_id integer,source_template_id integer,planner_next_operation jsonb,setup_id integer,itinerant_team_requirement text,default_duration integer,dependency_template_ids jsonb,resource_requirements jsonb);
   CREATE TABLE plan_resource_items(id integer,plan_id integer,resource_item_id integer,is_available boolean,availability_start text,availability_end text);
   CREATE TABLE plan_space_settings(plan_id integer,space_id integer,zone_id integer,availability_start text,availability_end text);
   CREATE TABLE plan_zone_settings(plan_id integer,zone_id integer,availability_start text,availability_end text);
   CREATE TABLE plan_space_resource_assignments(plan_id integer,space_id integer,plan_resource_item_id integer);
   CREATE TABLE plan_zone_resource_assignments(plan_id integer,zone_id integer,plan_resource_item_id integer);
   CREATE TABLE plan_itinerant_unit_snapshots(plan_id integer);
   CREATE TABLE plan_config_revisions(id bigint,plan_id integer,replay_snapshot_json jsonb);
   CREATE TABLE planning_runs(id bigint,plan_id integer,status text,execution_kind text,config_revision_id bigint,assisted_result_json jsonb,result_fingerprint text);
   CREATE FUNCTION public.effective_operation_continuity(integer,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT '[]'::jsonb$$;
   CREATE FUNCTION public.hhmm_to_minutes(text) RETURNS integer LANGUAGE sql AS $$SELECT split_part($1,':',1)::integer*60+split_part($1,':',2)::integer$$;`);
  const migration=readFileSync('supabase/migrations/115_daily_required_technical_chains.sql','utf8');
  for(const name of ['assert_daily_technical_chains','assert_daily_technical_chain_snapshot','guard_technical_chain_revision']){
   const start=migration.indexOf('CREATE FUNCTION public.'+name+'('),end=migration.indexOf('END $$;',start)+7;
   await db.exec(migration.slice(start,end));
  }
  await db.exec('CREATE TRIGGER revision_chain BEFORE INSERT ON plan_config_revisions FOR EACH ROW EXECUTE FUNCTION public.guard_technical_chain_revision()');
  await db.exec(`INSERT INTO plans(id,planner_next_configuration) VALUES(2,'{"technicalChains":[]}');
    INSERT INTO plan_config_revisions VALUES(1,2,'{"authorities":{"plan_workday":[{"plannerNextAuthorities":{"technicalChains":[]}}]}}');
    INSERT INTO plan_config_revisions VALUES(2,2,'{"authorities":{"plan_workday":[{"plannerNextAuthorities":{}}]}}');`);
  await assert.rejects(()=>db.query('INSERT INTO plan_config_revisions VALUES(3,2,$1)',[{authorities:{plan_workday:[{plannerNextAuthorities:{technicalChains:[{id:'forged',orderedTaskIds:[1,2]}]}}]}}]),/TECHNICAL_CHAIN_AUTHORITY_NOT_MATERIALIZED/);
  const policy={id:'test-chain',orderedTaskIds:[8,3,5],adjacency:'REQUIRED',resourceContinuity:'REQUIRED',requiredResourceIds:[21]};
  const authority={contractVersion:1,policies:[policy],by:'00000000-0000-0000-0000-000000000001',at:'2026-10-25T00:00:00Z'};
  const profile={configuration:{scenario:'STANDALONE_ONLY',setup:'NONE',transport:'NONE',resourceTransitionMinutes:0}};
  await db.query("INSERT INTO plans VALUES(1,NULL,$1,$2,NULL,10,'08:00','16:00','13:00','14:00','global_hard_break')",[profile,authority]);
  await db.exec(`INSERT INTO daily_tasks VALUES(8,1,1,NULL,101,'pending',NULL),(3,1,2,NULL,102,'pending',NULL),(5,1,3,NULL,103,'pending',NULL),(11,1,4,1,104,'pending',NULL);
   INSERT INTO plan_task_template_snapshots VALUES(1,1,'{"kind":"technical"}',NULL,'none',15,'[]','{"byItem":{"1":1}}'),(1,2,'{"kind":"technical"}',NULL,'none',20,'[1]','{"byItem":{"1":1}}'),(1,3,'{"kind":"technical"}',NULL,'none',10,'[2]','{"byItem":{"1":1}}'),(1,4,'{"kind":"auxiliary"}',NULL,'none',20,'[]','{"byItem":{"1":1}}');
   INSERT INTO plan_resource_items VALUES(21,1,1,true,'09:00','11:00'),(22,1,2,true,'08:00','16:00');
   INSERT INTO plan_zone_settings VALUES(1,201,NULL,NULL);
   INSERT INTO plan_space_settings VALUES(1,101,201,'09:00','09:20'),(1,102,201,'09:15','09:50'),(1,103,201,'09:35','10:00'),(1,104,201,'09:00','11:00');`);
  await db.query('INSERT INTO plan_config_revisions VALUES(10,1,$1)',[{authorities:{plan_workday:[{plannerNextAuthorities:{technicalChains:[policy]}}]}}]);
  await assert.rejects(()=>db.query('SELECT public.assert_daily_technical_chains(1,$1)',[{contractVersion:'1',policies:[policy]}]),/UNSUPPORTED_TECHNICAL_CHAIN_STRUCTURE/);
  await assert.rejects(()=>db.query('SELECT public.assert_daily_technical_chains(1,$1)',[{contractVersion:1,policies:[{...policy,adjacency:'PREFERRED'}]}]),/UNSUPPORTED_TECHNICAL_CHAIN_STRUCTURE/);
  const chain=[{taskId:8,startPlanned:'09:00',endPlanned:'09:15',spaceId:101,assignedResourceIds:[21]},{taskId:3,startPlanned:'09:15',endPlanned:'09:35',spaceId:102,assignedResourceIds:[21]},{taskId:5,startPlanned:'09:35',endPlanned:'09:45',spaceId:103,assignedResourceIds:[21]}];
  const full:{tasks:{taskId:number;startPlanned:string|null;endPlanned:string|null;spaceId:number;assignedResourceIds:number[]}[]}={tasks:[...chain,{taskId:11,startPlanned:null,endPlanned:null,spaceId:104,assignedResourceIds:[]}]};
  const check=(snapshot:any,run:number|null=null,revision=10)=>db.query('SELECT public.assert_daily_technical_chain_snapshot(1,$1,$2,$3)',[snapshot,revision,run]);
  await check(full);
  await db.exec('INSERT INTO plan_space_resource_assignments VALUES(1,102,22)');
  await assert.rejects(()=>check(full),/TECHNICAL_CHAIN_CERTIFICATE_INVALID/);
  const inherited=structuredClone(full);inherited.tasks[1].assignedResourceIds.push(22);await check(inherited);
  await db.exec('DELETE FROM plan_space_resource_assignments');
  for(const mutate of [
   (s:any)=>{s.tasks[1].startPlanned='09:20';s.tasks[1].endPlanned='09:40';},
   (s:any)=>{s.tasks[1].assignedResourceIds=[22];},
   (s:any)=>{s.tasks[1].spaceId=103;},
   (s:any)=>{s.tasks[1].endPlanned='09:30';},
   (s:any)=>{s.tasks.push({...s.tasks[0]});},
   (s:any)=>{s.tasks[3]={taskId:11,startPlanned:'09:10',endPlanned:'09:30',spaceId:104,assignedResourceIds:[21]};},
  ]){const changed=structuredClone(full);mutate(changed);await assert.rejects(()=>check(changed),/TECHNICAL_CHAIN_/);}
  await assert.rejects(()=>check(full,null,9),/STALE_TECHNICAL_CHAIN_REPLAY/);
  const future=structuredClone(full);future.tasks.slice(0,3).forEach(t=>{t.startPlanned=null as any;t.endPlanned=null as any;t.assignedResourceIds=[];});
  future.tasks[3]={taskId:11,startPlanned:'09:45',endPlanned:'10:05',spaceId:104,assignedResourceIds:[21]};
  const certify=async(snapshot:any,proof:any=chain)=>{
   const result={proposedDraftSnapshot:snapshot,evidence:{technicalChainCertificate:{status:'WITNESS',contextOnly:true,tasks:proof}}};
   await db.exec("DELETE FROM planning_runs");
   await db.query("INSERT INTO planning_runs VALUES(50,1,'success','ASSISTED_SCOPE',10,$1,encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex'))",[result]);
   return check(snapshot,50);
  };
  await certify(future);assert.equal(future.tasks.filter(t=>t.startPlanned).length,1);
  const prefix=structuredClone(future);prefix.tasks[0]=chain[0];await certify(prefix);
  const arbitrary=structuredClone(future);arbitrary.tasks[1]=chain[1];await assert.rejects(()=>certify(arbitrary),/TECHNICAL_CHAIN_INVALID_PREFIX/);
  await assert.rejects(()=>certify(future,chain.slice(0,2)),/TECHNICAL_CHAIN_CERTIFICATE_INVALID/);
  const harmful=structuredClone(future);harmful.tasks[3].startPlanned='09:10';harmful.tasks[3].endPlanned='09:30';await assert.rejects(()=>certify(harmful),/TECHNICAL_CHAIN_CERTIFICATE_INVALID/);
  const hiddenConflict=structuredClone(harmful);hiddenConflict.tasks[3].assignedResourceIds=[];
  await assert.rejects(()=>certify(hiddenConflict),/TECHNICAL_CHAIN_CERTIFICATE_INVALID/);
  await db.exec("UPDATE plan_space_settings SET availability_start='10:40' WHERE space_id=102");await assert.rejects(()=>check(full),/TECHNICAL_CHAIN_CERTIFICATE_INVALID/);
  // Several nominal REQUIRED resources have the same material checks.
  await db.exec("UPDATE plan_space_settings SET availability_start='09:15' WHERE space_id=102;UPDATE plan_task_template_snapshots SET resource_requirements='{\"byItem\":{\"1\":1,\"2\":1}}'");
  const multi={...policy,requiredResourceIds:[21,22]};
  await db.query('UPDATE plans SET daily_technical_chains=$1 WHERE id=1',[{...authority,policies:[multi]}]);
  await db.query('UPDATE plan_config_revisions SET replay_snapshot_json=$1 WHERE id=10',[{authorities:{plan_workday:[{plannerNextAuthorities:{technicalChains:[multi]}}]}}]);
  const multiSnapshot=structuredClone(full);multiSnapshot.tasks.slice(0,3).forEach(t=>t.assignedResourceIds.push(22));await check(multiSnapshot);
  await db.exec("UPDATE plan_task_template_snapshots SET resource_requirements='{\"byItem\":{\"1\":1}}' WHERE source_template_id=2");
  await assert.rejects(()=>check(multiSnapshot),/TECHNICAL_CHAIN_RESOURCE_NOT_REQUIRED/);
 }finally{await db.close();}
});
