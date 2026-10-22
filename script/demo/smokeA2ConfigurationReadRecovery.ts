/** Native, owned disposable services only. The 52-row shape was observed on
 * 27002; no shared credentials, personal fields or remote write path exist. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import type pg from 'pg';
import {AssistedAutopilot} from '../../shared/assistedAutopilot';
import {assistedAutopilotApi,hasAutopilotDraftAlerts} from '../../client/src/lib/assisted-autopilot';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import type {EngineInput} from '../../engine/types';

type Options={appUrl:string;baselineUrl?:string;db:pg.Client;planId:number;directory:string;users:Record<string,{token:string}>;buildInput:()=>Promise<EngineInput>;pass:(s:string)=>void};
export async function runA2ConfigurationReadRecovery(o:Options){
 assert.equal(new URL(o.appUrl).hostname,'127.0.0.1');assert.equal(o.planId,27002);
 const requests:any[]=[],report:any={mode:'NATIVE_DISPOSABLE_CONFIG_READ_RECOVERY',remoteWrites:0,requests};
 const safeMessage=(v:unknown)=>String(v??'').replace(/https?:\/\/\S+|Bearer\s+\S+|eyJ[\w-]+\.[\w-]+\.[\w-]+/g,'[redacted]').slice(0,240);
 const request=async<T>(method:string,path:string,body?:unknown,base=o.appUrl,role='production'):Promise<T>=>{
  // Node 20 can reset a reused idle socket when synchronous search outlives
  // the server's keep-alive timer. Fresh connections keep this HTTP harness
  // independent of that client-pool race; product polling/retries are unchanged.
  const response=await fetch(`${base}${path}`,{method,headers:{Authorization:`Bearer ${o.users[role].token}`,'Content-Type':'application/json',Connection:'close'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(180_000)}).catch(error=>{
   requests.push({method,path,networkError:{name:error?.name,code:error?.cause?.code}});
   // Match apiRequest's AbortController error for the existing read-poll retry
   // in AssistedAutopilot. A timed-out read does not cancel a persisted run.
   if(error?.name==='TimeoutError')throw Object.assign(new Error('Request aborted'),{name:'AbortError'});
   throw error;
  });
  // Preserve the original JSON reader and failure. Capture transport metadata
  // before the generic "engine must return its result" assertion hides it.
  const inspection=response.clone();let value:any;
  try { value=await response.json(); }
  catch(error:any){
   const bytes=await inspection.arrayBuffer().then(body=>body.byteLength).catch(()=>null);
   const failure={runtime:base===o.appUrl?'candidate':'base',method,path,status:response.status,
    headers:Object.fromEntries(['content-type','content-length','transfer-encoding','connection'].map(key=>[key,response.headers.get(key)])),
    receivedBytes:bytes,jsonError:{name:safeMessage(error?.name),
     message:error?.message==='Unexpected end of JSON input'?'Unexpected end of JSON input':'JSON response could not be decoded'}};
   requests.push(failure);
   writeFileSync(`${o.directory}/configuration-read-http-failure.json`,JSON.stringify(failure,null,2));
   throw error;
  }finally{void inspection.body?.cancel().catch(()=>{});}
  requests.push({runtime:base===o.appUrl?'candidate':'base',method,path,status:response.status,code:value.code,
   ...(path.endsWith('/next-scope')?{selector:value.selector,taskCount:value.taskIds?.length}:{}),
   ...(path.endsWith('/effective-configuration')?{readiness:value.readiness?.status}:{}),
   ...(value.runId?{runId:value.runId}:{})});
  if(!response.ok)throw Object.assign(new Error(value.message??'Request failed'),{status:response.status,code:value.code});
  return value as T;
 };
 const path=`/api/plans/${o.planId}/assisted`,configPath=`/api/plans/${o.planId}/effective-configuration`;
 const state=()=>request<any>('GET',path),guard=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:Number(s.draftBaseStageId)});
 const breaks=JSON.parse(readFileSync('script/demo/fixtures/a2-27002-legacy-breaks.json','utf8'));
 // The connected catalog also contains the older units referenced by its
 // legacy breaks, independently of the new day's structured unit snapshots.
 for(const id of new Set<number>(breaks.flatMap((b:any)=>b.itinerant_team_id==null?[]:[b.itinerant_team_id])))
  await o.db.query('INSERT INTO itinerant_teams(id,code,name) OVERRIDING SYSTEM VALUE VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[id,`legacy-unit-${id}`,`Historical unit ${id}`]);
 for(const b of breaks){
  const fields=Object.keys(b);assert.ok(fields.every(k=>/^[a-z_]+$/.test(k)));
  await o.db.query(`INSERT INTO plan_breaks (${fields.join(',')}) OVERRIDING SYSTEM VALUE VALUES (${fields.map((_:unknown,i:number)=>`$${i+1}`).join(',')})`,fields.map(k=>b[k]));
 }
 const material=async(table:string)=>JSON.stringify((await o.db.query(`SELECT to_jsonb(t) row FROM ${table} t WHERE ${table==='plans'?'id':'plan_id'}=$1 ORDER BY id`,[o.planId])).rows);
 const preservedBreaks=await material('plan_breaks'),preservedPlan=await material('plans'),preservedTasks=await material('daily_tasks');
 const cleanInput=await o.buildInput();assert.equal(cleanInput.tasks.length,266);
 const adapted=adaptEngineInputToPlannerNextProblem(cleanInput);assert.equal(adapted.status,'SUPPORTED');
 await request('POST',`${path}/session`,{});
 const s0=await state();assert.equal(s0.activeStage.ordinal,0);assert.equal(s0.draft.tasks.length,266);
 assert.ok(s0.draft.tasks.every((t:any)=>t.startPlanned==null&&t.endPlanned==null));
 report.baseline={available:!!o.baselineUrl};
 if(o.baselineUrl){
  await assert.rejects(()=>request('GET',configPath,undefined,o.baselineUrl),e=>(e as any).status===500&&(e as any).code==='EFFECTIVE_CONFIGURATION_UNAVAILABLE');
  await assert.rejects(()=>request('GET',`${path}/next-scope`,undefined,o.baselineUrl),e=>(e as any).status===500);
  const baseApi=assistedAutopilotApi(o.planId,(m,p,b)=>request(m,p,b,o.baselineUrl));
  const baseProgress:any[]=[];
  const base=new AssistedAutopilot(o.planId,baseApi,{authorized:()=>true,hasPendingAlerts:hasAutopilotDraftAlerts,onProgress:p=>baseProgress.push({...p})});
  const stopped=await base.start();assert.equal(stopped.phase,'FAILED');assert.ok(baseProgress.some(p=>p.phase==='SELECTING'));
  assert.ok(!baseProgress.some(p=>p.phase==='GENERATING'));report.baseline.autopilot={phase:stopped.phase,code:stopped.code};
 }
 const view=await request<any>('GET',configPath);assert.equal(view.planId,o.planId);
 const scope=await request<any>('GET',`${path}/next-scope`);assert.equal(scope.taskIds.length,19);
 assert.deepEqual(scope.selector,{kind:'SPACE',spaceId:cleanInput.plannerNext!.mainFlow!.spaceId});
 assert.equal(scope.expectedDraftFingerprint,s0.draftFingerprint);
 assert.deepEqual(await state(),s0);assert.equal(await material('plan_breaks'),preservedBreaks);
 o.pass('52 observed legacy breaks: configuration reads, S0/266 recommendation and SUPPORTED native input without row changes');

 // Explicit locks are never erased by authority precedence; both read routes
 // expose only a fixed operational category, under the existing role boundary.
 await o.db.query('UPDATE plan_breaks SET locked_start=earliest_start WHERE id=$1',[breaks[0].id]);
 for(const endpoint of [configPath,`${path}/next-scope`])await assert.rejects(()=>request('GET',endpoint),e=>(e as any).status===500&&(e as any).code==='PLANNING_CONFIGURATION_CONFLICT');
 await o.db.query('UPDATE plan_breaks SET locked_start=NULL WHERE id=$1',[breaks[0].id]);
 assert.equal(await material('plan_breaks'),preservedBreaks);
 const denied=await fetch(`${o.appUrl}${configPath}`);assert.equal(denied.status,401);
 await assert.rejects(()=>request('POST',`${path}/restart`,{...guard(s0),confirmation:'RESTART_BOOTSTRAP'},o.appUrl,'viewer'),e=>(e as any).status===403);
 o.pass('locked break conflicts remain blocked with a safe operational error; existing HTTP permissions remain enforced');

 const api=assistedAutopilotApi(o.planId,(m,p,b)=>request(m,p,b));let controller:AssistedAutopilot;
 const phases:string[]=[];
 controller=new AssistedAutopilot(o.planId,api,{authorized:()=>true,hasPendingAlerts:hasAutopilotDraftAlerts,onProgress:p=>{
  phases.push(p.phase);if(p.phase==='GENERATING'&&p.runId&&!p.stopRequested)controller.requestStop();
 }});
 const result=await controller.start();
 const stored= result.runId?(await o.db.query('SELECT status,message,assisted_result_json IS NOT NULL AS has_result FROM planning_runs WHERE id=$1',[result.runId])).rows[0]:null;
 writeFileSync(`${o.directory}/configuration-read-controller.json`,JSON.stringify({phase:result.phase,code:safeMessage(result.code),requests,storedRun:stored?{status:stored.status,hasResult:stored.has_result,message:safeMessage(stored.message)}:null},null,2));
 assert.ok(phases.includes('GENERATING'));assert.ok(result.runId,'initial run must exist');assert.ok(result.result,'engine must return its result');
 assert.ok(['STOPPED','FAILED'].includes(result.phase));
 if(result.phase==='FAILED'){
  assert.equal(result.code,'RUN_NO_PROPOSAL');assert.notEqual(result.result.outcome,'UNSUPPORTED');
  assert.ok(result.result.reasonCodes.length>0,'a distinct search failure must carry explicit evidence');
 }
 report.autopilot={phase:result.phase,code:result.code,stage:result.stage,completed:result.completed,total:result.total,runId:result.runId,outcome:result.result.outcome,reasonCodes:result.result.reasonCodes,evidence:result.result.evidence};
 writeFileSync(`${o.directory}/configuration-read-run.json`,JSON.stringify(result.result,null,2));
 o.pass('Autopilot reaches the real engine from S0/266 and returns proposal/search Evidence without the initial infrastructure error');

 const beforeRestart=await state(),history=await material('assisted_planning_stages'),revisions=await material('plan_config_revisions');
 await request('POST',`${path}/restart`,{...guard(beforeRestart),confirmation:'RESTART_BOOTSTRAP'});
 const restarted=await state();assert.equal(restarted.activeStage.ordinal,0);assert.deepEqual(restarted.draft,s0.draft);
 assert.equal(restarted.currentConfigRevisionId,beforeRestart.currentConfigRevisionId);
 assert.equal(await material('assisted_planning_stages'),history);assert.equal(await material('plan_config_revisions'),revisions);
 assert.equal(await material('plan_breaks'),preservedBreaks);assert.equal(await material('plans'),preservedPlan);
 // Restart restores accepted bootstrap placements; operational metadata timestamps
 // may change, so compare the immutable obligation/configuration fields explicitly.
 const tasks=JSON.parse(await material('daily_tasks')).map((v:any)=>v.row);
 assert.equal(tasks.length,266);assert.ok(tasks.every((t:any)=>t.start_planned==null&&t.end_planned==null));
 const original=JSON.parse(preservedTasks).map((v:any)=>v.row);
 for(const t of tasks){const before=original.find((v:any)=>v.id===t.id);for(const k of ['id','plan_id','template_id','contestant_id','zone_id','space_id','duration_override','participant_margin_before_minutes','participant_margin_after_minutes'])assert.deepEqual(t[k],before[k]);}
 assert.equal((await request<any>('GET',`${path}/next-scope`)).taskIds.length,19);
 report.restart={historyPreserved:true,configurationPreserved:true,legacyRowsPreserved:52,obligationsPreserved:266};
 o.pass('restart after recovery preserves configuration, history, 52 legacy rows and all 266 obligations');
 return report;
}
