/** Only product APIs author tasks; joint authority interventions are memory-only before delta. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {inspect} from './consumer';
import {newDayPlannerConfigurationSchema} from '../../../shared/newDayPlannerConfiguration';
import {dayConfigEditSchema} from '../../../shared/dayConfig';
export async function journey(context:any){
 if(process.argv.includes('--native'))return (await import('./nativeJourney')).nativeJourney(context);
 const {appUrl,url,anon,users,db,directory,pass}=context;
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(n:string,v:unknown)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const receipts:unknown[]=[];
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});const response={status:r.status,body:await r.json() as any};receipts.push({path,method,role,request:body,response});return response;};
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'17:00',mealStart:'14:00',mealEnd:'15:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'u00y_equipment',name:'Joint physical equipment'});
  const zone=await api('/api/zones','POST',{name:'Joint production'}),spaces:any[]=[];
  for(const name of ['Preparation','Shared operation','Finishing'])spaces.push(await api('/api/spaces','POST',{name,zoneId:zone.id}));
  const resource=await api('/api/resource-items','POST',{typeId:type.id,name:'Common kit',defaultAvailabilityStart:'09:00',defaultAvailabilityEnd:'12:00'});
  const tmpl=async(name:string,kind:string,s:number,d:number,deps:number[]=[],req:any={})=>api('/api/task-templates','POST',{name,defaultDuration:d,spaceId:spaces[s].id,zoneId:zone.id,requiresCoach:false,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,dependsOnTemplateIds:deps,resourceRequirements:req,rulesJson:{plannerNextOperation:{contractVersion:1,kind}}});
  const pre=await tmpl('Individual prerequisite','auxiliary',0,5),joint=await tmpl('Physical joint candidate','auxiliary',1,10,[pre.id],{byItem:{[resource.id]:1}}),post=await tmpl('Individual successor','auxiliary',2,5,[joint.id]),competitor=await tmpl('Physical competitor','auxiliary',1,15,[],{byItem:{[resource.id]:1}});
  const general=await api('/api/new-day-planner-configuration'),configuration={contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0};
  await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration});
  await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill('2027-11-02');
  const creating=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear día',exact:true}).click();const created=await creating;assert.equal(created.status(),201);const planId=Number((await created.json()).id),path=`/api/plans/${planId}/assisted`,configPath=`/api/plans/${planId}/day-configuration`;
  const groups:any[][]=[];
  for(const [i,start] of ['09:00','09:15'].entries()){
   const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`Participant ${i+1}`,availabilityStart:start,availabilityEnd:i?'11:45':'11:30'});
   const tasks=[];for(const t of [pre,joint,post])tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:person.id,spaceId:t.spaceId,zoneId:zone.id}));groups.push(tasks);
  }
  await api('/api/daily-tasks','POST',{planId,templateId:competitor.id,contestantId:groups[0][0].contestant_id,spaceId:competitor.spaceId,zoneId:zone.id});
  const ordinary=await buildEngineInput(planId,storage),s0=await api(path+'/session','POST',{}),members=groups.map(g=>g[1].id),jointGroups={contractVersion:1,groups:[{id:'joint-operation',taskIds:members}]};save('ordinary-input',ordinary);save('S0',s0);
  const before=(await db.query('SELECT * FROM plans WHERE id=$1',[planId])).rows;
  const effective=await api(`/api/plans/${planId}/effective-configuration`);
  const denied=await request(configPath,'PUT',{jointGroups,expectedRevisionId:effective.taskOperationScopes.revisionId});save('original-rejection',denied);assert.equal(denied.status,400);
  save('schema-rejection',{general:newDayPlannerConfigurationSchema.safeParse({...configuration,jointGroups}),daily:dayConfigEditSchema.safeParse({jointGroups,expectedRevisionId:null})});
  await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);await page.getByTestId('daily-task-operation-scopes').waitFor();save('ui-before',{text:await page.locator('body').innerText(),jointEditorCount:await page.getByTestId('daily-joint-groups').count()});await page.screenshot({path:`${directory}/ui-before.png`,fullPage:true});
  const paired=structuredClone(ordinary);for(const t of paired.tasks)if(members.includes(t.id))t.jointGroupId='joint-operation';
  const controls:any={};
  controls.separate=inspect(ordinary);controls.paired=inspect(paired);controls.scope=inspect(paired,[members[0]]);controls.scopeWithPrerequisites=inspect(paired,[members[0]],[],true);
  const incompatible=structuredClone(paired);incompatible.tasks.find(t=>t.id===groups[1][0].id)!.durationOverrideMin=145;controls.incompatible=inspect(incompatible);
  for(const [name,result] of Object.entries(controls))save('control-'+name,{input:name==='separate'?ordinary:paired,...result as object});
  const fixed=controls.paired.result?.proposal?.find((t:any)=>t.id===`task:${members[0]}`);assert.ok(fixed);
  controls.halfProtected=inspect(paired,[members[1]],[fixed]);
  controls.future=inspect(paired,[ordinary.tasks.at(-1)!.id]);
  for(const [name,result] of Object.entries(controls))save('control-'+name,{input:name==='separate'?ordinary:name==='incompatible'?incompatible:paired,...result as object});
  assert.deepEqual((await db.query('SELECT * FROM plans WHERE id=$1',[planId])).rows,before);const after=await api(path);assert.deepEqual(after.activeStage,s0.activeStage);assert.deepEqual(after.draft,s0.draft);save('final-S0',after);
  pass('native day, original rejection and memory-only consumer controls; persistence unchanged');return {planId,members,remoteWrites:0,experimentIsStage:false};
 }finally{save('api-receipts',receipts);await browser.close();}
}
