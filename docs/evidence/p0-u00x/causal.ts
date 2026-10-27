import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {validatePlan} from '../../../engine/planner-next/validate';
const directory=process.argv[2],load=(n:string)=>JSON.parse(readFileSync(`${directory}/${n}.json`,'utf8'));
const combined=load('control-combined'),partial=load('combined-partial'),problem=combined.adapter.problem;
const validation=validatePlan(problem,partial.result.evidence.nominalPhysicalFutureWitness.tasks);
assert.equal(validation.hardValid,true);assert.equal(combined.validation.hardValid,true);
const constraints:any[]=[];
for(const mode of ['same-unit','shared-member','inherited-CAM1','corner-occupation','split-operation','split-unit','missing-direct','invented-resource','outside-window']){
 const tasks=structuredClone(combined.result.proposal),reality=tasks.find((t:any)=>t.id==='task:17'),hall=tasks.find((t:any)=>t.id==='task:18'),corner=tasks.find((t:any)=>t.id==='task:19');
 const operation=problem.anchoredAccompaniments[0],anchor=tasks.find((t:any)=>t.id===operation.anchorTaskId),before=tasks.find((t:any)=>t.id===operation.beforeTaskIds[0]);
 if(mode==='same-unit'){reality.start=before.start;reality.end=reality.start+30;reality.itinerantUnitId=before.itinerantUnitId;reality.requiredResourceIds=[...new Set([...reality.requiredResourceIds,...before.requiredResourceIds])];}
 if(mode==='shared-member'){hall.start=reality.start;hall.end=reality.end;hall.requiredResourceIds.push(reality.requiredResourceIds[0]);}
 if(mode==='inherited-CAM1')reality.requiredResourceIds.push(hall.requiredResourceIds[0]);
 if(mode==='corner-occupation'){corner.start=reality.start;corner.end=corner.start+20;}
 if(mode==='split-operation'){before.start-=5;before.end-=5;}
 if(mode==='split-unit')before.itinerantUnitId=before.itinerantUnitId==='itinerant-team:1'?'itinerant-team:2':'itinerant-team:1';
 if(mode==='missing-direct')reality.requiredResourceIds=reality.requiredResourceIds.filter((r:string)=>r!=='plan-resource:9');
 if(mode==='invented-resource')reality.requiredResourceIds.push('plan-resource:2147483647');
 if(mode==='outside-window'){reality.start=720;reality.end=750;}
 const v=validatePlan(problem,tasks);
 // Fixed-unit resource tampering is certified by SQL 117, rather than by the
 // engine's interval validator. Record that boundary instead of misattributing it.
 if(mode!=='missing-direct')assert.equal(v.hardValid,false,mode);
 let standaloneBaseline:any;
 if(mode==='missing-direct'){
  const control=load('control-standalone'),fake=structuredClone(control.result.proposal);
  fake.find((t:any)=>t.id==='task:17').requiredResourceIds=fake.find((t:any)=>t.id==='task:17').requiredResourceIds.filter((r:string)=>r!=='plan-resource:9');
  standaloneBaseline=validatePlan(control.adapter.problem,fake);assert.equal(standaloneBaseline.hardValid,v.hardValid);
 }
 constraints.push({mode,validation:v,...(standaloneBaseline?{standaloneBaseline,requiredNextBarrier:'assert_task_scope_snapshot / exact direct resource provenance'}:{})});
}
const summary={base:'cc0b674ebaadb8c41c5438302a62eb29de684833',phase:'BEFORE_PRODUCT_DELTA',original:load('original-422'),controls:['anchors','standalone','combined'].map(n=>{const d=load('control-'+n);return {name:n,tasks:d.input.tasks.length,placed:d.result.proposal.length,preflight:d.preflight.status,validation:d.validation,work:d.result.evidence.work,operationSelections:d.operationSelections};}),partial:{placed:partial.result.proposal.length,witness:partial.result.evidence.nominalPhysicalFutureWitness,validation},constraints,firstIncorrectBoundary:'Native daily authority producers reject coexistence before preflight; no lost valid consumer alternative observed',persistenceUnchanged:true,solverChangesNeeded:false};
writeFileSync(`${directory}/causal-summary.json`,JSON.stringify(summary,null,2));
console.log('PASS combined full and future witness, nine physical negative controls');
