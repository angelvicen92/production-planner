import assert from 'node:assert/strict';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {validatePlan} from '../../../engine/planner-next/validate';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {acceptAttacks} from '../p0-u02b/accept-attacks';
import {mealPhaseAttacks} from '../p0-g03b/attacks';

export async function finishDay({appUrl,users,db,directory,pass,page,read,responseTo,save,planId,phaseTasks,meal,label='g03',phases=[phaseTasks.map((t:any)=>t.id)],joint,peerIndex=0}:any){
 const {storage}=await import('../../../server/storage');
 const path=`/api/plans/${planId}/assisted`,config=`/api/plans/${planId}/day-configuration`,viewPath=`/api/plans/${planId}/effective-configuration`;
 const captures:any[]=[],receipts:any[]=[];
 const request=async(route:string,method='GET',body?:unknown,role='admin')=>{
  const r=await fetch(appUrl+route,{method,headers:{Connection:'close','Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});
  const value={status:r.status,body:await r.json() as any};receipts.push({route,method,request:body,...value});save(label+'-api',receipts);return value;
 };
 const api=async(route:string,method='GET',body?:unknown)=>{const r=await request(route,method,body);assert.ok(r.status<300,JSON.stringify({route,...r}));return r.body;};
 const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
 const before=await buildEngineInput(planId,storage);save(label+'-before-input',before);
 const view=await read(viewPath);save(label+'-effective',view);
 const structure={contractVersion:1,policies:view.technicalChains.authority.policies};
 assert.deepEqual(structure.policies[0].phases,phases);
 const input=await buildEngineInput(planId,storage);save(label+'-input',input);
 assert.equal(input.mealMode,'flexible_meal_window');
 const adapter=adapt(input);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('adapter');
 const mealCount=adapter.problem.participantMeals!.length;save(label+'-adapter',adapter);
 save(label+'-revision',(await db.query('SELECT id,fingerprint,replay_snapshot_json FROM plan_config_revisions WHERE id=$1',[view.technicalChains.revisionId])).rows[0]);
 const {resolveAssistedScope}=await import('../../../server/assistedScopeResolver');
 const scopes=joint.map((t:any)=>resolveAssistedScope(input,adapter,{kind:'TASK_IDS',taskIds:[t.id]}));
 assert.deepEqual(scopes[0].productTaskIds,scopes[1].productTaskIds);assert.deepEqual([...scopes[0].productTaskIds].sort((a,b)=>a-b),phaseTasks.map((t:any)=>t.id).sort((a:number,b:number)=>a-b));save(label+'-peer-scopes',scopes);
 const security=[];
 for(const role of ['viewer','aux','norole','anonymous']){const r=await request(config,'PUT',{technicalChains:structure,expectedRevisionId:view.technicalChains.revisionId},role);assert.equal(r.status,role==='anonymous'?401:403);security.push({mode:role,...r});}
 const stale=await request(config,'PUT',{technicalChains:structure,expectedRevisionId:2147483647});assert.equal(stale.status,409);security.push({mode:'stale',...stale});
 const bad=structuredClone(structure);bad.policies[0].orderedTaskIds[0]=2147483647;bad.policies[0].phases[0][0]=2147483647;
 const invalid=await request(config,'PUT',{technicalChains:bad,expectedRevisionId:view.technicalChains.revisionId});assert.equal(invalid.status,422);security.push({mode:'invalid-member',...invalid});
 const mealMember=structuredClone(structure),mealId=input.tasks.find(t=>t.templateId===meal.id)!.id;
 mealMember.policies[0].orderedTaskIds[0]=mealId;mealMember.policies[0].phases[0][0]=mealId;
 const invalidMeal=await request(config,'PUT',{technicalChains:mealMember,expectedRevisionId:view.technicalChains.revisionId});assert.equal(invalidMeal.status,422);security.push({mode:'meal-as-operation',...invalidMeal});save(label+'-security',security);
 const poll=async(id:number)=>{for(let n=0;n<600;n++){const run=await api(`${path}/proposals/${id}`);if(!['pending','queued','running'].includes(run.status))return run;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
 const initial=await api(path+'/session','POST',{});
 const peerControl=await poll((await api(path+'/proposals','POST',{...expected(initial),selector:{kind:'TASK_IDS',taskIds:[joint[1-peerIndex].id]},includePrerequisites:false})).runId);
 save(label+'-other-peer-run',peerControl);assert.equal(peerControl.assisted_result_json.outcome,'PROPOSAL');
 assert.equal(peerControl.assisted_result_json.proposal.length,phaseTasks.length);
 await api(`${path}/proposals/${peerControl.id}/discard`,'POST',expected(initial));
 await page.goto(`${appUrl}/plans/${planId}?tab=planning`);
 const scope=page.getByTestId('section-assisted-scope');
 const scopeTrigger=scope.getByRole('button',{name:'Alcance de la siguiente propuesta',exact:true});await scopeTrigger.waitFor();
 if(await scopeTrigger.getAttribute('aria-expanded')==='false')await scopeTrigger.click();
 await scope.getByText('Incluir prerrequisitos',{exact:true}).waitFor();
 await scope.getByRole('button',{name:'Tareas',exact:true}).click();
 const selected=input.tasks.find(t=>t.id===joint[peerIndex].id)!,templateName=selected.templateName;
 await scope.locator('label').filter({hasText:templateName}).filter({hasText:selected.contestantName!}).first().getByRole('checkbox').check();
 const started=await responseTo(path+'/proposals','POST',()=>page.getByRole('button',{name:'Generar propuesta',exact:true}).click());
 for(let ordinal=1;ordinal<=2;ordinal++){
  const state=await api(path),run=ordinal===1?await poll(started.runId):await poll((await api(path+'/proposals','POST',{...expected(state),selector:{kind:'TASK_IDS',taskIds:state.draft.tasks.filter((t:any)=>t.startPlanned==null).map((t:any)=>t.taskId)},includePrerequisites:false})).runId);
  const prefix=`${label}-S${ordinal}`;save(prefix+'-run',run);
  assert.equal(run.assisted_result_json.outcome,'PROPOSAL',JSON.stringify(run.assisted_result_json.evidence.reasonCodes));
  const result=run.assisted_result_json,proof=result.evidence.nominalPhysicalFutureWitness;
  assert.equal(proof.tasks.length+proof.participantMeals.length,input.tasks.length);assert.equal(proof.participantMeals.length,mealCount);
  assert.ok(validatePlan(adapter.problem,proof.tasks,proof.setupPreparations,proof.spaceMeals,proof.participantMeals,proof.resourceMeals,proof.itinerantUnitMeals,proof.roundPreparations,proof.operationalMeals).hardValid);
  assert.deepEqual(result.evidence.acceptedSupportingPlacements,[]);assert.equal(result.evidence.globalMealGate,'PASS');
  assert.equal(result.evidence.technicalChainCertificate.status,'WITNESS');assert.equal(result.evidence.technicalChainCertificate.consumed,0);
  if(ordinal===1){assert.equal(result.proposal.length,phaseTasks.length);assert.ok(result.proposedDraftSnapshot.tasks.filter((t:any)=>input.tasks.some(m=>m.id===t.taskId&&m.templateId===meal.id)).every((t:any)=>t.startPlanned==null));
   assert.deepEqual(result.proposal,peerControl.assisted_result_json.proposal);assert.deepEqual(proof,peerControl.assisted_result_json.evidence.nominalPhysicalFutureWitness);
   assert.equal(result.proposedDraftFingerprint,peerControl.assisted_result_json.proposedDraftFingerprint);
   assert.equal(result.evidence.work.branchesExplored,peerControl.assisted_result_json.evidence.work.branchesExplored);
   await responseTo(`${path}/proposals/${run.id}/apply`,'POST',()=>page.getByRole('button',{name:'Aplicar al borrador',exact:true}).click());
  }else await api(`${path}/proposals/${run.id}/apply`,'POST',expected(state));
  let draft=await api(path);save(prefix+'-draft',draft);
  await mealPhaseAttacks({db,planId,run,draft,input,prefix,save:(name:string,rows:any[])=>save(name,rows.map(row=>/PRIOR_DECISION/.test(row.error.message)?{...row,category:'PROTECTION'}:row))});
  const {jointAttacks}=await import('./attacks');await jointAttacks({db,planId,run,draft,input,save,prefix});
  if(ordinal===1)await responseTo(path+'/validate','POST',()=>page.getByRole('button',{name:'Validar borrador',exact:true}).click());else await api(path+'/validate','POST',expected(draft));
  draft=await api(path);save(prefix+'-validated',draft);assert.equal(draft.validation.hardCount,0);assert.equal(draft.validation.requiredCount,0);
  await acceptAttacks({db,planId,draft,actor:users.admin.id,save,label,ordinal});
  const accepted=ordinal===1?await responseTo(path+'/accept-stage','POST',()=>page.getByRole('button',{name:'Aceptar etapa',exact:true}).click()):await api(path+'/accept-stage','POST',expected(draft));
  const row=(await db.query('SELECT ordinal,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE id=$1',[accepted.activeStage.id])).rows[0];save(prefix+'-sql',row);
  assert.deepEqual(row.snapshot_json,accepted.activeStage.snapshotJson);assert.equal(row.snapshot_fingerprint,fingerprintAssistedPlanningSnapshotV1(row.snapshot_json));
  assert.equal(row.snapshot_json.tasks.filter((t:any)=>t.startPlanned!=null).length,ordinal===1?phaseTasks.length:input.tasks.length);
  for(const prior of state.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(row.snapshot_json.tasks.find((t:any)=>t.taskId===prior.taskId),prior);
  captures.push({result,sql:row,draft:draft.draft,validation:{hardCount:draft.validation.hardCount,requiredCount:draft.validation.requiredCount,preferredCount:draft.validation.preferredCount,report:draft.validation.reportJson}});
  if(ordinal===1)await page.goto('about:blank');
 }
 const final=await api(path),protection=[];
 const finalInput=await buildEngineInput(planId,storage);save(label+'-final-input',finalInput);
 assert.equal(adapt(finalInput).status,'SUPPORTED');
 assert.equal(view.jointGroups.supported,true);
 const retired=await request(config,'PUT',{technicalChains:{contractVersion:1,policies:[]},expectedRevisionId:final.currentConfigRevisionId});assert.equal(retired.status,422);protection.push({category:'ADMISSION',...retired});
 const compatible=structuredClone(structure);compatible.policies[0].id+='-changed';
 const denied=await request(config,'PUT',{technicalChains:compatible,expectedRevisionId:final.currentConfigRevisionId});assert.equal(denied.status,409);protection.push({category:'PROTECTION',...denied});
 for(const role of ['service_role','postgres']){
  let error:any;await db.query('BEGIN');try{
   const forged=structuredClone(final.activeStage.snapshotJson);forged.tasks.find((t:any)=>t.startPlanned).startPlanned='15:55';
   if(role==='service_role')await db.query('SET LOCAL ROLE service_role');
   await db.query('UPDATE assisted_planning_stages SET snapshot_json=$2,snapshot_fingerprint=$3 WHERE id=$1',[final.activeStage.id,forged,fingerprintAssistedPlanningSnapshotV1(forged)]);
  }catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  assert.equal(error?.code,role==='service_role'?'42501':'P0001');protection.push({role,error,hashRecomputed:true});
 }save(label+'-protection',protection);
 const {default:pg}=await import('pg'),cp=db.connectionParameters,cold=new pg.Client({host:cp.host,port:cp.port,user:cp.user,database:cp.database,password:cp.password});await cold.connect();
 try{const rows=(await cold.query('SELECT ordinal,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE plan_id=$1 ORDER BY id',[planId])).rows;assert.deepEqual(rows.at(-1).snapshot_json,final.activeStage.snapshotJson);save(label+'-cold-sql',rows);}finally{await cold.end();}
 const stages=final.history.filter((s:any)=>s.ordinal>0);await api(path+'/rollback','POST',{targetStageId:final.history.find((s:any)=>s.ordinal===0).id});for(const s of stages)await api(path+'/redo','POST',{targetStageId:s.id});assert.deepEqual((await api(path)).activeStage.snapshotJson,final.activeStage.snapshotJson);
 pass(`${label}: native phases + ${mealCount} flexible meals, S1/S2 SQL, global physical witness and exact protected continuation`);
 return {label,planId,mealCount,input,problemFingerprint:adapter.problemFingerprint,captures};
}
