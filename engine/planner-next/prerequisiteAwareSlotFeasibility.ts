import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { checkMacroPendingPrerequisites, type MacroPendingPrerequisiteForwardCache } from "./macroPendingPrerequisiteForwardCheck";

/** A necessary-only authority: abstention is deliberately represented as usable. */
export type PrerequisiteAwareSlotVerdict = "PROVEN_IMPOSSIBLE" | "NOT_PROVEN_IMPOSSIBLE";

export type PrerequisiteAwareSlotAuthority = (
  task: Task,
  start: number,
) => PrerequisiteAwareSlotVerdict;

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
  return(task,start)=>{
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
  };
}
