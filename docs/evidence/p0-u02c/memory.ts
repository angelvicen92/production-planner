/** Guard intervention only: source inputs and every physical policy stay unchanged. */
import assert from 'node:assert/strict';
import type {EngineInput} from '../../../engine/types';
import {withDailyTechnicalChains} from '../../../server/technicalChainStructure';
import {withDailyJointGroups} from '../../../server/jointGroupStructure';
import {withDailyAnchoredAccompaniments} from '../../../server/anchoredAccompanimentStructure';
import {withDailyTaskOperationScopes} from '../../../server/dailyTaskOperationScopes';
import {withDailyOperationalMeals} from '../../../server/operationalMealPolicy';
import {inspect} from '../p0-u00y/consumer';
import {validatePlan} from '../../../engine/planner-next/validate';
export async function memoryAudit({actual,original,authorities:a,competitorId,save}:{actual:EngineInput;original:EngineInput;authorities:any;competitorId:number;save:(n:string,v:unknown)=>void}){
 const literal=JSON.stringify(actual);
 // Reconstitute each projection through its real projector on a temporary view
 // without unrelated family markers, then restore every original authority.
 let neutral:EngineInput={...structuredClone(actual),anchoredAccompaniments:undefined,dailyAnchoredAccompanimentsVersion:undefined,dailyTaskOperationScopes:undefined,technicalChains:undefined,dailyTechnicalChainsVersion:undefined,dailyJointGroups:undefined,dailyJointGroupsVersion:undefined,operationalMealPolicies:undefined,dailyOperationalMealsVersion:undefined,tasks:actual.tasks.map(t=>({...structuredClone(t),jointGroupId:undefined}))};
 const anchored=withDailyAnchoredAccompaniments(neutral,a.anchoredAccompaniments);
 const scopes=withDailyTaskOperationScopes(anchored,a.taskOperationScopes);
 const joint=withDailyJointGroups(neutral,a.jointGroups);
 const chains=withDailyTechnicalChains(neutral,a.technicalChains);
 const pause=withDailyOperationalMeals(neutral,a.operationalMealPolicies);
 const jointIds=new Map(joint.tasks.filter(t=>t.jointGroupId).map(t=>[t.id,t.jointGroupId]));
 const combined:EngineInput={...scopes,technicalChains:chains.technicalChains,dailyTechnicalChainsVersion:chains.dailyTechnicalChainsVersion,dailyJointGroups:joint.dailyJointGroups,dailyJointGroupsVersion:joint.dailyJointGroupsVersion,operationalMealPolicies:pause.operationalMealPolicies,dailyOperationalMealsVersion:pause.dailyOperationalMealsVersion,tasks:scopes.tasks.map(t=>jointIds.has(t.id)?{...t,jointGroupId:jointIds.get(t.id)}:t)};
 assert.equal(combined.tasks.length,27);assert.ok(original.tasks.every(t=>combined.tasks.some(c=>c.id===t.id)));
 const changes=actual.tasks.map(t=>({id:t.id,fields:Object.keys({...t,...combined.tasks.find(c=>c.id===t.id)}).filter(k=>JSON.stringify((t as any)[k])!==JSON.stringify((combined.tasks.find(c=>c.id===t.id) as any)[k]))})).filter(c=>c.fields.length);
 save('intervention',{changes,authorities:a,description:'Temporarily omit unrelated family markers only while calling existing projectors. Merge their projections. No source/availability/resource/unit/profile/budget/physical-policy replacement.',experimentIsStage:false});save('combined-input',combined);
 const full=inspect(combined);save('full',full);
 const partial=inspect(combined,[competitorId]);save('partial',partial);
 let continuation:any;
 if(partial.result?.proposal){
  const ids=combined.tasks.filter(t=>!partial.result!.proposal!.some(p=>p.id===`task:${t.id}`)).map(t=>t.id);
  continuation=inspect(combined,ids,[...partial.result.proposal]);save('continuation',continuation);
 }
 const anchorPartial=inspect(combined,[a.anchoredAccompaniments.policies[0].anchorTaskId],[],true);save('anchor-partial',anchorPartial);
 const supporting=inspect(combined,[a.jointGroups.groups[0].taskIds[1]]);save('supporting-scope',supporting);
 let anchorContinuation:any;
 if(anchorPartial.result?.proposal){const remaining=combined.tasks.filter(t=>!anchorPartial.result!.proposal!.some(p=>p.id===`task:${t.id}`)).map(t=>t.id);anchorContinuation=inspect(combined,remaining,[...anchorPartial.result.proposal],true);save('anchor-continuation',anchorContinuation);}
 const witnesses=[full,partial,continuation,anchorPartial,supporting,anchorContinuation].filter(Boolean).map(x=>x.result?.evidence.nominalPhysicalFutureWitness).filter(Boolean);
 const validations=full.adapter.status==='SUPPORTED'?witnesses.map(w=>validatePlan(full.adapter.problem!,w.tasks,w.setupPreparations,w.spaceMeals,w.participantMeals,w.resourceMeals,w.itinerantUnitMeals,w.roundPreparations,w.operationalMeals)):[];
 save('witness-validations',validations);
 assert.equal(JSON.stringify(actual),literal);
 const summary={status:(full.result?(full.result.proposal?'PROPOSAL':'NO_PROPOSAL'):full.adapter.status),placed:full.result?.proposal?.length??0,partial:partial.result?.proposal?.length??0,continuation:continuation?.result?.proposal?.length??0,work:full.result?.evidence.work,reasonCodes:full.result?.evidence.reasonCodes,witnessValidations:validations,anchorPartial:anchorPartial.result?.proposal?.length??0,anchorContinuation:anchorContinuation?.result?.proposal?.length??0,supporting:!!supporting.result?.proposal,experimentIsStage:false};save('memory-summary',summary);return summary;
}
