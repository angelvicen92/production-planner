import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {buildEngineInput} from '../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../../engine/planner-next/assistedPlanning';
import {validatePlan} from '../../engine/planner-next/validate';

type User={id:string;email:string;password:string;token:string};
/** API-created counterfactual. No itinerant units, fixture, seed, or operational SQL. */
export async function runU00iResourceJourney({appUrl,users,db,directory,pass}:{appUrl:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(name:string)=>void}){
  assert.equal(db.host,'127.0.0.1');
  const {storage}=await import('../../server/storage');
  const save=(name:string,value:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(value,null,2));
  const request=async(path:string,method='GET',body?:unknown)=>{
    const response=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users.admin.token}`},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json() as any};
  };
  const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
  const zone=await api('/api/zones','POST',{name:'U00i production'});
  const rooms=[];for(let i=0;i<2;i++)rooms.push(await api('/api/spaces','POST',{name:`Resource station ${i}`,zoneId:zone.id}));
  const type=await api('/api/resource-types','POST',{code:'exclusive_physical',name:'Exclusive physical equipment'});
  await api('/api/resource-items','POST',{typeId:type.id,name:'Unused equipment'});
  const resources:any[]=[];for(const name of ['A','B'])resources.push(await api('/api/resource-items','POST',{typeId:type.id,name}));
  await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'14:00',mealStart:'13:00',mealEnd:'14:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const config=await api('/api/new-day-planner-configuration');
  await api('/api/new-day-planner-configuration','PUT',{expectedRevision:config.revision,configuration:{contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:5}});
  const createDay=(date:string)=>api('/api/plans','POST',{date,configuration:{workday:{intent:'INHERIT'},meal:{intent:'INHERIT'},participantTransition:{intent:'OVERRIDE',value:0}}});
  await createDay('2026-12-23');
  const templates=[];
  for(let i=0;i<2;i++)templates.push(await api('/api/task-templates','POST',{name:i?'Critical':'Flexible',defaultDuration:20,spaceId:rooms[i].id,zoneId:zone.id,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}},resourceRequirements:i?{byItem:{[resources[0].id]:1}}:{anyOf:[{quantity:1,resourceItemIds:resources.map(r=>r.id)}]},autoCreateOnContestantCreate:false}));
  const plan=await createDay('2026-12-24'),tasks:any[]=[];
  for(let i=0;i<2;i++){
    const participant=await api(`/api/plans/${plan.id}/contestants`,'POST',{planId:plan.id,name:`Person ${i}`,availabilityStart:'09:00',availabilityEnd:'09:20'});
    tasks.push(await api('/api/daily-tasks','POST',{planId:plan.id,templateId:templates[i].id,contestantId:participant.id,spaceId:rooms[i].id,zoneId:zone.id}));
  }
  const inventory=await api(`/api/plans/${plan.id}/resource-items`);
  const daily=resources.map(resource=>inventory.find((r:any)=>r.resourceItemId===resource.id));
  daily.forEach((r,i)=>assert.notEqual(r.id,resources[i].id));
  const input=await buildEngineInput(plan.id,storage),before=structuredClone(input);
  const adapter=adaptEngineInputToPlannerNextProblem(input);
  save('A-input',input);save('A-adapter',adapter);save('A-catalog',{resources,templates,tasks,inventory});
  assert.equal(input.itinerantTeamAvailability?.length??0,0);
  assert.ok(input.tasks.every(t=>!t.assignedResourceIds?.length&&!t.declaredResourceIds?.length));
  // Replace only the flexible nominal domain with the operationally necessary
  // concrete B to prove feasibility using the unchanged U00h authorities.
  const counterfactual=structuredClone(input);
  counterfactual.tasks.find(t=>t.id===tasks[0].id)!.resourceRequirements={byItem:{[resources[1].id]:1}};
  const witnessAdapter=adaptEngineInputToPlannerNextProblem(counterfactual);
  assert.equal(witnessAdapter.status,'SUPPORTED',JSON.stringify(witnessAdapter));
  if(witnessAdapter.status!=='SUPPORTED')throw Error('counterfactual unsupported');
  const p=witnessAdapter.problem;
  const witness=executeAssistedPlanning(buildAssistedProblem(p,createPlanningScope({kind:'DAY',value:'counterfactual'},{},p.tasks.map(t=>t.id)),[]));
  assert.equal(witness.evidence.completeForScope,true);assert.ok(witness.proposal);
  assert.equal(validatePlan(p,[...witness.proposal]).hardValid,true);
  assert.deepEqual(witness.proposal.map(t=>[t.id,t.start,t.end]).sort(),tasks.map(t=>[`task:${t.id}`,540,560]).sort());
  assert.deepEqual(witness.proposal.find(t=>t.id===`task:${tasks[0].id}`)!.requiredResourceIds,[`plan-resource:${daily[1].id}`]);
  assert.deepEqual(witness.proposal.find(t=>t.id===`task:${tasks[1].id}`)!.requiredResourceIds,[`plan-resource:${daily[0].id}`]);
  save('counterfactual-input',counterfactual);save('counterfactual-witness',{adapter:witnessAdapter,witness});
  assert.deepEqual(input,before);
  {
    assert.equal(adapter.status,'UNSUPPORTED');
    assert.ok(adapter.issues.some(i=>i.path.endsWith('.resourceRequirements.anyOf.0')&&i.code==='UNSUPPORTED_RESOURCE_REQUIREMENT'));
    const readiness=await api(`/api/plans/${plan.id}/effective-configuration`);save('A-readiness',readiness);assert.notEqual(readiness.readiness.status,'READY');
    const path=`/api/plans/${plan.id}/assisted`;await api(path+'/session','POST',{});const state=await api(path);save('A-S0',state);
    const rejected=await request(path+'/proposals','POST',{expectedDraftFingerprint:state.draftFingerprint,expectedBaseStageId:state.draftBaseStageId,selector:{kind:'TASK_IDS',taskIds:tasks.map(t=>t.id)},includePrerequisites:true});save('A-rejected',rejected);
    assert.equal(rejected.status,422);assert.equal(rejected.body.code,'UNSUPPORTED_ENGINE_INPUT');
    const after=await api(path);assert.deepEqual(after.activeStage,state.activeStage);assert.deepEqual(after.draft,state.draft);save('A-after-rejection',after);
    save('causal',{status:'PREFLIGHT_REJECTION_REPRODUCED',planId:plan.id,globalIds:resources.map(r=>r.id),dailyIds:daily.map(r=>r.id),witnessComplete:true,hardValid:true,remoteWrites:0});
    pass('anyOf rejected before search; unchanged U00h solver proves flexible B + critical A simultaneously feasible');
    return {status:'PREFLIGHT_REJECTION_REPRODUCED',remoteWrites:0};
  }
}
