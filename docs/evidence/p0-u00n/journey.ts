import {proposalAttacks} from './proposalAttacks';
import {admissionAttacks} from './attacks';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type pg from 'pg';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {buildEffectivePlanConfigRevisionV1,projectEffectiveAuthoritiesFromEngineInputV1} from '../../../server/effectivePlanConfigRevision';
import {buildEffectivePlanConfigReplaySnapshotV1} from '../../../server/assistedPlanningConfigRevision';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';

type User={id:string;email:string;password:string;token:string};
export async function journey({appUrl,users,db,directory,pass}:{appUrl:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(s:string)=>void}){
  assert.equal((db as any).host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
  const {storage}=await import('../../../server/storage');
  const save=(name:string,value:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(value,null,2));
  const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
  const request=async(path:string,method='GET',body?:unknown,role='admin')=>{
    const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users[role].token}`},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,body:await r.json() as any};
  };
  const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
  const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
  const poll=async(path:string,id:number)=>{for(let i=0;i<600;i++){const r=await api(`${path}/proposals/${id}`);if(!['pending','running'].includes(r.status))return r;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
  const propose=async(path:string,ids:number[])=>{const s=await api(path);return poll(path,(await api(path+'/proposals','POST',{...expected(s),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true})).runId);};
  const sqlReceipt=async(name:string,work:()=>Promise<unknown>)=>{
    await db.query('SAVEPOINT probe');let result:any;
    try{result={ok:true,value:await work()};}catch(e:any){result={ok:false,code:e.code,message:e.message,where:e.where};}
    await db.query('ROLLBACK TO SAVEPOINT probe');await db.query('RELEASE SAVEPOINT probe');save(name,result);return result;
  };
  const sources=async(planId:number)=>(await db.query('SELECT public.assisted_read_bootstrap_sources($1) v',[planId])).rows[0].v;
  const identity=async(planId:number)=>{
    const input=await buildEngineInput(planId,storage),optimizerSnapshot=await storage.getPlanOptimizerSnapshot(planId),taskTemplateSnapshots=await storage.getPlanTaskTemplateSnapshots(planId);
    const revision={planId,optimizerSnapshot,taskTemplateSnapshots,optimizerProvenance:{authority:'plan_optimizer_snapshots',authorityContractVersion:1},taskTemplateProvenance:{authority:'plan_task_template_snapshots',authorityContractVersion:1},authorities:projectEffectiveAuthoritiesFromEngineInputV1(input)};
    return {input,identity:buildEffectivePlanConfigRevisionV1(revision),replay:buildEffectivePlanConfigReplaySnapshotV1(revision)};
  };
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const days:any[]=[];
  try{
    await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
    await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
    await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
    await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'14:00',mealStart:'13:00',mealEnd:'14:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
    const zone=await api('/api/zones','POST',{name:'U00n production'});
    const rooms:any[]=[];for(let i=0;i<4;i++)rooms.push(await api('/api/spaces','POST',{name:`U00n room ${i}`,zoneId:zone.id}));
    const types=await api('/api/resource-types-with-items');
    const coachType=types.find((t:any)=>t.code==='vocal_coach')??await api('/api/resource-types','POST',{code:'vocal_coach',name:'Coach'});
    const coach=await api('/api/resource-items','POST',{typeId:coachType.id,name:'U00n coach'});
    const physicalType=await api('/api/resource-types','POST',{code:'u00n_physical',name:'U00n exclusive'});
    const physical=await api('/api/resource-items','POST',{typeId:physicalType.id,name:'U00n camera'});
    for(const label of ['A','B']){
      const main=label==='A';
      const template=async(name:string,kind:string,room:any,deps:number[]=[],resources:any={},duration=20,requiresCoach=false)=>api('/api/task-templates','POST',{
        name:`U00n ${label} ${name}`,defaultDuration:duration,spaceId:room.id,zoneId:zone.id,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,
        requiresCoach,autoCreateOnContestantCreate:false,rulesJson:{plannerNextOperation:{contractVersion:1,kind}},resourceRequirements:resources,dependsOnTemplateIds:deps});
      const first=await template(main?'Vocal':'Capture','auxiliary',rooms[main?1:2],[],main?{}:{byItem:{[physical.id]:1}},main?10:30,main);
      // Explicit product roles, never inferred from the name.
      if(main)await api(`/api/ta/${first.id}`,'PATCH',{rulesJson:{plannerNextOperation:{contractVersion:1,kind:'vocal'}}});
      const second=main?await template('Main','main',rooms[0],[first.id],{},20,true):null;
      const reserve=await template('Existing pending','auxiliary',rooms[3]);
      const addition=await template('New obligation','auxiliary',rooms[main?3:1],main?[second.id]:[],main?{}:{byItem:{[physical.id]:1}},main?15:30);
      const general=await api('/api/new-day-planner-configuration');
      await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,
        scenario:main?'MAIN_WITH_VOCAL_FEEDER':'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',
        searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0,
        ...(main?{mainFlow:{spaceId:rooms[0].id,preferredEnd:'11:00',continuity:'REQUIRED',maxBlocksByKey:1,minTasksPerBlock:1}}:{})}});
      const plan=await api('/api/plans','POST',{date:main?'2027-03-01':'2027-03-02',configuration:{workday:{intent:'INHERIT'},meal:{intent:'INHERIT'},participantTransition:{intent:'OVERRIDE',value:0}}});
      const planId=plan.id,path=`/api/plans/${planId}/assisted`;
      const inventory=await api(`/api/plans/${planId}/resource-items`),dailyCoach=inventory.find((r:any)=>r.resourceItemId===coach.id);
      const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`U00n ${label} participant`,availabilityStart:'09:00',availabilityEnd:'12:00',...(main?{vocalCoachPlanResourceItemId:dailyCoach.id}:{})});
      let other=main?person:await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:'U00n B competing participant',availabilityStart:'09:00',availabilityEnd:'12:00'});
      const add=(t:any,p=person)=>api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id});
      const initial=[await add(first),...(main?[await add(second)]:[])],pending=await add(reserve);
      const start=await api(path+'/session','POST',{});save(`${label}-S0`,start);
      const original=await identity(planId);save(`${label}-before-identity`,original);
      save(`${label}-effective-before`,await api(`/api/plans/${planId}/effective-configuration`));
      const run=await propose(path,initial.map(t=>t.id));save(`${label}-S1-proposal`,run);assert.equal(run.assisted_result_json?.outcome,'PROPOSAL',JSON.stringify(run));
      await api(path+`/proposals/${run.id}/apply`,'POST',expected(start));
      await api(path+'/validate','POST',expected(await api(path)));
      const s1=await api(path+'/accept-stage','POST',expected(await api(path)));save(`${label}-S1`,s1);
      assert.equal(s1.activeStage.ordinal,1);
      const oldProposal=await propose(path,[pending.id]);save(`${label}-old-proposal`,oldProposal);
      const beforeSources=await sources(planId);save(`${label}-sources-S1`,beforeSources);
      const inflight=(await db.query(`INSERT INTO public.planning_runs(plan_id,status,engine,execution_kind,assisted_session_id,base_stage_id,config_revision_id,scope_json,scope_task_ids_json,include_prerequisites,source_draft_fingerprint)
        VALUES($1,'running','planner-next','ASSISTED_SCOPE',$2,$3,$4,$5,$6,true,$7) RETURNING id`,[planId,s1.session.id,s1.draftBaseStageId,s1.currentConfigRevisionId,oldProposal.scope_json,JSON.stringify(oldProposal.scope_task_ids_json),s1.draftFingerprint])).rows[0].id;
      if(!main)other=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:'U00n B post-Stage participant',availabilityStart:'09:00',availabilityEnd:'12:00'});
      const added=await add(addition,other);save(`${label}-new-task`,added);
      const unadmitted=await api(path);assert.deepEqual(unadmitted,s1);
      const preview=await api(path+'/bootstrap-additions');save(`${label}-preview`,preview);
      assert.equal(preview.allowed,true,JSON.stringify(preview));assert.equal(preview.mode,'POST_STAGE');assert.deepEqual(preview.addedTaskIds,[added.id]);
      const confirmation={...expected(s1),expectedSessionId:s1.session.id,expectedConfigRevisionId:s1.currentConfigRevisionId,sourceToken:preview.sourceToken,addedTaskIds:preview.addedTaskIds,confirmation:'INCORPORATE_NEW_TASKS'};
      const denied=await request(path+'/bootstrap-additions','POST',confirmation,'viewer');save(`${label}-permissions`,denied);assert.equal(denied.status,403);
      // Demonstrable source modifications, with no lasting side effects.
      await db.query('BEGIN');
      try{
        for(const [name,sql,args,reason] of [
          ['edit', 'UPDATE public.daily_tasks SET duration_override=99 WHERE id=$1',[initial[0].id],'REBOOTSTRAP_TASK_CHANGED_OR_REMOVED'],
          ['dependency',"UPDATE public.plan_task_template_snapshots SET dependency_template_ids='[]' WHERE plan_id=$1 AND source_template_id=$2",[planId,second?.id],main?'REBOOTSTRAP_AUTHORITY_CHANGED':null],
          ['participant',"UPDATE public.contestants SET availability_end='11:55' WHERE id=$1",[person.id],'REBOOTSTRAP_PARTICIPANT_CHANGED_OR_REMOVED'],
          ['assignment',"UPDATE public.daily_tasks SET assigned_resource_ids=assigned_resource_ids||jsonb_build_array($2::bigint) WHERE id=$1",[initial[0].id,main?inventory.find((r:any)=>r.resourceItemId===physical.id).id:dailyCoach.id],'REBOOTSTRAP_TASK_CHANGED_OR_REMOVED'],
          ['authority','UPDATE public.plan_resource_items SET is_available=false WHERE plan_id=$1',[planId],'REBOOTSTRAP_AUTHORITY_CHANGED'],
          ['delete','DELETE FROM public.daily_tasks WHERE id=$1',[pending.id],'REBOOTSTRAP_TASK_CHANGED_OR_REMOVED'],
          ['partial-baseline',"UPDATE public.assisted_bootstrap_sources SET sources_json=sources_json-'resource_types' WHERE session_id=$1",[s1.session.id],'REBOOTSTRAP_BASELINE_UNAVAILABLE'],
          ['task-row-baseline',"UPDATE public.assisted_bootstrap_sources SET sources_json=jsonb_set(sources_json,'{daily_tasks}',(SELECT jsonb_agg(t) FROM jsonb_array_elements(sources_json->'daily_tasks') t WHERE t->>'id'<>$2::text)) WHERE session_id=$1",[s1.session.id,initial[0].id],'REBOOTSTRAP_BASELINE_UNAVAILABLE'],
          ['participant-row-baseline',"UPDATE public.assisted_bootstrap_sources SET sources_json=jsonb_set(sources_json,'{contestants}','[]') WHERE session_id=$1",[s1.session.id],'REBOOTSTRAP_BASELINE_UNAVAILABLE'],
          ['baseline','DELETE FROM public.assisted_bootstrap_sources WHERE session_id=$1',[s1.session.id],'REBOOTSTRAP_BASELINE_UNAVAILABLE'],
        ] as const){
          if(!reason)continue;
          const negative=await sqlReceipt(`${label}-negative-${name}`,async()=>{await db.query(sql,args as any);const p=(await db.query('SELECT public.assisted_preview_bootstrap_additions($1) v',[planId])).rows[0].v;assert.equal(p.reason,reason);return p;});assert.ok(negative.ok,JSON.stringify(negative));
        }
      }finally{await db.query('ROLLBACK');}
      await db.query('BEGIN');try{const causal=await sqlReceipt(`${label}-source-comparison-causal`,async()=>{
        const before=(await sources(planId)).daily_tasks.find((t:any)=>t.id===initial[0].id);
        await db.query('UPDATE public.daily_tasks SET assigned_resource_ids=assigned_resource_ids||jsonb_build_array($2::bigint) WHERE id=$1',[initial[0].id,main?inventory.find((r:any)=>r.resourceItemId===physical.id).id:dailyCoach.id]);
        const after=(await sources(planId)).daily_tasks.find((t:any)=>t.id===initial[0].id);
        const comparison=(await db.query('SELECT $1::jsonb @> $2::jsonb legacy_contains,$1::jsonb=$2::jsonb exact_equal',[after,before])).rows[0];
        const current=(await db.query('SELECT public.assisted_preview_bootstrap_additions($1) v',[planId])).rows[0].v;
        assert.equal(comparison.legacy_contains,true);assert.equal(comparison.exact_equal,false);assert.equal(current.reason,'REBOOTSTRAP_TASK_CHANGED_OR_REMOVED');
        return {before,after,comparison,current};
      });assert.ok(causal.ok,JSON.stringify(causal));}finally{await db.query('ROLLBACK');}
      await admissionAttacks({db,storage,planId,userId:users.admin.id,viewerId:users.viewer.id,state:s1,preview,current:await identity(planId),oldProposal,inflight,directory,label});
      // Native UI reviews exactly the identities/revision and confirms admission.
      await page.goto(`${appUrl}/plans/${planId}?tab=planning`);
      await page.getByText('Nuevas tareas pendientes de incorporar a Assisted',{exact:false}).first().waitFor({timeout:30000});
      await page.getByRole('button',{name:'Revisar nuevas tareas',exact:true}).click();
      await page.getByRole('button',{name:'Actualizar Assisted con nuevas tareas',exact:true}).waitFor();
      await page.screenshot({path:`${directory}/${label}-review.png`,fullPage:true});
      await page.getByRole('button',{name:'Actualizar Assisted con nuevas tareas',exact:true}).click();
      await page.getByRole('button',{name:'Confirmar incorporación',exact:true}).waitFor();
      await page.screenshot({path:`${directory}/${label}-confirmation.png`,fullPage:true});
      await page.getByRole('button',{name:'Confirmar incorporación',exact:true}).click();
      await page.getByText('Nuevas tareas pendientes de incorporar a Assisted',{exact:false}).first().waitFor({state:'hidden'});
      const admitted=await api(path);save(`${label}-admitted`,admitted);
      assert.equal(admitted.session.id,s1.session.id);assert.deepEqual(admitted.activeStage,s1.activeStage);
      assert.notEqual(admitted.currentConfigRevisionId,s1.currentConfigRevisionId);
      assert.deepEqual(admitted.workingOrigin.pendingLaterTaskIds,[added.id]);
      assert.deepEqual(admitted.draft.tasks.filter((t:any)=>t.taskId!==added.id),s1.draft.tasks);
      assert.equal(admitted.draft.tasks.find((t:any)=>t.taskId===added.id).startPlanned,null);
      assert.deepEqual((await sources(planId)).daily_tasks.filter((t:any)=>t.id!==added.id),beforeSources.daily_tasks);
      save(`${label}-transition`,(await db.query('SELECT * FROM public.assisted_obligation_transitions WHERE session_id=$1',[s1.session.id])).rows);
      save(`${label}-revision`,await storage.getPlanConfigRevision(admitted.currentConfigRevisionId));
      await db.query('BEGIN');try{const staleFinish=await sqlReceipt(`${label}-finish-after-admission`,()=>db.query('SELECT public.assisted_finish_proposal($1,$2,$3)',[planId,inflight,oldProposal.assisted_result_json]));assert.equal(staleFinish.message,'STALE_CONFIG_REVISION');}finally{await db.query('ROLLBACK');}
      const inflightAfter=(await db.query('SELECT status,message FROM public.planning_runs WHERE id=$1',[inflight])).rows[0];save(`${label}-inflight-after`,inflightAfter);assert.equal(inflightAfter.status,'error');assert.equal(inflightAfter.message,'STALE_CONFIG_REVISION');
      const oldApply=await request(path+`/proposals/${oldProposal.id}/apply`,'POST',expected(s1));save(`${label}-old-apply`,oldApply);assert.equal(oldApply.status,409);
      const duplicate=await request(path+'/bootstrap-additions','POST',confirmation);save(`${label}-duplicate`,duplicate);assert.equal(duplicate.status,409);
      const s2run=await propose(path,[added.id]);save(`${label}-S2-proposal`,s2run);
      assert.equal(s2run.assisted_result_json?.outcome,'PROPOSAL',JSON.stringify(s2run));
      assert.ok(s2run.assisted_result_json.proposal.some((t:any)=>t.taskId===added.id));
      assert.ok(s2run.assisted_result_json.proposedDraftSnapshot.tasks.some((t:any)=>t.taskId===added.id));
      await proposalAttacks({db,run:s2run,state:admitted,planId,addedId:added.id,directory,label});
      await api(path+`/proposals/${s2run.id}/apply`,'POST',expected(admitted));
      const draft=await api(path);save(`${label}-S2-draft`,draft);
      await api(path+'/validate','POST',expected(draft));const validated=await api(path);save(`${label}-S2-validation`,validated.validation);
      // An actual source insertion after validation must never consolidate U2.
      const transient=await add(reserve,other);
      const staleAccept=await request(path+'/accept-stage','POST',expected(validated));save(`${label}-late-addition`,staleAccept);assert.equal(staleAccept.status,409);assert.deepEqual(await api(path),validated);
      await api(`/api/daily-tasks/${transient.id}`,'DELETE');
      await api(path+'/validate','POST',expected(await api(path)));
      const s2=await api(path+'/accept-stage','POST',expected(await api(path)));save(`${label}-S2`,s2);
      assert.equal(s2.activeStage.parentStageId,s1.activeStage.id);assert.equal(s2.activeStage.configRevisionId,admitted.currentConfigRevisionId);
      assert.deepEqual(s2.draft.tasks.filter((t:any)=>t.taskId!==added.id),s1.draft.tasks);
      const oldTask=s1.draft.tasks.find((t:any)=>t.startPlanned),newTask=s2.draft.tasks.find((t:any)=>t.taskId===added.id);
      assert.ok(oldTask.endPlanned<=newTask.startPlanned);
      if(!main)assert.deepEqual(oldTask.assignedResourceIds,newTask.assignedResourceIds);
      const restored=await api(path+'/rollback','POST',{targetStageId:s1.activeStage.id});save(`${label}-rollback`,restored);
      assert.deepEqual(restored.activeStage,s1.activeStage);assert.deepEqual(restored.draft,admitted.draft);
      assert.deepEqual(restored.workingOrigin.pendingLaterTaskIds,[added.id]);assert.equal(restored.currentConfigRevisionId,admitted.currentConfigRevisionId);
      const redone=await api(path+'/redo','POST',{});save(`${label}-redo`,redone);assert.deepEqual(redone.activeStage,s2.activeStage);assert.deepEqual(redone.draft,s2.draft);
      const restoredS0=await api(path+'/rollback','POST',{targetStageId:start.activeStage.id});save(`${label}-rollback-S0`,restoredS0);
      assert.deepEqual(restoredS0.activeStage,start.activeStage);assert.equal(restoredS0.draft.tasks.length,s2.draft.tasks.length);assert.ok(restoredS0.draft.tasks.every((t:any)=>t.startPlanned===null));
      const redoS1=await api(path+'/redo','POST',{});save(`${label}-redo-S1`,redoS1);assert.deepEqual(redoS1.draft,admitted.draft);
      assert.deepEqual((await api(path+'/redo','POST',{})).draft,s2.draft);
      // Reality of execution takes precedence over checkpoint restoration.
      for(const status of ['done','in_progress']){
        await db.query('BEGIN');
        try{const conflict=await sqlReceipt(`${label}-execution-conflict-${status}`,async()=>{await db.query('UPDATE public.daily_tasks SET status=$2 WHERE id=$1',[added.id,status]);
          return (await db.query('SELECT public.assisted_move_stage($1,$2,false)',[planId,s1.activeStage.id])).rows;});assert.equal(conflict.message,'RESTORE_EXECUTION_CONFLICT');}finally{await db.query('ROLLBACK');}
      }
      await api(path+'/rollback','POST',{targetStageId:s1.activeStage.id});
      const branchRun=await propose(path,[added.id]);assert.equal(branchRun.assisted_result_json?.outcome,'PROPOSAL');
      await api(path+`/proposals/${branchRun.id}/apply`,'POST',expected(await api(path)));
      await api(path+'/validate','POST',expected(await api(path)));
      const branch=await api(path+'/accept-stage','POST',expected(await api(path)));save(`${label}-branch`,branch);
      assert.equal(branch.activeStage.parentStageId,s1.activeStage.id);
      assert.ok(branch.history.find((t:any)=>t.id===s2.activeStage.id).archivedAt);
      assert.deepEqual(branch.history.find((t:any)=>t.id===s1.activeStage.id),s1.activeStage);
      save(`${label}-history`,await api(path+'/history'));save(`${label}-daily`,await api(`/api/plans/${planId}/tasks`));
      // A further scope starts from the U2 Stage normally.
      const continuation=await propose(path,[pending.id]);save(`${label}-continuation`,continuation);assert.equal(continuation.assisted_result_json?.outcome,'PROPOSAL');
      await page.reload();await page.screenshot({path:`${directory}/${label}-S2.png`,fullPage:true});
      if(!main){
        await api(path+'/draft','PATCH',{...expected(await api(path)),changes:[{taskId:added.id,startPlanned:oldTask.startPlanned,endPlanned:oldTask.endPlanned}]});
        await api(path+'/validate','POST',expected(await api(path)));
        const exceptionStage=await api(path+'/accept-stage','POST',{...expected(await api(path)),confirmation:'HARD_EXCEPTIONS'});save('B-exception-stage',exceptionStage);
        assert.ok(exceptionStage.validation===null);assert.ok(exceptionStage.acceptedExceptions.length>0);
        const later=await add(addition,other);const review=await api(path+'/bootstrap-additions');assert.equal(review.allowed,true,JSON.stringify(review));
        const expanded=await api(path+'/bootstrap-additions','POST',{...expected(exceptionStage),expectedSessionId:exceptionStage.session.id,expectedConfigRevisionId:exceptionStage.currentConfigRevisionId,sourceToken:review.sourceToken,addedTaskIds:review.addedTaskIds,confirmation:'INCORPORATE_NEW_TASKS'});save('B-exception-admission',expanded);
        assert.deepEqual(expanded.acceptedExceptions,exceptionStage.acceptedExceptions);
        const laterRun=await propose(path,[later.id]);save('B-exception-proposal',laterRun);assert.equal(laterRun.assisted_result_json?.outcome,'PROPOSAL');
        await proposalAttacks({db,run:laterRun,state:expanded,planId,addedId:later.id,directory,label:'B-exception'});
        await api(path+`/proposals/${laterRun.id}/apply`,'POST',expected(expanded));
        await api(path+'/validate','POST',expected(await api(path)));
        const beforeInheritedAccept=await api(path);
        await db.query('BEGIN');try{const staleAccept=await sqlReceipt('B-stale-exception-accept',async()=>{
          await db.query("UPDATE public.planning_accepted_exceptions SET status='STALE',resolved_at=now() WHERE stage_id=$1",[exceptionStage.activeStage.id]);
          await db.query('SET LOCAL ROLE service_role');return (await db.query("SELECT public.assisted_accept_stage($1,$2,$3,$4,'NONE')",[planId,users.admin.id,beforeInheritedAccept.draftFingerprint,beforeInheritedAccept.draftBaseStageId])).rows;
        });assert.equal(staleAccept.message,'STALE_VALIDATION');}finally{await db.query('ROLLBACK');}
        const continued=await api(path+'/accept-stage','POST',expected(await api(path)));save('B-exception-continuation',continued);
        assert.equal(continued.activeStage.validationSummaryJson.hardValid,false);
        assert.ok(continued.activeStage.validationSummaryJson.hardCount>0);
        assert.equal(continued.activeStage.validationSummaryJson.report.newHardCount,0);
        await db.query('BEGIN');try{const staleException=await sqlReceipt('B-stale-exception',async()=>{
          await db.query("UPDATE public.planning_accepted_exceptions SET status='STALE',resolved_at=now() WHERE stage_id=$1",[exceptionStage.activeStage.id]);
          await db.query('SET LOCAL ROLE service_role');return (await db.query('SELECT public.assisted_inherited_violation_report($1,$2,$3,$4)',[continued.session.id,continued.activeStage.id,continued.draft,JSON.stringify(laterRun.assisted_result_json.evidence.violations)])).rows;
        });assert.equal(staleException.message,'VALIDATION_NOT_ACCEPTABLE');}finally{await db.query('ROLLBACK');}
        // A later task creates a different material violation, requiring a new decision.
        await api(path+'/draft','PATCH',{...expected(continued),changes:[{taskId:later.id,startPlanned:oldTask.startPlanned,endPlanned:oldTask.endPlanned}]});
        await api(path+'/validate','POST',expected(await api(path)));
        const newViolation=await api(path);save('B-new-violation',newViolation.validation);assert.ok(newViolation.validation.reportJson.newHardCount>0);
        const refused=await request(path+'/accept-stage','POST',expected(newViolation));save('B-new-violation-refused',refused);assert.equal(refused.status,422);
        // Returning the Draft to the working origin preserves the exception lineage.
        await api(path+'/draft/reset','POST',expected(newViolation));
        await api(path+'/draft','PATCH',{...expected(await api(path)),changes:[{taskId:added.id,startPlanned:'10:00',endPlanned:'10:30'}]});
        await api(path+'/validate','POST',expected(await api(path)));
        const superseded=await api(path+'/accept-stage','POST',expected(await api(path)));save('B-superseded',superseded);
        const exceptions=(await db.query('SELECT id,status FROM public.planning_accepted_exceptions WHERE stage_id=$1',[exceptionStage.activeStage.id])).rows;
        save('B-exception-lifecycle',exceptions);assert.ok(exceptions.every((e:any)=>e.status==='SUPERSEDED'));

      }
      days.push({label,planId,sessionId:s1.session.id,addedTaskId:added.id,s1Id:s1.activeStage.id,s2Id:s2.activeStage.id,branchId:branch.activeStage.id});
      pass(`${label}: S1 → UI admission → S2, exact checkpoints, pending overlay, redo and archived branch`);
    }
    save('days',days);return {days,acceptedStages:6};
  }finally{await browser.close();}
}
