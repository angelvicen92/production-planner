import type {EngineInput} from '../../../engine/types';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {preflightEngineInputForPlannerNext as preflight} from '../../../engine/planner-next/integration/engineInputPreflight';
import {buildAssistedProblem,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {resolveAssistedScope,expandVisiblePrerequisites,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {validatePlan} from '../../../engine/planner-next/validate';
import type {ScheduledTask} from '../../../engine/planner-next/contracts';
export function inspect(input:EngineInput,ids=input.tasks.map(t=>t.id),protectedPlacements:ScheduledTask[]=[],includePrerequisites=false){
 const adapter=adapt(input),pf=preflight(input);
 if(adapter.status!=='SUPPORTED')return {preflight:pf,adapter,requested:undefined,scope:undefined,problem:undefined,result:undefined,validation:undefined};
 const requested=resolveAssistedScope(input,adapter,{kind:'TASK_IDS',taskIds:ids});
 const scope=includePrerequisites?expandVisiblePrerequisites(input,requested,adapter):requested;
 const problem=buildAssistedProblem(adapter.problem,scope.scope,protectedPlacements,analyticalFutureEligibleTaskIds(input,adapter.identityMap));
 const result=executeAssistedPlanning(problem);
 return {preflight:pf,adapter,requested,scope,problem,result,
  ...(result.proposal?{validation:validatePlan(adapter.problem,[...protectedPlacements,...result.proposal])}:{})};
}
