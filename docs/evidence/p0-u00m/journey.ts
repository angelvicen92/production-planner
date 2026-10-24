import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type pg from 'pg';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {buildEffectivePlanConfigRevisionV1,projectEffectiveAuthoritiesFromEngineInputV1} from '../../../server/effectivePlanConfigRevision';
import {buildEffectivePlanConfigReplaySnapshotV1} from '../../../server/assistedPlanningConfigRevision';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {AssistedProposalService,type AssistedProposalRunAccess} from '../../../server/assistedProposalService';
import {executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';

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
    const zone=await api('/api/zones','POST',{name:'U00m production'});
    const rooms:any[]=[];for(let i=0;i<4;i++)rooms.push(await api('/api/spaces','POST',{name:`U00m room ${i}`,zoneId:zone.id}));
    const types=await api('/api/resource-types-with-items');
    const coachType=types.find((t:any)=>t.code==='vocal_coach')??await api('/api/resource-types','POST',{code:'vocal_coach',name:'Coach'});
    const coach=await api('/api/resource-items','POST',{typeId:coachType.id,name:'U00m coach'});
    const physicalType=await api('/api/resource-types','POST',{code:'u00m_physical',name:'U00m exclusive'});
    const physical=await api('/api/resource-items','POST',{typeId:physicalType.id,name:'U00m camera'});
    for(const label of ['A','B']){
      const main=label==='A';
      const template=async(name:string,kind:string,room:any,deps:number[]=[],resources:any={},duration=20,requiresCoach=false)=>api('/api/task-templates','POST',{
        name:`U00m ${label} ${name}`,defaultDuration:duration,spaceId:room.id,zoneId:zone.id,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,
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
      const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`U00m ${label} participant`,availabilityStart:'09:00',availabilityEnd:'12:00',...(main?{vocalCoachPlanResourceItemId:dailyCoach.id}:{})});
      const other=main?person:await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:'U00m B competing participant',availabilityStart:'09:00',availabilityEnd:'12:00'});
      const add=(t:any,p=person)=>api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id});
      const initial=[await add(first),...(main?[await add(second)]:[])],pending=await add(reserve);
      const start=await api(path+'/session','POST',{});save(`${label}-S0`,start);
      const original=await identity(planId);save(`${label}-before-identity`,original);
      save(`${label}-effective-before`,await api(`/api/plans/${planId}/effective-configuration`));
      const run=await propose(path,initial.map(t=>t.id));save(`${label}-S1-proposal`,run);assert.equal(run.assisted_result_json?.outcome,'PROPOSAL',JSON.stringify(run));
      await db.query('BEGIN');
      try{
        await sqlReceipt(`${label}-S0-running-negative`,async()=>{
          await db.query("UPDATE public.planning_runs SET status='running' WHERE id=$1",[run.id]);
          const p=(await db.query('SELECT public.assisted_preview_bootstrap_additions($1) v',[planId])).rows[0].v;
          assert.equal(p.reason,'REBOOTSTRAP_PENDING_PROPOSAL');return p;
        });
        await sqlReceipt(`${label}-S0-modification-negative`,async()=>{
          await db.query("UPDATE public.planning_runs SET status='error' WHERE id=$1",[run.id]);
          await db.query('UPDATE public.daily_tasks SET duration_override=99 WHERE id=$1',[initial[0].id]);
          const p=(await db.query('SELECT public.assisted_preview_bootstrap_additions($1) v',[planId])).rows[0].v;
          assert.equal(p.reason,'REBOOTSTRAP_TASK_CHANGED_OR_REMOVED');return p;
        });
        await sqlReceipt(`${label}-S0-protected-negative`,async()=>{
          await db.query("UPDATE public.planning_runs SET status='error' WHERE id=$1",[run.id]);
          await db.query("UPDATE public.daily_tasks SET status='done' WHERE id=$1",[initial[0].id]);
          const p=(await db.query('SELECT public.assisted_preview_bootstrap_additions($1) v',[planId])).rows[0].v;
          assert.equal(p.reason,'REBOOTSTRAP_PROTECTED_DAY');return p;
        });
      }finally{await db.query('ROLLBACK');}
      await api(path+`/proposals/${run.id}/apply`,'POST',expected(start));const draft=await api(path);save(`${label}-S1-draft`,draft);
      assert.ok((await api(`/api/plans/${planId}/tasks`)).every((t:any)=>!t.startPlanned));
      await api(path+'/validate','POST',expected(draft));const validated=await api(path);save(`${label}-S1-validation`,validated.validation);
      let s1=await api(path+'/accept-stage','POST',expected(validated));assert.equal(s1.activeStage.ordinal,1);
      const acceptedStage=s1.activeStage;
      save(`${label}-control-rollback`,await api(path+'/rollback','POST',{targetStageId:start.activeStage.id}));
      s1=await api(path+'/redo','POST',{});save(`${label}-control-redo`,s1);save(`${label}-S1`,s1);
      assert.deepEqual(s1.activeStage,acceptedStage);
      const beforeSources=await sources(planId);save(`${label}-sources-S1`,beforeSources);
      const oldProposal=await propose(path,[pending.id]);save(`${label}-old-proposal`,oldProposal);assert.equal(oldProposal.assisted_result_json?.outcome,'PROPOSAL');
      // The obligation is genuinely created AFTER an accepted S1, through the product API.
      const added=await add(addition,other);save(`${label}-new-task`,added);
      const after=await identity(planId),afterSources=await sources(planId),state=await api(path);save(`${label}-after-identity`,after);save(`${label}-sources-after`,afterSources);save(`${label}-after`,state);
      save(`${label}-effective-after`,await api(`/api/plans/${planId}/effective-configuration`));
      assert.notEqual(after.identity.configurationFingerprint,original.identity.configurationFingerprint);
      assert.deepEqual(state,s1); // New obligations do not mutate session, revision or historical checkpoints.
      assert.deepEqual(afterSources.daily_tasks.filter((t:any)=>t.id!==added.id),beforeSources.daily_tasks);
      const {daily_tasks:_beforeTasks,...beforeOther}=beforeSources,{daily_tasks:_afterTasks,...afterOther}=afterSources;
      assert.deepEqual(afterOther,beforeOther);
      assert.equal(afterSources.daily_tasks.find((t:any)=>t.id===added.id).start_planned,null);
      const preview=await api(path+'/bootstrap-additions');save(`${label}-preview`,preview);assert.equal(preview.reason,'REBOOTSTRAP_ACCEPTED_STAGE');
      const confirmation={...expected(state),expectedSessionId:state.session.id,expectedConfigRevisionId:state.currentConfigRevisionId,sourceToken:preview.sourceToken,confirmation:'INCORPORATE_NEW_TASKS'};
      const rejected=await request(path+'/bootstrap-additions','POST',confirmation);save(`${label}-incorporate`,rejected);assert.equal(rejected.body.code,'REBOOTSTRAP_ACCEPTED_STAGE');
      const newRun=await request(path+'/proposals','POST',{...expected(state),selector:{kind:'TASK_IDS',taskIds:[added.id]},includePrerequisites:true});save(`${label}-new-run`,newRun);assert.equal(newRun.body.code,'STALE_CONFIG_REVISION');
      const oldIdsRun=await propose(path,[pending.id]);save(`${label}-existing-run-after-add`,oldIdsRun);assert.equal(oldIdsRun.status,'error');assert.match(oldIdsRun.message,/STALE_CONFIG_REVISION/);
      const validationAfter=await request(path+'/validate','POST',expected(state));save(`${label}-validate-after`,validationAfter);assert.equal(validationAfter.body.code,'STALE_CONFIG_REVISION');
      const stale=await request(path+`/proposals/${oldProposal.id}/apply`,'POST',{...expected(state),expectedDraftFingerprint:'0'.repeat(64)});save(`${label}-CAS`,stale);assert.equal(stale.body.code,'STALE_DRAFT');
      const denied=await request(path+'/bootstrap-additions','POST',confirmation,'viewer');save(`${label}-permissions`,denied);assert.equal(denied.status,403);
      const rollback=await request(path+'/rollback','POST',{targetStageId:start.activeStage.id});save(`${label}-rollback`,rollback);assert.equal(rollback.body.code,'TASK_SET_MISMATCH');
      save(`${label}-redo`,await request(path+'/redo','POST',{}));
      save(`${label}-history`,await api(path+'/history'));save(`${label}-history-timings`,await api(path+'/history/timings'));
      await page.goto(`${appUrl}/plans/${planId}?tab=planning`);await page.getByText('Nuevas tareas pendientes de incorporar a Assisted',{exact:false}).first().waitFor({timeout:30000});
      await page.screenshot({path:`${directory}/${label}-post-S1.png`,fullPage:true});
      pass(`${label}: S1 real, pure API addition, red preview/run/validation/rollback, immutable history`);

      // Ephemeral dependency injection bypasses ONLY the effective-fingerprint comparison.
      // No run or stage from these simulations is persisted or accepted.
      const simulatedRun={...oldProposal,scope_task_ids_json:[added.id],scope_json:{selector:{kind:'TASK_IDS',taskIds:[added.id]},metadata:{}},include_prerequisites:true};
      let captured:any;
      const access:AssistedProposalRunAccess={create:async()=>{throw Error('forbidden');},find:async()=>({data:simulatedRun,error:null}),fail:async()=>{throw Error('forbidden');},apply:async()=>{throw Error('forbidden');},finish:async(_p,_r,result)=>{captured=result;return {error:null};}};
      const prior=await storage.getPlanConfigRevision(state.currentConfigRevisionId);
      const simulated=new AssistedProposalService(storage,()=>{},access,executeAssistedPlanning,{buildInput:async()=>after.input,buildConfigRevision:()=>prior!.identityJson as any});
      await simulated.run(planId,Number(oldProposal.id));save(`${label}-counterfactual-old-origin`,{bypass:'effective identity comparison only via dependency injection; no persistence',result:captured});
      assert.equal(captured.outcome,'PROPOSAL');assert.ok(captured.proposal.some((t:any)=>t.taskId===added.id));assert.ok(!captured.proposedDraftSnapshot.tasks.some((t:any)=>t.taskId===added.id));
      const currentSnapshot=buildAssistedPlanningSnapshotV1(await storage.getTasksForPlan(planId));
      const expanded={...state.draft,tasks:[...state.draft.tasks,currentSnapshot.tasks.find(t=>t.taskId===added.id)!].sort((a:any,b:any)=>a.taskId-b.taskId)};
      const expandedFp=fingerprintAssistedPlanningSnapshotV1(expanded);
      save(`${label}-expanded-working-snapshot`,{snapshot:expanded,fingerprint:expandedFp,historicalStageUnchanged:true});
      const expandedStorage=new Proxy(storage,{get(target,key){
        if(key==='getActiveAssistedPlanningSession')return async()=>({...state.session,draftSnapshotJson:expanded,draftFingerprint:expandedFp});
        const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
      }});
      const expandedService=new AssistedProposalService(expandedStorage,()=>{},access);
      await assert.rejects(()=>expandedService.request(planId,{expectedDraftFingerprint:expandedFp,expectedBaseStageId:state.draftBaseStageId,selector:{kind:'TASK_IDS',taskIds:[added.id]},includePrerequisites:true}),error=>{
        save(`${label}-expanded-draft-request`,{bypass:'ephemeral session read contains enlarged Draft only',code:(error as any).code});return (error as any).code==='DIRTY_DRAFT';
      });
      await db.query('BEGIN');
      try{
        await sqlReceipt(`${label}-SQL-CAS`,async()=> (await db.query('SELECT public.assisted_rebootstrap_additions($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [planId,users.admin.id,state.session.id,state.draftBaseStageId,'0'.repeat(64),state.currentConfigRevisionId,preview.sourceToken,after.identity,after.replay,expanded,expandedFp])).rows);
        await sqlReceipt(`${label}-SQL-stale-source-token`,async()=>{
          await db.query('UPDATE public.daily_tasks SET duration_override=99 WHERE id=$1',[added.id]);
          return (await db.query('SELECT public.assisted_rebootstrap_additions($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
            [planId,users.admin.id,state.session.id,state.draftBaseStageId,state.draftFingerprint,state.currentConfigRevisionId,preview.sourceToken,after.identity,after.replay,expanded,expandedFp])).rows;
        });
        await sqlReceipt(`${label}-SQL-old-proposal-apply`,async()=> (await db.query('SELECT public.assisted_apply_proposal($1,$2,$3,$4)',[planId,oldProposal.id,state.draftFingerprint,state.draftBaseStageId])).rows);
        await sqlReceipt(`${label}-SQL-accept-after-old-apply`,async()=>{
          await db.query('SELECT public.assisted_apply_proposal($1,$2,$3,$4)',[planId,oldProposal.id,state.draftFingerprint,state.draftBaseStageId]);
          const p=oldProposal.assisted_result_json;
          await db.query('SELECT public.assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,p.proposedDraftFingerprint,state.draftBaseStageId,state.currentConfigRevisionId]);
          return (await db.query("SELECT public.assisted_accept_stage($1,$2,$3,$4,'NONE')",[planId,users.admin.id,p.proposedDraftFingerprint,state.draftBaseStageId])).rows;
        });
        await sqlReceipt(`${label}-SQL-manual-extend`,async()=> (await db.query('SELECT public.assisted_patch_draft($1,$2,$3,$4,$5)',[planId,state.draftFingerprint,state.draftBaseStageId,expanded,expandedFp])).rows);
        await sqlReceipt(`${label}-SQL-apply-snapshot`,async()=> (await db.query('SELECT public.assisted_apply_snapshot($1,$2)',[planId,state.draft])).rows);
        await sqlReceipt(`${label}-SQL-redo-across-task-set`,async()=>{
          await db.query('UPDATE public.assisted_planning_sessions SET active_stage_id=$1,draft_base_stage_id=$1,draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$4',[start.activeStage.id,start.draft,start.draftFingerprint,state.session.id]);
          return (await db.query('SELECT public.assisted_move_stage($1,NULL,true)',[planId])).rows;
        });
        await sqlReceipt(`${label}-SQL-expanded-draft-old-proposal`,async()=>{
          await db.query('UPDATE public.assisted_planning_sessions SET draft_snapshot_json=$1,draft_fingerprint=$2 WHERE id=$3',[expanded,expandedFp,state.session.id]);
          return (await db.query('SELECT public.assisted_apply_proposal($1,$2,$3,$4)',[planId,oldProposal.id,expandedFp,state.draftBaseStageId])).rows;
        });
        await sqlReceipt(`${label}-SQL-updated-revision-old-proposal`,async()=>{
          const revision=(await db.query("INSERT INTO public.plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,created_by) VALUES($1,$2,'DIAGNOSTIC_ROLLED_BACK',$3,$4,$5,$6) RETURNING id",
            [planId,state.currentConfigRevisionId,after.identity.configurationFingerprint,after.identity,after.replay,users.admin.id])).rows[0].id;
          await db.query('UPDATE public.assisted_planning_sessions SET current_config_revision_id=$1 WHERE id=$2',[revision,state.session.id]);
          return (await db.query('SELECT public.assisted_apply_proposal($1,$2,$3,$4)',[planId,oldProposal.id,state.draftFingerprint,state.draftBaseStageId])).rows;
        });
        await sqlReceipt(`${label}-SQL-replacement-session`,async()=>{
          const snapshot=buildAssistedPlanningSnapshotV1(await storage.getTasksForPlan(planId));
          await db.query("UPDATE public.assisted_planning_sessions SET status='CLOSED' WHERE id=$1",[state.session.id]);
          const newId=(await db.query('SELECT public.assisted_bootstrap_session($1,$2,$3,$4,$5,$6) id',[planId,users.admin.id,after.identity,after.replay,snapshot,fingerprintAssistedPlanningSnapshotV1(snapshot)])).rows[0].id;
          const newSession=(await db.query('SELECT * FROM public.assisted_planning_sessions WHERE id=$1',[newId])).rows[0];
          const link=(await db.query('SELECT previous_session_id FROM public.assisted_bootstrap_sources WHERE session_id=$1',[newId])).rows[0];
          const history=(await db.query('SELECT * FROM public.assisted_planning_stages WHERE session_id=$1 ORDER BY ordinal',[newId])).rows;
          await db.query('SAVEPOINT cross_session');let rollbackError:string|null=null;
          try{await db.query('SELECT public.assisted_move_stage($1,$2,false)',[planId,s1.activeStage.id]);}catch(e:any){rollbackError=e.message;}
          await db.query('ROLLBACK TO SAVEPOINT cross_session');
          assert.equal(rollbackError,'INVALID_STAGE_TARGET');
          return {discarded:true,newSession,link,history,oldStageStillPresent:(await db.query('SELECT * FROM public.assisted_planning_stages WHERE id=$1',[s1.activeStage.id])).rows[0],rollbackError};
        });
        const definition=(await db.query("SELECT pg_get_functiondef('public.assisted_preview_bootstrap_additions(integer)'::regprocedure) d")).rows[0].d;
        let modified=definition;const replacements=[
          ["IF base.ordinal IS DISTINCT FROM 0 OR s.draft_base_stage_id IS DISTINCT FROM base.id\n  OR EXISTS(SELECT 1 FROM public.assisted_planning_stages WHERE session_id=s.id AND ordinal>0)","IF false"],
          ["ELSIF EXISTS(SELECT 1 FROM public.planning_runs WHERE plan_id=p_plan_id AND\n  (status IN ('queued','running','cancelling') OR (assisted_session_id=s.id AND status='success' AND assisted_result_json->>'outcome'='PROPOSAL')))","ELSIF false"]
        ];
        for(const [i,[from,to]] of replacements.entries()){
          assert.equal(modified.split(from).length,2);const before=modified;modified=modified.replace(from,to);await db.query(modified);
          const observation=(await db.query('SELECT public.assisted_preview_bootstrap_additions($1) v',[planId])).rows[0].v;
          save(`${label}-guard-ablation-${i+1}`,{discarded:true,beforeSha256:sha(before),afterSha256:sha(modified),from,to,observation});
        }
        save(`${label}-guard-definitions`,{before:definition,after:modified});
        // A real modification is distinguishable from a pure addition against the S1 source frontier.
        const changed=await sqlReceipt(`${label}-modified-task-negative`,async()=>{
          await db.query('UPDATE public.daily_tasks SET duration_override=99 WHERE id=$1',[initial[0].id]);
          const current=await sources(planId);const old=beforeSources.daily_tasks.find((t:any)=>t.id===initial[0].id),now=current.daily_tasks.find((t:any)=>t.id===initial[0].id);
          assert.notDeepEqual(now,old);return {baseline:old,current:now,pureAddition:false,preview:(await db.query('SELECT public.assisted_preview_bootstrap_additions($1) v',[planId])).rows[0].v};
        });assert.equal(changed.ok,true);
        await sqlReceipt(`${label}-protected-task-negative`,async()=>{
          await db.query("UPDATE public.daily_tasks SET status='done' WHERE id=$1",[initial[0].id]);
          const current=(await sources(planId)).daily_tasks.find((t:any)=>t.id===initial[0].id);
          return {current,preview:(await db.query('SELECT public.assisted_preview_bootstrap_additions($1) v',[planId])).rows[0].v};
        });
      }finally{await db.query('ROLLBACK');}
      const {Client}=await import('pg'),connection=(db as any).connectionParameters;
      const blocker=new Client({host:'127.0.0.1',port:connection.port,user:connection.user,password:connection.password,database:connection.database});
      await blocker.connect();
      try{
        await blocker.query('BEGIN');await blocker.query('UPDATE public.daily_tasks SET duration_override=99 WHERE id=$1',[added.id]);
        await db.query('BEGIN');
        try{await sqlReceipt(`${label}-SQL-writer-contention`,async()=> (await db.query('SELECT public.assisted_read_bootstrap_sources($1,true)',[planId])).rows);}
        finally{await db.query('ROLLBACK');}
      }finally{await blocker.query('ROLLBACK');await blocker.end();}
      assert.deepEqual(await api(path),state);assert.deepEqual(await sources(planId),afterSources);
      days.push({label,planId,sessionId:state.session.id,stageId:s1.activeStage.id,initialTaskIds:initial.map(t=>t.id),pendingTaskId:pending.id,addedTaskId:added.id,
        effectiveFingerprintBefore:original.identity.configurationFingerprint,effectiveFingerprintAfter:after.identity.configurationFingerprint,revisionIdUnchanged:state.currentConfigRevisionId,
        snapshotTaskIds:state.draft.tasks.map((t:any)=>t.taskId),currentTaskIds:after.input.tasks.filter(t=>t.id>0).map(t=>t.id),stagesAfterProbes:(await api(path+'/history')).length});
      pass(`${label}: discarded counterfactuals and SQL rollback preserve every source and Stage`);
    }
    save('days',days);return {days,remoteWrites:0,acceptedDiagnosticS2:0};
  }finally{await browser.close();}
}
