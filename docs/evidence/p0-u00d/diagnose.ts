/** Read-only focal observer: consume the native UI-created adapter output. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createPlanningScope,buildAssistedProblem,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {materializeItinerantUnitAssignment} from '../../../engine/planner-next/itinerantUnitAssignment';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
const [source,destination]=process.argv.slice(2);
const raw=JSON.parse(readFileSync(source,'utf8'));
const counterfactual=process.argv.includes('--baseline-input');
const adapter=counterfactual?adaptEngineInputToPlannerNextProblem({...raw,
  plannerNextMaterializationIssues:raw.plannerNextMaterializationIssues.filter((issue:any)=>
    issue.code!=='UNSUPPORTED_TASK_ROLE'||!raw.tasks.some((task:any)=>task.id===issue.taskId&&['auxiliary','technical'].includes(task.plannerNextKind))),
}):raw;
assert.equal(adapter.status,'SUPPORTED');
const problem=adapter.problem;
const scope=createPlanningScope({kind:'DAY',value:'focal'},{},problem.tasks.map((t:any)=>t.id));
const result=executeAssistedPlanning(buildAssistedProblem(problem,scope,[]));
const physical=problem.tasks.filter((t:any)=>t.itinerantUnitId).map((t:any)=>({taskId:t.id,unit:t.itinerantUnitId,
 actualResources:t.requiredResourceIds??[],materializedResources:materializeItinerantUnitAssignment(problem,t,t.itinerantUnitId)?.requiredResourceIds}));
writeFileSync(destination,JSON.stringify({source,mode:counterfactual?'COUNTERFACTUAL_PROFILE_GATE_ONLY':'OBSERVED_AFTER_PROFILE_GATE',problemFingerprint:adapter.problemFingerprint,identityMap:adapter.identityMap,physical,result},null,2));
console.log(JSON.stringify({reasonCodes:result.evidence.reasonCodes,physical}));
