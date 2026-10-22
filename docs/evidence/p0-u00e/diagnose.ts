/** Focal counterfactual on the native UI/API input. Solver is unchanged. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createPlanningScope,buildAssistedProblem,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
import {generateExactSetupBlockCandidates} from '../../../engine/planner-next/exactSetupBlocks';
import {createExactSearchLedger} from '../../../engine/planner-next/exactMainAndFeederCore';
import {validatePlan} from '../../../engine/planner-next/validate';
const [source,destination]=process.argv.slice(2);
const input=JSON.parse(readFileSync(source,'utf8'));
const spaceId=input.tasks[0].spaceId;
const catalog=JSON.parse(readFileSync(resolve(dirname(source),'journey.json'),'utf8')).templates;
const familyByTemplate=new Map<number,number>(catalog.map((t:any)=>[t.id,t.setupId]));
assert.ok(input.tasks.every((t:any)=>familyByTemplate.has(t.templateId)));
const families=[...new Set(input.tasks.map((t:any)=>String(familyByTemplate.get(t.templateId))))].sort() as string[];
const counterfactual={...input,plannerNextMaterializationIssues:input.plannerNextMaterializationIssues.filter((i:any)=>i.code!=='UNSUPPORTED_SETUP_MAPPING'),
 setupPolicies:[{spaceId,families,oneBlockPerFamily:true,orderConstraint:'UNSPECIFIED',reentry:'FORBIDDEN',preparationMinutesBetweenFamilies:10}],
 tasks:input.tasks.map((t:any)=>({...t,setupFamilyId:String(familyByTemplate.get(t.templateId))}))};
const adapter=adaptEngineInputToPlannerNextProblem(counterfactual);
assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error(adapter.reasonCodes.join(','));
const problem=adapter.problem;
const scope=createPlanningScope({kind:'DAY',value:'counterfactual'},{},problem.tasks.map(t=>t.id));
const result=executeAssistedPlanning(buildAssistedProblem(problem,scope,[]));
const geometry=generateExactSetupBlockCandidates(problem,problem.tasks,[],[],[],createExactSearchLedger(problem.budget.maxBranchExpansions));
const validation=validatePlan(problem,[...result.proposal!],[...(result.evidence.selectedSetupPreparations??[])]);
writeFileSync(destination,JSON.stringify({counterfactual,adapter,geometry:{outcome:geometry.outcome,evidence:geometry.evidence},validation,result},null,2));
assert.equal(validation.hardValid,true);
console.log(JSON.stringify({outcome:result.outcome,evidence:result.evidence,proposal:result.proposal}));
assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));
