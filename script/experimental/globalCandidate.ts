import { spawn } from 'node:child_process';
import { mkdir,writeFile,readFile,mkdtemp,rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { PlannerNextProblem,ScheduledTask,ScheduledOperationalMeal } from '../../engine/planner-next/contracts';
import type { FutureJointCompletionWitnessV1 } from '../../engine/planner-next/anonymousPipelineWitness';
import { buildGlobalCandidateModel } from './globalCandidateModel';
import { revalidateJointCompletionWitness } from '../../engine/planner-next/jointCompletionWitness';
import { PreparedFutureCollectiveParticipantClosure } from '../../engine/planner-next/futureCollectiveParticipantClosure';
import { validatePlan } from '../../engine/planner-next/validate';
import { materializeScheduledItinerantUnitMeals } from '../../engine/planner-next/itinerantUnitMeals';
import { createSetupPreparation } from '../../engine/planner-next/setupPreparation';
import { roundPreparationId } from '../../engine/planner-next/roundSynchronization';

export async function generateGlobalCandidate(source:PlannerNextProblem,protectedTasks:readonly ScheduledTask[],protectedOperationalMeals:readonly ScheduledOperationalMeal[],
 options:{python:string;timeoutMs?:number;signal?:AbortSignal;directory?:string}){
 const started=performance.now(),before=JSON.stringify({source,protectedTasks,protectedOperationalMeals});
 const timeoutMs=options.timeoutMs??30_000;
 if(!Number.isFinite(timeoutMs)||timeoutMs<100||timeoutMs>60_000)throw Error('INVALID_EXPERIMENT_TIMEOUT');
 if(options.signal?.aborted)return {outcome:'INCONCLUSIVE',stopReason:'CANCELLED',witness:null};
 await mkdir('work',{recursive:true});const directory=options.directory??await mkdtemp(resolve('work/cpsat-'));
 await mkdir(directory,{recursive:true});const model=buildGlobalCandidateModel(source,protectedTasks,protectedOperationalMeals);
 await writeFile(`${directory}/model.json`,JSON.stringify(model));
 let solver:any;
 try{
  const exit=await new Promise<{code:number|null;stderr:string;reason?:string}>((done,reject)=>{
   const child=spawn(options.python,[resolve('script/experimental/global_candidate.py'),resolve(directory,'model.json'),resolve(directory,'result.json'),String(timeoutMs/1000)],{stdio:['ignore','ignore','pipe']});
   let stderr='',reason:string|undefined,killTimer:ReturnType<typeof setTimeout>|undefined;
   const stop=(r:string)=>{reason=r;child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),250);};
   const timer=setTimeout(()=>stop('PROCESS_TIMEOUT'),timeoutMs+5000),abort=()=>stop('CANCELLED');options.signal?.addEventListener('abort',abort,{once:true});
   const clear=()=>{clearTimeout(timer);if(killTimer)clearTimeout(killTimer);options.signal?.removeEventListener('abort',abort);};
   child.stderr.on('data',chunk=>{if(stderr.length<8000)stderr+=String(chunk).slice(0,8000-stderr.length);});
   child.on('error',e=>{clear();reject(e);});child.on('close',code=>{clear();done({code,stderr,reason});});
  });
  if(exit.reason||exit.code!==0)return {outcome:'INCONCLUSIVE',stopReason:exit.reason??'DEPENDENCY_OR_MODEL_ERROR',details:exit.stderr,wallMs:performance.now()-started,witness:null};
  solver=JSON.parse(await readFile(`${directory}/result.json`,'utf8'));
  if(!solver.starts)return {outcome:'INCONCLUSIVE',stopReason:solver.status,solver,wallMs:performance.now()-started,witness:null};
  const tasks=model.tasks.map(t=>{const variant=t.variants[solver.variants[t.id]]!.task,fixed=protectedTasks.find(f=>f.id===t.id);
   return fixed?structuredClone(fixed):{...variant,start:solver.starts[t.id],end:solver.starts[t.id]+variant.duration};});
  const body={kind:'JOINT_COMPLETION' as const,version:1 as const,tasks,
   preparations:solver.preparations.map((p:any)=>createSetupPreparation(p.spaceId,p.setupFamilyId,1,p.duration,p.start)),
   roundPreparations:solver.roundPreparations.map((p:any)=>({...p,id:roundPreparationId(p.synchronizationId,p.spaceId,p.roundIndex),kind:'round-preparation' as const})),
   participantMeals:model.meals.map(({starts:_starts,window:_window,status:_status,dependencies:_deps,fixedInterval:_fixed,...m})=>({...m,start:solver.starts[m.sourceTaskId],end:solver.starts[m.sourceTaskId]+m.duration})),
   operationalMeals:solver.operationalMeals.map(({window:_window,...m}:any)=>structuredClone(protectedOperationalMeals.find(f=>f.id===m.id)??m)),spaceMeals:[]};
  const witness:FutureJointCompletionWitnessV1={...body,fingerprint:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
  let charges=0;const consume=()=>charges<100_000?(charges++,true):false;
  const replay=revalidateJointCompletionWitness(source,witness,protectedTasks,consume);
  const protectedLiteral=protectedTasks.every(t=>JSON.stringify(t)===JSON.stringify(tasks.find(x=>x.id===t.id)))
   &&protectedOperationalMeals.every(m=>JSON.stringify(m)===JSON.stringify(witness.operationalMeals.find(x=>x.id===m.id)));
  const resourceMeals=(source.resourceMeals??[]).map(m=>({id:m.id,sourceTaskId:m.sourceTaskId,resourceIds:m.resourceIds,start:m.interval.start,end:m.interval.end,duration:m.interval.end-m.interval.start}));
  const validation=validatePlan(source,[...tasks],[...witness.preparations],[],[...witness.participantMeals],resourceMeals,materializeScheduledItinerantUnitMeals(source),[...witness.roundPreparations],[...witness.operationalMeals]);
  const closure=new PreparedFutureCollectiveParticipantClosure(source).evaluate([...tasks],[...witness.participantMeals],consume,'CERTIFY');
  const certified=replay==='PASS'&&protectedLiteral&&validation.hardValid&&closure.certified;
  if(before!==JSON.stringify({source,protectedTasks,protectedOperationalMeals}))throw Error('MUTATED_CANON');
  await writeFile(`${directory}/candidate.json`,JSON.stringify({source,protectedTasks,protectedOperationalMeals,witness}));
  return {outcome:certified?'CERTIFIED_EXPERIMENTAL_COMPLETION':'INCONCLUSIVE',stopReason:certified?null:'CANONICAL_CERTIFICATION_REJECTED',
   solver,validation,replay,protectedLiteral,closureStatus:closure.status,closureCertified:closure.certified,auditCharges:charges,wallMs:performance.now()-started,witness:certified?witness:null};
 }catch(e){return {outcome:'INCONCLUSIVE',stopReason:'PROCESS_OR_CERTIFICATION_ERROR',details:e instanceof Error?e.message:String(e),wallMs:performance.now()-started,witness:null};}
 finally{if(!options.directory)await rm(directory,{recursive:true,force:true});}
}
