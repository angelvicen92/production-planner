import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {api,buildUrl} from '../../shared/routes';

type Fingerprint=Record<string,{count:number;hash:string}>;
type Trace={path:string;method:string;responseStatus:number|null};
const roles=['admin','production','aux','viewer','norole','anonymous','invalid-token'] as const;
type Role=typeof roles[number];
const variants=(path:string)=>[path,path+'/',path.toUpperCase(),path.replace('/api/','/API/').replace(/zones|spaces|vocal-coach-rules/,s=>s[0].toUpperCase()+s.slice(1))+'/'];
const denied=(role:Role)=>role==='anonymous'||role==='invalid-token'?401:403;

/** Only freshly created local PostgreSQL, Auth and PostgREST from the existing harness. */
export async function runCatalogAuthorization(options:{
 appUrl:string;baselineUrl?:string;db:pg.Client;users:Record<string,{token:string}>;directory:string;
 pass:(name:string)=>void;transport:Trace[];baselineOnly:boolean;
}){
 const {appUrl,baselineUrl,db,users,directory,pass,transport,baselineOnly}=options;
 assert.ok(baselineOnly||baselineUrl,'CATALOG_AUTHORIZATION_BASELINE_ROOT must identify the unchanged baseline');
 for(const url of [appUrl,baselineUrl].filter(Boolean))assert.equal(new URL(url!).hostname,'127.0.0.1');
 const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>String(r.tablename));
 const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
 const fingerprintSQL=tables.map(table=>`SELECT '${table}' AS name,count(*)::int AS count,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS hash FROM public.${quote(table)} t`).join(' UNION ALL ');
 const fingerprints=async():Promise<Fingerprint>=>Object.fromEntries((await db.query(fingerprintSQL)).rows.map(({name,count,hash})=>[name,{count,hash}]));
 const changed=(before:Fingerprint,after:Fingerprint)=>tables.filter(t=>JSON.stringify(before[t])!==JSON.stringify(after[t]));
 const original=await fingerprints();
 assert.ok(original.daily_tasks.count>0&&original.assisted_planning_stages.count>0&&original.plan_task_template_snapshots.count>0,'preservation checks must not be empty');
 const report={baseline:[] as unknown[],candidate:[] as unknown[],reads:[] as unknown[],neighbors:[] as unknown[],invalidPayloads:[] as unknown[],original,cleanupVerified:false};
 const save=()=>writeFileSync(directory+'/catalog-authorization.json',JSON.stringify(report,null,2));
 const request=async(url:string,path:string,method:string,role:Role,body?:unknown)=>{
  const before=await fingerprints(),start=transport.length;
  const response=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:'Bearer '+(role==='invalid-token'?'invalid-token':users[role].token)})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text(),after=await fingerprints(),calls=transport.slice(start).map(({path,method,responseStatus})=>({path,method,responseStatus}));
  const row={role,path,method,status:response.status,changedTables:changed(before,after),before,after,restCalls:calls};
  if(response.status===401||response.status===403){
   assert.deepEqual(after,before,'rejected HTTP request changed persisted content');
   assert.ok(calls.every(c=>c.method==='GET'&&c.path.startsWith('/rest/v1/user_roles?')),'denial must precede every privileged handler query/write');
   if(response.status===403)assert.equal(data.type,'permission_denied');
  }
  return {row,data};
 };
 await db.query('CREATE TEMP TABLE catalog_authz_original_rules AS TABLE public.vocal_coach_rules');
 const zone=Number((await db.query("INSERT INTO zones(name) VALUES('Catalog authorization zone') RETURNING id")).rows[0].id);
 const spaceZone=Number((await db.query("INSERT INTO zones(name) VALUES('Catalog authorization space parent') RETURNING id")).rows[0].id);
 const space=Number((await db.query("INSERT INTO spaces(name,zone_id) VALUES('Catalog authorization space',$1) RETURNING id",[spaceZone])).rows[0].id);
 const template=Number((await db.query("INSERT INTO task_templates(name,default_duration,default_cameras) VALUES('Catalog authorization template',10,0) RETURNING id")).rows[0].id);
 const resource=Number((await db.query('SELECT id FROM resource_items ORDER BY id LIMIT 1')).rows[0].id);
 await db.query('INSERT INTO vocal_coach_rules(vocal_coach_resource_item_id,task_template_id,default_space_id,sort_order,is_required) VALUES($1,$2,NULL,0,true)',[resource,template]);
 await db.query('CREATE TEMP TABLE catalog_authz_rules AS TABLE public.vocal_coach_rules');
 await db.query('CREATE TEMP TABLE catalog_authz_zone AS SELECT * FROM zones WHERE id=$1',[zone]);
 await db.query('CREATE TEMP TABLE catalog_authz_space AS SELECT * FROM spaces WHERE id=$1',[space]);
 const rules=(await db.query('SELECT * FROM catalog_authz_rules ORDER BY id')).rows.map(r=>({vocalCoachResourceItemId:Number(r.vocal_coach_resource_item_id),taskTemplateId:Number(r.task_template_id),defaultSpaceId:r.default_space_id==null?null:Number(r.default_space_id),sortOrder:Number(r.sort_order)+(Number(r.task_template_id)===template?1:0),isRequired:r.is_required}));
 const operations=[
  {contract:api.vocalCoachRules.saveAll,path:api.vocalCoachRules.saveAll.path,body:{rules},table:'vocal_coach_rules'},
  {contract:api.zones.update,path:buildUrl(api.zones.update.path,{id:zone}),body:{name:'Updated catalog zone'},table:'zones'},
  {contract:api.zones.delete,path:buildUrl(api.zones.delete.path,{id:zone}),body:undefined,table:'zones'},
  {contract:api.spaces.update,path:buildUrl(api.spaces.update.path,{id:space}),body:{name:'Updated catalog space'},table:'spaces'},
  {contract:api.spaces.delete,path:buildUrl(api.spaces.delete.path,{id:space}),body:undefined,table:'spaces'},
 ] as const;
 const restore=async(table:string)=>{
  if(table==='vocal_coach_rules')await db.query('DELETE FROM vocal_coach_rules; INSERT INTO vocal_coach_rules OVERRIDING SYSTEM VALUE SELECT * FROM catalog_authz_rules');
  if(table==='zones')await db.query('DELETE FROM zones WHERE id=$1',[zone]).then(()=>db.query('INSERT INTO zones OVERRIDING SYSTEM VALUE SELECT * FROM catalog_authz_zone'));
  if(table==='spaces')await db.query('DELETE FROM spaces WHERE id=$1',[space]).then(()=>db.query('INSERT INTO spaces OVERRIDING SYSTEM VALUE SELECT * FROM catalog_authz_space'));
 };
 try{
  const servers:readonly (readonly ['baseline'|'candidate',string])[]=baselineOnly?[['baseline',appUrl]]:[['baseline',baselineUrl!],['candidate',appUrl]];
  for(const [label,url] of servers){
   for(const operation of operations)for(const path of variants(operation.path))for(const role of roles){
    const bypass=operation.table==='vocal_coach_rules'||path.toLowerCase()!==path;
    const allowed=role==='admin'||(label==='baseline'&&bypass&&role!=='anonymous'&&role!=='invalid-token');
    const result=await request(url,path,operation.contract.method,role,operation.body);
    report[label].push(result.row);save();
    assert.equal(result.row.status,allowed?200:denied(role),`${label} ${role} ${operation.contract.method} ${path}`);
    assert.deepEqual(result.row.changedTables,allowed?[operation.table]:[]);
    if(allowed){
     if(operation.contract.method==='PATCH'){assert.ok(operation.body&&'name' in operation.body);assert.equal(result.data.name,operation.body.name);assert.equal(result.data.id,operation.table==='zones'?zone:space);}
     else assert.equal(result.data.success,true);
     if(operation.table==='vocal_coach_rules')assert.equal(Number((await db.query('SELECT sort_order FROM vocal_coach_rules WHERE task_template_id=$1',[template])).rows[0].sort_order),1);
     if(operation.contract.method==='DELETE')assert.equal(Number((await db.query(`SELECT count(*) FROM ${operation.table} WHERE id=$1`,[operation.table==='zones'?zone:space])).rows[0].count),0);
     await restore(operation.table);
     assert.deepEqual(await fingerprints(),result.row.before,'restore identical fixture between identities and URLs');
    }
   }
   for(const catalog of [api.zones.list,api.spaces.list,api.vocalCoachRules.list])for(const path of variants(catalog.path))for(const role of roles){
    const result=await request(url,path,catalog.method,role);
    report.reads.push({server:label,...result.row});
    const bypass=catalog===api.vocalCoachRules.list||path.toLowerCase()!==path;
    assert.equal(result.row.status,role==='anonymous'||role==='invalid-token'?401:role==='norole'&&!(label==='baseline'&&bypass)?403:200);
    assert.deepEqual(result.row.changedTables,[]);
    if(result.row.status===200)assert.ok(Array.isArray(result.data));
   }
  }
  for(const [label,url] of servers)for(const path of ['/api/zones-extra/1','/API/ZONES-extra/1','/api/spaces-extra/1','/api/vocal-coach-rules-extra'])for(const role of roles){
   const result=await request(url,path,'PATCH',role,{name:'Must not write'});
   report.neighbors.push({server:label,...result.row});
   assert.equal(result.row.status,role==='anonymous'||role==='invalid-token'?401:404,'false catalog prefixes must not match real handlers or claim catalog authority');
   assert.deepEqual(result.row.changedTables,[]);
  }
  pass('baseline real global PUT and mixed-case spatial PATCH/DELETE bypasses reproduced with all seven identities');
  if(!baselineOnly){
   pass('candidate catalog matrix: ADMIN 200, other roles 403, missing/invalid Auth 401; zero handler queries/writes on denial');
   // U03a and plan-local authority remain distinct from the global vocal catalog.
   const plan=Number((await db.query('SELECT id FROM plans ORDER BY id LIMIT 1')).rows[0].id);
   const originalPlanRules=(await db.query('SELECT * FROM plan_vocal_coach_rules WHERE plan_id=$1',[plan])).rows;
   const planRules=originalPlanRules.map(r=>({vocalCoachPlanResourceItemId:Number(r.vocal_coach_plan_resource_item_id),taskTemplateId:Number(r.task_template_id),defaultSpaceId:r.default_space_id==null?null:Number(r.default_space_id),sortOrder:Number(r.sort_order),isRequired:r.is_required}));
   await db.query('CREATE TEMP TABLE catalog_authz_plan_rules AS SELECT * FROM plan_vocal_coach_rules WHERE plan_id=$1',[plan]);
   for(const role of roles){
    const result=await request(appUrl,buildUrl(api.plans.vocalCoachRules.saveAll.path,{id:plan}),'PUT',role,{rules:planRules});
    report.neighbors.push(result.row);
    assert.equal(result.row.status,role==='admin'||role==='production'?200:denied(role));
    assert.ok(result.row.changedTables.every(t=>t==='plan_vocal_coach_rules'));
    await db.query('DELETE FROM plan_vocal_coach_rules WHERE plan_id=$1',[plan]);
    await db.query('INSERT INTO plan_vocal_coach_rules OVERRIDING SYSTEM VALUE SELECT * FROM catalog_authz_plan_rules');
    for(const path of variants(buildUrl(api.taskTemplates.update.path,{id:template}))){
     const templateResult=await request(appUrl,path,'PATCH',role,{defaultDuration:11});report.neighbors.push(templateResult.row);
     assert.equal(templateResult.row.status,role==='admin'?200:denied(role));
     assert.deepEqual(templateResult.row.changedTables,role==='admin'?['task_templates']:[]);
     await db.query('UPDATE task_templates SET default_duration=10 WHERE id=$1',[template]);
    }
   }
   for(const operation of operations.filter(o=>o.contract.method!=='DELETE'))for(const role of ['admin','production'] as const){
    const result=await request(appUrl,operation.path,operation.contract.method,role,{name:42,rules:'invalid'});
    report.invalidPayloads.push(result.row);assert.equal(result.row.status,role==='admin'?400:403);assert.deepEqual(result.row.changedTables,[]);
   }
   pass('GET catalog role policy, plan-local Production PUT, U03a alias and pre-validation denial preserved');
  }
 }finally{
  await db.query('DELETE FROM vocal_coach_rules; INSERT INTO vocal_coach_rules OVERRIDING SYSTEM VALUE SELECT * FROM catalog_authz_original_rules');
  await db.query('DELETE FROM task_templates WHERE id=$1',[template]);
  await db.query('DELETE FROM spaces WHERE id=$1',[space]);
  await db.query('DELETE FROM zones WHERE id=ANY($1)',[[zone,spaceZone]]);
  assert.deepEqual(await fingerprints(),original,'all public table contents restored, including snapshots/daily/Assisted');
  report.cleanupVerified=true;save();
 }
 return {baselineRequests:report.baseline.length,candidateRequests:report.candidate.length,readRequests:report.reads.length,neighborRequests:report.neighbors.length,invalidPayloadRequests:report.invalidPayloads.length,publicTables:tables.length,protectedRows:{dailyTasks:original.daily_tasks.count,stages:original.assisted_planning_stages.count,templateSnapshots:original.plan_task_template_snapshots.count},cleanupVerified:report.cleanupVerified};
}
