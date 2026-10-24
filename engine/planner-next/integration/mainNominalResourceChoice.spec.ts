import assert from 'node:assert/strict';
import test from 'node:test';
import {scenario,counterfactual} from '../../../docs/evidence/p0-u00k/scenario';
import {adaptEngineInputToPlannerNextProblem} from './engineInputAdapter';
import {executePlannerNext} from '../executePlannerNext';
import {runExactItinerantPlanSearch} from '../exactItinerantPlan';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../assistedPlanning';
import {preparePipelineBundleGraph,materializePreparedPipelineBundleMatching} from '../anonymousPipelineWitness';
import {nominalOperationEdgeKey,nominalResourceVariants} from '../nominalResourceChoice';
import {createExactSearchLedger} from '../exactMainAndFeederCore';
import {validatePlan} from '../validate';
import type {EngineInput} from '../../types';
const input=(mode:'B'|'A'|'anyOf'|'byType'='anyOf')=>counterfactual(scenario(process.cwd()),mode);
function adapted(source=input()){
 const a=adaptEngineInputToPlannerNextProblem(source);assert.equal(a.status,'SUPPORTED',JSON.stringify(a));
 if(a.status!=='SUPPORTED')throw Error();return a.problem;
}
for(const mode of ['B','A','anyOf','byType'] as const)test(`U00k Main ${mode}: genuine 11-obligation construction`,()=>{
 const source=input(mode),before=structuredClone(source),p=adapted(source),r=executePlannerNext(p);
 assert.ok(r.result);assert.equal(r.result.complete,mode!=='A');assert.deepEqual(source,before);
 if(!r.result.complete)return;
 assert.equal(r.result.scheduledTasks.length,11);assert.equal(validatePlan(p,r.result.scheduledTasks).hardValid,true);
 if(mode==='anyOf'||mode==='byType')assert.equal(r.result.scheduledTasks.find(t=>t.id==='task:4')!.nominalResourceChoice!.selectedResourceId,'plan-resource:102');
 assert.deepEqual(r.result.scheduledTasks.find(t=>t.id==='task:20')!.requiredResourceIds,['plan-resource:101']);
});
test('residual search rejects A, then recovers B at the identical spot; inventory order is immaterial',()=>{
 const source=input(),p=adapted(source),entered:{slot:number;selected:string|undefined}[]=[];
 const r=runExactItinerantPlanSearch(p,{coreOrderer:{onMainChoiceEntered:d=>{
  if(d.mainTask.id==='task:4')entered.push({slot:d.slot,selected:d.operationTasks.find(t=>t.id==='task:4')!.nominalResourceChoice?.selectedResourceId});
 }}});
 assert.equal(r.status,'COMPLETE');const main=r.scheduledTasks.find(t=>t.id==='task:4')!;
 assert.equal(main.nominalResourceChoice!.selectedResourceId,'plan-resource:102');
 assert.ok(entered.some(t=>t.slot===main.start&&t.selected==='plan-resource:101'));
 assert.ok(entered.some(t=>t.slot===main.start&&t.selected==='plan-resource:102'));
 source.planResourceItems.reverse();source.tasks.find(t=>t.id===4)!.resourceRequirements!.anyOf![0].resourceItemIds.reverse();
 const permuted=runExactItinerantPlanSearch(adapted(source));assert.deepEqual(permuted.scheduledTasks,r.scheduledTasks);
 assert.equal(permuted.evidence.branchesExplored,r.evidence.branchesExplored);
});
test('bundle variants coexist, physical rejection repairs A to B at the same task/spot through the real continuation',()=>{
 const p=adapted(),architecture={pattern:p.tasks.filter(t=>t.kind==='main').map(t=>t.blockKey!),slots:[580,590]};
 const prepared=preparePipelineBundleGraph(p,architecture)!;assert.ok(prepared);
 for(const variants of prepared.nominalVariants!.get('task:4')!.values())
  assert.deepEqual(variants.map(bundle=>bundle.find(t=>t.id==='task:4')!.nominalResourceChoice!.selectedResourceId),['plan-resource:101','plan-resource:102']);
 const ledger=createExactSearchLedger(p.budget.maxBranchExpansions),consume=()=>ledger.consume('CORE');
 const first=materializePreparedPipelineBundleMatching(p,prepared,new Set(),undefined,consume)!;
 const main=first.scheduledTasks.find(t=>t.id==='task:4')!,position=first.matching.get(main.id)!;
 const repaired=materializePreparedPipelineBundleMatching(p,prepared,new Set([nominalOperationEdgeKey(main.id,position,[main])]),first,consume)!;
 assert.equal(repaired.matching.get(main.id),position);
 assert.equal(repaired.scheduledTasks.find(t=>t.id===main.id)!.nominalResourceChoice!.selectedResourceId,'plan-resource:102');
 const reserved=materializePreparedPipelineBundleMatching(p,prepared,new Set(),undefined,consume,undefined,[{...p.tasks.find(t=>t.id==='task:20')!,start:575,end:605}])!;
 assert.equal(reserved.matching.get(main.id),position);
 assert.equal(reserved.scheduledTasks.find(t=>t.id===main.id)!.nominalResourceChoice!.selectedResourceId,'plan-resource:102');
 const r=runExactItinerantPlanSearch(p,{preferredArchitecture:architecture,preferredBundleCandidate:first,
  repairPreferredBundleCandidate:(prior,forbidden,consume)=>materializePreparedPipelineBundleMatching(p,prepared,forbidden,prior,consume)});
 assert.equal(r.status,'COMPLETE');assert.ok(r.evidence.bundleMatchingRepairs>0);
 const accepted=r.scheduledTasks.find(t=>t.id===main.id)!;assert.equal(accepted.start,main.start);
 assert.equal(accepted.nominalResourceChoice!.selectedResourceId,'plan-resource:102');
 assert.ok(ledger.branchesExplored>0&&ledger.branchesExplored<ledger.limit);
});
test('partial Main proposal keeps the complete physical future ephemeral and revalidates protected selection',()=>{
 const p=adapted(),run=(ids:string[],fixed:Parameters<typeof buildAssistedProblem>[2]=[])=>executeAssistedPlanning(buildAssistedProblem(p,createPlanningScope({kind:'TASK_IDS',value:'partial Main'},{},ids),fixed,new Set(p.tasks.map(t=>t.id))));
 const first=run(['task:4']);assert.equal(first.proposal?.length,1);assert.equal(first.evidence.nominalPhysicalFutureWitness?.tasks.length,11);
 assert.equal(first.proposal![0].nominalResourceChoice!.selectedResourceId,'plan-resource:102');
 const next=run(p.tasks.filter(t=>t.id!=='task:4').map(t=>t.id),first.proposal!);assert.equal(next.evidence.completeForScope,true);
 assert.equal(next.proposal?.length,10);assert.ok(!next.proposal!.some(t=>t.id==='task:4'));
 const proof=first.evidence.nominalPhysicalFutureWitness!.tasks;
 for(const forged of [proof.filter(t=>t.id!=='task:20'),proof.map(t=>t.id==='task:4'&&t.kind==='main'?{...t,coachId:'plan-resource:101'}:t),
  proof.map(t=>t.id==='task:4'?{...t,requiredResourceIds:[]}:t),
  proof.map(t=>t.id==='task:4'?{...nominalResourceVariants(p.tasks.find(t=>t.id==='task:4')!)[0],start:t.start,end:t.end}:t)])
  assert.equal(validatePlan(p,forged).hardValid,false);
});
for(const [name,edit] of [
 ['Vocal',(s:EngineInput)=>{s.tasks.find(t=>t.id===3)!.resourceRequirements=s.tasks.find(t=>t.id===4)!.resourceRequirements;delete s.tasks.find(t=>t.id===4)!.resourceRequirements;}],
 ['quantity two',(s:EngineInput)=>{s.tasks.find(t=>t.id===4)!.resourceRequirements!.anyOf![0].quantity=2;}],
 ['multiple groups',(s:EngineInput)=>{s.tasks.find(t=>t.id===4)!.resourceRequirements!.anyOf!.push({quantity:1,resourceItemIds:[201]});}],
 ['missing identity',(s:EngineInput)=>{s.tasks.find(t=>t.id===4)!.resourceRequirements!.anyOf![0].resourceItemIds=[999];}],
 ['unavailable inventory',(s:EngineInput)=>{s.planResourceItems.filter(t=>t.typeId===2).forEach(t=>t.isAvailable=false);}],
 ['missing coach',(s:EngineInput)=>{s.tasks.find(t=>t.id===4)!.declaredResourceIds=[];}],
 ['shared capacity',(s:EngineInput)=>{s.planResourceItems.find(t=>t.id===101)!.typeCode='auxiliar';}],
 ['anchored Main',(s:EngineInput)=>{s.anchoredAccompaniments=[{id:'main-anchor',anchorTaskId:4,beforeTaskIds:[11],afterTaskIds:[],adjacency:'REQUIRED',internalTransition:'INCLUDED',resourceContinuity:'REQUIRED'}];}],
] as const)test(`Main nominal rejects ${name}`,()=>{const s=input();edit(s);assert.equal(adaptEngineInputToPlannerNextProblem(s).status,'UNSUPPORTED');});
test('Main keeps independent byItem, direct, inherited and explicit resources while coach assignments and locks stay in coachId',()=>{
 const s=input(),main=s.tasks.find(t=>t.id===4)!;
 for(const id of [103,104,105,106])s.planResourceItems.push({id,resourceItemId:id+100,typeId:3,typeCode:'equipment',name:`Independent ${id}`,isAvailable:true,availabilityStart:'09:00',availabilityEnd:'10:30'});
 main.resourceRequirements!.byItem={1:1,203:1}; // Same coach by identity plus an independent physical item.
 main.declaredResourceIds=[2,105];main.assignedResourceIds=[2,106];
 s.spaceResourceAssignments={...s.spaceResourceAssignments,[main.spaceId!]:[104]};
 s.locks=[{id:99,planId:s.planId,taskId:4,lockType:'resource',lockedResourceId:2}];
 const p=adapted(s),task=p.tasks.find(t=>t.id==='task:4')!;
 assert.equal(task.coachId,'plan-resource:2');
 assert.deepEqual(task.nominalResourceChoice!.fixedResourceIds,['plan-resource:103','plan-resource:104','plan-resource:105','plan-resource:106']);
 const r=executePlannerNext(p);assert.ok(r.result?.complete);
 const chosen=r.result.scheduledTasks.find(t=>t.id===task.id)!;
 for(const id of task.nominalResourceChoice!.fixedResourceIds)
  assert.equal(validatePlan(p,r.result.scheduledTasks.map(t=>t===chosen?{...t,requiredResourceIds:t.requiredResourceIds!.filter(resource=>resource!==id)}:t)).hardValid,false);
});
test('Main variants obey physical resource transitions and incompatible resource locks',async()=>{
 const {diagnoseTaskPlacement,exactTaskStaticStartDomain}=await import('../placement');
 const s=input();s.plannerNext!.resourceTransitionMinutes=5;
 const critical=s.tasks.find(t=>t.id===20)!;critical.durationOverrideMin=10;
 s.contestantAvailabilityById![4]={start:'09:30',end:'09:40'};
 s.planSpaceSettings!.find(space=>space.spaceId===5)!.availabilityStart='09:30';
 s.planSpaceSettings!.find(space=>space.spaceId===5)!.availabilityEnd='09:40';
 const p=adapted(s),source=p.tasks.find(t=>t.id==='task:20')!,start=exactTaskStaticStartDomain(p,source).starts().next().value!;
 assert.equal(start,570);const occupied={...source,start,end:start+source.duration};
 const [a,b]=nominalResourceVariants(p.tasks.find(t=>t.id==='task:4')!);
 assert.equal(diagnoseTaskPlacement(p,a,580,[occupied]).firstRejectionReason,'TRANSITION_REQUIRED_RESOURCE');
 assert.equal(diagnoseTaskPlacement(p,b,580,[occupied]).valid,true);
 const locked=input();locked.locks=[{id:99,planId:locked.planId,taskId:4,lockType:'resource',lockedResourceId:101}];
 assert.equal(executePlannerNext(adapted(locked)).result?.complete,false);
});
