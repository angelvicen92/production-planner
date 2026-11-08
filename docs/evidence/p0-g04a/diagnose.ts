/** Read-only diagnosis after native creation. No guard, database or engine patch. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync,unlinkSync} from 'node:fs';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {requiredPhaseCompositionSupported,validateDailyTechnicalChains} from '../../../server/technicalChainStructure';
import {jointCombinationSupported,withDailyJointGroups} from '../../../server/jointGroupStructure';
export async function diagnose({appUrl,users,db,directory,pass,page,read,save,planId,phaseTasks,phaseB,joint,last}:any){
 const {storage}=await import('../../../server/storage');
 const input=await buildEngineInput(planId,storage);save('native-input',input);
 assert.equal(input.tasks.length,103);assert.equal(input.tasks.filter(t=>t.operationalRole==='transport_arrival').length,19);
 assert.equal(input.tasks.filter(t=>t.operationalRole==='transport_departure').length,19);
 const adapter=adapt(input);save('native-adapter',adapter);assert.equal(adapter.status,'SUPPORTED');
 const phases=[phaseTasks.map((t:any)=>t.id),phaseB.map((t:any)=>t.id),[joint[0].id,last.id]];
 const structure={contractVersion:1,policies:[{id:'daily-technical-chain',orderedTaskIds:phases.flat(),phases,adjacency:'REQUIRED',resourceContinuity:'REQUIRED',requiredResourceIds:[]}]};
 const groups={contractVersion:1 as const,groups:[{id:'daily-joint-'+joint.map((t:any)=>t.id).sort((a:number,b:number)=>a-b).join('-'),taskIds:joint.map((t:any)=>t.id).sort((a:number,b:number)=>a-b)}]};
 save('attempted-authorities',{technicalChains:structure,jointGroups:groups});
 const config=`/api/plans/${planId}/day-configuration`;
 const view=await read(`/api/plans/${planId}/effective-configuration`);save('native-effective',view);
 await page.goto(`${appUrl}/plans/${planId}?tab=configuration`,{waitUntil:'networkidle'});
 const editor=page.getByTestId('daily-technical-chain');
 const disabled=!(await editor.getByRole('button',{name:'Crear cadena técnica',exact:true}).isEnabled());
 assert.equal(view.technicalChains.phasesSupported,false);assert.equal(disabled,true);
 await page.screenshot({path:directory+'/first-authoring-rejection.png',fullPage:true});
 const rejects:any[]=[];
 for(const [field,authority,validate] of [['technicalChains',structure,()=>validateDailyTechnicalChains(input,structure as any)],['jointGroups',groups,()=>withDailyJointGroups(input,groups)] ] as const){
  let ts:any;try{validate();}catch(e:any){ts={message:e.message,status:e.status};}assert.equal(ts.status,422);
  const payload={[field]:authority,expectedRevisionId:view.technicalChains.revisionId};
  const r=await fetch(appUrl+config,{method:'PUT',headers:{Authorization:`Bearer ${users.admin.token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const body=await r.json();assert.equal(r.status,422);
  rejects.push({field,ts,request:payload,status:r.status,body});
 }
 save('authoring-rejections',{first:'CHROMIUM_DISABLED_PHASE_CREATE',disabled,requiredPhaseCompositionSupported:requiredPhaseCompositionSupported(input),jointCombinationSupported:jointCombinationSupported(input),rejects});
 const sql:any[]=[];
 for(const [fn,authority] of [['assert_daily_technical_chains',structure],['assert_daily_joint_groups',groups]] as const){
  let error:any;await db.query('BEGIN READ ONLY');
  try{await db.query(`SELECT public.${fn}($1,$2)`,[planId,authority]);}catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  assert.equal(error?.code,'P0001');sql.push({fn,authority,error,readOnly:true,authorityInserted:false});
 }
 save('sql-readonly-rejections',sql);
 save('sql-contracts',(await db.query("SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE oid IN ('public.assert_daily_technical_chains(integer,jsonb)'::regprocedure,'public.assert_daily_joint_groups(integer,jsonb)'::regprocedure)")).rows);
 save('sql-sources',{plan:(await db.query('SELECT * FROM plans WHERE id=$1',[planId])).rows,
  templates:(await db.query('SELECT * FROM plan_task_template_snapshots WHERE plan_id=$1 ORDER BY id',[planId])).rows,
  stages:(await db.query('SELECT ordinal,snapshot_fingerprint FROM assisted_planning_stages WHERE plan_id=$1 ORDER BY id',[planId])).rows,
  runs:(await db.query('SELECT id,status FROM planning_runs WHERE plan_id=$1 ORDER BY id',[planId])).rows});
 assert.deepEqual(await buildEngineInput(planId,storage),input);
 if(process.env.G04A_SQL_PROBE){
  let attempt=0;
  for(;;){
   try{
    const module=await import(new URL(attempt?`./sqlConsumerProbeRetry${attempt}.ts`:'./sqlConsumerProbe.ts',import.meta.url).href);
    const result=await module.sqlConsumerProbe({appUrl,users,db,save,planId,input},process.env.G04A_SQL_PROBE);
    if(!result.error||/ANCHORED_WITNESS_.*CONFLICT/.test(result.error.message))break;
    save('sql-harness-attempt-'+attempt,{error:result.error,materialConsumerReached:false});
   }catch(e:any){save('sql-harness-attempt-'+attempt,{error:{message:e.message,stack:e.stack},materialConsumerReached:false});}
   // Keep this owned disposable stack available for a focused harness repair.
   // Each retry module is separately retained; no product source is hot-patched.
   const trigger=directory+'/retry-sql-probe';
   while(!existsSync(trigger))await new Promise(r=>setTimeout(r,250));
   unlinkSync(trigger);attempt++;
  }
 }
 pass('G04a: 103 native obligations, separate IN/OUT snapshots; first UI/TS/SQL admission rejection reproduced unchanged');
 return {status:'DIAGNOSTIC_ONLY',planId,obligations:103,authoritiesPersisted:false,acceptedStages:0};
}
