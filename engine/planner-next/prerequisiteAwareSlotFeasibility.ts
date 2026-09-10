import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { checkMacroPendingPrerequisites, type MacroPendingPrerequisiteForwardCache } from "./macroPendingPrerequisiteForwardCheck";
import { createPendingCompletionDeadlineAuthority } from "./pendingCompletionDeadlineAuthority";
import { maximumBipartiteMatchingCardinality } from "./macroScheduling";
import { maximumAnonymousArrivalCapacity } from "./transportGrouping";

/** A necessary-only authority: abstention is deliberately represented as usable. */
export type PrerequisiteAwareSlotVerdict = "PROVEN_IMPOSSIBLE" | "NOT_PROVEN_IMPOSSIBLE";

export type PrerequisiteAwareSlotAuthority = ((
  task: Task,
  start: number,
) => PrerequisiteAwareSlotVerdict) & {
  geometryFeasible?(latestCompatibleStarts: readonly { task: Task; start: number }[]): PrerequisiteAwareSlotVerdict;
  arrivalInjectiveFeasible?(edges: readonly { task: Task; slotId: string; start: number }[]): ArrivalInjectiveEnvelopeAssessment;
};

export interface ArrivalInjectiveEnvelopeAssessment {
  verdict: PrerequisiteAwareSlotVerdict;
  checked: boolean;
  edgeDeadlineChecks: number;
  maxMatchingChecks: number;
  firstCertificate: { cutoff: number; minimumDemand: number; maximumPossible: number } | null;
}

/**
 * Builds the cheap edge authority used by structural macro matchings.  It uses
 * only necessary analytic certificates; the exact child remains authoritative
 * whenever those certificates cannot decide.
 */
export function createPrerequisiteAwareSlotAuthority(problem:PlannerNextProblem,pending:readonly Task[],
  placed:readonly ScheduledTask[],meals:readonly ScheduledSpaceMeal[]=[],cache?:MacroPendingPrerequisiteForwardCache):PrerequisiteAwareSlotAuthority{
  const orderedPending=[...pending].sort((a,b)=>a.id.localeCompare(b.id));
  const pendingById=new Map(orderedPending.map(task=>[task.id,task]));
  const verdicts=new Map<string,PrerequisiteAwareSlotVerdict>();
  const authority=((task:Task,start:number)=>{
    const key=`${task.id}\u0000${start}`;
    const cached=verdicts.get(key);if(cached)return cached;
    const scheduled=scoreAuxiliaryTask(problem,task,start,placed).scheduled;
    const ancestorIds=new Set<string>();
    const visit=(id:string):void=>{const candidate=pendingById.get(id);if(!candidate)return;
      for(const dependency of candidate.dependencies)if(!ancestorIds.has(dependency)){ancestorIds.add(dependency);visit(dependency);}};
    visit(task.id);
    const remaining=orderedPending.filter(item=>ancestorIds.has(item.id));
    const assessment=checkMacroPendingPrerequisites(problem,remaining,placed,[scheduled],meals,cache,
      "AFFECTED_PREREQUISITES","ANALYTIC_CAPACITY_ONLY");
    const verdict=assessment.feasible?"NOT_PROVEN_IMPOSSIBLE":"PROVEN_IMPOSSIBLE";
    verdicts.set(key,verdict);return verdict;
  }) as PrerequisiteAwareSlotAuthority;
  const geometryVerdicts=new Map<string,PrerequisiteAwareSlotVerdict>();
  const arrivalDeadlineByTaskAndStart=new Map<string,number>();
  const arrivalCapacityByCutoff=new Map<number,ReturnType<typeof maximumAnonymousArrivalCapacity>>();
  authority.geometryFeasible=(bounds)=>{
    const ordered=[...bounds].sort((a,b)=>a.task.id.localeCompare(b.task.id)||a.start-b.start);
    if(!ordered.length)return "NOT_PROVEN_IMPOSSIBLE";
    const key=ordered.map(({task,start})=>`${task.id}@${start}`).join("|");
    const cached=geometryVerdicts.get(key);if(cached)return cached;
    const ancestorIds=new Set<string>();
    const visit=(id:string):void=>{const candidate=pendingById.get(id);if(!candidate)return;
      for(const dependency of candidate.dependencies)if(!ancestorIds.has(dependency)){ancestorIds.add(dependency);visit(dependency);}};
    for(const {task} of ordered)visit(task.id);
    const terminalStartBounds=new Map(ordered.map(({task,start})=>[task.id,start]));
    const remaining=orderedPending.filter(task=>ancestorIds.has(task.id)&&!terminalStartBounds.has(task.id));
    const assessment=checkMacroPendingPrerequisites(problem,remaining,placed,[],meals,cache,
      "AFFECTED_PREREQUISITES","ANALYTIC_CAPACITY_ONLY",terminalStartBounds);
    const verdict=assessment.feasible?"NOT_PROVEN_IMPOSSIBLE":"PROVEN_IMPOSSIBLE";
    geometryVerdicts.set(key,verdict);return verdict;
  };
  authority.arrivalInjectiveFeasible=(edges)=>{
    const abstain=():ArrivalInjectiveEnvelopeAssessment=>({verdict:"NOT_PROVEN_IMPOSSIBLE",checked:false,
      edgeDeadlineChecks:0,maxMatchingChecks:0,firstCertificate:null});
    if(!edges.length)return abstain();
    const taskIds=[...new Set(edges.map(({task})=>task.id))];
    const slotIds=[...new Set(edges.map(({slotId})=>slotId))];
    const tasks=taskIds.map(id=>pendingById.get(id)).filter((task):task is Task=>Boolean(task));
    if(tasks.length!==taskIds.length||tasks.some(task=>!task.participantId)
      ||new Set(tasks.map(task=>task.participantId)).size!==tasks.length)return abstain();
    const arrivalIds=new Set(problem.transportPolicy?.arrival.taskIds??[]);
    const arrivalByParticipant=new Map(problem.tasks.filter(task=>arrivalIds.has(task.id)&&task.participantId)
      .map(task=>[task.participantId!,task]));
    if(tasks.some(task=>!arrivalByParticipant.has(task.participantId!)))return abstain();
    const edgeDeadlines=new Map<string,number>();
    for(const edge of [...edges].sort((a,b)=>a.task.id.localeCompare(b.task.id)||a.slotId.localeCompare(b.slotId))){
      const cacheKey=`${edge.task.id}\u0000${edge.start}`;
      let deadline=arrivalDeadlineByTaskAndStart.get(cacheKey);
      if(deadline===undefined){
        const terminal=new Map([[edge.task.id,edge.start]]);
        const deadlineAuthority=createPendingCompletionDeadlineAuthority(problem,orderedPending,placed,meals,terminal);
        const arrival=arrivalByParticipant.get(edge.task.participantId!)!;
        deadline=deadlineAuthority.completionDeadline(arrival.id);
        arrivalDeadlineByTaskAndStart.set(cacheKey,deadline);
      }
      edgeDeadlines.set(`${edge.task.id}\u0000${edge.slotId}`,deadline);
    }
    const placedForcedDeadline=new Map<string,number>();
    for(const scheduled of placed)if(scheduled.participantId&&arrivalByParticipant.has(scheduled.participantId))
      placedForcedDeadline.set(scheduled.participantId,Math.min(placedForcedDeadline.get(scheduled.participantId)??problem.day.end,scheduled.start));
    const cutoffs=[...new Set([...edgeDeadlines.values(),...placedForcedDeadline.values()])].sort((a,b)=>a-b);
    let maxMatchingChecks=0;
    for(const cutoff of cutoffs){
      const baseForced=new Set([...placedForcedDeadline].filter(([,deadline])=>deadline<=cutoff).map(([id])=>id));
      const cardinality=maximumBipartiteMatchingCardinality(taskIds,slotIds,(taskId,slotId)=>{
        const task=pendingById.get(taskId)!;
        return baseForced.has(task.participantId!)||(edgeDeadlines.get(`${taskId}\u0000${slotId}`)??-Infinity)>cutoff;
      });
      maxMatchingChecks+=1;
      const minimumDemand=baseForced.size+(taskIds.length-cardinality);
      let capacity=arrivalCapacityByCutoff.get(cutoff);
      if(!capacity){capacity=maximumAnonymousArrivalCapacity(problem,cutoff);arrivalCapacityByCutoff.set(cutoff,capacity);}
      if(!capacity.checked)return abstain();
      if(minimumDemand>capacity.maximumPossible)return {verdict:"PROVEN_IMPOSSIBLE",checked:true,
        edgeDeadlineChecks:edges.length,maxMatchingChecks,
        firstCertificate:{cutoff,minimumDemand,maximumPossible:capacity.maximumPossible}};
    }
    return {verdict:"NOT_PROVEN_IMPOSSIBLE",checked:true,edgeDeadlineChecks:edges.length,maxMatchingChecks,firstCertificate:null};
  };
  return authority;
}
