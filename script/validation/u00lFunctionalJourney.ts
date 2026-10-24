import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../../engine/planner-next/assistedPlanning';
import {preflightEngineInputForPlannerNext} from '../../engine/planner-next/integration/engineInputPreflight';
import {fingerprint} from '../../engine/planner-next/fingerprint';
import {fingerprintAssistedPlanningSnapshotV1} from '../../server/assistedPlanningSnapshot';
type User={id:string;email:string;password:string;token:string};
export async function runU00lFunctionalJourney({appUrl,users,db,directory,pass}:{appUrl:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(name:string)=>void}){
  assert.equal(db.host,'127.0.0.1');const {storage}=await import('../../server/storage');
  const save=(name:string,value:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(value,null,2));
  const request=async(path:string,method='GET',body?:unknown,role='admin')=>{
    const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users[role].token}`},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,body:await r.json() as any};
  };
  const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
  if(process.env.OPTIPLAN_U00L_BEFORE_INTEGRITY!=='1'){
    const security=(await db.query(`SELECT p.prosecdef, p.proconfig,
      has_schema_privilege(role,n.oid,'USAGE') AS schema_usage,
      has_function_privilege(role,p.oid,'EXECUTE') AS executable,role
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
      unnest(ARRAY['anon','authenticated','service_role']) role
      WHERE n.nspname='nominal_resource_private' AND p.proname='guard_nominal_physical_validation'`)).rows;
    assert.equal(security.length,3);
    for(const row of security){assert.equal(row.prosecdef,false);assert.deepEqual(row.proconfig,['search_path=""']);assert.equal(row.schema_usage,false);assert.equal(row.executable,false);}
    assert.equal(Number((await db.query("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='guard_nominal_physical_validation'")).rows[0].count),0);
    save('guard-security',{privateSchema:true,publicRpcAdded:false,roles:security});
  }
  const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
  const poll=async(path:string,id:number)=>{const end=Date.now()+180_000;while(Date.now()<end){const run=await api(`${path}/proposals/${id}`);if(!['pending','running'].includes(run.status))return run;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(30_000);
  const responseFor=(path:string)=>page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');
  try{
  await page.goto(`${appUrl}/login`);await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  const zone=await api('/api/zones','POST',{name:'Nominal production'}),rooms:any[]=[];
  for(let i=0;i<4;i++)rooms.push(await api('/api/spaces','POST',{name:`Nominal station ${i}`,zoneId:zone.id}));
  const type=await api('/api/resource-types','POST',{code:'physical_exclusive',name:'Physical exclusive equipment'});

  const resources:any[]=[];const otherType=await api('/api/resource-types','POST',{code:'independent',name:'Independent'});
  for(const [i,name] of ['A','B','Independent kit'].entries())resources.push(await api('/api/resource-items','POST',{typeId:i<2?type.id:otherType.id,name}));
  await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'14:00',mealStart:'13:00',mealEnd:'14:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const coachTypes=await api('/api/resource-types-with-items');
  const coachType=coachTypes.find((t:any)=>t.code==='vocal_coach')??await api('/api/resource-types','POST',{code:'vocal_coach',name:'Vocal coach'});
  const coach=await api('/api/resource-items','POST',{typeId:coachType.id,name:'Production coach'});
  const otherCoach=await api('/api/resource-items','POST',{typeId:coachType.id,name:'Other production coach'});
  const createDay=(date:string)=>api('/api/plans','POST',{date,configuration:{workday:{intent:'INHERIT'},meal:{intent:'INHERIT'},participantTransition:{intent:'OVERRIDE',value:5}}});
  const days:any[]=[];
  for(const [index,label] of ['A','B'].entries()){
    const mainRoom=index?await api('/api/spaces','POST',{name:'Second Main room',zoneId:zone.id}):rooms[0];
    const tmpl=async(name:string,kind:string,room:any,deps:number[]=[],requirements:any={},duration=10,requiresCoach=false)=>
      api('/api/task-templates','POST',{name:`${label} ${name}`,defaultDuration:duration,spaceId:room.id,zoneId:zone.id,
        participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,requiresCoach,
        rulesJson:{plannerNextOperation:{contractVersion:1,kind}},autoCreateOnContestantCreate:false,resourceRequirements:requirements,dependsOnTemplateIds:deps});
    const arrival=index?null:await tmpl('Arrival','auxiliary',rooms[2]);
    const prep=index?null:await tmpl('Preparation','auxiliary',rooms[3],[arrival.id]);
    const vocal1=await tmpl('Vocal one','vocal',rooms[1],arrival?[arrival.id]:[],{},10,true);
    const vocal2=await tmpl('Vocal two','vocal',rooms[1],arrival?[arrival.id]:[],{},10,true);
    const main1=await tmpl('Main nominal one','main',mainRoom,[vocal1.id,...(prep?[prep.id]:[])],
      index?{byType:{[type.id]:1},byItem:{[resources[2].id]:1}}:{anyOf:[{quantity:1,resourceItemIds:resources.slice(0,2).map(r=>r.id)}]},10,true);
    const main2=await tmpl('Main future two','main',mainRoom,[vocal2.id,...(prep?[prep.id]:[])],index?{byType:{[type.id]:1}}:{},10,true);
    const departure=index?null:await tmpl('Departure','auxiliary',rooms[2]);
    const critical=await tmpl('Critical A','auxiliary',rooms[3],[],{byItem:{[resources[0].id]:1}},30);
    const tail=index?await tmpl('Tail','auxiliary',rooms[2],[main2.id]):null;
    const config=await api('/api/new-day-planner-configuration');
    await api('/api/optimizer-settings','PATCH',{arrivalTaskTemplateName:arrival?.name??'',departureTaskTemplateName:departure?.name??'',
      arrivalMinimumGroupSize:1,arrivalMaximumGroupSize:2,arrivalMinGapMinutes:0,departureMinimumGroupSize:1,departureMaximumGroupSize:2,departureMinGapMinutes:0});
    await api('/api/new-day-planner-configuration','PUT',{expectedRevision:config.revision,configuration:{contractVersion:1,
      scenario:'MAIN_WITH_VOCAL_FEEDER',transport:arrival?{arrivalTemplateId:arrival.id,departureTemplateId:departure.id}:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',
      searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:index?5:0,
      mainFlow:{spaceId:mainRoom.id,preferredEnd:'10:00',continuity:'REQUIRED',maxBlocksByKey:1,minTasksPerBlock:1}}});
    const plan=await createDay(`2027-02-${index+1}`),planId=plan.id;
    const inventory=await api(`/api/plans/${planId}/resource-items`),daily=resources.map(resource=>inventory.find((r:any)=>r.resourceItemId===resource.id));
    const dailyCoach=inventory.find((r:any)=>r.resourceItemId===coach.id);
    const dailyOtherCoach=inventory.find((r:any)=>r.resourceItemId===otherCoach.id);
    const participants:any[]=[];
    for(let i=0;i<3;i++)participants.push(await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`${label} person ${i}`,
      availabilityStart:i===2?'09:35':'09:00',availabilityEnd:i===2?'10:05':'10:30',vocalCoachPlanResourceItemId:i<2?dailyCoach.id:dailyOtherCoach.id}));
    // A singleton critical window, not a placement or lock supplied by the harness.
    await api(`/api/plans/${planId}/spaces/${mainRoom.id}/availability`,'PATCH',{availabilityStart:'09:40',availabilityEnd:'10:00'});
    // Preparation has its own station in the transport day.
    const criticalRoom=await api('/api/spaces','POST',{name:`${label} critical room`,zoneId:zone.id});
    await api(`/api/plans/${planId}/spatial-availability/init`,'POST',{});
    await api(`/api/plans/${planId}/spaces/${criticalRoom.id}/availability`,'PATCH',{availabilityStart:'09:35',availabilityEnd:'10:05'});
    await api(`/api/ta/${critical.id}`,'PATCH',{spaceId:criticalRoom.id});
    // Template snapshots are immutable for this day; the task explicitly selects its daily space.
    if(index){
      await api(`/api/plans/${planId}/resource-items/${daily[1].id}`,'PATCH',{availabilityStart:'09:00',availabilityEnd:'09:50'});
      await api(`/api/plans/${planId}/resource-items/${daily[2].id}`,'PATCH',{availabilityStart:'09:40',availabilityEnd:'09:50'});
      const adhoc=await api(`/api/plans/${planId}/resource-items`,'POST',{typeId:type.id,name:'Future daily ad hoc camera',availabilityStart:'09:50',availabilityEnd:'10:30'});
      daily.push((await api(`/api/plans/${planId}/resource-items`)).find((r:any)=>r.id===adhoc.id));assert.equal(daily[3].resourceItemId,null);
    }
    const templates:any[]=[],tasks:any[]=[];
    const add=async(template:any,participant:any,room:any)=>{templates.push(template);tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:template.id,contestantId:participant.id,spaceId:room.id,zoneId:zone.id}));};
    await add(main1,participants[0],mainRoom);await add(critical,participants[2],criticalRoom);await add(main2,participants[1],mainRoom);
    await add(vocal1,participants[0],rooms[1]);await add(vocal2,participants[1],rooms[1]);
    if(index)await add(tail,participants[1],rooms[2]);
    else for(let i=0;i<2;i++){await add(arrival,participants[i],rooms[2]);await add(prep,participants[i],rooms[3]);await add(departure,participants[i],rooms[2]);}
    const input=await buildEngineInput(planId,storage),adapter=adaptEngineInputToPlannerNextProblem(input);
    save(`${label}-input`,input);save(`${label}-adapter`,adapter);assert.equal(adapter.status,'SUPPORTED',JSON.stringify(adapter));
    const path=`/api/plans/${planId}/assisted`;await api(path+'/session','POST',{});const stages:any[]=[];
    for(const [stage,ids] of (index?[[tasks[0].id,tasks[3].id],tasks.filter((t:any)=>t.id!==tasks[0].id&&t.id!==tasks[3].id).map(t=>t.id)]:[tasks.map(t=>t.id)]).entries()){
      await page.goto(`${appUrl}/plans/${planId}?tab=planning`);
      const scope=page.getByTestId('section-assisted-scope');await scope.getByRole('checkbox').first().waitFor();
      for(const box of await scope.getByRole('checkbox').all())await box.uncheck();
      for(const id of ids){const name=templates[tasks.findIndex(task=>task.id===id)].name;
        for(const item of await scope.locator('label').filter({hasText:name}).all())await item.getByRole('checkbox').check();}
      const before=await api(path),generating=responseFor(path+'/proposals');
      await page.getByRole('button',{name:'Generar propuesta',exact:true}).click();const generated=await generating;
      assert.equal(generated.status(),202,await generated.text());const body=generated.request().postDataJSON();
      const run=await poll(path,(await generated.json()).runId),result=run.assisted_result_json;
      const action=async(name:string,suffix:string)=>{const pending=responseFor(path+suffix);await page.getByRole('button',{name,exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());};
      save(`${label}-S${stage+1}-run`,run);assert.equal(result?.outcome,'PROPOSAL',JSON.stringify(run));
      assert.ok(result.evidence.completeForScope&&result.evidence.hardValid&&result.evidence.requiredValid);
      const replay=await poll(path,(await api(path+'/proposals','POST',body)).runId);save(`${label}-S${stage+1}-replay`,replay);
      assert.deepEqual(replay.assisted_result_json.proposedDraftSnapshot,result.proposedDraftSnapshot);
      assert.equal(replay.assisted_result_json.evidence.fingerprint,result.evidence.fingerprint);
      assert.deepEqual(replay.assisted_result_json.evidence.work,result.evidence.work);
      for(const old of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(result.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===old.taskId),old);
      if(stage===0){
        const first=result.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===tasks[0].id);
        assert.deepEqual(first.assignedResourceIds,[daily[1].id,...(index?[daily[2].id]:[])].sort((a,b)=>a-b));
        if(index){const future=result.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===tasks[2].id);assert.equal(future.startPlanned,null);assert.deepEqual(future.assignedResourceIds,[]);
          assert.ok(result.evidence.nominalPhysicalFutureWitness.tasks.length===tasks.length);}
      }
      assert.equal((await request(path+`/proposals/${run.id}/apply`,'POST',{...expected(before),expectedDraftFingerprint:'0'.repeat(64)})).status,409);
      await page.getByRole('button',{name:'Aplicar al borrador',exact:true}).waitFor();await action('Aplicar al borrador',`/proposals/${run.id}/apply`);const draft=await api(path);save(`${label}-S${stage+1}-draft`,draft);
      save(`${label}-S${stage+1}-workday`,(await db.query('SELECT replay_snapshot_json FROM public.plan_config_revisions WHERE id=$1',[draft.currentConfigRevisionId])).rows[0].replay_snapshot_json);
      const adversaries:any[]=[];
      const guards=['block-key','blocks-space','coach-missing','coach-changed','coach-unavailable','coach-overlap',...(index?['coach-transition']:[]),'coach-lock','resource-lock','nonexistent',...(index?['fixed-omission']:[]),'omit','double','invented','missing-choice','future-omission','future-collision','future-identity','future-dependencies','type-identity','domain','unavailable','time-lock','space-availability','draft','base','revision','permission',
        ...(index?['independent-byItem','future-availability']:[]),...(index?['outside-scope']:[]),...(stage?['protected']:[])];
      for(const guard of guards){
        await db.query('BEGIN');let failure:any;
        try{
          const forged=structuredClone(result),proof=forged.evidence.nominalPhysicalFutureWitness,
            nominal=proof.tasks.find((t:any)=>t.id===`task:${tasks[0].id}`),
            row=forged.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===tasks[0].id),
            proposal=forged.proposal.find((t:any)=>t.taskId===tasks[0].id);
          const replace=(ids:number[],selected?:number)=>{
            row.assignedResourceIds=ids; if(proposal)proposal.assignedResourceIds=ids;
            nominal.requiredResourceIds=ids.map(id=>`plan-resource:${id}`);
            nominal.nominalResourceChoice.selectedResourceId=selected===undefined?undefined:`plan-resource:${selected}`;
          };
          if(guard==='future-dependencies')proof.tasks.find((t:any)=>t.id===`task:${tasks[1].id}`).dependencies=['task:999'];
          if(guard==='future-identity')proof.tasks.find((t:any)=>t.id===`task:${tasks[1].id}`).participantId='participant:999';
          if(guard==='type-identity')nominal.nominalResourceChoice.requestedResourceTypeId=`resource-type:${otherType.id}`;
          if(guard==='domain')nominal.nominalResourceChoice.resourceIds=[`plan-resource:${daily[1].id}`];
          if(guard==='block-key')nominal.blockKey='plan-resource:999';
          if(guard==='blocks-space')nominal.blocksSpace=false;
          if(guard==='coach-missing')delete nominal.coachId;
          if(guard==='coach-changed')nominal.coachId=`plan-resource:${daily[2].id}`;
          if(guard==='coach-unavailable')await db.query('UPDATE public.plan_resource_items SET is_available=false WHERE id=$1',[dailyCoach.id]);
          const alignScheduledProofRow=(task:any)=>{
            const product=forged.proposedDraftSnapshot.tasks.find((r:any)=>`task:${r.taskId}`===task.id);
            if(!product.startPlanned)return;
            const clock=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
            product.startPlanned=clock(task.start);product.endPlanned=clock(task.end);
            const proposalRow=forged.proposal.find((r:any)=>r.taskId===product.taskId);
            if(proposalRow){proposalRow.startPlanned=product.startPlanned;proposalRow.endPlanned=product.endPlanned;}
          };
          if(guard==='coach-overlap'){
            const mains=proof.tasks.filter((t:any)=>t.kind==='main').sort((a:any,b:any)=>a.start-b.start);
            const feeder=proof.tasks.find((t:any)=>t.kind==='vocal'&&t.participantId===mains[1].participantId);
            feeder.start=mains[0].start;feeder.end=mains[0].end;alignScheduledProofRow(feeder);
          }
          if(guard==='coach-transition'){
            const feeder=proof.tasks.find((t:any)=>t.id===`task:${tasks[3].id}`);feeder.start=nominal.start-10;feeder.end=nominal.start;alignScheduledProofRow(feeder);
          }

          if(guard==='nonexistent')replace([999999],999999);
          if(guard==='fixed-omission')nominal.nominalResourceChoice.fixedResourceIds=[];
          if(guard==='unavailable')await db.query('UPDATE public.plan_resource_items SET is_available=false WHERE id=$1',[daily[1].id]);

          if(guard==='time-lock')await db.query("INSERT INTO public.locks(plan_id,task_id,lock_type,locked_start,locked_end,created_by,reason) VALUES ($1,$2,'time','10:00','10:20',$3,'reverted adversary')",[planId,tasks[0].id,users.admin.id]);
          if(guard==='space-availability')await db.query("UPDATE public.plan_space_settings SET availability_start='10:00',availability_end='12:00' WHERE plan_id=$1 AND space_id=$2",[planId,mainRoom.id]);
          if(guard==='omit')replace([]);
          if(guard==='double')replace([daily[0].id,daily[1].id],daily[1].id);
          if(guard==='invented')replace([daily[2].id],daily[2].id);
          if(guard==='missing-choice')nominal.nominalResourceChoice.selectedResourceId=undefined;
          if(guard==='future-omission')proof.tasks=proof.tasks.filter((t:any)=>t.id!==`task:${tasks[1].id}`);
          if(guard==='future-collision')replace([daily[0].id,...(index?[daily[2].id]:[])],daily[0].id);
          if(guard==='independent-byItem')replace([daily[1].id],daily[1].id);
          if(guard==='future-availability'){const future=proof.tasks.find((t:any)=>t.id===`task:${tasks[2].id}`);future.start=570;future.end=585;}
          if(guard==='protected'||guard==='outside-scope'){
            const target=forged.proposedDraftSnapshot.tasks.find((t:any)=>!ids.includes(t.taskId)&&(guard==='protected'?t.startPlanned:!t.startPlanned))??row;
            target.assignedResourceIds=[daily[0].id];
          }
          if(guard==='protected'){
            forged.scopeTaskIds=[...new Set([...forged.scopeTaskIds,tasks[0].id])].sort((a:any,b:any)=>a-b);
            await db.query('UPDATE public.planning_runs SET scope_task_ids_json=$2 WHERE id=$1',[run.id,JSON.stringify(forged.scopeTaskIds)]);
            await db.query("UPDATE public.assisted_planning_sessions SET draft_scope_json=jsonb_set(draft_scope_json,'{resolvedTaskIds}',$2) WHERE id=$1",[draft.session.id,JSON.stringify(forged.scopeTaskIds)]);
          }
          proof.fingerprint=fingerprint(proof.tasks);
          forged.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(forged.proposedDraftSnapshot);
          await db.query(`UPDATE public.planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(extensions.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') WHERE id=$1`,[run.id,JSON.stringify(forged)]);
          await db.query('UPDATE public.assisted_planning_sessions SET draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$1',[draft.session.id,JSON.stringify(forged.proposedDraftSnapshot),forged.proposedDraftFingerprint]);
          if(guard==='coach-lock'||guard==='resource-lock')try{await db.query("INSERT INTO public.locks(plan_id,task_id,lock_type,locked_resource_id,created_by,reason) VALUES ($1,$2,'resource',$3,$4,'rollback only')",[planId,tasks[0].id,guard==='coach-lock'?dailyOtherCoach.id:daily[0].id,users.admin.id]);}catch(error){failure=error;}
          if(guard==='permission')await db.query('SET LOCAL ROLE authenticated');
          if(!failure)try{await db.query('SELECT public.assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,guard==='draft'?'0'.repeat(64):forged.proposedDraftFingerprint,
            guard==='base'?draft.draftBaseStageId+999:draft.draftBaseStageId,guard==='revision'?draft.currentConfigRevisionId+999:draft.currentConfigRevisionId]);}catch(error){failure=error;}
          if(process.env.OPTIPLAN_U00L_BEFORE_INTEGRITY==='1'&&guard==='omit'){
            assert.equal(failure,undefined);save('sql-omission-before-111',{accepted:true,hashesRecomputed:true,rolledBack:true});
            pass('before 111: recalculated resource omission accepted by existing RPC; transaction rolled back');
            return {status:'SQL_OMISSION_REPRODUCED',remoteWrites:0};
          }
          assert.ok(failure,`SQL accepted forged ${guard}`);
          if(index&&stage===0&&(guard==='coach-overlap'||guard==='coach-transition'))assert.match(failure.message,/COACH_OVERLAP_OR_TRANSITION/);

          assert.match(String(failure.message),guard==='coach-lock'||guard==='resource-lock'?/RUN_RESULT_INVALID|locks_locked_resource_id_fkey/:/RUN_RESULT_INVALID|STALE_|permission denied/);
          adversaries.push({guard,error:failure.message,hashesRecomputed:true,rolledBack:true});
        }finally{await db.query('ROLLBACK');}
      }
      save(`${label}-S${stage+1}-sql-adversaries`,adversaries);assert.deepEqual((await api(path)).draft,draft.draft);
      await db.query('BEGIN');
      try{await db.query('SELECT public.assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,draft.draftFingerprint,draft.draftBaseStageId,draft.currentConfigRevisionId]);}
      catch(error:any){save(`${label}-S${stage+1}-positive-sql-diagnostic`,{message:error.message,where:error.where,code:error.code});}
      finally{await db.query('ROLLBACK');}
      await action('Validar borrador','/validate');const validated=await api(path);save(`${label}-S${stage+1}-validation`,validated.validation);
      assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
      await action('Aceptar etapa','/accept-stage');const accepted=await api(path);save(`${label}-S${stage+1}-stage`,accepted);
      assert.deepEqual(accepted.activeStage.snapshotJson,result.proposedDraftSnapshot);
      const rows=(await db.query('SELECT id,assigned_resource_ids,status FROM public.daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows;save(`${label}-S${stage+1}-daily`,rows);
      for(const row of accepted.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(rows.find(t=>Number(t.id)===row.taskId).assigned_resource_ids,row.assignedResourceIds);
      assert.ok(rows.every(row=>row.status==='pending'));
      assert.equal(Number((await db.query('SELECT count(*) FROM public.locks WHERE plan_id=$1',[planId])).rows[0].count),0);
      if(index&&stage===0)assert.deepEqual(rows.find(row=>Number(row.id)===tasks[2].id).assigned_resource_ids,[]);
      const rebuilt=adaptEngineInputToPlannerNextProblem(await buildEngineInput(planId,storage));save(`${label}-S${stage+1}-rebuilt`,rebuilt);assert.equal(rebuilt.status,'SUPPORTED',JSON.stringify(rebuilt));
      if(index&&stage===1)assert.deepEqual(rows.find(row=>Number(row.id)===tasks[2].id).assigned_resource_ids,[daily[3].id]);
      if(index&&stage===0&&rebuilt.status==='SUPPORTED')assert.equal(rebuilt.problem.tasks.find(t=>t.id===`task:${tasks[2].id}`)?.nominalResourceChoice?.selectedResourceId,undefined);
      await page.screenshot({path:`${directory}/${label}-S${stage+1}-accepted.png`,fullPage:true});
      stages.push({stage:stage+1,fingerprint:result.evidence.fingerprint,work:result.evidence.work});
    }
    const final=await api(path);assert.ok(final.activeStage.snapshotJson.tasks.every((t:any)=>t.startPlanned));
    assert.equal((await request(path+'/accept-stage','POST',expected(final),'viewer')).status,403);
    days.push({label,planId,obligations:tasks.length,resources:daily.map(r=>r.id),stages});pass(`nominal API day ${label}: ${tasks.length}/${tasks.length} through Stage`);
  }
  save('summary',{status:'PASS',days,remoteWrites:0});return {status:'PASS',days,remoteWrites:0};
  }finally{await browser.close();}
}
