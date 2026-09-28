import type { PlannerNextProblem, Task } from "./contracts";

/** Materializes one explicit itinerant-unit choice and its physical composition atomically. */
export function materializeItinerantUnitAssignment(
  problem: Pick<PlannerNextProblem,"itinerantUnits">,
  task: Task,
  selectedUnitId: string,
): Task | null {
  const domain=task.allowedItinerantUnitIds?.length
    ?[...new Set(task.allowedItinerantUnitIds)].sort()
    :task.itinerantUnitId?[task.itinerantUnitId]:[];
  if(!domain.includes(selectedUnitId))return null;
  const units=(problem.itinerantUnits??[]).filter(unit=>domain.includes(unit.id));
  const selected=units.find(unit=>unit.id===selectedUnitId);
  if(!selected)return null;
  const domainResources=new Set(units.flatMap(unit=>unit.resourceIds??[]));
  return {...task,itinerantUnitId:selectedUnitId,
    requiredResourceIds:[...new Set([...(task.requiredResourceIds??[]).filter(id=>!domainResources.has(id)),...(selected.resourceIds??[])])].sort()};
}
