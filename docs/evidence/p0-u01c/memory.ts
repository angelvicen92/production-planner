/** MEMORY ONLY: existing consumers, unchanged code/budgets. Never applies a proposal. */
import assert from 'node:assert/strict';
import {inspect} from '../p0-u00y/consumer';
import {validatePlan} from '../../../engine/planner-next/validate';
import {certifyDailyTechnicalChain} from '../../../server/technicalChainCertificate';
import {resolveEffectiveTaskResourceAssignments} from '../../../engine/planner-next/integration/effectiveTaskResourceAssignments';
import {operationContinuityPreflight} from '../../../engine/planner-next/operationContinuity';
import {canPlaceTask} from '../../../engine/planner-next/placement';
import type {EngineInput} from '../../../engine/types';

export function memory(input:EngineInput,policy:any,rival:number,save:(n:string,v:unknown)=>void,label:string){
 const original=JSON.stringify(input);
 const declared:EngineInput={...structuredClone(input),dailyTechnicalChainsVersion:1,technicalChains:[{...structuredClone(policy),requiredResourceIds:[]}]};
 const run=(name:string,source:EngineInput,ids?:number[],fixed:any[]=[])=>{
  const start=performance.now(),r=inspect(source,ids,fixed,true);
  const proof=r.result?.evidence.nominalPhysicalFutureWitness as any;
  const validation=proof&&r.adapter.status==='SUPPORTED'?validatePlan(r.adapter.problem,proof.tasks,proof.setupPreparations??[],proof.spaceMeals??[],proof.participantMeals??[],proof.resourceMeals??[],proof.itinerantUnitMeals??[],proof.roundPreparations??[],proof.operationalMeals??[]):undefined;
  const certificate=proof&&r.adapter.status==='SUPPORTED'?certifyDailyTechnicalChain(r.adapter.problem,[...fixed,...r.result!.proposal??[]],0,proof):null;
  const value={memoryOnly:true,stage:false,intervention:'Only policy.requiredResourceIds=[]; every operation keeps its actual physical requirements; REQUIRED adjacency and resourceContinuity unchanged.',elapsedMs:performance.now()-start,...r,globalValidation:validation,certificate};
  save(`${label}-memory-${name}`,value);return value;
 };
 const full=run('full',declared),repeat=run('repeat',declared);
 assert.equal(full.adapter.status,'SUPPORTED');
 assert.deepEqual(full.result?.proposal,repeat.result?.proposal);
 const negative=label==='impossible';
 if(!negative){
  assert.ok(full.globalValidation?.hardValid);assert.equal(full.certificate?.status,'WITNESS');
  if(label!=='itinerant'){const partial=run('partial',declared,[rival]);assert.equal(partial.result?.proposal?.length,1);assert.ok(partial.globalValidation?.hardValid);
  const continuation=run('continuation',declared,input.tasks.filter(t=>t.id!==rival).map(t=>t.id),[...partial.result!.proposal!]);assert.ok(continuation.globalValidation?.hardValid);
  assert.ok(continuation.result?.evidence.protectedPlacementsPreserved);}
  if(full.adapter.status!=='SUPPORTED')throw Error('adapter');
  const p=full.adapter.problem,chain=p.technicalChains![0],members=[...new Set([...chain.orderedTaskIds,...p.tasks.filter(t=>t.jointGroupId).map(t=>t.id)])];
  save(`${label}-alternative-A`,{memoryOnly:true,operationContinuity:operationContinuityPreflight({...p,technicalChains:undefined,operationContinuityGroups:[{id:'time-only',policy:'REQUIRED',gapWeight:1,taskIds:members}]} as any),splitChains:'Cannot close phases with dependency edges: edges impose precedence, not adjacency; schema admits max one chain.',effective:resolveEffectiveTaskResourceAssignments(input)});
  // Guard against calling removal a solution: compare the same physical witness
  // to the original (nonempty, deliberately false) shared-resource assertion.
  const asserted=structuredClone(p);asserted.technicalChains![0].requiredResourceIds=policy.requiredResourceIds.map((id:number)=>`plan-resource:${id}`);
  const proof=full.result!.evidence.nominalPhysicalFutureWitness! as any;
  save(`${label}-original-assertion-validation`,validatePlan(asserted,proof.tasks,[],[],[],[],[],[],proof.operationalMeals??[]));
  const attacks=[];
  for(const mutation of ['omit-physical-resource','gap','split-joint','omit-rest']){
   const witness=structuredClone(proof),task=witness.tasks.find((t:any)=>chain.orderedTaskIds.includes(t.id));
   if(mutation==='omit-physical-resource')task.requiredResourceIds=[];
   if(mutation==='gap'){task.start+=5;task.end+=5;}
   if(mutation==='split-joint'){const peer=witness.tasks.find((t:any)=>t.jointGroupId);if(!peer)continue;peer.start+=5;peer.end+=5;}
   if(mutation==='omit-rest'){if(!p.operationalMealPolicies?.length)continue;witness.operationalMeals=[];}
   const validation=validatePlan(p,witness.tasks,witness.setupPreparations??[],witness.spaceMeals??[],witness.participantMeals??[],witness.resourceMeals??[],witness.itinerantUnitMeals??[],witness.roundPreparations??[],witness.operationalMeals??[]);
   assert.equal(validation.hardValid,false,mutation);attacks.push({mutation,validation});
  }
  save(`${label}-memory-attacks`,attacks);
  if(label==='mixed'){
   // A's independent participant can work during the final phase because A
   // is released there. Compare identical occupation with a declared hold.
   const final=chain.phases!.at(-1)!,firstFinal=Math.min(...proof.tasks.filter((t:any)=>final.includes(t.id)).map((t:any)=>t.start));
   const competitor=p.tasks.find(t=>t.id===`task:${rival}`)!;
   const occupations=proof.tasks.filter((t:any)=>t.id!==competitor.id);
   const allowed=canPlaceTask(p,competitor,firstFinal,occupations);
   const held=structuredClone(occupations);for(const t of held.filter((t:any)=>final.includes(t.id)))t.requiredResourceIds=[...new Set([...(t.requiredResourceIds??[]),...competitor.requiredResourceIds??[]])];
   const withFalseHold=canPlaceTask(p,competitor,firstFinal,held);
   assert.ok(allowed);assert.equal(withFalseHold,false);
   save('mixed-release-control',{memoryOnly:true,start:firstFinal,end:firstFinal+competitor.duration,resourceReleasePermitsCompetition:allowed,inventedHoldPermitsCompetition:withFalseHold,intervention:'Candidate generated from the authentic witness phase boundary; no placement persisted.'});
  }
 }else{
  assert.equal(full.result?.proposal,null);assert.ok(!full.result?.evidence.reasonCodes.some(x=>x.includes('BUDGET_EXHAUSTED')));
 }
 assert.equal(JSON.stringify(input),original);
 return {memoryOnly:true,stage:false,outcome:full.result?.proposal?"PROPOSAL":"NO_PROPOSAL",valid:full.globalValidation?.hardValid,work:full.result?.evidence.work,certificate:full.certificate?.status};
}
