import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {scenario,counterfactual} from '../../../docs/evidence/p0-u00k/scenario';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
import {preparePipelineBundleGraph,materializePreparedPipelineBundleMatching} from '../../../engine/planner-next/anonymousPipelineWitness';
import {nominalResourceVariants} from '../../../engine/planner-next/nominalResourceChoice';
import {diagnoseTaskPlacement} from '../../../engine/planner-next/placement';
import {createExactSearchLedger} from '../../../engine/planner-next/exactMainAndFeederCore';
const adapted=adaptEngineInputToPlannerNextProblem(counterfactual(scenario(process.cwd()),'anyOf'));
assert.equal(adapted.status,'SUPPORTED',JSON.stringify(adapted));if(adapted.status!=='SUPPORTED')throw Error();
const p=adapted.problem,architecture={pattern:p.tasks.filter(t=>t.kind==='main').map(t=>t.blockKey!),slots:[580,590]};
const generated:any[]=[];const original=Map.prototype.set;
Map.prototype.set=function(key:any,value:any){
 if(typeof key==='number'&&Array.isArray(value)&&value.some(t=>t?.nominalResourceChoice?.selectedResourceId))
  generated.push({position:key,bundle:structuredClone(value),replaced:this.has(key)?structuredClone(this.get(key)):null});
 return original.call(this,key,value);
};
let prepared;try{prepared=preparePipelineBundleGraph(p,architecture);}finally{Map.prototype.set=original;}
assert.ok(prepared);
const ledger=createExactSearchLedger(p.budget.maxBranchExpansions),consume=()=>ledger.consume('CORE');
const selected=materializePreparedPipelineBundleMatching(p,prepared,new Set(),undefined,consume);
// B is occupied by a genuine singleton obligation; A remains legal at both Main spots.
const critical={...p.tasks.find(t=>t.id==='task:20')!,requiredResourceIds:['plan-resource:102'],nonSubstitutableResourceIds:['plan-resource:102'],start:575,end:605};
const rejected=materializePreparedPipelineBundleMatching(p,prepared,new Set(),undefined,consume,undefined,[critical]);
const main=p.tasks.find(t=>t.id==='task:4')!,variants=nominalResourceVariants(main);
const diagnoses=variants.map(task=>({selected:task.nominalResourceChoice!.selectedResourceId,at580:diagnoseTaskPlacement(p,task,580,[critical]),at590:diagnoseTaskPlacement(p,task,590,[critical])}));
assert.equal(generated.filter(x=>x.position===0).length,2);assert.ok(generated.some(x=>x.replaced));assert.ok(selected);assert.equal(rejected,null);
const result={generated,retained:[...prepared.candidates.get(main.id)!],selected,rejected,diagnoses,ledger:{limit:ledger.limit,branches:ledger.branchesExplored},conclusion:'Both variants constructed at the same task/spot. Map.set overwrites A with B; reservation rejects B and matching cannot recover viable A.'};
writeFileSync(process.argv[2],JSON.stringify(result,null,2));console.log(result.conclusion);
