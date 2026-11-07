/** Memory-only protected continuation; never applies a Draft or SQL Stage. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {buildAssistedProblem,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {validatePlan} from '../../../engine/planner-next/validate';
const directory=process.argv[2],input=JSON.parse(readFileSync(directory+'/input.json','utf8')),first=JSON.parse(readFileSync(directory+'/run.json','utf8'));
const a=adapt(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('adapter');
const fixed=first.proposal;assert.ok(fixed?.length);
const scope=resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:input.tasks.filter((t:any)=>!fixed.some((p:any)=>p.id==='task:'+t.id)).map((t:any)=>t.id)});
const b=buildAssistedProblem(a.problem,scope.scope,fixed,analyticalFutureEligibleTaskIds(input,a.identityMap));
const run=executeAssistedPlanning(b),proof=run.evidence.nominalPhysicalFutureWitness;
let validation=null;if(proof){
 validation=validatePlan(a.problem,proof.tasks,proof.setupPreparations as any,proof.spaceMeals as any,proof.participantMeals as any,proof.resourceMeals as any,proof.itinerantUnitMeals as any,proof.roundPreparations as any,proof.operationalMeals as any);
 for(const t of fixed)assert.deepEqual(proof.tasks.find(p=>p.id===t.id),t);
}
writeFileSync(directory+'/continuation.json',JSON.stringify({scope,result:run,validation,memoryOnly:true,sqlStages:0},null,2));
console.log(JSON.stringify({memoryOnly:true,complete:!!proof&&validation?.hardValid===true,proposal:run.proposal?.length??0,branches:run.evidence.work.branchesExplored,reasons:run.evidence.reasonCodes,sqlStages:0}));
