import assert from 'node:assert/strict';
import type {Page} from 'playwright';
import type pg from 'pg';
import {buildEngineInput} from '../../../engine/buildInput';
import {inspect} from './consumer';
import {configurationAttacks,certificateAttacks} from './attacks';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
type Context={label:string;index:number;planId:number;policies:any[];dailyUnits:number[];page:Page;appUrl:string;db:pg.Client;api:(p:string,m?:string,b?:unknown)=>Promise<any>;request:(p:string,m?:string,b?:unknown,role?:string)=>Promise<{status:number;body:any}>;save:(name:string,value:unknown)=>void;s0:any;directory:string};
export async function nativeDay({label,index,planId,policies,dailyUnits,page,appUrl,db,api,request,save,s0,directory}:Context){
 const path=`/api/plans/${planId}/assisted`,configPath=`/api/plans/${planId}/day-configuration`;
 const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
 const poll=async(id:number)=>{for(let i=0;i<600;i++){const r=await api(`${path}/proposals/${id}`);if(!['pending','running'].includes(r.status))return r;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
 const {storage}=await import('../../../server/storage');
 const declare=async(i:number,mode:'fixed'|'domain',fixed=dailyUnits[0])=>{
  await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);const editor=page.getByTestId('daily-anchored-accompaniment');await editor.waitFor();
  const existing=await editor.getByTestId('anchored-operation').count();
  if(i<existing)await editor.getByTestId('anchored-operation').nth(i).getByRole('button',{name:'Modificar operación anclada',exact:true}).click();
  else await editor.getByRole('button',{name:'Crear operación anclada',exact:true}).click();
  await editor.getByLabel('Actividad principal anclada',{exact:true}).selectOption(String(policies[i].anchorTaskId));
  await editor.getByLabel('Segmento anterior al Main',{exact:true}).selectOption(String(policies[i].beforeTaskIds[0]));
  await editor.getByLabel('Segmento posterior al Main',{exact:true}).selectOption(String(policies[i].afterTaskIds[0]));
  await editor.getByLabel('Contrato de equipo anclado',{exact:true}).selectOption(mode);
  if(mode==='fixed')await editor.getByLabel('Unidad de la operación anclada',{exact:true}).selectOption(String(fixed));
  else {const effective=await api(`/api/plans/${planId}/effective-configuration`);for(const id of dailyUnits)await editor.getByLabel(`Equipo elegible ${effective.anchoredAccompaniments.units.find((u:any)=>u.id===id).name}`,{exact:true}).check();}
  const saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Guardar operación anclada',exact:true}).click();const response=await saving;assert.equal(response.status(),200,await response.text());
  await page.reload({waitUntil:'domcontentloaded'});await editor.getByText(/Operación anclada efectiva y versionada/).waitFor();
  save(`${label}-declaration-${i}-${mode}-${fixed}`,await api(`/api/plans/${planId}/effective-configuration`));
 };
 const propose=async(ids:number[])=>{const state=await api(path);const run=await api(path+'/proposals','POST',{...expected(state),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true});return poll(run.runId);};
 if(process.argv.includes('--shared-negative')){
  await declare(0,'domain');const input=await buildEngineInput(planId,storage),run=await propose(input.tasks.map(t=>t.id));
  save('shared-physical-input',input);save('shared-physical-run',run);assert.equal(run.assisted_result_json.outcome,'NO_PROPOSAL');
  assert.ok(!run.assisted_result_json.evidence.reasonCodes.some((c:string)=>/BUDGET|EXHAUST/.test(c)));
  const final=await api(path);assert.equal(final.activeStage.id,s0.activeStage.id);assert.deepEqual(final.draft,s0.draft);save('shared-physical-final-S0',final);
  return {planId,physicalConflict:true,units:dailyUnits,stageCreated:false,remoteWrites:0};
 }
 let fixedBProposal:any[]|undefined;
 if(!index){
  await declare(0,'fixed');const inputA=await buildEngineInput(planId,storage),runA=await propose(inputA.tasks.map(t=>t.id));save('choice-native-fixed-A',{input:inputA,run:runA});assert.notEqual(runA.assisted_result_json?.outcome,'PROPOSAL');
  await declare(0,'fixed',dailyUnits[1]);const inputB=await buildEngineInput(planId,storage),runB=await propose(inputB.tasks.map(t=>t.id));save('choice-native-fixed-B',{input:inputB,run:runB});assert.equal(runB.assisted_result_json.outcome,'PROPOSAL');
  fixedBProposal=runB.assisted_result_json.proposal;
  await api(`${path}/proposals/${runB.id}/discard`,'POST',expected(await api(path)));
 }
 for(let i=0;i<policies.length;i++)await declare(i,'domain');
 await configurationAttacks({planId,db,api,request,save:(n,v)=>save(`${label}-${n}`,v)});
 const input=await buildEngineInput(planId,storage);save(`${label}-input`,input);
 save(`${label}-consumer`,inspect(input));
 save(`${label}-authority`,(await db.query('SELECT daily_anchored_accompaniments,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows);
 const stages:any[]=[];
 let firstRunId:number|undefined;
 for(let stage=0;stage<(index?2:1);stage++){
  const before=await api(path),ids=index&&stage===0?[policies[0].anchorTaskId]:before.draft.tasks.filter((t:any)=>t.startPlanned==null).map((t:any)=>t.taskId);
  const run=await propose(ids);save(`${label}-S${stage+1}-run`,run);assert.equal(run.assisted_result_json.outcome,'PROPOSAL');
  firstRunId??=run.id;
  const result=run.assisted_result_json,witness=result.evidence.nominalPhysicalFutureWitness;
  if(fixedBProposal){const placements=(rows:any[])=>rows.map(t=>({taskId:t.taskId,start:t.startPlanned,end:t.endPlanned,unit:t.itinerantTeamId,resources:t.assignedResourceIds??[]}));assert.deepEqual(placements(result.proposal),placements(fixedBProposal));}
  assert.equal(witness.tasks.length,input.tasks.length);
  for(const policy of policies){const members=[...policy.beforeTaskIds,policy.anchorTaskId,...policy.afterTaskIds].map(id=>witness.tasks.find((t:any)=>t.id===`task:${id}`));assert.ok(members.every((t:any)=>t.itinerantUnitId===members[0].itinerantUnitId));assert.ok(dailyUnits.some(id=>members[0].itinerantUnitId===`itinerant-team:${id}`));}
  if(index&&stage===0)for(const p of policies.slice(1))for(const id of [...p.beforeTaskIds,p.anchorTaskId,...p.afterTaskIds])assert.equal(result.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===id).startPlanned,null);
  if(!index)for(const t of result.proposal.filter((t:any)=>[...policies[0].beforeTaskIds,policies[0].anchorTaskId,...policies[0].afterTaskIds].includes(t.taskId)))assert.equal(t.itinerantTeamId,dailyUnits[1]);
  await api(`${path}/proposals/${run.id}/apply`,'POST',expected(before));const draft=await api(path);save(`${label}-S${stage+1}-draft`,draft);
  await certificateAttacks({planId,db,run,draft,units:dailyUnits,policies,save:(n,v)=>save(`${label}-S${stage+1}-${n}`,v)});
  await db.query('BEGIN');try{await db.query('SET LOCAL ROLE service_role');await db.query('SELECT public.assert_daily_anchored_snapshot($1,$2,$3)',[planId,result.proposedDraftSnapshot,run.config_revision_id]);save(`${label}-S${stage+1}-positive-sql`,{accepted:true});}
  catch(e:any){save(`${label}-S${stage+1}-positive-sql`,{accepted:false,message:e.message,where:e.where,code:e.code});throw e;}finally{await db.query('ROLLBACK');}
  await api(path+'/validate','POST',expected(draft));const validated=await api(path);save(`${label}-S${stage+1}-validation`,validated.validation);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
  const accepted=await api(path+'/accept-stage','POST',expected(validated));save(`${label}-S${stage+1}-accepted`,accepted);stages.push(accepted.activeStage);
  for(const t of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.activeStage.snapshotJson.tasks.find((r:any)=>r.taskId===t.taskId),t);
  save(`${label}-S${stage+1}-sql`,(await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
  const sqlStage=(await db.query('SELECT id,ordinal,config_revision_id,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE plan_id=$1 AND id=$2',[planId,accepted.activeStage.id])).rows[0];assert.deepEqual(sqlStage.snapshot_json,accepted.activeStage.snapshotJson);
  const sqlUnits=(await db.query('SELECT id,name,members,availability_windows FROM plan_itinerant_unit_snapshots WHERE plan_id=$1 ORDER BY id',[planId])).rows;
  const selections=policies.map(p=>{const rows=[...p.beforeTaskIds,p.anchorTaskId,...p.afterTaskIds].map(id=>sqlStage.snapshot_json.tasks.find((t:any)=>t.taskId===id));const placed=rows.filter(t=>t.startPlanned!=null);assert.ok(placed.length===0||placed.length===3);if(placed.length)assert.equal(new Set(placed.map(t=>t.itinerantTeamId)).size,1);return {anchorTaskId:p.anchorTaskId,selectedUnit:placed.length?sqlUnits.find(u=>Number(u.id)===placed[0].itinerantTeamId):null,members:rows};});
  save(`${label}-S${stage+1}-sql-selection`,{sqlStage,selections});
  const forged=structuredClone(sqlStage.snapshot_json);forged.tasks.find((t:any)=>t.taskId===policies[0].anchorTaskId).itinerantTeamId=dailyUnits.find(id=>id!==forged.tasks.find((t:any)=>t.taskId===policies[0].anchorTaskId).itinerantTeamId);
  await db.query('BEGIN');let failure:any;try{await db.query('SET LOCAL ROLE service_role');await db.query('UPDATE assisted_planning_stages SET snapshot_json=$2,snapshot_fingerprint=$3 WHERE id=$1',[sqlStage.id,forged,fingerprintAssistedPlanningSnapshotV1(forged)]);}catch(e:any){failure={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}
  assert.ok(failure);save(`${label}-S${stage+1}-immutable-stage-forgery`,{...failure,hashRecomputed:true,rolledBack:true});
 }
 await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);const editor=page.getByTestId('daily-anchored-accompaniment');await editor.waitFor();assert.equal(await editor.getByTestId('anchored-operation').count(),policies.length);await editor.scrollIntoViewIfNeeded();await editor.screenshot({path:`${directory}/${label}-selected.png`});
 const effective=await api(`/api/plans/${planId}/effective-configuration`);for(const p of policies)assert.ok(effective.anchoredAccompaniments.tasks.find((t:any)=>t.id===p.anchorTaskId).selectedUnitId);
 save(`${label}-reconstructed`,{input:await buildEngineInput(planId,storage),view:effective,session:await api(path)});
 const denied=await request(configPath,'PUT',{anchoredAccompaniments:{contractVersion:2,policies:[]},expectedRevisionId:effective.anchoredAccompaniments.revisionId});save(`${label}-protected-retire`,denied);assert.equal(denied.status,409);
 save(`${label}-rollback`,await api(path+'/rollback','POST',{targetStageId:s0.activeStage.id}));
 const rollbackDenied=await request(configPath,'PUT',{anchoredAccompaniments:{contractVersion:2,policies:[]},expectedRevisionId:effective.anchoredAccompaniments.revisionId});assert.equal(rollbackDenied.status,409);save(`${label}-rollback-protected-retire`,rollbackDenied);
 for(const s of stages)save(`${label}-redo-${s.ordinal}`,await api(path+'/redo','POST',{targetStageId:s.id}));
 const obsolete=await request(`${path}/proposals/${firstRunId}/apply`,'POST',expected(await api(path)));assert.equal(obsolete.status,409);save(`${label}-obsolete-proposal`,obsolete);
 return {planId,policies,dailyUnits,stages:stages.map(s=>({id:s.id,fingerprint:s.snapshotFingerprint})),remoteWrites:0};
}
