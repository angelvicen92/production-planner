/** Change one ephemeral supporting placement while preserving the visible proposal and all physical authorities. */
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';
import {validatePlan} from '../../../engine/planner-next/validate';
import {certifyDailyTechnicalChain} from '../../../server/technicalChainCertificate';
const base=process.argv[2],r=JSON.parse(readFileSync(`${base}/integrated-scope-unit.json`,'utf8')),p=r.adapter.problem,original=r.result.evidence.nominalPhysicalFutureWitness;
const support=r.result.evidence.supportingTaskIds,visible=new Set(r.result.proposal.map((t:any)=>t.id));assert.equal(r.result.evidence.acceptedSupportingPlacements.length,0);assert.ok(support.length>0);
let repaired:any=null;
for(const id of support){for(let start=p.day.start;start<=p.day.end;start+=5){
 const proof=structuredClone(original),task=proof.tasks.find((t:any)=>t.id===id);if(!task||start===task.start||visible.has(id))continue;const old={start:task.start,end:task.end};task.start=start;task.end=start+task.duration;
 const v=validatePlan(p,proof.tasks,proof.setupPreparations??[],proof.spaceMeals??[],proof.participantMeals??[],proof.resourceMeals??[],proof.itinerantUnitMeals??[],proof.roundPreparations??[],proof.operationalMeals??[]);
 if(v.hardValid){const certificate=certifyDailyTechnicalChain(p,r.result.proposal,0,proof);assert.equal(certificate?.status,'WITNESS');repaired={memoryOnly:true,stage:false,changed:id,old,next:{start:task.start,end:task.end},supportingTaskIds:support,acceptedSupportingPlacements:[],visibleProposal:r.result.proposal,validation:v,certificate,proof};break;}
}if(repaired)break;}
assert.ok(repaired,'At least one supporting placement remains reparable');writeFileSync(process.argv[3],JSON.stringify(repaired,null,2));console.log(JSON.stringify({status:'PASS',changed:repaired.changed,old:repaired.old,next:repaired.next}));
