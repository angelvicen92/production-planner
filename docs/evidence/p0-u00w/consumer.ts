/** Read-only interventions on API-created sources. No placements supplied to search. */
import assert from 'node:assert/strict';
import type {EngineInput} from '../../../engine/types';
import {withDailyAnchoredAccompaniments} from '../../../server/anchoredAccompanimentStructure';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {preflightEngineInputForPlannerNext as preflight} from '../../../engine/planner-next/integration/engineInputPreflight';
import {buildAssistedProblem,executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
import {resolveAssistedScope,expandVisiblePrerequisites,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {runExactMainAndFeederSearch} from '../../../engine/planner-next/exactMainAndFeederCore';
import {validatePlan} from '../../../engine/planner-next/validate';
import type {AnchoredAccompanimentStructure} from '../../../shared/anchoredAccompanimentStructure';
import type {ScheduledTask} from '../../../engine/planner-next/contracts';
type Policy=Extract<AnchoredAccompanimentStructure,{contractVersion:1}>['policies'][number];
export function project(source:EngineInput,policies:Policy[],units:number[],selection:(number|null)[]):EngineInput{
 let input=structuredClone(source);const contracts:NonNullable<EngineInput['anchoredAccompaniments']>=[];
 for(const p of policies){input=withDailyAnchoredAccompaniments(input,{contractVersion:1,policies:[p]});contracts.push(...input.anchoredAccompaniments!);}
 input.anchoredAccompaniments=contracts;
 const compositionResources=new Set(input.itinerantTeamAvailability!.filter(u=>units.includes(u.itinerantTeamId)).flatMap(u=>u.planResourceItemIds??[]));
 for(const [i,p] of policies.entries())for(const id of [...p.beforeTaskIds,p.anchorTaskId,...p.afterTaskIds]){
  const t=input.tasks.find(t=>t.id===id)!,chosen=selection[i];
  t.assignedResourceIds=(t.assignedResourceIds??[]).filter(id=>!compositionResources.has(id)||t.declaredResourceIds?.includes(id));
  t.itinerantTeamRequirement=chosen===null?'any':'specific';t.itinerantTeamId=chosen;
  t.allowedItinerantTeamIds=chosen===null?[...units]:[chosen];
 }
 return input;
}
export function inspect(input:EngineInput,visibleIds=input.tasks.map(t=>t.id),protectedPlacements:ScheduledTask[]=[]){
 const before=JSON.stringify(input),adapter=adapt(input),pf=preflight(input);
 if(adapter.status!=='SUPPORTED')return {preflight:pf,adapter,experimentIsStage:false};
 const scope=expandVisiblePrerequisites(input,resolveAssistedScope(input,adapter,{kind:'TASK_IDS',taskIds:visibleIds}),adapter);
 const problem=buildAssistedProblem(adapter.problem,scope.scope,protectedPlacements,analyticalFutureEligibleTaskIds(input,adapter.identityMap));
 const result=execute(problem),repeated=execute(problem);
 assert.deepEqual(result.proposal,repeated.proposal);assert.equal(result.evidence.fingerprint,repeated.evidence.fingerprint);
 const choices:unknown[]=[];
 const core=runExactMainAndFeederSearch(problem.problem,{causalDiagnostic:true,fixedPlacements:protectedPlacements,fixedPlacementsAsContext:true,
  onMainChoicesRanked:(_,ordered)=>choices.push(ordered.map(c=>({id:c.mainTask.id,slot:c.slot,operation:c.operationTasks.map(t=>({id:t.id,unit:t.itinerantUnitId??null,resources:t.requiredResourceIds??[]}))}))) });
 assert.equal(JSON.stringify(input),before);
 const operationSelections=(adapter.problem.anchoredAccompaniments??[]).map(c=>{
  const ids=[...c.beforeTaskIds,c.anchorTaskId,...c.afterTaskIds];
  const tasks=ids.map(id=>result.proposal?.find(t=>t.id===id));
  const selected=[...new Set(tasks.map(t=>t?.itinerantUnitId).filter((id):id is string=>!!id))];
  return {id:c.id,complete:tasks.every(Boolean),selected,oneCommonUnit:tasks.every(Boolean)&&selected.length===1&&tasks.every(t=>t!.itinerantUnitId===selected[0]),tasks};
 });
 return {experimentIsStage:false,preflight:pf,adapter,scope,problem,result,core,choices,operationSelections,
  ...(result.proposal?{validation:validatePlan(adapter.problem,[...result.proposal])}:{})};
}
