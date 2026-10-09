import type { PlannerNextProblem, ScheduledTask } from "./contracts";

/** Earliest protected/material boundary shared by more than one lane in an interchangeable itinerary. */
export function itinerantAgendaStructuralFrontier(problem:Readonly<PlannerNextProblem>,unitIds:readonly string[],
  context:readonly ScheduledTask[]):number {
  const units=[...unitIds].sort().map(id=>problem.itinerantUnits?.find(unit=>unit.id===id)).filter((unit):unit is NonNullable<typeof unit>=>Boolean(unit));
  const memberResources=new Set(units.flatMap(unit=>unit.resourceIds??[]));
  return context.filter(task=>{
    const shared=(task.requiredResourceIds??[]).filter(id=>memberResources.has(id));
    return units.filter(unit=>(unit.resourceIds??[]).some(id=>shared.includes(id))).length>1;
  }).reduce((frontier,task)=>Math.min(frontier,task.start),problem.day.end);
}
