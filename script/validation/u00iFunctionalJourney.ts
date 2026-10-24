import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {fingerprint} from '../../engine/planner-next/fingerprint';
import {fingerprintAssistedPlanningSnapshotV1} from '../../server/assistedPlanningSnapshot';
type User={id:string;email:string;password:string;token:string};
export async function runU00iFunctionalJourney({appUrl,users,db,directory,pass}:{appUrl:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(name:string)=>void}){
  assert.equal(db.host,'127.0.0.1');const {storage}=await import('../../server/storage');
  const save=(name:string,value:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(value,null,2));
  const request=async(path:string,method='GET',body?:unknown,role='admin')=>{
    const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users[role].token}`},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,body:await r.json() as any};
  };
  const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
  if(process.env.OPTIPLAN_U00I_BEFORE_INTEGRITY!=='1'){
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
  await api('/api/resource-items','POST',{typeId:type.id,name:'Unconsumed catalog identity'});
  const resources:any[]=[];for(const name of ['A','B','Independent kit'])resources.push(await api('/api/resource-items','POST',{typeId:type.id,name}));
  await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'14:00',mealStart:'13:00',mealEnd:'14:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const config=await api('/api/new-day-planner-configuration');
  await api('/api/new-day-planner-configuration','PUT',{expectedRevision:config.revision,configuration:{contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:5}});
  const createDay=(date:string)=>api('/api/plans','POST',{date,configuration:{workday:{intent:'INHERIT'},meal:{intent:'INHERIT'},participantTransition:{intent:'OVERRIDE',value:0}}});
  await createDay('2026-12-25');const days:any[]=[];
  for(const [index,label] of ['A','B'].entries()){
    const templates:any[]=[];
    for(let i=0;i<(index?4:2);i++)templates.push(await api('/api/task-templates','POST',{
      name:`${label} ${['Flexible','Critical A','Future flexible','Tail B'][i]}`,defaultDuration:i<2?20:15,
      spaceId:rooms[i].id,zoneId:zone.id,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,
      rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}},autoCreateOnContestantCreate:false,
      resourceRequirements:i===0||i===2?{anyOf:[{quantity:1,resourceItemIds:resources.slice(0,2).map(r=>r.id)}],
        ...(index&&i===0?{byItem:{[resources[2].id]:1}}:{})}:{byItem:{[resources[i===1?0:1].id]:1}},
      dependsOnTemplateIds:i===3?[templates[2].id]:[],
    }));
    const plan=await createDay(`2026-12-${26+index}`),planId=plan.id,participants:any[]=[],tasks:any[]=[];
    for(let i=0;i<(index?3:2);i++)participants.push(await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`${label} person ${i}`,availabilityStart:i<2?'09:00':'09:30',availabilityEnd:i<2?'09:20':'11:00'}));
    for(let i=0;i<templates.length;i++)tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:templates[i].id,contestantId:participants[Math.min(i,2)].id,spaceId:rooms[i].id,zoneId:zone.id}));
    const inventory=await api(`/api/plans/${planId}/resource-items`),daily=resources.map(resource=>inventory.find((r:any)=>r.resourceItemId===resource.id));
    daily.forEach((r,i)=>assert.notEqual(r.id,resources[i].id));
    if(index)await api(`/api/plans/${planId}/resource-items/${daily[1].id}`,'PATCH',{availabilityStart:'09:00',availabilityEnd:'10:30'});
    const input=await buildEngineInput(planId,storage),adapter=adaptEngineInputToPlannerNextProblem(input);
    save(`${label}-input`,input);save(`${label}-adapter`,adapter);assert.equal(adapter.status,'SUPPORTED',JSON.stringify(adapter));
    const path=`/api/plans/${planId}/assisted`;await api(path+'/session','POST',{});const stages:any[]=[];
    for(const [stage,ids] of (index?[[tasks[0].id],tasks.slice(1).map(t=>t.id)]:[tasks.map(t=>t.id)]).entries()){
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
          assert.ok(result.evidence.nominalPhysicalFutureWitness.tasks.length===4);}
      }
      assert.equal((await request(path+`/proposals/${run.id}/apply`,'POST',{...expected(before),expectedDraftFingerprint:'0'.repeat(64)})).status,409);
      await page.getByRole('button',{name:'Aplicar al borrador',exact:true}).waitFor();await action('Aplicar al borrador',`/proposals/${run.id}/apply`);const draft=await api(path);save(`${label}-S${stage+1}-draft`,draft);
      const adversaries:any[]=[];
      const guards=['omit','double','invented','missing-choice','future-omission','future-collision','draft','base','revision','permission',
        ...(index?['independent-byItem','future-transition']:[]),...(index?['outside-scope']:[]),...(stage?['protected']:[])];
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
          if(guard==='omit')replace([]);
          if(guard==='double')replace([daily[0].id,daily[1].id],daily[1].id);
          if(guard==='invented')replace([daily[2].id],daily[2].id);
          if(guard==='missing-choice')nominal.nominalResourceChoice.selectedResourceId=undefined;
          if(guard==='future-omission')proof.tasks=proof.tasks.filter((t:any)=>t.id!==`task:${tasks[1].id}`);
          if(guard==='future-collision')replace([daily[0].id,...(index?[daily[2].id]:[])],daily[0].id);
          if(guard==='independent-byItem')replace([daily[1].id],daily[1].id);
          if(guard==='future-transition'){
            const future=proof.tasks.find((t:any)=>t.id===`task:${tasks[2].id}`),tail=proof.tasks.find((t:any)=>t.id===`task:${tasks[3].id}`);
            future.start=570;future.end=585;future.requiredResourceIds=[`plan-resource:${daily[1].id}`];future.nominalResourceChoice.selectedResourceId=`plan-resource:${daily[1].id}`;
            tail.start=585;tail.end=600;
          }
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
          if(guard==='permission')await db.query('SET LOCAL ROLE authenticated');
          try{await db.query('SELECT public.assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,guard==='draft'?'0'.repeat(64):forged.proposedDraftFingerprint,
            guard==='base'?draft.draftBaseStageId+999:draft.draftBaseStageId,guard==='revision'?draft.currentConfigRevisionId+999:draft.currentConfigRevisionId]);}catch(error){failure=error;}
          if(process.env.OPTIPLAN_U00I_BEFORE_INTEGRITY==='1'&&guard==='omit'){
            assert.equal(failure,undefined);save('sql-omission-before-110',{accepted:true,hashesRecomputed:true,rolledBack:true});
            pass('before 110: recalculated resource omission accepted by existing RPC; transaction rolled back');
            return {status:'SQL_OMISSION_REPRODUCED',remoteWrites:0};
          }
          assert.ok(failure,`SQL accepted forged ${guard}`);assert.match(String(failure.message),/RUN_RESULT_INVALID|STALE_|permission denied/);
          adversaries.push({guard,error:failure.message,hashesRecomputed:true,rolledBack:true});
        }finally{await db.query('ROLLBACK');}
      }
      save(`${label}-S${stage+1}-sql-adversaries`,adversaries);assert.deepEqual((await api(path)).draft,draft.draft);
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
