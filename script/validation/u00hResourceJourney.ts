import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {buildEngineInput} from '../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {resolveEffectiveTaskResourceAssignments} from '../../engine/planner-next/integration/effectiveTaskResourceAssignments';
import {fingerprintAssistedPlanningSnapshotV1} from '../../server/assistedPlanningSnapshot';
type User={id:string;email:string;password:string;token:string};
export async function runU00hResourceJourney({appUrl,users,db,directory,pass}:{appUrl:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(name:string)=>void}){
  assert.equal(db.host,'127.0.0.1');
  const {storage}=await import('../../server/storage');
  const save=(name:string,value:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(value,null,2));
  const request=async(path:string,method='GET',body?:unknown,role='admin')=>{
    const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users[role].token}`},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,body:await r.json() as any};
  };
  const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
  const poll=async(path:string,id:number)=>{const end=Date.now()+180_000;while(Date.now()<end){const run=await api(`${path}/proposals/${id}`);if(!['pending','running'].includes(run.status))return run;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
  const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
  const zone=await api('/api/zones','POST',{name:'U00h production'});
  const rooms=[];for(let i=0;i<4;i++)rooms.push(await api('/api/spaces','POST',{name:`Station ${i}`,zoneId:zone.id}));
  const type=await api('/api/resource-types','POST',{code:'concrete_equipment',name:'Concrete equipment'});
  // A prior catalog item makes global/daily numeric coincidence insufficient evidence.
  await api('/api/resource-items','POST',{typeId:type.id,name:'Unused equipment'});
  const resources:any[]=[];for(const name of ['Camera A','Recorder B'])resources.push(await api('/api/resource-items','POST',{typeId:type.id,name}));
  await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'14:00',mealStart:'13:00',mealEnd:'14:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const config=await api('/api/new-day-planner-configuration');
  await api('/api/new-day-planner-configuration','PUT',{expectedRevision:config.revision,configuration:{contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:5}});
  const createDay=(date:string)=>api('/api/plans','POST',{date,configuration:{workday:{intent:'INHERIT'},meal:{intent:'INHERIT'},participantTransition:{intent:'OVERRIDE',value:0}}});
  await createDay('2026-12-19');
  const days:any[]=[];
  for(const [index,label] of ['A','B'].entries()){
    const resource=resources[index],templates:any[]=[];
    for(let i=0;i<4;i++)templates.push(await api('/api/task-templates','POST',{name:`${label} operation ${i}`,defaultDuration:index?15:20,spaceId:rooms[i].id,zoneId:zone.id,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}},resourceRequirements:{byItem:{[resource.id]:1}},dependsOnTemplateIds:i>=2?[templates[i-2].id]:[],autoCreateOnContestantCreate:false}));
    const plan=await createDay(`2026-12-${20+index}`),planId=plan.id;
    const participants=[];for(let i=0;i<2;i++)participants.push(await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`${label} person ${i}`,availabilityStart:'09:00',availabilityEnd:'12:00'}));
    const tasks=[];for(let i=0;i<4;i++)tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:templates[i].id,contestantId:participants[i%2].id,spaceId:rooms[i].id,zoneId:zone.id}));
    const inventory=await api(`/api/plans/${planId}/resource-items`),daily=inventory.find((r:any)=>r.resourceItemId===resource.id);assert.ok(daily);
    assert.notEqual(daily.id,resource.id,'catalog and daily identities must differ in both cases');
    await api(`/api/plans/${planId}/resource-items/${daily.id}`,'PATCH',{availabilityStart:index?'09:30':'09:00',availabilityEnd:'12:00'});
    const input=await buildEngineInput(planId,storage),adapter=adaptEngineInputToPlannerNextProblem(input);save(`${label}-input`,input);save(`${label}-adapter`,adapter);save(`${label}-assignments`,resolveEffectiveTaskResourceAssignments(input));
    assert.ok(input.tasks.every(t=>!t.assignedResourceIds?.length&&!t.declaredResourceIds?.length));assert.ok(Object.values(input.spaceResourceAssignments).every(v=>!v.length));assert.ok(Object.values(input.zoneResourceAssignments).every(v=>!v.length));
    assert.equal(adapter.status,'SUPPORTED',JSON.stringify(adapter));if(adapter.status!=='SUPPORTED')throw Error('unsupported');
    if(process.env.OPTIPLAN_U00H_BASELINE!=='1'){
      assert.ok(adapter.problem.tasks.every(t=>JSON.stringify(t.requiredResourceIds)===JSON.stringify([`plan-resource:${daily.id}`])));
      const ready=await api(`/api/plans/${planId}/effective-configuration`);save(`${label}-readiness`,ready);assert.equal(ready.readiness.status,'READY');
    }
    const path=`/api/plans/${planId}/assisted`;await api(path+'/session','POST',{});
    const state=()=>api(path),stages:any[]=[];
    for(const [stage,ids] of (index?[[tasks[0].id],[tasks[1].id,tasks[2].id,tasks[3].id]]:[tasks.map(t=>t.id)]).entries()){
      const before=await state();save(`${label}-S${stage}-state`,before);
      const start=performance.now(),body={...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true};
      const run=await poll(path,(await api(path+'/proposals','POST',body)).runId);save(`${label}-S${stage+1}-run`,run);
      const result=run.assisted_result_json;assert.equal(result?.outcome,'PROPOSAL',JSON.stringify(run));
      if(process.env.OPTIPLAN_U00H_BASELINE==='1'){
        const missing=adapter.problem.tasks.every(t=>!t.requiredResourceIds?.length);
        const proposal=result.proposal;const overlaps=proposal.some((a:any,i:number)=>proposal.slice(i+1).some((b:any)=>a.startPlanned<b.endPlanned&&b.startPlanned<a.endPlanned));
        assert.equal(missing,true);assert.equal(overlaps,true);
        save('causal',{status:'LOSS_REPRODUCED',planId,resourceItemId:resource.id,planResourceItemId:daily.id,supported:true,missingRequiredResourceIds:missing,overlappingTasks:overlaps,proposal,remoteWrites:0});pass('byItem accepted SUPPORTED, absent from canonical requirements, simultaneous competing tasks proposed');return {status:'LOSS_REPRODUCED'};
      }
      const replay=await poll(path,(await api(path+'/proposals','POST',body)).runId);save(`${label}-S${stage+1}-replay`,replay);
      assert.deepEqual(replay.assisted_result_json.proposedDraftSnapshot,result.proposedDraftSnapshot);assert.equal(replay.assisted_result_json.evidence.fingerprint,result.evidence.fingerprint);assert.deepEqual(replay.assisted_result_json.evidence.work,result.evidence.work);
      assert.ok(result.evidence.completeForScope&&result.evidence.hardValid&&result.evidence.requiredValid);
      for(const row of result.proposal)assert.deepEqual(row.assignedResourceIds,[daily.id]);
      for(const row of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(result.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===row.taskId),row);
      const stale=await request(path+`/proposals/${run.id}/apply`,'POST',{...expected(before),expectedDraftFingerprint:'0'.repeat(64)});assert.equal(stale.status,409);
      await api(path+`/proposals/${run.id}/apply`,'POST',expected(before));const draft=await state();save(`${label}-S${stage+1}-draft`,draft);
      const sqlNegatives=[];
      for(const guard of ['draft','base','config','scope','permission']){
        if(guard==='scope'&&stage===0)continue;
        await db.query('BEGIN');
        try{
          if(guard==='scope'){
            const forged=structuredClone(result),protectedRow=forged.proposedDraftSnapshot.tasks.find((t:any)=>!ids.includes(t.taskId)&&t.startPlanned);
            assert.ok(protectedRow);protectedRow.startPlanned='10:55';protectedRow.endPlanned='11:10';
            forged.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(forged.proposedDraftSnapshot);
            await db.query(`UPDATE public.planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(extensions.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') WHERE id=$1`,[run.id,JSON.stringify(forged)]);
            await db.query('UPDATE public.assisted_planning_sessions SET draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$1',[draft.session.id,JSON.stringify(forged.proposedDraftSnapshot),forged.proposedDraftFingerprint]);
          }
          if(guard==='permission')await db.query('SET LOCAL ROLE authenticated');
          let failure:any;try{await db.query('SELECT public.assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,guard==='draft'?'0'.repeat(64):guard==='scope'?(await db.query('SELECT draft_fingerprint FROM public.assisted_planning_sessions WHERE id=$1',[draft.session.id])).rows[0].draft_fingerprint:draft.draftFingerprint,guard==='base'?Number(draft.draftBaseStageId)+999:draft.draftBaseStageId,guard==='config'?Number(draft.currentConfigRevisionId)+999:draft.currentConfigRevisionId]);}catch(e){failure=e;}
          assert.ok(failure,`SQL negative accepted: ${guard}`);assert.match(String(failure.message),/STALE_|RUN_RESULT_INVALID|VALIDATION_NOT_ACCEPTABLE|permission denied/);sqlNegatives.push({guard,rejected:failure.message,canonicalHashesMatched:guard==='scope'});
        }finally{await db.query('ROLLBACK');}
      }
      save(`${label}-S${stage+1}-sql-negatives`,sqlNegatives);assert.deepEqual((await state()).draft,draft.draft);
      await api(path+'/validate','POST',expected(draft));const validated=await state();save(`${label}-S${stage+1}-validation`,validated.validation);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
      await api(path+'/accept-stage','POST',expected(validated));const accepted=await state();save(`${label}-S${stage+1}-stage`,accepted);assert.deepEqual(accepted.activeStage.snapshotJson,result.proposedDraftSnapshot);
      for(const row of accepted.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(row.assignedResourceIds,[daily.id]);
      const persisted=(await db.query('SELECT id,assigned_resource_ids,status FROM public.daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows;
      assert.ok(persisted.every(t=>t.status==='pending'));save(`${label}-S${stage+1}-daily`,persisted);
      for(const row of accepted.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(persisted.find(t=>Number(t.id)===row.taskId).assigned_resource_ids,[daily.id]);
      const rebuilt=adaptEngineInputToPlannerNextProblem(await buildEngineInput(planId,storage));assert.equal(rebuilt.status,'SUPPORTED');if(rebuilt.status==='SUPPORTED')assert.ok(rebuilt.problem.tasks.every(t=>JSON.stringify(t.requiredResourceIds)===JSON.stringify([`plan-resource:${daily.id}`])));
      stages.push({ordinal:stage+1,runId:run.id,elapsedMs:performance.now()-start,fingerprint:result.evidence.fingerprint,work:result.evidence.work});
    }
    const final=await state();assert.ok(final.activeStage.snapshotJson.tasks.every((t:any)=>t.startPlanned));
    const placements=final.activeStage.snapshotJson.tasks;for(let i=0;i<placements.length;i++)for(let j=i+1;j<placements.length;j++)assert.ok(placements[i].endPlanned<=placements[j].startPlanned||placements[j].endPlanned<=placements[i].startPlanned);
    const ordered=[...placements].sort((a:any,b:any)=>a.startPlanned.localeCompare(b.startPlanned)),minute=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
    assert.ok(ordered.slice(1).every((t:any,i:number)=>minute(t.startPlanned)>=minute(ordered[i].endPlanned)+5));
    assert.ok(placements.every((t:any)=>t.startPlanned>=(index?'09:30':'09:00')&&t.endPlanned<='12:00'));
    assert.equal((await request(path+'/accept-stage','POST',expected(final),'viewer')).status,403);
    days.push({label,planId,resourceItemId:resource.id,planResourceItemId:daily.id,completed:placements.length,stages});pass(`API day ${label}: 4/4 through native Stage, same concrete resource and deterministic replay`);
  }
  // A separate API-created day has no available concrete resource, never a substitute.
  const impossible=await createDay('2026-12-22'),candidateTemplates=await api('/api/task-templates');
  const participant=await api(`/api/plans/${impossible.id}/contestants`,'POST',{planId:impossible.id,name:'Unavailable case',availabilityStart:'09:00',availabilityEnd:'12:00'});
  const t=candidateTemplates.find((t:any)=>t.name==='B operation 0');
  await api('/api/daily-tasks','POST',{planId:impossible.id,templateId:t.id,contestantId:participant.id,spaceId:t.spaceId,zoneId:zone.id});
  const unavailable=(await api(`/api/plans/${impossible.id}/resource-items`)).find((r:any)=>r.resourceItemId===resources[1].id);
  await api(`/api/plans/${impossible.id}/resource-items/${unavailable.id}`,'PATCH',{isAvailable:false});
  const negative=adaptEngineInputToPlannerNextProblem(await buildEngineInput(impossible.id,storage));save('unavailable',negative);assert.equal(negative.status,'UNSUPPORTED');assert.ok(negative.reasonCodes.includes('MISSING_RESOURCE_AVAILABILITY'));
  const negativeReady=await api(`/api/plans/${impossible.id}/effective-configuration`);assert.notEqual(negativeReady.readiness.status,'READY');save('unavailable-readiness',negativeReady);
  save('summary',{status:'PASS',days,remoteWrites:0});return {status:'PASS',days,remoteWrites:0};
}
