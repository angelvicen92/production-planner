/** Conditional decision probe only. Never used as the App's schedule or a seed baseline. */
import assert from 'node:assert/strict';
import {constructExactItinerantPlan} from '../../../engine/planner-next/exactItinerantPlan';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {inspect} from '../p0-u00y/consumer';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {validatePlan} from '../../../engine/planner-next/validate';
const [source,label,output]=process.argv.slice(2);mkdirSync(output,{recursive:true});
const load=(n:string)=>JSON.parse(readFileSync(`${source}/${label}-${n}.json`,'utf8'));
const input=load('combined-input'),original=load('full'),a=load('obligations').authorities,adapter=adapt(input);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('unsupported');
const id=a.taskOperationScopes.policies[0].taskId,task=adapter.problem.tasks.find(t=>t.id===`task:${id}`)!;
const minute=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
const raw=constructExactItinerantPlan(adapter.problem,true);
assert.equal(raw.evidence.branchesExplored,original.result.evidence.work.branchesExplored);
writeFileSync(`${output}/${label}-raw-search.json`,JSON.stringify(raw,null,2));
const experiments=[];
for(const [name,start] of [['early-first-decision',minute(input.workDay.start)],['after-pause-window',minute(a.operationalMealPolicies.policies[0].window.end)]] as const){
 const fixed={...task,start,end:start+task.duration},result=inspect(input,input.tasks.filter((t:any)=>t.id!==id).map((t:any)=>t.id),[fixed]);
 const witness=result.result?.evidence.nominalPhysicalFutureWitness as any;
 const validation=witness?validatePlan(adapter.problem,witness.tasks,witness.setupPreparations,witness.spaceMeals,witness.participantMeals,witness.resourceMeals,witness.itinerantUnitMeals,witness.roundPreparations,witness.operationalMeals):null;
 experiments.push({name,conditionedPlacement:fixed,result,validation,experimentIsStage:false,notUnconditionedSuccess:true});
}
writeFileSync(`${output}/${label}-search-probe.json`,JSON.stringify({originalOutcome:original.result.proposal?'PROPOSAL':'NO_PROPOSAL',originalWork:original.result.evidence.work,firstMacroTrace:original.result.evidence.standaloneDiagnostic.macroCandidateCausalTraces[0],experiments,inputUnchanged:true,budgetUnchanged:true,experimentIsStage:false},null,2));
console.log(experiments.map(x=>({name:x.name,placed:x.result.result?.proposal?.length??0,branches:x.result.result?.evidence.work.branchesExplored,valid:x.validation?.hardValid})));
