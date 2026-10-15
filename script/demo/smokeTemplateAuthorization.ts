import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium} from 'playwright';
import {api,buildUrl} from '../../shared/routes';

type User={token:string;email:string;password:string};
type Observation={role:string;path:string;status:number;changedTables:string[];before:Record<string,unknown>;after:Record<string,unknown>};
const tables=['task_templates','plan_task_template_snapshots','plans','daily_tasks','assisted_planning_stages','plan_config_revisions'] as const;

/** Uses only the local services and identities created by smokeA2Integration. */
export async function runTemplateAuthorization(options:{
 appUrl:string;baselineUrl?:string;db:pg.Client;users:Record<string,User>;directory:string;pass:(name:string)=>void;
}){
 const {appUrl,baselineUrl,db,users,directory,pass}=options;
 assert.ok(baselineUrl,'TEMPLATE_AUTHORIZATION_BASELINE_ROOT must identify the unchanged baseline');
 for(const url of [appUrl,baselineUrl])assert.equal(new URL(url).hostname,'127.0.0.1');
 assert.equal(api.taskTemplates.update.method,'PATCH');
 assert.equal(api.taskTemplates.update.path,'/api/ta/:id','exercise the actual shared hook/handler contract');
 const snapshotCount=Number((await db.query('SELECT count(*) FROM public.plan_task_template_snapshots')).rows[0].count);
 assert.ok(snapshotCount>0,'the no-write check must include existing persisted snapshots');
 const fingerprints=async()=>{
  const entries=await Promise.all(tables.map(async table=>{
   const result=await db.query("SELECT count(*)::int AS count,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS hash FROM public."+table+' t');
   return [table,result.rows[0]] as const;
  }));
  return Object.fromEntries(entries);
 };
 const request=async(url:string,path:string,method:string,role:string,body?:unknown)=>{
  const response=await fetch(url+path,{method,headers:{'Content-Type':'application/json',
   ...(role==='anonymous'?{}:{Authorization:'Bearer '+(role==='invalid-token'?'invalid-token':users[role].token)})},
   body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json()};
 };
 const report:{baseline:Observation[];candidate:Observation[];snapshotCount:number;reads:unknown[];otherWrites:unknown[];ui?:unknown}={baseline:[],candidate:[],snapshotCount,reads:[],otherWrites:[]};
 const save=()=>writeFileSync(directory+'/template-authorization.json',JSON.stringify(report,null,2));
 const original=await fingerprints();
 // This new local-only fixture never replaces an imported catalog entry.
 const fixture=(await db.query("INSERT INTO public.task_templates(name,default_duration,default_cameras,abbrev) VALUES ('U03a authorization probe',10,0,'U03A') RETURNING id")).rows[0];
 const id=Number(fixture.id),path=buildUrl(api.taskTemplates.update.path,{id});
 const variants=[path,'/api/TA/'+id,'/API/tA/'+id+'/'];
 try{
  for(const [label,url] of [['baseline',baselineUrl],['candidate',appUrl]] as const){
   for(const variant of variants){
    for(const role of ['admin','production','aux','viewer','norole','anonymous','invalid-token']){
     const before=await fingerprints(),patch={abbrev:role.toUpperCase(),defaultDuration:11};
     const result=await request(url,variant,'PATCH',role,patch),after=await fingerprints();
     const changedTables=tables.filter(table=>JSON.stringify(before[table])!==JSON.stringify(after[table]));
     report[label].push({role,path:variant,status:result.status,changedTables,before,after});
     if(result.status===200){
      assert.equal(result.data.id,id);
      assert.equal(result.data.abbrev,patch.abbrev);
      assert.equal(result.data.defaultDuration,11);
      assert.deepEqual((await db.query('SELECT abbrev,default_duration FROM public.task_templates WHERE id=$1',[id])).rows[0],
       {abbrev:patch.abbrev,default_duration:11});
      assert.deepEqual(changedTables,['task_templates']);
      await db.query("UPDATE public.task_templates SET abbrev='U03A',default_duration=10 WHERE id=$1",[id]);
     }else{
      assert.deepEqual(after,before,'a rejected request must not change records, snapshots, Stages or revisions');
      if(result.status===403)assert.equal(result.data.type,'permission_denied');
     }
    }
   }
  }
  save();
  console.log('Template authorization HTTP/SQL matrix '+JSON.stringify(Object.fromEntries(['baseline','candidate'].map(label=>[label,report[label as 'baseline'|'candidate'].map(({role,path,status,changedTables})=>({role,path,status,changedTables}))]))));
  for(const row of report.baseline){
   assert.equal(row.status,['anonymous','invalid-token'].includes(row.role)?401:200,'unchanged baseline must reproduce the bypass');
   assert.deepEqual(row.changedTables,row.status===200?['task_templates']:[]);
  }
  for(const row of report.candidate){
   assert.equal(row.status,['anonymous','invalid-token'].includes(row.role)?401:row.role==='admin'?200:403,'candidate role matrix for '+row.role+' '+row.path);
   assert.deepEqual(row.changedTables,row.status===200?['task_templates']:[]);
  }
  pass('baseline bypass reproduced and candidate PATCH matrix certified with native Auth, HTTP, storage and SQL');
  for(const role of ['admin','production','aux','viewer','norole','anonymous']){
   const before=await fingerprints(),result=await request(appUrl,api.taskTemplates.list.path,'GET',role);
   assert.equal(result.status,role==='anonymous'?401:role==='norole'?403:200);
   if(result.status===200)assert.ok(result.data.some((t:{id:number})=>t.id===id));
   assert.deepEqual(await fingerprints(),before);
   report.reads.push({role,status:result.status});
  }
  // Other public template writers retain the same catalog policy.
  for(const role of ['production','aux','viewer','norole','anonymous']){
   for(const [method,target,body] of [
    ['POST',api.taskTemplates.create.path,{name:'Must not exist',defaultDuration:10}],
    ['DELETE',buildUrl(api.taskTemplates.delete.path,{id}),undefined],
    ['POST','/API/TASK-TEMPLATES',{name:'Must not exist',defaultDuration:10}],
    ['DELETE','/API/TASK-TEMPLATES/'+id,undefined],
   ] as const){
    const before=await fingerprints(),result=await request(appUrl,target,method,role,body);
    assert.equal(result.status,role==='anonymous'?401:403);
    assert.deepEqual(await fingerprints(),before);
    report.otherWrites.push({role,method,path:target,status:result.status});
   }
  }
  const invalidBefore=await fingerprints();
  assert.equal((await request(appUrl,path,'PATCH','admin',{defaultDuration:0})).status,400);
  assert.deepEqual(await fingerprints(),invalidBefore);
  assert.equal((await request(appUrl,path,'PATCH','production',{defaultDuration:0})).status,403,'authorization precedes payload validation');
  pass('catalog reads preserved; create/delete denials and invalid admin payload leave all observed tables unchanged');

  const browser=await chromium.launch({headless:true});
  const uiResults:Record<string,unknown>={};
  let baselinePayload:unknown;
  try{
   for(const [label,url] of [['baseline',baselineUrl],['candidate',appUrl]] as const){
    const before=await fingerprints(),page=await browser.newPage();
    await page.goto(url+'/login');
    await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
    await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
    await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();
    await page.waitForURL('**/dashboard');
    await page.goto(url+'/settings');
    const templatesTab=()=>page.getByRole('tab',{name:/plantillas|templates/i});
    await templatesTab().click();
    const card=()=>page.locator('.bg-card').filter({has:page.getByText('U03a authorization probe',{exact:true})}).last();
    await card().getByRole('button',{name:'Editar',exact:true}).click();
    await page.getByPlaceholder('ENTR',{exact:true}).fill('UI-U03A');
    await page.getByPlaceholder('30',{exact:true}).fill('17');
    const saved=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='PATCH');
    await page.getByRole('button',{name:'Guardar',exact:true}).click();
    const response=await saved,payload=response.request().postDataJSON();
    api.taskTemplates.update.input.parse(payload);
    assert.equal(payload.defaultDuration,17);assert.equal(payload.abbrev,'UI-U03A');
    if(label==='baseline')baselinePayload=payload;else assert.deepEqual(payload,baselinePayload,'the real UI payload is unchanged');
    // U02: storage writes location_label whenever the full UI sends location.
    // The native migration ledger has no such template column. Do not invent it
    // in the fixture or hide this pre-existing failure with an unrelated patch.
    const returned=await response.json();
    assert.equal(response.status(),400);
    assert.match(returned.message,/Could not find the 'location_label' column/);
    assert.deepEqual(await fingerprints(),before,'the rejected full UI payload is atomic');
    await page.reload();await templatesTab().click();
    assert.match(await card().innerText(),/Duración: 10 min · Abrv: U03A/);
    uiResults[label]={status:response.status(),path,method:'PATCH',payloadKeys:Object.keys(payload).sort(),schemaAccepted:true,error:returned.message,reloadUnchanged:true};
    await page.screenshot({path:directory+'/template-admin-ui-'+label+'.png',fullPage:true});
    await page.close();
   }
  }finally{await browser.close();}
  const before=await fingerprints(),validPatch={abbrev:'UI-U03A',defaultDuration:17};
  const saved=await request(appUrl,path,'PATCH','admin',validPatch);
  assert.equal(saved.status,200);assert.equal(saved.data.defaultDuration,17);assert.equal(saved.data.abbrev,'UI-U03A');
  const reloaded=await request(appUrl,api.taskTemplates.list.path,'GET','admin');
  assert.deepEqual(reloaded.data.filter((t:{id:number})=>t.id===id).map((t:{abbrev:string;defaultDuration:number})=>({abbrev:t.abbrev,defaultDuration:t.defaultDuration})),[validPatch]);
  assert.deepEqual((await db.query('SELECT abbrev,default_duration FROM public.task_templates WHERE id=$1',[id])).rows[0],{abbrev:'UI-U03A',default_duration:17});
  const after=await fingerprints();
  for(const table of tables.filter(t=>t!=='task_templates'))assert.deepEqual(after[table],before[table]);
  report.ui={...uiResults,validAdminPatch:{status:saved.status,patch:validPatch,reload:true},fullFormGap:'U02: location_label write against native template schema'};
  pass('real admin UI payload and existing U02 failure identical to baseline; valid admin PATCH persists and reloads without changing snapshots');
 }finally{
  await db.query('DELETE FROM public.task_templates WHERE id=$1',[id]);
  save();
  assert.deepEqual(await fingerprints(),original,'fixture cleanup and protected data preservation');
 }
 return report;
}
