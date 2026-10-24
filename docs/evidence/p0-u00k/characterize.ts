import {buildAnonymousPipelineWitness,materializeNominalPipelineWitness,preparePipelineBundleGraph,
  materializePreparedPipelineBundleMatching,futureStructuralWitnessFromMaterialization,
  futureStructuralWitnessV2FromAcceptedPipeline,revalidateFutureStructuralWitnessDetailed} from '../../../engine/planner-next/anonymousPipelineWitness';
import {nominalResourceVariants} from '../../../engine/planner-next/nominalResourceChoice';
import {canPlaceTask,diagnoseTaskPlacement,exactTaskStaticStartDomain,exactTaskDynamicStartDomain} from '../../../engine/planner-next/placement';
import {fingerprint} from '../../../engine/planner-next/fingerprint';
import {validatePlan} from '../../../engine/planner-next/validate';
import {executePlannerNext} from '../../../engine/planner-next/executePlannerNext';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {createExactSearchLedger,incrementallyRepairMatchingWitness} from '../../../engine/planner-next/exactMainAndFeederCore';
import type {PlannerNextProblem,ScheduledTask} from '../../../engine/planner-next/contracts';

/** Direct calls characterize existing authorities; selected inputs are controls,
 * never a nominal solver or an injected search result. */
export function characterize(problem:PlannerNextProblem) {
  const main=problem.tasks.find(t=>t.id==='task:4')!,critical=problem.tasks.find(t=>t.id==='task:20')!;
  const architecture={pattern:problem.tasks.filter(t=>t.kind==='main').map(t=>t.blockKey!),slots:[580,590]};
  const staticCritical=exactTaskStaticStartDomain(problem,critical);
  const criticalPlacement={...critical,start:575,end:605} as ScheduledTask;
  const graphs:unknown[]=[],variants:unknown[]=[];
  for(const task of nominalResourceVariants(main)) {
    variants.push({task,staticDomain:exactTaskStaticStartDomain(problem,task),
      dynamicWithCritical:exactTaskDynamicStartDomain(problem,task,[criticalPlacement],exactTaskStaticStartDomain(problem,task)),
      at580:diagnoseTaskPlacement(problem,task,580,[criticalPlacement]),
      at590:diagnoseTaskPlacement(problem,task,590,[criticalPlacement])});
  }
  const graph=(label:string,p:PlannerNextProblem)=>{
    const ledger=createExactSearchLedger(p.budget.maxBranchExpansions),consume=()=>ledger.consume('CORE');
    const diagnostics:unknown[]=[],witness=buildAnonymousPipelineWitness(p,architecture,d=>diagnostics.push(d));
    const nominal=materializeNominalPipelineWitness(p,architecture),prepared=preparePipelineBundleGraph(p,architecture,[],nominal);
    const matchingDiagnostic={} as NonNullable<Parameters<typeof materializePreparedPipelineBundleMatching>[7]>;
    const materialized=prepared?materializePreparedPipelineBundleMatching(p,prepared,new Set(),undefined,consume,undefined,[],matchingDiagnostic):null;
    const reservedDiagnostic={} as NonNullable<typeof matchingDiagnostic>;
    const reserved=prepared?materializePreparedPipelineBundleMatching(p,prepared,new Set(),undefined,consume,undefined,[criticalPlacement],reservedDiagnostic):null;
    const edges=prepared?[...prepared.candidates].flatMap(([id,row])=>[...row].map(([position,bundle])=>
      ({key:`${id}@${position}`,mainTaskId:id,position,bundle}))):[];
    const positions=prepared?new Map([...prepared.candidates].map(([id,row])=>[id,[...row.keys()]])):new Map<string,number[]>();
    const initial=prepared?incrementallyRepairMatchingWitness(prepared.mainIds,positions,new Set(),new Set(),new Map(),consume):null;
    const forbidden=initial?.matching?new Set([`${main.id}@${initial.matching.get(main.id)}`]):new Set<string>();
    const repaired=initial?.matching&&prepared?incrementallyRepairMatchingWitness(prepared.mainIds,positions,forbidden,new Set(),initial.matching,consume):null;
    const coreIds=new Set(materialized?.scheduledTasks.map(t=>t.id)??[]);
    const coreProblem={...p,tasks:p.tasks.filter(t=>coreIds.has(t.id)),transportPolicy:p.transportPolicy?{
      arrival:{...p.transportPolicy.arrival,taskIds:p.transportPolicy.arrival.taskIds.filter(id=>coreIds.has(id))},
      departure:{...p.transportPolicy.departure,taskIds:p.transportPolicy.departure.taskIds.filter(id=>coreIds.has(id))}}:undefined};
    const v1=materialized?futureStructuralWitnessFromMaterialization(p,architecture,materialized):null;
    const v2=materialized?futureStructuralWitnessV2FromAcceptedPipeline(p,architecture,witness.fingerprint,materialized.scheduledTasks):null;
    const protectedCore=materialized?.scheduledTasks.filter(t=>t.kind==='main'||t.kind==='vocal')??[];
    graphs.push({label,architecture,witness,diagnostics,nominalSchedule:nominal.scheduledTasks,
      nominalMainPlacement:diagnoseTaskPlacement(p,p.tasks.find(t=>t.id===main.id)!,580,[]),
      edges,preparedBundleEdges:prepared?.preparedBundleEdges,matchingDiagnostic,materialized,
      matchingLedger:{limit:ledger.limit,branchesExplored:ledger.branchesExplored,lastExhaustionPhase:ledger.lastExhaustionPhase},
      reservedDiagnostic,reserved,initial,forbidden:[...forbidden],repaired,
      validation:materialized?validatePlan(coreProblem,[...materialized.scheduledTasks]):null,
      v1,v2,v1Revalidation:v1?revalidateFutureStructuralWitnessDetailed(p,architecture,protectedCore,v1):null,
      v2Revalidation:v2?revalidateFutureStructuralWitnessDetailed(p,architecture,protectedCore,v2):null});
  };
  graph('as-adapted',problem);
  const selectedControls:unknown[]=[];
  if(main.nominalResourceChoice)for(const selected of nominalResourceVariants(main)){
    const p={...problem,tasks:problem.tasks.map(t=>t.id===main.id?selected:t)};
    graph(selected.nominalResourceChoice!.selectedResourceId!,p);
    const execution=executePlannerNext(p,{causalDiagnostic:true});
    const partial=executeAssistedPlanning(buildAssistedProblem(p,
      createPlanningScope({kind:'TASK_IDS',value:'Main only, future pending'},{},[main.id]),[],new Set(p.tasks.map(t=>t.id))));
    selectedControls.push({selected:selected.nominalResourceChoice!.selectedResourceId,execution,partial});
  }
  const sameTimeVariants=nominalResourceVariants(main).map(task=>({...task,start:580,end:590} as ScheduledTask));
  const positive=selectedControls.find((c:any)=>c.selected==='plan-resource:102') as {execution:ReturnType<typeof executePlannerNext>}|undefined;
  const complete=positive?.execution.result?.scheduledTasks;
  const forgeries=complete?[
    {label:'omitted nominal selection',tasks:complete.map(t=>t.id===main.id?{...t,requiredResourceIds:[],nominalResourceChoice:main.nominalResourceChoice}:t)},
    {label:'critical future obligation omitted',tasks:complete.filter(t=>t.id!==critical.id)},
    {label:'selected A collides with critical future',tasks:complete.map(t=>t.id===main.id?{...sameTimeVariants[0],start:t.start,end:t.end}:t)},
  ].map(({label,tasks})=>({label,fingerprint:fingerprint(tasks),validation:validatePlan(problem,tasks)})):[];
  return {architecture,staticCritical,criticalPlacement,variants,graphs,selectedControls,
    forgeries,
    rawPlacement:diagnoseTaskPlacement(problem,main,580,[]),rawCanPlace:canPlaceTask(problem,main,580,[]),
    fingerprints:sameTimeVariants.map(task=>({selected:task.nominalResourceChoice?.selectedResourceId,fingerprint:fingerprint([task])})),
    method:'Direct authorities; architecture inferred from the hard Main window and two ten-minute tasks, not a human schedule. No call result is used as a solver seed.'};
}
