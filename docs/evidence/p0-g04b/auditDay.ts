import assert from 'node:assert/strict';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {resolveAssistedScope} from '../../../server/assistedScopeResolver';

/** A NO_PROPOSAL is a diagnostic observation, never a functional acceptance. */
export async function auditDay(ctx:any){
 const {appUrl,users,db,page,read,responseTo,save,planId,joint,directory}=ctx;
 const {storage}=await import('../../../server/storage');
 const path=`/api/plans/${planId}/assisted`,config=`/api/plans/${planId}/day-configuration`;
 const receipts:any[]=[];
 const request=async(route:string,method='GET',body?:unknown,role='admin')=>{
  const r=await fetch(appUrl+route,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});
  const result={status:r.status,body:await r.json() as any};receipts.push({route,method,request:body,role,...result});save('macro-api',receipts);return result;
 };
 const api=async(route:string,method='GET',body?:unknown)=>{const r=await request(route,method,body);assert.ok(r.status<300,JSON.stringify(r));return r.body;};
 const input=await buildEngineInput(planId,storage),adapter=adapt(input);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('adapter');
 save('macro-input',input);save('macro-adapter',adapter);const view=await read(`/api/plans/${planId}/effective-configuration`);save('macro-effective',view);
 save('macro-revision',(await db.query('SELECT id,fingerprint,replay_snapshot_json FROM plan_config_revisions WHERE id=$1',[view.technicalChains.revisionId])).rows[0]);
 const scopes=joint.map((t:any)=>resolveAssistedScope(input,adapter,{kind:'TASK_IDS',taskIds:[t.id]}));save('macro-peer-scopes',scopes);assert.deepEqual(scopes[0].productTaskIds,scopes[1].productTaskIds);
 const structure={contractVersion:1,policies:view.technicalChains.authority.policies},security=[];
 for(const role of ['viewer','aux','norole','anonymous']){
  const r=await request(config,'PUT',{technicalChains:structure,expectedRevisionId:view.technicalChains.revisionId},role);assert.equal(r.status,role==='anonymous'?401:403);security.push({mode:role,...r});
 }
 const stale=await request(config,'PUT',{technicalChains:structure,expectedRevisionId:2147483647});assert.equal(stale.status,409);security.push({mode:'stale',...stale});
 const invalid=structuredClone(structure);invalid.policies[0].orderedTaskIds[0]=2147483647;invalid.policies[0].phases[0][0]=2147483647;
 const bad=await request(config,'PUT',{technicalChains:invalid,expectedRevisionId:view.technicalChains.revisionId});assert.equal(bad.status,422);security.push({mode:'invalid-member',...bad});save('macro-security',security);
 const initial=await api(path+'/session','POST',{});save('macro-S0',initial);
 const expected={expectedDraftFingerprint:initial.draftFingerprint,expectedBaseStageId:initial.draftBaseStageId};
 const poll=async(id:number)=>{for(let n=0;n<600;n++){const run=await api(`${path}/proposals/${id}`);if(!['pending','queued','running'].includes(run.status))return run;await new Promise(r=>setTimeout(r,100));}throw Error('native proposal polling timeout');};
 await page.goto(`${appUrl}/plans/${planId}?tab=planning`);
 const scope=page.getByTestId('section-assisted-scope'),trigger=scope.getByRole('button',{name:'Alcance de la siguiente propuesta',exact:true});await trigger.waitFor();
 if(await trigger.getAttribute('aria-expanded')==='false')await trigger.click();
 await scope.getByRole('button',{name:'Tareas',exact:true}).click();
 const selected=input.tasks.find(t=>t.id===joint[1].id)!;
 await scope.locator('label').filter({hasText:selected.templateName}).filter({hasText:selected.contestantName!}).first().getByRole('checkbox').check();
 const started=await responseTo(path+'/proposals','POST',()=>page.getByRole('button',{name:'Generar propuesta',exact:true}).click());
 save('macro-ui-start',started);const ui=await poll(started.runId);save('macro-ui-run',ui);
 assert.equal(ui.assisted_result_json.outcome,'NO_PROPOSAL');assert.equal(ui.assisted_result_json.evidence.work.branchesExplored,input.plannerNext!.searchBudget.maxBranchExpansions);
 const after=await api(path);save('macro-after-ui',after);
 assert.deepEqual(after.draft,initial.draft);assert.equal(after.draftFingerprint,initial.draftFingerprint);assert.deepEqual(after.activeStage,initial.activeStage);
 await page.reload({waitUntil:'networkidle'});await page.screenshot({path:directory+'/macro-no-proposal.png',fullPage:true});
 const discardUI=await request(`${path}/proposals/${ui.id}/discard`,'POST',expected);assert.equal(discardUI.status,409);assert.equal(discardUI.body.code,'RUN_NOT_READY');
 const peer=await poll((await api(path+'/proposals','POST',{...expected,selector:{kind:'TASK_IDS',taskIds:[joint[0].id]},includePrerequisites:false})).runId);save('macro-other-peer-run',peer);
 assert.equal(peer.assisted_result_json.outcome,'NO_PROPOSAL');assert.deepEqual(peer.assisted_result_json.evidence.work,ui.assisted_result_json.evidence.work);
 const discardPeer=await request(`${path}/proposals/${peer.id}/discard`,'POST',expected);assert.equal(discardPeer.status,409);assert.equal(discardPeer.body.code,'RUN_NOT_READY');
 const invalidScope=await request(path+'/proposals','POST',{...expected,selector:{kind:'TASK_IDS',taskIds:[2147483647]},includePrerequisites:false});assert.ok(invalidScope.status>=400&&invalidScope.status<500);save('macro-invalid-scope',invalidScope);
 const stages=(await db.query('SELECT id,ordinal,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE plan_id=$1 ORDER BY id',[planId])).rows;
 assert.equal(stages.length,1);assert.equal(stages[0].ordinal,0);assert.ok(stages[0].snapshot_json.tasks.every((t:any)=>t.startPlanned==null));save('macro-sql-stages',stages);
 save('macro-terminal-state',await api(path));
 const result={status:'DIAGNOSTIC_NO_PROPOSAL',obligations:141,acceptedPlacements:0,newStages:0,initialStage:0,work:ui.assisted_result_json.evidence.work,reasonCodes:ui.assisted_result_json.evidence.reasonCodes,sourceConfigurationChanged:false};
 save('audit-result',result);ctx.pass('G04b diagnostic reproduced: native UI NO_PROPOSAL, S0/Draft unchanged, zero accepted Stages');return result;
}
