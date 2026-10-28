/** Productive fixed composition gate. All operational data is authored through the real API. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fixedAttacks} from './fixed-attacks';
import {buildCanonicalPlanConfig} from '../../../server/dayConfigurationService';
import {withDailyOperationalMeals} from '../../../server/operationalMealPolicy';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {readFileSync,writeFileSync} from 'node:fs';
import {buildEngineInput} from '../../../engine/buildInput';
import {resolveEffectiveTaskResourceAssignments} from '../../../engine/planner-next/integration/effectiveTaskResourceAssignments';
import {requiredFunctionBodies} from '../../../script/demo/a2Preflight';
import {certificateAttacks} from './attacks';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';

export async function journey({appUrl,users,db,directory,pass}:any){
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(n:string,v:unknown)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const receipts:any[]=[];
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{
  const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});
  const response={status:r.status,body:await r.json() as any};receipts.push({path,method,request:body,response});return response;
 };
 const contentions:any[]=[];
 const api=async(path:string,method='GET',body?:unknown)=>{
  const plan=path.match(/^\/api\/plans\/(\d+)\/assisted\/validate$/)?.[1];
  const token=plan?(await db.query('SELECT assisted_bootstrap_source_token($1) token',[Number(plan)])).rows[0].token:null;
  let r=await request(path,method,body);
  if(plan&&r.status===409&&r.body.code==='REBOOTSTRAP_STALE_SOURCES'){
   const after=(await db.query('SELECT assisted_bootstrap_source_token($1) token',[Number(plan)])).rows[0].token;
   const locks=(await db.query("SELECT a.backend_type,l.mode,l.granted,c.relname FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid LEFT JOIN pg_class c ON c.oid=l.relation WHERE a.datname=current_database() AND l.locktype='relation' AND l.mode<>'AccessShareLock' ORDER BY a.backend_type,c.relname,l.mode")).rows;
   assert.equal(after,token,'source authority changed; do not retry');
   const current=await request(`/api/plans/${plan}/assisted`);assert.equal(current.body.draftFingerprint,(body as any).expectedDraftFingerprint);assert.equal(current.body.draftBaseStageId,(body as any).expectedBaseStageId);
   contentions.push({path,first:r,sourceTokenUnchanged:true,locks,reason:'Existing SQL NOWAIT protects concurrent source reads; one explicit validation retry with the same Draft/base and source token.'});save('source-contention',contentions);
   r=await request(path,method,body);
  }
  assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;
 };
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium'});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const browserEvents:any[]=[];page.on('pageerror',e=>browserEvents.push({message:e.message}));page.on('requestfailed',r=>browserEvents.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
 const sql=async(name:string,plan:number,body:any)=>{try{await db.query(`SELECT public.${name}($1,$2)`,[plan,body]);return {accepted:true};}catch(e:any){return {accepted:false,code:e.code,message:e.message};}};
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  // Compare every existing SQL contract byte for byte, without replacing it.
  const catalog=[];
  for(const [name,expected] of requiredFunctionBodies(false,124)){
   const rows=(await db.query("SELECT pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1",[name])).rows;
   assert.ok(rows.some((d:any)=>{const m=d.definition.match(/\bAS\s+(\$\w*\$)([\s\S]*)/i);return m&&m[2].slice(0,m[2].indexOf(m[1])).trim()===expected;}),name);catalog.push({name,exactBody:true});
  }save('sql-catalog',catalog);
  await api('/api/program-settings','PATCH',{defaultWorkStart:'08:00',defaultWorkEnd:'16:00',mealStart:'14:00',mealEnd:'15:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'physical_tools',name:'Physical tools'}),zone=await api('/api/zones','POST',{name:'Production'});
  const spaces:any[]=[];for(const name of ['First phase','Second phase','Third phase','Preparation and closing','Competition A','Competition B','Competition C'])spaces.push(await api('/api/spaces','POST',{name,zoneId:zone.id}));
  const tools:any[]=[];for(const name of ['Tool A','Tool B','Tool C'])tools.push(await api('/api/resource-items','POST',{typeId:type.id,name,defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'12:00'}));
  const general=await api('/api/new-day-planner-configuration');await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0}});
  const tmpl=async(name:string,s:number,d:number,deps:number[]=[],resources:number[]=[],team?:number)=>api('/api/task-templates','POST',{name,defaultDuration:d,spaceId:spaces[s].id,zoneId:zone.id,requiresCoach:false,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,dependsOnTemplateIds:deps,resourceRequirements:{byItem:Object.fromEntries(resources.map(i=>[tools[i].id,1]))},...(team?{itinerantTeamRequirement:'specific',itinerantTeamId:team}:{}),rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}}});
  const days=[];let units:any[]=[];
  for(const [ordinal,label] of ['baseline','A-fixed','B-segments','C-joint-unit','D-rest-competition','impossible','unused-snapshot','second','common-unit'].entries()){
   if(ordinal===1)for(const [code,indices] of [['ab',[0,1]],['ac',[0,2]],['b',[1]],['tight-ab',[0,1]]] as const){
    units.push(await api('/api/itinerant-teams','POST',{code:'unit-'+code,name:'Unit '+code,resourceItemIds:indices.map(i=>tools[i].id),availabilityWindows:[{start:'08:00',end:code==='tight-ab'?'11:00':'12:00'}],transitionMinutes:0,isActive:true,orderIndex:units.length}));
   }
   const second=label==='second',common=label==='common-unit',firstUnit=common?3:0;
   const moving=!['baseline','unused-snapshot'].includes(label),segmented=['B-segments','D-rest-competition'].includes(label),jointUnit=label==='C-joint-unit'||common;
   const pre=await tmpl(label+' preparation',3,5),a=await tmpl(label+' first',0,5,[pre.id],moving?[]:[0,1],moving?units[firstUnit].id:undefined);
   const b=await tmpl(label+' second',1,5,[a.id],moving?[]:[0,1],moving?units[segmented?1:firstUnit].id:undefined);
   const joint=await tmpl(label+' joint',2,10,[b.id],jointUnit?[]:[1],jointUnit?units[common?3:2].id:undefined),last=await tmpl(label+' final',2,5,[a.id],[2],common?units[3].id:undefined);
   const alternateIdentity=common?await tmpl(label+' alternative identity',2,10,[],[],units[0].id):null;
   const postJoint=await tmpl(label+' closing joint',3,5,[joint.id]),postLast=await tmpl(label+' closing final',3,5,[last.id]);
   const rivals=[await tmpl(label+' rival A',4,15,[],[0]),await tmpl(label+' rival B',5,10,[],[1]),await tmpl(label+' rival C',6,10,[],[2])];
   const plan=await api('/api/plans','POST',{date:`2027-05-${String(ordinal+1).padStart(2,'0')}`,configuration:{workday:{intent:'INHERIT'},meal:{intent:'INHERIT'},participantTransition:{intent:'INHERIT'}}}),planId=plan.id;
   const configPath=`/api/plans/${planId}/day-configuration`,viewPath=`/api/plans/${planId}/effective-configuration`,path=`/api/plans/${planId}/assisted`;
   const inventory=await api(`/api/plans/${planId}/resource-items`),daily=tools.map(t=>inventory.find((r:any)=>r.resourceItemId===t.id));
   if(label==='impossible')await api(`/api/plans/${planId}/resource-items/${daily[0].id}`,'PATCH',{availabilityStart:'08:00',availabilityEnd:'08:40'});
   const groups:any[][]=[];
   for(let i=0;i<(second?2:3);i++){
    const p=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`Participant ${i+1}`,availabilityStart:'08:00',availabilityEnd:'12:00'}),tasks=[];
    for(const t of [pre,a,...(i<2?[b,joint,postJoint]:[last,postLast])])tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id}));groups.push(tasks);
   }
   const competitors=[];
   for(let i=0;i<(second?2:3);i++){
    const p=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`Independent ${i+1}`,availabilityStart:'08:00',availabilityEnd:'12:00'});
    const t=rivals[i];competitors.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id}));
   }
   if(label==='C-joint-unit'||common){
    const attempts=[];
    for(const mode of ['different-physical-peers',...(common?['equal-members-different-unit']:[])]){
     let error:any;await db.query('BEGIN');try{
      const peer=groups[1][3].id;
      if(mode==='different-physical-peers')await db.query('UPDATE daily_tasks SET assigned_resource_ids=$2 WHERE id=$1',[peer,JSON.stringify([daily[2].id])]);
      else await db.query('UPDATE daily_tasks SET template_id=$2 WHERE id=$1',[peer,alternateIdentity.id]);
      await db.query('SET LOCAL ROLE service_role');
      await db.query('SELECT assert_daily_joint_groups($1,$2)',[planId,{contractVersion:1,groups:[{id:'negative',taskIds:groups.slice(0,2).map(g=>g[3].id)}]}]);
     }catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
     assert.equal(error?.message,mode==='different-physical-peers'?'JOINT_RESOURCE_MISMATCH':'JOINT_UNIT_MISMATCH');attempts.push({mode,error,rolledBack:true,realDailySources:true});
    }save(label+'-joint-source-negatives',attempts);
   }
   const s0=await api(path+'/session','POST',{});save(label+'-S0',s0);
   const basePhases=[groups.map(g=>g[1].id),groups.slice(0,2).map(g=>g[2].id),[groups[0][3].id,...(groups[2]?[groups[2][2].id]:[])]];
   const phases=second?[basePhases[0],[groups[0][3].id,...basePhases[1]]]:basePhases;
   const policy={id:'required-unit',orderedTaskIds:phases.flat(),phases,adjacency:'REQUIRED' as const,resourceContinuity:'REQUIRED' as const,requiredResourceIds:common?[daily[0].id]:[]};
   const jointStructure={contractVersion:1,groups:[{id:'synchronized-operation',taskIds:groups.slice(0,2).map(g=>g[3].id)}]};
   let view=await api(viewPath);
   const rest={contractVersion:1,policies:[{id:'physical-rest',window:{start:label==='impossible'?'08:20':label==='D-rest-competition'?'08:20':'09:00',end:label==='impossible'||label==='D-rest-competition'?'08:35':'09:30'},durationMinutes:15,planResourceItemIds:[daily[0].id,daily[1].id],spaceIds:spaces.slice(0,3).map(s=>s.id)}]};
   if(second)rest.policies=[];
   if(!second)await api(configPath,'PUT',{operationalMealPolicies:rest,expectedRevisionId:view.operationalMeals.revisionId});
   const beforePlan=(await db.query('SELECT * FROM plans WHERE id=$1',[planId])).rows[0],beforeDraft=await api(path);view=await api(viewPath);
   const jointResponse=await request(configPath,'PUT',{jointGroups:jointStructure,expectedRevisionId:view.jointGroups.revisionId});
   const jointSQL=await sql('assert_daily_joint_groups',planId,jointStructure);view=await api(viewPath);
   const structure={contractVersion:1 as const,policies:[policy]},phaseResponse=await request(configPath,'PUT',{technicalChains:structure,expectedRevisionId:view.technicalChains.revisionId});
   const phaseSQL=await sql('assert_daily_technical_chains',planId,structure);
   const afterPlan=(await db.query('SELECT * FROM plans WHERE id=$1',[planId])).rows[0],afterDraft=await api(path);
   save(label+'-authoring',{policy,jointStructure,rest,jointResponse,jointSQL,phaseResponse,phaseSQL,beforePlan,afterPlan,beforeDraft,afterDraft});
   view=await api(viewPath);
   if(label==='A-fixed'){
    await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);
    const editor=page.getByTestId('daily-technical-chain');await editor.getByRole('button',{name:'Modificar cadena técnica',exact:true}).click();
    assert.ok(await editor.getByLabel('Orden por fases',{exact:true}).isChecked());
    const task=view.technicalChains.tasks.find((t:any)=>t.id===phases[0][0]),check=editor.getByLabel(`Fase 1: ${task.label}`,{exact:true});await check.uncheck();await check.check();
    const saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Guardar cadena técnica',exact:true}).click();const response=await saving;assert.equal(response.status(),200,await response.text());
    await page.reload();await page.getByTestId('daily-technical-chain').screenshot({path:`${directory}/fixed-required-phases.png`});await page.screenshot({path:`${directory}/fixed-configuration.png`,fullPage:true});
    await page.goto('about:blank');view=await api(viewPath);save('ui-edit',view);
    // Restore the same nominal flexible order to compare 83/82 with U01d/e.
    await api(configPath,'PUT',{technicalChains:structure,expectedRevisionId:view.technicalChains.revisionId});view=await api(viewPath);
    const changed=structuredClone(structure);changed.policies[0].id+='-cas';
    const race=await Promise.all(['admin','production'].map(role=>request(configPath,'PUT',{technicalChains:changed,expectedRevisionId:view.technicalChains.revisionId},role)));
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);save('CAS-race',race);view=await api(viewPath);
    await api(configPath,'PUT',{technicalChains:structure,expectedRevisionId:view.technicalChains.revisionId});view=await api(viewPath);
   }
   const security=[];
   for(const role of ['viewer','aux','norole','anonymous']){const r=await request(configPath,'PUT',{technicalChains:structure,expectedRevisionId:view.technicalChains.revisionId},role);assert.equal(r.status,role==='anonymous'?401:403);security.push({role,...r});}
   const stale=await request(configPath,'PUT',{technicalChains:structure,expectedRevisionId:2147483647});assert.equal(stale.status,409);security.push({mode:'stale-CAS',...stale});save(label+'-security',security);
   save(label+'-view',await api(viewPath));
   if(label==='A-fixed'||common){
    const negatives=[];
    for(const mode of ['omitted','null','false-common']){
     const bad:any=structuredClone(policy);if(mode==='omitted')delete bad.requiredResourceIds;else if(mode==='null')bad.requiredResourceIds=null;else bad.requiredResourceIds=[daily[2].id];
     const value={contractVersion:1,policies:[bad]},current=await api(viewPath),response=await request(configPath,'PUT',{technicalChains:value,expectedRevisionId:current.technicalChains.revisionId}),consumer=await sql('assert_daily_technical_chains',planId,value);
     assert.equal(response.status,mode==='false-common'?422:400);assert.equal(consumer.accepted,false);negatives.push({mode,response,sql:consumer});
    }save(label+'-contract-negatives',negatives);
   }
   const input=await buildEngineInput(planId,storage);assert.equal(input.tasks.length,second?12:17);save(label+'-input',input);save(label+'-effective',resolveEffectiveTaskResourceAssignments(input));
   assert.equal(jointResponse.status,200,JSON.stringify(jointResponse));assert.equal(phaseResponse.status,200,JSON.stringify(phaseResponse));
   assert.deepEqual(input.technicalChains,[policy]);assert.deepEqual(input.dailyJointGroups,jointStructure.groups);
   save(label+'-adapter',adapt(input));
   {
    const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
    const poll=async(id:number)=>{for(let i=0;i<600;i++){const run=await api(`${path}/proposals/${id}`);if(!['pending','running'].includes(run.status))return run;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
    if(label!=='impossible')for(const [entry,selector] of [['representative',{kind:'TASK_IDS',taskIds:[jointStructure.groups[0].taskIds[0]]}],['peer',{kind:'TASK_IDS',taskIds:[jointStructure.groups[0].taskIds[1]]}]] as const){
     const before=await api(path),start=await api(path+'/proposals','POST',{...expected(before),selector,includePrerequisites:false}),run=await poll(start.runId);save(`${label}-scope-${entry}`,run);
     assert.equal(run.assisted_result_json.outcome,'PROPOSAL');assert.equal(run.assisted_result_json.proposal.length,policy.orderedTaskIds.length+1);assert.equal(run.assisted_result_json.evidence.acceptedSupportingPlacements.length,0);await api(`${path}/proposals/${run.id}/discard`,'POST',expected(before));
    }
    for(let n=1;n<=2;n++){
     const before=await api(path),ids=n===1?(second?[groups[0][1].id]:[competitors[0].id]):before.draft.tasks.filter((t:any)=>t.startPlanned==null).map((t:any)=>t.taskId);
     const start=await api(path+'/proposals','POST',{...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true});let run:any;
     for(let i=0;i<600;i++){run=await api(`${path}/proposals/${start.runId}`);if(!['pending','running'].includes(run.status))break;await new Promise(r=>setTimeout(r,100));}
     save(`${label}-S${n}-run`,run);
     if(label==='impossible'){assert.equal(run.assisted_result_json.outcome,'NO_PROPOSAL');assert.ok(!run.assisted_result_json.evidence.reasonCodes.some((c:string)=>c.includes('BUDGET')||c.includes('TIME_LIMIT')));assert.equal((await api(path)).history.length,1);break;}
     assert.equal(run.assisted_result_json.outcome,'PROPOSAL');
     await api(`${path}/proposals/${run.id}/apply`,'POST',expected(before));let draft=await api(path);save(`${label}-S${n}-draft`,draft);if(second&&n===2)save(`${label}-S${n}-forgeries`,[]);else await certificateAttacks({db,planId,run,draft,policy,input,save,label,ordinal:n});await fixedAttacks({db,planId,run,draft,policy,input,save,label,ordinal:n});await api(path+'/validate','POST',expected(draft));draft=await api(path);assert.equal(draft.validation.hardCount,0);assert.equal(draft.validation.requiredCount,0);
     const accepted=await api(path+'/accept-stage','POST',expected(draft));save(`${label}-S${n}-accepted`,accepted);
     save(`${label}-S${n}-sql`,(await db.query('SELECT id,ordinal,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE id=$1',[accepted.activeStage.id])).rows[0]);
     if(second&&n===1){
      const current=await api(viewPath),restOnly={contractVersion:1 as const,policies:[...rest.policies,{id:'new-resource-only-rest',window:{start:'11:15',end:'11:30'},durationMinutes:15,planResourceItemIds:[daily[0].id],spaceIds:[spaces[6].id]}]};
      const rejected=await request(configPath,'PUT',{operationalMealPolicies:restOnly,expectedRevisionId:current.operationalMeals.revisionId});
      assert.equal(rejected.status,409,JSON.stringify(rejected));assert.match(rejected.body.message,/OPERATIONAL_MEAL_PROTECTED_DECISIONS/);save('resource-only-rest-protected',{response:rejected,authority:restOnly,stage:accepted.activeStage});assert.deepEqual((await api(path)).activeStage,accepted.activeStage);
      const old=await buildCanonicalPlanConfig(planId,storage),next=await buildCanonicalPlanConfig(planId,storage,withDailyOperationalMeals(old.input,restOnly));
      const migration120=readFileSync('supabase/migrations/120_native_joint_groups.sql','utf8'),from=migration120.indexOf('CREATE FUNCTION public.joint_task_resources('),to=migration120.indexOf('REVOKE ALL ON FUNCTION public.joint_member_ids',from);
      let counterfactualError:any;await db.query('BEGIN');try{
       await db.query(migration120.slice(from,to).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
       await db.query('SET LOCAL ROLE service_role');
       await db.query("SELECT apply_day_config_operation_v5($1,$2,'EDIT',$3,$4,$5,$6,$7,$8,$9)",[planId,users.admin.id,{operationalMealPolicies:restOnly,expectedRevisionId:current.operationalMeals.revisionId},current.operationalMeals.revisionId,old.identity,old.replay,next.identity,next.replay,{}]);
      }catch(e:any){counterfactualError={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
      save('resource-only-rest-counterfactual',{oldHelperOnly:true,accepted:!counterfactualError,error:counterfactualError,rolledBack:true,authenticWriter:true});if(counterfactualError)assert.equal(counterfactualError.message,'OPERATIONAL_MEAL_PROTECTED_DECISIONS');
      assert.deepEqual((await api(path)).activeStage,accepted.activeStage);

     }
     for(const row of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.activeStage.snapshotJson.tasks.find((t:any)=>t.taskId===row.taskId),row);
    }
   }
   if(label!=='impossible'){
    const final=await api(path),stage=final.activeStage,forged=structuredClone(stage.snapshotJson);forged.tasks.find((t:any)=>t.startPlanned).startPlanned='15:55';
    const failures=[];
    for(const role of ['service_role','postgres']){
     let error:any;await db.query('BEGIN');try{if(role==='service_role')await db.query('SET LOCAL ROLE service_role');await db.query('UPDATE assisted_planning_stages SET snapshot_json=$2,snapshot_fingerprint=$3 WHERE id=$1',[stage.id,forged,fingerprintAssistedPlanningSnapshotV1(forged)]);}catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
     assert.equal(error?.code,role==='service_role'?'42501':'P0001');failures.push({role,error,hashRecomputed:true});
    }save(label+'-immutable-stages',failures);
    await api(path+'/rollback','POST',{targetStageId:s0.activeStage.id});
    for(const id of final.history.filter((s:any)=>s.ordinal>0).map((s:any)=>s.id))await api(path+'/redo','POST',{targetStageId:id});
    assert.deepEqual((await api(path)).activeStage.snapshotJson,stage.snapshotJson);save(label+'-rollback-redo',await api(path));
    save(label+'-final-input',await buildEngineInput(planId,storage));
   }
   // Read-only helper results expose how much of the team the existing SQL
   // resource authority sees. This is not a fabricated revision or Stage.
   save(label+'-sql-resources',(await db.query('SELECT id,public.joint_task_resources($1,id) AS resources FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
   days.push({label,planId,taskCount:input.tasks.length,jointStatus:jointResponse.status,phaseStatus:phaseResponse.status});save('profiles',days);pass(`${label}: ${label==='impossible'?'NO_PROPOSAL without budget exhaustion':'API authority, Draft, SQL Stage and continuation certified'}`);
  }
  return {days,remoteWrites:0,diagnosticOnly:false};
 }finally{save('api-receipts',receipts);save('browser-events',browserEvents);await browser.close();}
}
