/** Diagnostic only. All operational data is authored through the real API. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {buildEngineInput} from '../../../engine/buildInput';
import {resolveEffectiveTaskResourceAssignments} from '../../../engine/planner-next/integration/effectiveTaskResourceAssignments';
import {requiredFunctionBodies} from '../../../script/demo/a2Preflight';
import {memory} from './memory';

export async function journey({appUrl,users,db,directory,pass}:any){
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(n:string,v:unknown)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const receipts:any[]=[];
 const request=async(path:string,method='GET',body?:unknown)=>{
  const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users.admin.token}`},body:body===undefined?undefined:JSON.stringify(body)});
  const response={status:r.status,body:await r.json() as any};receipts.push({path,method,request:body,response});return response;
 };
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const sql=async(name:string,plan:number,body:any)=>{try{await db.query(`SELECT public.${name}($1,$2)`,[plan,body]);return {accepted:true};}catch(e:any){return {accepted:false,code:e.code,message:e.message};}};
 try{
  // Compare every existing SQL contract byte for byte, without replacing it.
  const catalog=[];
  for(const [name,expected] of requiredFunctionBodies(false,123)){
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
  for(const [ordinal,label] of ['baseline','A-fixed','B-segments','C-joint-unit','D-rest-competition','impossible','unused-snapshot'].entries()){
   if(ordinal===1)for(const [code,indices] of [['ab',[0,1]],['ac',[0,2]],['b',[1]]] as const){
    units.push(await api('/api/itinerant-teams','POST',{code:'unit-'+code,name:'Unit '+code,resourceItemIds:indices.map(i=>tools[i].id),availabilityWindows:[{start:'08:00',end:'12:00'}],transitionMinutes:0,isActive:true,orderIndex:units.length}));
   }
   const moving=!['baseline','unused-snapshot'].includes(label),segmented=['B-segments','D-rest-competition'].includes(label),jointUnit=label==='C-joint-unit';
   const pre=await tmpl(label+' preparation',3,5),a=await tmpl(label+' first',0,5,[pre.id],moving?[]:[0,1],moving?units[0].id:undefined);
   const b=await tmpl(label+' second',1,5,[a.id],moving?[]:[0,1],moving?units[segmented?1:0].id:undefined);
   const joint=await tmpl(label+' joint',2,10,[b.id],jointUnit?[]:[1],jointUnit?units[2].id:undefined),last=await tmpl(label+' final',2,5,[a.id],[2]);
   const postJoint=await tmpl(label+' closing joint',3,5,[joint.id]),postLast=await tmpl(label+' closing final',3,5,[last.id]);
   const rivals=[await tmpl(label+' rival A',4,15,[],[0]),await tmpl(label+' rival B',5,10,[],[1]),await tmpl(label+' rival C',6,10,[],[2])];
   const plan=await api('/api/plans','POST',{date:`2027-05-${String(ordinal+1).padStart(2,'0')}`,configuration:{workday:{intent:'INHERIT'},meal:{intent:'INHERIT'},participantTransition:{intent:'INHERIT'}}}),planId=plan.id;
   const configPath=`/api/plans/${planId}/day-configuration`,viewPath=`/api/plans/${planId}/effective-configuration`,path=`/api/plans/${planId}/assisted`;
   const inventory=await api(`/api/plans/${planId}/resource-items`),daily=tools.map(t=>inventory.find((r:any)=>r.resourceItemId===t.id));
   if(label==='impossible')await api(`/api/plans/${planId}/resource-items/${daily[0].id}`,'PATCH',{availabilityStart:'08:00',availabilityEnd:'08:40'});
   const groups:any[][]=[];
   for(let i=0;i<3;i++){
    const p=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`Participant ${i+1}`,availabilityStart:'08:00',availabilityEnd:'12:00'}),tasks=[];
    for(const t of [pre,a,...(i<2?[b,joint,postJoint]:[last,postLast])])tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id}));groups.push(tasks);
   }
   const competitors=[];
   for(let i=0;i<3;i++){
    const p=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`Independent ${i+1}`,availabilityStart:'08:00',availabilityEnd:'12:00'});
    const t=rivals[i];competitors.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id}));
   }
   const s0=await api(path+'/session','POST',{});save(label+'-S0',s0);
   const phases=[groups.map(g=>g[1].id),groups.slice(0,2).map(g=>g[2].id),[groups[0][3].id,groups[2][2].id]];
   const policy={id:'required-unit',orderedTaskIds:phases.flat(),phases,adjacency:'REQUIRED' as const,resourceContinuity:'REQUIRED' as const,requiredResourceIds:[]};
   const jointStructure={contractVersion:1,groups:[{id:'synchronized-operation',taskIds:groups.slice(0,2).map(g=>g[3].id)}]};
   let view=await api(viewPath);
   const rest={contractVersion:1,policies:[{id:'physical-rest',window:{start:label==='impossible'?'08:20':label==='D-rest-competition'?'08:20':'09:00',end:label==='impossible'||label==='D-rest-competition'?'08:35':'09:30'},durationMinutes:15,planResourceItemIds:[daily[0].id,daily[1].id],spaceIds:spaces.slice(0,3).map(s=>s.id)}]};
   await api(configPath,'PUT',{operationalMealPolicies:rest,expectedRevisionId:view.operationalMeals.revisionId});
   const beforePlan=(await db.query('SELECT * FROM plans WHERE id=$1',[planId])).rows[0],beforeDraft=await api(path);view=await api(viewPath);
   const jointResponse=await request(configPath,'PUT',{jointGroups:jointStructure,expectedRevisionId:view.jointGroups.revisionId});
   const jointSQL=await sql('assert_daily_joint_groups',planId,jointStructure);view=await api(viewPath);
   const structure={contractVersion:1 as const,policies:[policy]},phaseResponse=await request(configPath,'PUT',{technicalChains:structure,expectedRevisionId:view.technicalChains.revisionId});
   const phaseSQL=await sql('assert_daily_technical_chains',planId,structure);
   const afterPlan=(await db.query('SELECT * FROM plans WHERE id=$1',[planId])).rows[0],afterDraft=await api(path);
   save(label+'-authoring',{policy,jointStructure,rest,jointResponse,jointSQL,phaseResponse,phaseSQL,beforePlan,afterPlan,beforeDraft,afterDraft});
   save(label+'-view',await api(viewPath));
   const input=await buildEngineInput(planId,storage);assert.equal(input.tasks.length,17);save(label+'-input',input);save(label+'-effective',resolveEffectiveTaskResourceAssignments(input));
   if(moving){assert.equal(jointResponse.status,422);assert.equal(jointResponse.body.message,'UNSUPPORTED_JOINT_COMBINATION');assert.equal(phaseResponse.status,422);assert.equal(phaseResponse.body.message,'UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION');assert.deepEqual(beforePlan,afterPlan);assert.deepEqual(beforeDraft.draft,afterDraft.draft);}
   if(label==='unused-snapshot'){assert.equal(jointResponse.status,200);assert.equal(phaseResponse.status,422);}
   if(label==='baseline'){
    assert.equal(jointResponse.status,200);assert.equal(phaseResponse.status,200);
    const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
    for(let n=1;n<=2;n++){
     const before=await api(path),ids=n===1?[competitors[0].id]:before.draft.tasks.filter((t:any)=>t.startPlanned==null).map((t:any)=>t.taskId);
     const start=await api(path+'/proposals','POST',{...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true});let run:any;
     for(let i=0;i<600;i++){run=await api(`${path}/proposals/${start.runId}`);if(!['pending','running'].includes(run.status))break;await new Promise(r=>setTimeout(r,100));}
     save(`${label}-S${n}-run`,run);assert.equal(run.assisted_result_json.outcome,'PROPOSAL');
     await api(`${path}/proposals/${run.id}/apply`,'POST',expected(before));let draft=await api(path);await api(path+'/validate','POST',expected(draft));draft=await api(path);assert.equal(draft.validation.hardCount,0);assert.equal(draft.validation.requiredCount,0);
     const accepted=await api(path+'/accept-stage','POST',expected(draft));save(`${label}-S${n}-accepted`,accepted);
     save(`${label}-S${n}-sql`,(await db.query('SELECT id,ordinal,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE id=$1',[accepted.activeStage.id])).rows[0]);
     for(const row of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.activeStage.snapshotJson.tasks.find((t:any)=>t.taskId===row.taskId),row);
    }
   }
   const summary=memory(input,policy,jointStructure.groups,competitors.map(t=>t.id),daily.map(r=>r.id),save,label);
   // Read-only helper results expose how much of the team the existing SQL
   // resource authority sees. This is not a fabricated revision or Stage.
   save(label+'-sql-resources',(await db.query('SELECT id,public.joint_task_resources($1,id) AS resources FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
   days.push({label,planId,taskCount:17,jointStatus:jointResponse.status,phaseStatus:phaseResponse.status,summary});save('profiles',days);pass(`${label}: API authority and memory consumers inspected`);
  }
  return {days,remoteWrites:0,diagnosticOnly:true};
 }finally{save('api-receipts',receipts);}
}
