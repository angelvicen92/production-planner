/** Memory-only consumer differential; never calls persistence or a product writer. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,executeAssistedPlanning as execute,createPlanningScope} from '../../../engine/planner-next/assistedPlanning';
import {constructExactMainAndFeederCore} from '../../../engine/planner-next/exactMainAndFeederCore';
import {materializeAnchoredOperation} from '../../../engine/planner-next/anchoredAccompaniment';
import {validatePlan} from '../../../engine/planner-next/validate';
const input=JSON.parse(readFileSync(process.argv[2],'utf8')),adapted=adapt(input);
assert.equal(adapted.status,'SUPPORTED');if(adapted.status!=='SUPPORTED')throw Error('unsupported');
const p=adapted.problem;
const scope=(ids:string[])=>createPlanningScope({kind:'TASK_IDS',value:ids.join(',')},{},ids);
const full=buildAssistedProblem(p,scope(p.tasks.map(t=>t.id)),[]),result=execute(full);
const ordinary=structuredClone(p);delete ordinary.anchoredAccompaniments;
const ordinaryResult=execute(buildAssistedProblem(ordinary,scope(ordinary.tasks.map(t=>t.id)),[]));
const contract=p.anchoredAccompaniments![0]!,anchor=p.tasks.find(t=>t.id===contract.anchorTaskId)!;
const materializerStarts=[];
for(let start=p.day.start;start+anchor.duration<=p.day.end;start+=5){
 const operation=materializeAnchoredOperation(p,anchor,start,[]);
 if(operation)materializerStarts.push({anchorStart:start,operationStart:operation.start,operationEnd:operation.end});
}
const independent=p.tasks.find(t=>![contract.anchorTaskId,...contract.beforeTaskIds,...contract.afterTaskIds].includes(t.id)&&t.kind!=='vocal')!;
const partial=buildAssistedProblem(p,scope([independent.id]),[],new Set(p.tasks.map(t=>t.id)));
const partialResult=execute(partial);
const out={mode:'DIAGNOSTIC_ONLY',inputUntouched:true,experimentIsStage:false,problem:p,full,result,ordinaryResult,
 core:constructExactMainAndFeederCore(p),materializerStarts,partial,partialResult,
 ...(result.proposal?{validation:validatePlan(p,[...result.proposal])}:{})};
writeFileSync(process.argv[3],JSON.stringify(out,null,2));
console.log(JSON.stringify({reasons:result.evidence.reasonCodes,proposal:result.proposal,work:result.evidence.work,ordinary:ordinaryResult.evidence.reasonCodes,materializerStarts:materializerStarts.length,partial:partialResult.evidence.reasonCodes,partialProposal:partialResult.proposal}));
