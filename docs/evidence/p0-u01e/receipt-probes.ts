/** Offline interventions on recorded memory witnesses; never creates a run. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {validatePlan} from '../../../engine/planner-next/validate';
import {certifyDailyTechnicalChain} from '../../../server/technicalChainCertificate';
import {resolveEffectiveTaskResourceAssignments} from '../../../engine/planner-next/integration/effectiveTaskResourceAssignments';
const base=process.argv[2],output=process.argv[3];
const read=(name:string)=>JSON.parse(readFileSync(`${base}/${name}.json`,'utf8'));
const r=read('A-fixed-memory-scope-unit'),p=r.adapter.problem,proof=structuredClone(r.result.evidence.nominalPhysicalFutureWitness);
const supporting=r.result.evidence.supportingTaskIds.map((id:string)=>proof.tasks.find((t:any)=>t.id===id));assert.equal(supporting.length,3);
const [left,right]=supporting;[left.start,right.start]=[right.start,left.start];left.end=left.start+left.duration;right.end=right.start+right.duration;
const validation=validatePlan(p,proof.tasks,proof.setupPreparations??[],proof.spaceMeals??[],proof.participantMeals??[],proof.resourceMeals??[],proof.itinerantUnitMeals??[],proof.roundPreparations??[],proof.operationalMeals??[]);
assert.ok(validation.hardValid);const certificate=certifyDailyTechnicalChain(p,r.result.proposal,0,proof);assert.equal(certificate?.status,'WITNESS');
assert.equal(r.result.evidence.acceptedSupportingPlacements.length,0);
const input=read('A-fixed-input'),policy=read('A-fixed-authoring').policy,finalId=policy.phases.at(-1).at(-1),last=input.tasks.find((t:any)=>t.id===finalId),unit=input.itinerantTeamAvailability.find((u:any)=>u.itinerantTeamId===input.tasks.find((t:any)=>t.id===policy.phases[0][0]).itinerantTeamId);
const original=resolveEffectiveTaskResourceAssignments(input).assignments.find(t=>t.taskId===finalId);
Object.assign(last,{itinerantTeamId:unit.itinerantTeamId,itinerantTeamRequirement:'specific',allowedItinerantTeamIds:[unit.itinerantTeamId]});
const forced=resolveEffectiveTaskResourceAssignments(input).assignments.find(t=>t.taskId===finalId);assert.equal(forced!.effectiveResourceIds.length,3);assert.equal(original!.effectiveResourceIds.length,1);
writeFileSync(output,JSON.stringify({memoryOnly:true,stage:false,supportingRepair:{changedTaskIds:[left.id,right.id],acceptedSupportingPlacements:[],validation,certificate,unchangedScopeProposal:r.result.proposal},forcedSameUnit:{original,forced,unit,explanation:'Requiring the fixed AB unit on the final C task consumes ABC. Release requires dropping that unit requirement, not renaming its space.'}},null,2));
