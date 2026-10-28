/** Counterfactuals never enter storage, revisions, proposals or Stage SQL. */
import assert from 'node:assert/strict';
import type {EngineInput} from '../../../engine/types';
import {inspect} from '../p0-u00y/consumer';
import {validatePlan} from '../../../engine/planner-next/validate';
import {certifyDailyTechnicalChain} from '../../../server/technicalChainCertificate';
import {canPlaceTask} from '../../../engine/planner-next/placement';
import {resolveEffectiveTaskResourceAssignments} from '../../../engine/planner-next/integration/effectiveTaskResourceAssignments';
import {withDailyTaskOperationScopes} from '../../../server/dailyTaskOperationScopes';

export function memory(input:EngineInput,policy:any,joints:any[],rivals:number[],resources:number[],save:(n:string,v:unknown)=>void,label:string){
 const original=JSON.stringify(input),declared=structuredClone(input);
 Object.assign(declared,{dailyTechnicalChainsVersion:1,technicalChains:[policy],dailyJointGroupsVersion:1,dailyJointGroups:joints});
 for(const group of joints)for(const id of group.taskIds)declared.tasks.find(t=>t.id===id)!.jointGroupId=group.id;
 const run=(name:string,source:EngineInput,ids?:number[],fixed:any[]=[],includePrerequisites=false)=>{
  const start=performance.now(),r=inspect(source,ids,fixed,includePrerequisites),proof=r.result?.evidence.nominalPhysicalFutureWitness as any;
  const validation=proof&&r.adapter.status==='SUPPORTED'?validatePlan(r.adapter.problem,proof.tasks,proof.setupPreparations??[],proof.spaceMeals??[],proof.participantMeals??[],proof.resourceMeals??[],proof.itinerantUnitMeals??[],proof.roundPreparations??[],proof.operationalMeals??[]):undefined;
  const certificate=proof&&r.adapter.status==='SUPPORTED'?certifyDailyTechnicalChain(r.adapter.problem,[...fixed,...r.result?.proposal??[]],0,proof):null;
  const value={memoryOnly:true,stage:false,intervention:'Inject rejected daily phases and joint identities into a clone after buildEngineInput. Preserve every physical task/unit/resource/rest authority.',elapsedMs:performance.now()-start,...r,globalValidation:validation,certificate};save(`${label}-memory-${name}`,value);return value;
 };
 const full=run('full',declared),repeat=run('repeat',declared);assert.deepEqual(full.result?.proposal,repeat.result?.proposal);
 save(label+'-memory-effective',resolveEffectiveTaskResourceAssignments(declared));
 assert.equal(full.adapter.status,'SUPPORTED');
 if(label==='impossible'){
  assert.equal(full.result?.proposal,null);assert.ok(!full.result?.evidence.reasonCodes.some(c=>c.includes('BUDGET')||c.includes('TIME_LIMIT')));assert.equal(JSON.stringify(input),original);
  return {adapter:full.adapter.status,outcome:'NO_PROPOSAL',work:full.result?.evidence.work,reasons:full.result?.evidence.reasonCodes};
 }
 assert.ok(full.result?.proposal,'Feasible integrated counterfactual');
 assert.ok(full.globalValidation?.hardValid);assert.equal(full.certificate?.status,'WITNESS');
 const partial=run('partial',declared,[rivals[0]]);assert.equal(partial.result?.proposal?.length,1);assert.ok(partial.globalValidation?.hardValid);
 const continuation=run('continuation',declared,input.tasks.filter(t=>t.id!==rivals[0]).map(t=>t.id),[...partial.result!.proposal!]);assert.ok(continuation.globalValidation?.hardValid);assert.ok(continuation.result?.evidence.protectedPlacementsPreserved);
 const peer=joints[0].taskIds[1];for(const id of joints[0].taskIds){const scoped=run('scope-'+id,declared,[id]);assert.ok(scoped.scope?.scope.resolvedTaskIds.includes('task:'+peer));}
 // Supporting prerequisites can witness the unit without entering its proposal.
 const scoped=run('scope-unit',declared,[policy.orderedTaskIds[0]]);save(label+'-supporting',{memoryOnly:true,proposalIds:scoped.result?.proposal?.map(t=>t.id),scope:scoped.scope,resultEvidence:scoped.result?.evidence});
 if(full.adapter.status!=='SUPPORTED')throw Error('adapter');
 const p=full.adapter.problem,proof=full.result.evidence.nominalPhysicalFutureWitness as any;
 const validate=(w:any,problem=p)=>validatePlan(problem,w.tasks,w.setupPreparations??[],w.spaceMeals??[],w.participantMeals??[],w.resourceMeals??[],w.itinerantUnitMeals??[],w.roundPreparations??[],w.operationalMeals??[]);
 const attacks=[];
 for(const mode of ['missing-resource','gap','split-peer','missing-rest','resource-collision','individual-availability','collective-availability']){
  const w=structuredClone(proof),problem=structuredClone(p),member=w.tasks.find((t:any)=>t.id==='task:'+policy.phases[0][0]);
  if(mode==='missing-resource')member.requiredResourceIds=[];
  if(mode==='gap'){member.start+=5;member.end+=5;}
  if(mode==='split-peer'){const t=w.tasks.find((t:any)=>t.id==='task:'+peer);t.start+=5;t.end+=5;}
  if(mode==='missing-rest')w.operationalMeals=[];
  if(mode==='resource-collision'){const t=w.tasks.find((t:any)=>t.id==='task:'+rivals[0]);t.start=member.start;t.end=t.start+t.duration;}
  if(mode==='individual-availability')problem.resources.find(r=>r.id==='plan-resource:'+resources[0])!.availability=[{start:member.end,end:720}];
  if(mode==='collective-availability'){if(!member.itinerantUnitId)continue;problem.itinerantUnits!.find(u=>u.id===member.itinerantUnitId)!.availability=[{start:member.end,end:720}];}
  const v=validate(w,problem);assert.equal(v.hardValid,false,mode);attacks.push({mode,validation:v});
 }save(label+'-memory-attacks',attacks);
 const finalStart=Math.min(...proof.tasks.filter((t:any)=>policy.phases.at(-1).includes(Number(t.id.slice(5)))).map((t:any)=>t.start));
 const rival=p.tasks.find(t=>t.id==='task:'+rivals[0])!,others=proof.tasks.filter((t:any)=>t.id!==rival.id);
 const released=canPlaceTask(p,rival,finalStart,others),held=structuredClone(others);
 for(const t of held.filter((t:any)=>policy.phases.at(-1).includes(Number(t.id.slice(5)))))t.requiredResourceIds=[...new Set([...(t.requiredResourceIds??[]),'plan-resource:'+resources[0]])];
 save(label+'-release',{memoryOnly:true,start:finalStart,released,withInventedHold:canPlaceTask(p,rival,finalStart,held)});
 assert.equal(released,true);assert.equal(canPlaceTask(p,rival,finalStart,held),false);
 if(label==='A-fixed'){
  // An actual existing scope producer validates these declarations before the
  // rejected structures are overlaid, solely in this in-memory clone.
  for(const blocksSpace of [true,false]){
   const scopedInput=withDailyTaskOperationScopes(structuredClone(input),{contractVersion:1,policies:input.tasks.filter(t=>t.itinerantTeamId!=null).map(t=>({taskId:t.id,agendaScope:'ITINERANT_UNIT',resourceInheritance:'OPERATION_ONLY',blocksSpace,itinerantUnitId:t.itinerantTeamId!,declaredResourceIds:[]}))});
   Object.assign(scopedInput,{dailyTechnicalChainsVersion:1,technicalChains:[policy],dailyJointGroupsVersion:1,dailyJointGroups:joints});
   for(const group of joints)for(const id of group.taskIds)scopedInput.tasks.find(t=>t.id===id)!.jointGroupId=group.id;
   run('agenda-'+blocksSpace,scopedInput);
  }
  const transitionProblem=structuredClone(p),unit=transitionProblem.itinerantUnits!.find(u=>u.id===p.tasks.find(t=>t.id==='task:'+policy.phases[0][0])!.itinerantUnitId)!;
  unit.transitionMinutes=5;
  const v=validate(proof,transitionProblem);assert.equal(v.hardValid,false);
  save(label+'-positive-transition',{memoryOnly:true,configuredMinutes:5,validationOfZeroGapWitness:v,explanation:'Distinct-space consecutive uses of the same unit require 5 minutes. REQUIRED zero-gap is not an implicit INCLUDED override.'});
 }
 if(label==='B-segments'){
  const left=proof.tasks.find((t:any)=>t.id==='task:'+policy.phases[0][0]),right=proof.tasks.find((t:any)=>t.id==='task:'+policy.phases[1][1]);
  const conflict=canPlaceTask(p,p.tasks.find(t=>t.id===right.id)!,left.start,[left]);
  assert.notEqual(left.itinerantUnitId,right.itinerantUnitId);assert.equal(conflict,false);
  save(label+'-shared-members',{memoryOnly:true,left,right,overlapPermitted:conflict,explanation:'AB and AC remain distinct units but both consume A. No simultaneous capacity is invented.'});
 }
 assert.equal(JSON.stringify(input),original);
 return {adapter:full.adapter.status,outcome:'PROPOSAL',valid:full.globalValidation?.hardValid,certificate:full.certificate?.status,work:full.result.evidence.work,partialWork:partial.result?.evidence.work,continuationWork:continuation.result?.evidence.work,stage:false};
}
