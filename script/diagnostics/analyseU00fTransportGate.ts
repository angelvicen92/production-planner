import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {adaptEngineInputToPlannerNextProblem,engineTimeToMinute} from '../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../../engine/planner-next/assistedPlanning';
import {deriveArchitectureFromProtectedMains} from '../../engine/planner-next/exactMainAndFeederCore';
import {validatePlan} from '../../engine/planner-next/validate';
import {validateTransportGrouping} from '../../engine/planner-next/transportGrouping';
import {analyticalFutureEligibleTaskIds} from '../../server/assistedScopeResolver';
import type {PlannerNextProblem,ScheduledTask} from '../../engine/planner-next/contracts';
import type {EngineInput} from '../../engine/types';

/** Read-only causal analysis of native authorities; no solver/persistence injection. */
export function analyseU00fTransportGate(directory:string){
 const read=(name:string)=>JSON.parse(readFileSync(resolve(directory,name),'utf8'));
 const original=read('original-input.json') as EngineInput;
 const input=read('first-input.json') as EngineInput;
 assert.equal(original.transportSettings,undefined);
 assert.ok(original.tasks.every(task=>task.operationalRole==='productive_task'));
 assert.equal(read('original-preflight.json').status,'SUPPORTED');
 assert.equal(read('original-preflight.json').problem.transportPolicy,undefined);
 assert.equal(input.transportSettings?.source,'engine-buildInput-optimizer-transport');
 const adapted=adaptEngineInputToPlannerNextProblem(input);assert.equal(adapted.status,'SUPPORTED');
 if(adapted.status!=='SUPPORTED')throw Error('Main input unsupported');
 const problem=adapted.problem;
 const base=read('protected-base-stage.json'),complete=read('protected-complete-stage.json');
 const fixedRows=base.activeStage.snapshotJson.tasks.filter((task:any)=>task.startPlanned&&task.endPlanned);
 const fixed:ScheduledTask[]=fixedRows.map((row:any)=>({...problem.tasks.find(task=>task.id===`task:${row.taskId}`)!,
   start:engineTimeToMinute(row.startPlanned),end:engineTimeToMinute(row.endPlanned)}));
 for(const row of fixedRows)assert.deepEqual(complete.activeStage.snapshotJson.tasks.find((task:any)=>task.taskId===row.taskId),row);
 assert.ok(complete.activeStage.snapshotJson.tasks.every((task:any)=>task.startPlanned&&task.endPlanned));
 const fixedIds=new Set(fixed.map(task=>task.id));
 const pending=problem.tasks.filter(task=>!fixedIds.has(task.id)).map(task=>task.id);
 const scope=createPlanningScope({kind:'TASK_IDS',value:'native protected continuation'},{},pending);
 const cold=executeAssistedPlanning(buildAssistedProblem(problem,scope,fixed));
 const prior=read('protected-base-run.json').assisted_result_json.evidence.futureStructuralWitnesses;
 assert.ok(prior.some((witness:any)=>witness.kind==='JOINT_COMPLETION'));
 const replay=()=>executeAssistedPlanning(buildAssistedProblem(problem,scope,fixed,
   analyticalFutureEligibleTaskIds(input,adapted.identityMap),[],[],[],[],prior));
 const warm=replay(),repeat=replay();
 assert.equal(warm.evidence.completeForScope,true);assert.equal(warm.evidence.protectedPlacementsPreserved,true);
 assert.deepEqual(warm.proposal,repeat.proposal);assert.equal(warm.evidence.fingerprint,repeat.evidence.fingerprint);
 assert.equal(validatePlan(problem,[...fixed,...warm.proposal!]).hardValid,true);
 const reduced:PlannerNextProblem={...problem,tasks:problem.tasks.filter(task=>fixedIds.has(task.id)),transportPolicy:undefined};
 const policy=problem.transportPolicy!;
 const without=validatePlan(reduced,fixed);
 const withPolicy=validatePlan({...reduced,transportPolicy:{arrival:{...policy.arrival,taskIds:policy.arrival.taskIds.filter(id=>fixedIds.has(id))},departure:{...policy.departure,taskIds:[]}}},fixed);
 const standaloneInput=read('second-input.json') as EngineInput;
 const standalone=adaptEngineInputToPlannerNextProblem(standaloneInput);assert.equal(standalone.status,'SUPPORTED');
 if(standalone.status!=='SUPPORTED')throw Error('Standalone preflight changed');
 assert.equal(standalone.problem.profile,'STANDALONE_ONLY');assert.equal(standalone.problem.tasks.filter(task=>task.kind==='main').length,0);
 const standaloneScope=createPlanningScope({kind:'DAY',value:'native standalone'},{},standalone.problem.tasks.map(task=>task.id));
 const standaloneBefore=structuredClone(standalone.problem);
 const standaloneResult=executeAssistedPlanning(buildAssistedProblem(standalone.problem,standaloneScope,[]));
 const standaloneRepeat=executeAssistedPlanning(buildAssistedProblem(standalone.problem,standaloneScope,[]));
 assert.deepEqual(standalone.problem,standaloneBefore);
 assert.equal(standaloneResult.evidence.completeForScope,true);
 assert.equal(standaloneResult.proposal?.length,9);
 assert.deepEqual(standaloneResult.proposal,standaloneRepeat.proposal);
 assert.equal(standaloneResult.evidence.fingerprint,standaloneRepeat.evidence.fingerprint);
 const standaloneValidation=validatePlan(standalone.problem,[...standaloneResult.proposal!]);
 assert.equal(standaloneValidation.hardValid,true);
 // Hand-authored feasibility control for this 3-person/9-task fixture only.
 // It is never supplied to search, stored, accepted, or generalized into a scheduler.
 assert.equal(standalone.problem.participants.length,3);assert.equal(standalone.problem.tasks.length,9);
 const arrivals=new Set(standalone.problem.transportPolicy!.arrival.taskIds),departures=new Set(standalone.problem.transportPolicy!.departure.taskIds);
 const people=[...standalone.problem.participants].sort((a,b)=>a.id.localeCompare(b.id));
 const witness:ScheduledTask[]=standalone.problem.tasks.map(task=>{
  const index=people.findIndex(person=>person.id===task.participantId);assert.ok(index>=0);
  const start=arrivals.has(task.id)?540:departures.has(task.id)?600+index*15:560+index*10;
  return {...task,start,end:start+task.duration};
 });
 const feasible=validatePlan(standalone.problem,witness);
 assert.equal(feasible.hardValid,true);assert.equal((feasible.violations??[]).filter(violation=>violation.severity==="REQUIRED").length,0);
 const nativeFailure=read('second-run.json');
 assert.equal(cold.evidence.completeForScope,true);
 assert.equal(cold.evidence.protectedPlacementsPreserved,true);
 assert.equal(validatePlan(problem,[...fixed,...cold.proposal!]).hardValid,true);
 const report={status:'ENGINE_GATE_PASS',featureImplemented:false,solverChanged:true,remoteWrites:0,
  original:{preflight:'SUPPORTED',transportLost:true,readiness:read('journey.json').original.readiness},
  main:{obligations:problem.tasks.length,completeStageOrdinal:complete.activeStage.ordinal,
   protectedTaskCount:fixed.length,protectedPreserved:true,proposalWithPriorWitness:warm.evidence.completeForScope,
   replayFingerprint:warm.evidence.fingerprint,replayDeterministic:true,problemFingerprint:adapted.problemFingerprint,
   grouping:validateTransportGrouping(problem,[...fixed,...warm.proposal!])},
  standalone:{diagnosis:'SUPPORTED',preflight:'SUPPORTED',obligations:standalone.problem.tasks.length,
   observedNativeStatus:nativeFailure.status,observedNativeMessage:nativeFailure.message,
   solver:{result:standaloneResult,validation:standaloneValidation,deterministic:true},
   feasibleWitness:witness,witnessValidation:feasible,
   historicalCause:'onHardValidCoreLeaf compared 0 Main placements with 0 Main tasks and called the Main pipeline; buildPipelineWitness dereferenced empty layers[0].styling',
   correction:'Require nonempty Main geometry before pipeline matching; the same standalone search now produces and validates all nine obligations.'},
  coldReplay:{diagnosis:cold.evidence.completeForScope?'SUPPORTED':'UNSUPPORTED',result:cold,observedReasons:cold.evidence.reasonCodes,
   architecture:deriveArchitectureFromProtectedMains(problem,fixed),withoutTransportPolicy:without,withTransportPolicy:withPolicy,
   productionContinuation:'SUPPORTED with the persisted JOINT_COMPLETION witness; the native Stage path succeeds.',
   historicalCause:'Without a witness, protected-Main architecture requires a styling layer; fallback dropped transportPolicy and reclassified synchronized IN as overlapping physical occupations.',
   correction:'Preserve literal direction parameters and project only task IDs in the protected-core fallback; cold continuation and persisted-certificate continuation both validate.'}};
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=analyseU00fTransportGate(process.argv[2]);
 const output=process.argv[3]??resolve(process.argv[2],'causal-analysis.json');mkdirSync(dirname(output),{recursive:true});
 writeFileSync(output,JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,main:report.main.obligations,standalone:report.standalone.diagnosis,coldReplay:report.coldReplay.diagnosis}));
}
