/** Focal order audit on the SAME native database after the unchanged UI smoke.
 * Only real HTTP/RPC rollback supplies checkpoints. No synthetic session, seed,
 * imported schedule, run replacement, recommender mutation or search override.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import type {runA2BrowserJourney} from './smokeA2Journey';
import type {EngineInput} from '../../engine/types';
import type {AssistedPlanningSnapshotV1} from '../../shared/assistedPlanningSnapshotContracts';
import {fingerprintAssistedPlanningSnapshotV1} from '../../server/assistedPlanningSnapshot';
import {recommendNextAssistedScope,type AssistedScopeRecommendation} from '../../server/assistedScopeOrchestrator';
import {adaptEngineInputToPlannerNextProblem,engineTimeToMinute} from '../../engine/planner-next/integration/engineInputAdapter';
import type {EngineInputAdapterSupportedResult} from '../../engine/planner-next/integration/engineInputAdapter';
import type {ScheduledTask} from '../../engine/planner-next/contracts';
import type {FutureJointCompletionWitnessV1} from '../../engine/planner-next/anonymousPipelineWitness';
import {jointCompletionCanonicalJson,revalidateJointCompletionWitness} from '../../engine/planner-next/jointCompletionWitness';
import {materializeItinerantUnitAssignment} from '../../engine/planner-next/itinerantUnitAssignment';
import {materializeScheduledItinerantUnitMeals} from '../../engine/planner-next/itinerantUnitMeals';
import {PreparedFutureCollectiveParticipantClosure} from '../../engine/planner-next/futureCollectiveParticipantClosure';
import {validatePlan} from '../../engine/planner-next/validate';
import {roundPreparationId} from '../../engine/planner-next/roundSynchronization';
import {setupPreparationId} from '../../engine/planner-next/setupPreparation';

type Options=Parameters<typeof runA2BrowserJourney>[0];
type Journey=Awaited<ReturnType<typeof runA2BrowserJourney>>;
const hash=(value:unknown)=>createHash('sha256').update(jointCompletionCanonicalJson(value)).digest('hex');
const sorted=(ids:readonly number[])=>[...ids].sort((a,b)=>a-b);
const placed=(snapshot:AssistedPlanningSnapshotV1)=>snapshot.tasks.filter(t=>t.startPlanned&&t.endPlanned);
const count=(snapshot:AssistedPlanningSnapshotV1)=>placed(snapshot).length;
const adapter=(input:EngineInput)=>{const a=adaptEngineInputToPlannerNextProblem(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('Unsupported real input');return a;};
const canonical=(a:EngineInputAdapterSupportedResult,namespace:string,id:string|number)=>{
 const match=a.identityMap.find(i=>i.namespace===namespace&&i.sourceId===String(id));assert.ok(match,`${namespace}:${id}`);return match.canonicalId;
};

function protect(prior:AssistedPlanningSnapshotV1,next:AssistedPlanningSnapshotV1){
 assert.deepEqual(next.tasks.map(t=>t.taskId),prior.tasks.map(t=>t.taskId),'complete task catalog survives');
 for(const row of placed(prior))assert.deepEqual(next.tasks.find(t=>t.taskId===row.taskId),row,'accepted task/resource/unit protected');
 for(const [field,key] of [['operationalMeals','policyId'],['setupPreparations','id'],['roundPreparations','id'],['planningBlocks','blockId']] as const)
  for(const item of prior[field]??[])assert.deepEqual((next[field]??[]).find((r:any)=>(r as any)[key]===(item as any)[key]),item,`${field}: accepted decision protected`);
}

/** Actual persisted placements, with semantics from the real canonical adapter.
 * Witnesses are not the authority for accepted task times, spaces or resources.
 */
function actualTasks(a:EngineInputAdapterSupportedResult,snapshot:AssistedPlanningSnapshotV1):ScheduledTask[]{
 return placed(snapshot).flatMap(row=>{
  const source=a.problem.tasks.find(t=>t.id===canonical(a,'task',row.taskId));if(!source)return []; // participant meals have their own canonical authority
  const selected=row.itinerantTeamId===undefined?source:materializeItinerantUnitAssignment(a.problem,source,canonical(a,'itinerant-team',row.itinerantTeamId));
  assert.ok(selected,'real selected itinerant composition materializes');
  if(row.itinerantTeamId!==undefined){
   const unit=a.problem.itinerantUnits!.find(u=>u.id===selected.itinerantUnitId)!;
   const assigned=(row.assignedResourceIds??[]).map(id=>canonical(a,'plan-resource',id));
   for(const id of unit.resourceIds??[])assert.ok(assigned.includes(id),'selected physical composition persisted');
  }
  return [{...selected,spaceId:canonical(a,'space',row.spaceId!),start:engineTimeToMinute(row.startPlanned!),end:engineTimeToMinute(row.endPlanned!)}];
 });
}

function auditWitness(a:EngineInputAdapterSupportedResult,w:FutureJointCompletionWitnessV1,base:AssistedPlanningSnapshotV1){
 let charges=0;const consume=()=>charges<100_000?(charges++,true):false;
 assert.equal(revalidateJointCompletionWitness(a.problem,w,actualTasks(a,base),consume),'PASS');
 const v=validatePlan(a.problem,[...w.tasks],[...w.preparations],[...w.spaceMeals],[...w.participantMeals],[],materializeScheduledItinerantUnitMeals(a.problem),[...w.roundPreparations],[...w.operationalMeals]);
 assert.equal(v.hardValid,true);assert.deepEqual(v.violations,[]);
 const closure=new PreparedFutureCollectiveParticipantClosure(a.problem).evaluate(w.tasks,w.participantMeals,consume,'CERTIFY');
 assert.equal(closure.certified,true);
 return {fingerprint:w.fingerprint,revalidation:'PASS',canonical:'PASS',closure:'CERTIFIED',charges,closureFingerprint:closure.witnessFingerprint};
}

export function auditOperationalMealConsolidation(snapshot:AssistedPlanningSnapshotV1,witness:FutureJointCompletionWitnessV1){
 const accepted=new Set(placed(snapshot).map(task=>`task:${task.taskId}`));
 return witness.operationalMeals.map(meal=>{
  const consumers=witness.tasks.filter(task=>meal.spaceIds.includes(task.spaceId)||(task.requiredResourceIds??[]).some(id=>meal.resourceIds.includes(id))||task.coachId!==undefined&&meal.resourceIds.includes(task.coachId));
  const closed=consumers.length>0&&consumers.every(task=>accepted.has(task.id));
  const stored=snapshot.operationalMeals?.find(item=>item.policyId===meal.id);
  assert.equal(Boolean(stored),closed,'consolidate complete consumers only; future meals stay virtual');
  if(stored)assert.deepEqual({start:engineTimeToMinute(stored.startPlanned),end:engineTimeToMinute(stored.endPlanned)},{start:meal.start,end:meal.end},'persist the selected actual interval');
  return {policyId:meal.id,consumerCount:consumers.length,acceptedConsumers:consumers.filter(task=>accepted.has(task.id)).length,closed,persisted:Boolean(stored)};
 });
}

export function auditComplete(a:EngineInputAdapterSupportedResult,snapshot:AssistedPlanningSnapshotV1,witness:FutureJointCompletionWitnessV1){
 const tasks=actualTasks(a,snapshot);
 const meals=(a.problem.participantMeals??[]).map(meal=>{
  const row=snapshot.tasks.find(t=>canonical(a,'task',t.taskId)===meal.sourceTaskId)!;assert.ok(row?.startPlanned&&row.endPlanned);
  return {id:meal.id,sourceTaskId:meal.sourceTaskId,participantId:meal.participantId,duration:meal.duration,start:engineTimeToMinute(row.startPlanned),end:engineTimeToMinute(row.endPlanned)};
 });
 const setups=(snapshot.setupPreparations??[]).map(p=>{
  const spaceId=canonical(a,'space',p.spaceId),setupFamilyId=canonical(a,'setup-family',p.setupFamilyId);
  assert.equal(p.id,setupPreparationId(spaceId,setupFamilyId,p.entryIndex),'stored setup identity is intact');
  return {...p,kind:'setup-preparation' as const,id:setupPreparationId(spaceId,setupFamilyId,p.entryIndex),spaceId,setupFamilyId};
 });
 const rounds=(snapshot.roundPreparations??[]).map(p=>{
  const spaceId=canonical(a,'space',p.spaceId),synchronizationId=canonical(a,'round-synchronization',p.synchronizationId);
  assert.equal(p.id,roundPreparationId(p.synchronizationId,String(p.spaceId),p.roundIndex),'stored round identity is intact');
  return {...p,kind:'round-preparation' as const,id:roundPreparationId(synchronizationId,spaceId,p.roundIndex),spaceId,synchronizationId};
 });
 const operations=(snapshot.operationalMeals??[]).map(m=>{
  const policy=a.problem.operationalMealPolicies!.find(p=>p.id===m.policyId)!;assert.ok(policy);
  return {id:policy.id,resourceIds:[...policy.resourceIds],spaceIds:[...policy.spaceIds],duration:policy.duration,start:engineTimeToMinute(m.startPlanned),end:engineTimeToMinute(m.endPlanned)};
 });
 assert.equal(count(snapshot),266);assert.equal(tasks.length+meals.length,266);
 assert.equal(new Set([...tasks.map(t=>t.id),...meals.map(m=>m.sourceTaskId)]).size,266);
 // A2 has no flexible space-meal occupations; do not substitute future rows.
 assert.equal(a.problem.spaces.filter(s=>s.mealPolicy).length,0);
 const v=validatePlan(a.problem,tasks,setups,[],meals,[],materializeScheduledItinerantUnitMeals(a.problem),rounds,operations);
 let charges=0;const closure=new PreparedFutureCollectiveParticipantClosure(a.problem).evaluate(tasks,meals,()=>charges<100_000?(charges++,true):false,'CERTIFY');
 const missing=(a.problem.operationalMealPolicies??[]).filter(p=>!operations.some(m=>m.id===p.id)).map(p=>p.id);
 // Read-only falsification: add ONLY the missing occupations already present in
 // the real native witness. Never apply/accept them or certify them as persisted.
 const additions=witness.operationalMeals.filter(m=>missing.includes(m.id));
 const counterfactual=validatePlan(a.problem,tasks,setups,[],meals,[],materializeScheduledItinerantUnitMeals(a.problem),rounds,[...operations,...additions]);
 return {status:v.hardValid&&v.violations?.length===0&&closure.certified?'PASS':'FAIL',obligations:266,productiveTasks:tasks.length,participantMeals:meals.length,setupPreparations:setups.length,roundPreparations:rounds.length,operationalMeals:operations.length,expectedOperationalMeals:(a.problem.operationalMealPolicies??[]).length,missingOperationalMealIds:missing,validation:v,closure:closure.certified?'CERTIFIED':'FAILED',closureFingerprint:closure.witnessFingerprint,charges,placementsFingerprint:hash({tasks,meals,setups,rounds,operations}),counterfactual:{mode:'READ_ONLY_NOT_PERSISTED',addedMealIds:additions.map(m=>m.id),hardValid:counterfactual.hardValid,violations:counterfactual.violations,allOtherPlacementsUnchanged:true}};
}

function relationAudit(a:EngineInputAdapterSupportedResult,left:AssistedScopeRecommendation,right:AssistedScopeRecommendation){
 const A=new Set(left.memberTaskIds.map(id=>canonical(a,'task',id))),B=new Set(right.memberTaskIds.map(id=>canonical(a,'task',id)));
 const tasks=new Map(a.problem.tasks.map(t=>[t.id,t])),meals=new Map((a.problem.participantMeals??[]).map(m=>[m.sourceTaskId,m]));
 const nodes=[...a.problem.tasks,...(a.problem.participantMeals??[]).map(m=>({id:m.sourceTaskId,dependencies:m.dependencies??[]}))];
 const graph=new Map(nodes.map(t=>[t.id,t.dependencies]));
 const ancestors=(id:string,seen=new Set<string>()):Set<string>=>{for(const dep of graph.get(id)??[])if(!seen.has(dep)){seen.add(dep);ancestors(dep,seen);}return seen;};
 const direct=nodes.flatMap(t=>t.dependencies.filter(d=>A.has(t.id)&&B.has(d)||B.has(t.id)&&A.has(d)).map(d=>({prerequisite:d,dependent:t.id})));
 const transitive=[...A,...B].flatMap(id=>[...ancestors(id)].filter(d=>A.has(id)&&B.has(d)||B.has(id)&&A.has(d)).map(d=>({prerequisite:d,dependent:id})));
 const resources=(ids:Set<string>)=>new Set([...ids].flatMap(id=>{
  const t=tasks.get(id);if(!t){assert.ok(meals.has(id),'every obligation has a canonical authority');return [];}
  return [...(t.requiredResourceIds??[]),...('coachId' in t?[t.coachId]:[]),...(a.problem.itinerantUnits??[]).filter(u=>(t.allowedItinerantUnitIds??[t.itinerantUnitId]).includes(u.id)).flatMap(u=>u.resourceIds??[])];
 }));
 const ra=resources(A),rb=resources(B);
 const couplings=[...(a.problem.technicalChains??[]).map(c=>({id:c.id,tasks:c.orderedTaskIds})),...(a.problem.anchoredAccompaniments??[]).map(c=>({id:c.id,tasks:[c.anchorTaskId,...c.beforeTaskIds,...c.afterTaskIds]})),...(a.problem.roundSynchronizations??[]).map(c=>({id:c.id,tasks:c.lanes.flatMap(l=>l.taskIds)}))].filter(c=>c.tasks.some(id=>A.has(id))&&c.tasks.some(id=>B.has(id)));
 const participants=(ids:Set<string>)=>new Set([...ids].flatMap(id=>{const t=tasks.get(id);return t&&'participantId' in t?[t.participantId]:meals.has(id)?[meals.get(id)!.participantId]:[];}));
 const pa=participants(A),pb=participants(B);
 return {units:[left.selectedUnitId,right.selectedUnitId],kinds:[left.selectedUnitKind,right.selectedUnitKind],members:[A.size,B.size],directDependencies:direct,transitiveDependencies:transitive,sharedPhysicalResources:[...ra].filter(id=>rb.has(id)),hardCouplings:couplings,sharedParticipants:[...pa].filter(id=>pb.has(id)),sharedGlobalParticipantMealClosure:true,priorities:[left.priority,right.priority]};
}

export async function probeA2StageOrder(options:Options,journey:Journey,initialInput:EngineInput){
 const {appUrl,users,db,planId,directory,buildInput,pass,diagnostics}=options;
 const path=`/api/plans/${planId}/assisted`;
 diagnostics.stageOrderHttp={connection:'close',retries:0,timeoutMs:180_000};
 const api=async(suffix:string,method='GET',body?:unknown)=>{
  try{
   // Independent CLI requests exercise the actual HTTP contract without an
   // idle fetch pool surviving the synchronous S1 calculation. No retries.
   const r=await fetch(`${appUrl}${path}${suffix}`,{method,headers:{'Content-Type':'application/json',Connection:'close',Authorization:`Bearer ${users.production.token}`},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(180_000)});
   return {status:r.status,data:await r.json() as any};
  }catch(error){
   const failure=error as Error&{cause?:{name?:string;code?:string;message?:string}};
   diagnostics.stageOrderHttpFailure={method,suffix,message:failure.message,cause:failure.cause?{name:failure.cause.name,code:failure.cause.code,message:failure.cause.message}:null,
    runs:(await db.query('SELECT id,status,message,base_stage_id FROM public.planning_runs WHERE plan_id=$1 ORDER BY id',[planId])).rows};
   throw error;
  }
 };
 const state=async()=>{const r=await api('');assert.equal(r.status,200);return r.data;};
 const guard=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:Number(s.draftBaseStageId)});
 const post=async(suffix:string,body:unknown)=>{const r=await api(suffix,'POST',body);assert.equal(r.status,200,`${suffix}: ${JSON.stringify(r.data)}`);return r.data;};
 const stages=async()=>(await db.query('SELECT * FROM public.assisted_planning_stages WHERE plan_id=$1 ORDER BY id',[planId])).rows;
 const runs=async()=>(await db.query('SELECT * FROM public.planning_runs WHERE plan_id=$1 ORDER BY id',[planId])).rows;
 const material=async()=>{
  const data:Record<string,unknown>={};
  for(const t of ['daily_tasks','assisted_planning_sessions','assisted_planning_stages','planning_stage_validations','planning_runs','plan_config_revisions','planning_accepted_exceptions'])data[t]=(await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') AS rows FROM public.${t} x WHERE plan_id=$1`,[planId])).rows[0].rows;
  return data;
 };
 const preserveDaily=async(snapshot:AssistedPlanningSnapshotV1)=>{
  const daily=(await db.query('SELECT id,start_planned,end_planned,zone_id,space_id,location_label,duration_override,cameras_override,assigned_resource_ids FROM public.daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows;
  for(const task of snapshot.tasks){const row=daily.find(t=>Number(t.id)===task.taskId)!;
   assert.deepEqual({...row,id:Number(row.id),zone_id:row.zone_id==null?null:Number(row.zone_id),space_id:row.space_id==null?null:Number(row.space_id)},{id:task.taskId,start_planned:task.startPlanned,end_planned:task.endPlanned,zone_id:task.zoneId,space_id:task.spaceId,location_label:task.locationLabel,duration_override:task.durationOverride,cameras_override:task.camerasOverride,assigned_resource_ids:task.assignedResourceIds??[]});
  }
 };
 const archive=async(name:string)=>{
  const bytes=gzipSync(JSON.stringify({state:await state(),input:await buildInput(),publicMaterial:await material()}));
  const file=`stage-order-${name}.json.gz`;writeFileSync(`${directory}/${file}`,bytes,{mode:0o600});return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 };
 const originalStages=await stages(),originalRuns=await runs(),originalFinal=await state();
 const baselineArchive=await archive('baseline');diagnostics.stageOrderBaselineArchive=baselineArchive;
 assert.equal(journey.stages.length,10);assert.equal(count(originalFinal.draft),266);
 const stageContent=(s:any)=>{const {archived_at:_archived,...content}=s;return content;};
 const frozenStages=new Map(originalStages.map(s=>[Number(s.id),stageContent(s)]));
 const frozenRuns=new Map(originalRuns.map(r=>[Number(r.id),r]));
 const revisions=(await db.query('SELECT * FROM public.plan_config_revisions WHERE plan_id=$1 ORDER BY id',[planId])).rows;
 const immutableHistory=async()=>{
  const actual=await stages();for(const [id,content] of frozenStages)assert.deepEqual(stageContent(actual.find(r=>Number(r.id)===id)),content,'branching can archive future metadata, never rewrite any accepted Stage');
  for(const row of actual)frozenStages.set(Number(row.id),stageContent(row));
  const actualRuns=await runs();for(const [id,run] of frozenRuns)assert.deepEqual(actualRuns.find(r=>Number(r.id)===id),run,'persisted completed runs/witnesses survive');
  for(const run of actualRuns.filter(r=>r.status!=='running'))frozenRuns.set(Number(run.id),run);
  assert.deepEqual((await db.query('SELECT * FROM public.plan_config_revisions WHERE plan_id=$1 ORDER BY id',[planId])).rows,revisions,'effective configuration remains unchanged');
 };
 const initialAdapter=adapter(initialInput);
 const units=journey.stages.map((s,index)=>{
  const run=originalRuns.find(r=>Number(r.id)===s.runId)!;assert.ok(run);
  const parent=originalStages.find(p=>Number(p.id)===Number(run.base_stage_id))!;
  const recommendation=recommendNextAssistedScope(initialInput,parent.snapshot_json)!;assert.ok(recommendation);
  assert.deepEqual(recommendation.selector,s.scope,'baseline UI used the unchanged recommender');
  assert.deepEqual(sorted(recommendation.memberTaskIds),sorted(run.scope_task_ids_json));
  return {ordinal:index+1,runId:s.runId,parentStageId:Number(parent.id),stageId:Number(originalStages.find(p=>Number(p.proposal_run_id)===s.runId)!.id),recommendation,scope:run.scope_json,includePrerequisites:run.include_prerequisites,evidence:run.assisted_result_json.evidence,reasonCodes:run.assisted_result_json.reasonCodes,completed:s.completed};
 });
 const candidates=units.slice(0,-1).map((left,i)=>({index:i,left,right:units[i+1]!,audit:relationAudit(initialAdapter,left.recommendation,units[i+1]!.recommendation)}));
 const targetKinds=[['ITINERANT_AGENDA','OPERATIONAL_MEAL'],['OPERATIONAL_MEAL','OPERATIONAL_MEAL']];
 const selected=targetKinds.map(kinds=>{
  const matches=candidates.filter(c=>c.audit.kinds.every((k,i)=>k===kinds[i])&&c.audit.directDependencies.length===0&&c.audit.transitiveDependencies.length===0&&c.audit.sharedPhysicalResources.length===0&&c.audit.hardCouplings.length===0);
  assert.equal(matches.length,1,'unique relatively independent operational pair, chosen from configured units');return matches[0]!;
 }).sort((a,b)=>b.index-a.index); // preserve the deeper ORIGINAL checkpoint before branching from the earlier one
 const report:any={status:'RUNNING',mechanism:'native production rollback + explicit TASK_IDS + real HTTP/Auth/RPC/PostgreSQL',sourceBaselineFingerprint:originalFinal.activeStage.snapshotFingerprint,baseline:units.map(u=>({ordinal:u.ordinal,completed:u.completed,...u.recommendation,work:u.evidence.work,witnesses:u.evidence.futureStructuralWitnesses?.map((w:any)=>({kind:w.kind,fingerprint:w.fingerprint})),fullEvidenceFingerprint:hash(u.evidence)})),candidateAudit:candidates.filter(c=>selected.includes(c)||c.audit.kinds[0]==='OPERATIONAL_MEAL'&&c.audit.kinds[1]==='PARTICIPANT_OPENING').map(c=>({baselineOrdinals:[c.left.ordinal,c.right.ordinal],...c.audit})),experiments:[],algorithmChanges:0,remoteWrites:0,limits:['Late acceptance-order variations of a joint completion witness already constructed in baseline S1; not arbitrary pre-witness order robustness','Alternative scopes use production HTTP; baseline scopes use the unchanged real UI; no claim of alternate UI clicks','Original Supabase restored catalog and published Replit are not exercised']};
 diagnostics.stageOrder=report;
 const save=()=>writeFileSync(`${directory}/stage-order.json`,JSON.stringify(report,null,2));
 const baselineWitness=originalRuns.at(-1)!.assisted_result_json.evidence.futureStructuralWitnesses.find((w:any)=>w.kind==='JOINT_COMPLETION');assert.ok(baselineWitness);
 report.baselineArchive=baselineArchive;report.baselineCanonical=auditComplete(adapter(await buildInput()),originalFinal.draft,baselineWitness);save();
 try{
  const scenarios=[...selected.map(candidate=>({...candidate,baselineReplay:false})),{...selected[0]!,index:0,left:units[0]!,right:units[0]!,baselineReplay:true}];
  for(const candidate of scenarios){
   const {index,left,right}=candidate,base=originalStages.find(s=>Number(s.id)===left.parentStageId)!;
   const order=[...units.slice(index)];if(!candidate.baselineReplay)[order[0],order[1]]=[order[1]!,order[0]!];
   const experiment:any={baselineOrdinals:[left.ordinal,right.ordinal],unitIds:[left.recommendation.selectedUnitId,right.recommendation.selectedUnitId],checkpoint:{stageId:Number(base.id),ordinal:Number(base.ordinal),fingerprint:base.snapshot_fingerprint,completed:count(base.snapshot_json)},classification:null,repeats:[]};
   if(candidate.baselineReplay)report.baselineReplay=experiment;else report.experiments.push(experiment);
   for(let repeat=1;repeat<=(candidate.baselineReplay?1:2);repeat++){
    const liveBase=(await stages()).find(s=>Number(s.id)===Number(base.id))!;assert.equal(liveBase.archived_at,null,'original common checkpoint is still reachable');
    await post('/rollback',{targetStageId:Number(base.id)});const common=await state();
    assert.equal(Number(common.activeStage.id),Number(base.id));assert.deepEqual(common.draft,base.snapshot_json);assert.equal(common.draftFingerprint,base.snapshot_fingerprint);await preserveDaily(common.draft);await immutableHistory();
    const rows=await stages(),persistedRuns=await runs(),lineage=[];let ancestor:any=rows.find(s=>Number(s.id)===Number(base.id));
    while(ancestor){lineage.push({stage:stageContent(ancestor),run:ancestor.proposal_run_id==null?null:persistedRuns.find(r=>Number(r.id)===Number(ancestor.proposal_run_id))});ancestor=ancestor.parent_stage_id==null?null:rows.find(s=>Number(s.id)===Number(ancestor.parent_stage_id));}
    const checkpointInput=await buildInput();
    const trace:any={repeat,checkpointArchive:await archive(`pair-${left.ordinal}-${right.ordinal}-repeat-${repeat}-checkpoint`),commonConfigRevisionId:common.currentConfigRevisionId,commonContextFingerprint:hash({input:checkpointInput,snapshot:common.draft,lineage,revisions}),lineage:lineage.map(s=>({stageId:Number(s.stage.id),runId:s.run==null?null:Number(s.run.id),snapshotFingerprint:s.stage.snapshot_fingerprint,runFingerprint:s.run==null?null:hash(s.run),witnesses:s.run?.assisted_result_json?.evidence?.futureStructuralWitnesses?.map((w:any)=>({kind:w.kind,fingerprint:w.fingerprint}))})),protectedCounts:{tasks:count(common.draft),completeCatalog:common.draft.tasks.length,setupPreparations:common.draft.setupPreparations?.length??0,roundPreparations:common.draft.roundPreparations?.length??0,operationalMeals:common.draft.operationalMeals?.length??0,planningBlocks:common.draft.planningBlocks?.length??0},steps:[]};experiment.repeats.push(trace);save();
    if(repeat===2)assert.equal(trace.commonContextFingerprint,experiment.repeats[0].commonContextFingerprint,'complete original lineage, runs, witnesses, configuration, daily input and protections reproduced');
    for(const unit of order){
     const before=await state(),selector=candidate.baselineReplay?unit.scope.selector:{kind:'TASK_IDS',taskIds:[...unit.recommendation.memberTaskIds]},start=performance.now();
     const created=await api('/proposals','POST',{selector,includePrerequisites:unit.includePrerequisites,...guard(before)});assert.equal(created.status,202,JSON.stringify(created.data));
     const runId=Number(created.data.runId);let run:any;const deadline=Date.now()+180_000;
     do{const r=await api(`/proposals/${runId}`);assert.equal(r.status,200);run=r.data;if(run.status!=='running')break;await new Promise(r=>setTimeout(r,250));}while(Date.now()<deadline);
     const result=run.assisted_result_json??run.assistedResultJson;
     const step:any={baselineUnitOrdinal:unit.ordinal,unitId:unit.recommendation.selectedUnitId,selector,runId,baseStageId:Number(before.activeStage.id),baseFingerprint:before.draftFingerprint,configRevisionId:run.config_revision_id,status:run.status,outcome:result?.outcome,generationMs:Math.round(performance.now()-start),completedBefore:count(before.draft),reasonCodes:result?.reasonCodes,evidence:result?.evidence};trace.steps.push(step);save();
     assert.deepEqual(sorted(run.scope_task_ids_json),sorted(unit.recommendation.memberTaskIds),'product scope exactly selected');assert.equal(Number(run.config_revision_id),Number(common.currentConfigRevisionId));
     if(run.status!=='success'||result?.outcome!=='PROPOSAL'){
      const unchanged=await state();assert.equal(unchanged.draftFingerprint,before.draftFingerprint);await preserveDaily(before.draft);await immutableHistory();
      trace.blocker={firstScope:unit.recommendation.selectedUnitId,completed:count(before.draft),pending:266-count(before.draft),runId,status:run.status,message:run.message,outcome:result?.outcome,reasonCodes:result?.reasonCodes,evidence:result?.evidence,archive:await archive(`pair-${left.ordinal}-${right.ordinal}-repeat-${repeat}-blocked`)};
      experiment.classification='BLOCKED_REQUIRES_CAUSAL_AUDIT';report.status='BLOCKED';save();throw Error(`Order variation blocked at ${unit.recommendation.selectedUnitId}; inspect real stage-order evidence`);
     }
     assert.equal(result.evidence.newHardViolationCount,0);assert.equal(result.evidence.newRequiredViolationCount,0);assert.equal(result.evidence.globalMealGate,'PASS');
     const w=result.evidence.futureStructuralWitnesses.find((v:any)=>v.kind==='JOINT_COMPLETION') as FutureJointCompletionWitnessV1;assert.ok(w);
     step.witnessAudit=auditWitness(adapter(await buildInput()),w,before.draft);
     await post(`/proposals/${runId}/apply`,guard(before));await preserveDaily(before.draft);const applied=await state();protect(before.draft,applied.draft);
     await post('/validate',guard(applied));const validated=await state();assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);assert.equal(validated.validation.draftFingerprint,validated.draftFingerprint);
     await post('/accept-stage',{...guard(validated),confirmation:'NONE'});const after=await state();
     assert.equal(Number(after.activeStage.proposalRunId),runId);assert.equal(Number(after.activeStage.parentStageId),Number(before.activeStage.id));assert.deepEqual(after.draft,applied.draft);assert.equal(after.activeStage.snapshotFingerprint,fingerprintAssistedPlanningSnapshotV1(after.draft));
     await preserveDaily(after.draft);await immutableHistory();assert.deepEqual(await state(),after,'fresh HTTP reload restores persisted authority');
     Object.assign(step,{acceptedOrdinal:after.activeStage.ordinal,acceptedStageId:Number(after.activeStage.id),completedAfter:count(after.draft),remaining:266-count(after.draft),fingerprint:after.activeStage.snapshotFingerprint,hard:0,required:0,acceptedContentPreserved:true,dailyPersistence:true,reload:true,operationalMealConsolidation:auditOperationalMealConsolidation(after.draft,w)});save();
     pass(`order ${left.ordinal}/${right.ordinal} repeat ${repeat}: explicit ${unit.recommendation.selectedUnitKind} → accepted S${after.activeStage.ordinal} (${step.completedAfter}/266)`);
    }
    const final=await state(),finalWitness=trace.steps.at(-1).evidence.futureStructuralWitnesses.find((w:any)=>w.kind==='JOINT_COMPLETION');assert.ok(finalWitness);
    trace.finalFingerprint=final.activeStage.snapshotFingerprint;trace.canonical=auditComplete(adapter(await buildInput()),final.draft,finalWitness);trace.finalArchive=await archive(`pair-${left.ordinal}-${right.ordinal}-repeat-${repeat}-final`);trace.pendingRecommendation=(await api('/next-scope')).data;assert.equal(trace.pendingRecommendation.selector,null);
    trace.determinismMaterial={fingerprint:trace.finalFingerprint,placementsFingerprint:trace.canonical.placementsFingerprint,steps:trace.steps.map((s:any)=>({unitId:s.unitId,completed:s.completedAfter,fingerprint:s.fingerprint,work:s.evidence.work,witness:s.witnessAudit.fingerprint,reasonCodes:s.reasonCodes}))};save();
   }
   const reference=candidate.baselineReplay?{determinismMaterial:{fingerprint:report.sourceBaselineFingerprint,placementsFingerprint:report.baselineCanonical.placementsFingerprint,steps:units.map((u,i)=>({unitId:u.recommendation.selectedUnitId,completed:u.completed,fingerprint:journey.stages[i]!.fingerprint,work:u.evidence.work,witness:u.evidence.futureStructuralWitnesses.find((w:any)=>w.kind==='JOINT_COMPLETION').fingerprint,reasonCodes:u.reasonCodes}))},canonical:report.baselineCanonical}:experiment.repeats[1];
   assert.deepEqual(experiment.repeats[0].determinismMaterial,reference.determinismMaterial,'repeat the same order: same geometry, work, witness and validation');
   assert.deepEqual(experiment.repeats[0].canonical.validation,reference.canonical.validation,'same complete canonical validation on both repeats');
   experiment.deterministic=true;experiment.orderStatus='PASS';experiment.fullCanonicalStatus=experiment.repeats.every((r:any)=>r.canonical.status==='PASS')?'PASS':'FAIL';experiment.classification=experiment.repeats[0].finalFingerprint===report.sourceBaselineFingerprint?'VALID_ALTERNATIVE_ACCEPTANCE_ORDER_SAME_GEOMETRY':'VALID_ALTERNATIVE_ORDER_DIFFERENT_GEOMETRY';save();
  }
  report.orderStatus='PASS';
  // Collect all focal runs first, but retain the complete-plan assertion as a
  // failing gate. A witness/counterfactual is never a substitute for persistence.
  const completeGates=[report.baselineCanonical,...report.experiments.flatMap((e:any)=>e.repeats.map((r:any)=>r.canonical)),report.baselineReplay.repeats[0].canonical];
  report.fullCanonicalStatus=completeGates.every((g:any)=>g.status==='PASS')?'PASS':'FAIL';
  if(report.fullCanonicalStatus!=='PASS'){
   report.status='FAIL_CANONICAL_PERSISTENCE';save();assert.fail('Complete persisted canonical plan failed in baseline or variation; inspect missing occupations and read-only counterfactual. No complete integration certificate.');
  }
  report.status='PASS';pass('two focal orders repeated from complete real checkpoints: canonical 266/266, no new HARD/REQUIRED, unchanged original runs/Stages, deterministic');return report;
 }catch(error){if(report.status==='RUNNING')report.status='FAIL';report.error=error instanceof Error?error.message:String(error);throw error;}finally{save();}
}
