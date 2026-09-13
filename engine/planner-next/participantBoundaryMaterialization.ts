import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask, exactTaskDynamicStartDomain, exactTaskStaticStartDomain } from "./placement";
import { findTransportDirectionWitness, transportTaskIds } from "./transportGrouping";

export interface ParticipantBoundaryMaterialization {
  status: "FEASIBLE" | "NO_WITNESS" | "BUDGET_EXHAUSTED";
  scheduled: ScheduledTask[];
  entryBranches: number;
  exitBranches: number;
  arrivalWitnessReused: boolean;
  arrivalWitnessRepaired: boolean;
  materializedEntryCount: number;
  materializedExitCount: number;
}

const byId = (a: Task, b: Task) => a.id.localeCompare(b.id);

function scheduleBoundary(problem: PlannerNextProblem, tasks: readonly Task[], placed: readonly ScheduledTask[],
  meals: readonly ScheduledSpaceMeal[], participantMeals:readonly ScheduledParticipantMeal[], direction: "ENTRY_PREREQUISITE" | "EXIT_PREREQUISITE",
  consume: () => boolean): { status: ParticipantBoundaryMaterialization["status"]; scheduled: ScheduledTask[]; branches: number } {
  let branches = 0, exhausted = false;
  const search = (remaining: readonly Task[], current: ScheduledTask[]): ScheduledTask[] | null => {
    if (!remaining.length) return current;
    const available = remaining.filter(task => task.dependencies.every(id => current.some(row => row.id === id)));
    const alternatives = available.map(task => ({ task, starts: [...exactTaskDynamicStartDomain(problem, task, current,
      exactTaskStaticStartDomain(problem,task,[...meals])).starts()]
      .filter(start => {
        const end=start+task.duration;
        if(participantMeals.some(meal=>meal.participantId===task.participantId&&start<meal.end&&meal.start<end))return false;
        return canPlaceTask(problem, task, start, current, meals);
      }) }))
      .sort((a,b)=>a.starts.length-b.starts.length||byId(a.task,b.task));
    const selected = alternatives[0];
    if (!selected) return null;
    const starts = selected.starts.sort((a,b)=>direction === "ENTRY_PREREQUISITE" ? b-a : a-b);
    for (const start of starts) {
      if (!consume()) { exhausted = true; return null; }
      branches += 1;
      const task: ScheduledTask = { ...selected.task, start, end:start+selected.task.duration };
      const result = search(remaining.filter(row=>row.id!==selected.task.id), [...current,task]);
      if (result) return result;
      if (exhausted) return null;
    }
    return null;
  };
  const result=search([...tasks].sort(byId),[...placed]);
  return { status:result?"FEASIBLE":exhausted?"BUDGET_EXHAUSTED":"NO_WITNESS",
    scheduled:result?result.slice(placed.length):[],branches };
}

/** Exact terminal pipeline: arrival → latest entry → productive structure → earliest exit → departure. */
export function materializeParticipantBoundaries(problem:PlannerNextProblem,productive:readonly ScheduledTask[],
  participantMeals:readonly ScheduledParticipantMeal[]=[],spaceMeals:readonly ScheduledSpaceMeal[]=[],
  reservedArrival:readonly (readonly ScheduledTask[])[]=[],consume:()=>boolean=()=>true):ParticipantBoundaryMaterialization {
  const transportIds=transportTaskIds(problem);
  const entries=problem.tasks.filter(task=>task.participantBoundaryRole==="ENTRY_PREREQUISITE").sort(byId);
  const exits=problem.tasks.filter(task=>task.participantBoundaryRole==="EXIT_PREREQUISITE").sort(byId);
  const arrivalTasks=(problem.transportPolicy?.arrival.taskIds??[]).map(id=>problem.tasks.find(task=>task.id===id)!).filter(Boolean);
  const departureTasks=(problem.transportPolicy?.departure.taskIds??[]).map(id=>problem.tasks.find(task=>task.id===id)!).filter(Boolean);
  const virtualProductive=productive.filter(task=>!transportIds.has(task.id));
  const reserved=[...reservedArrival].map(group=>[...group]);
  const entryMinutesByParticipant=new Map<string,number>();
  for(const task of entries)entryMinutesByParticipant.set(task.participantId!,
    (entryMinutesByParticipant.get(task.participantId!)??0)+task.duration);
  const arrivalDeadlines=new Map(arrivalTasks.map(task=>[task.id,
    Math.min(problem.day.end,...virtualProductive.filter(row=>row.participantId===task.participantId).map(row=>row.start))
      -(entryMinutesByParticipant.get(task.participantId!)??0)]));
  // The reservation authority already validated this witness against productive deadlines.
  // The reservation has already been validated after every productive placement.
  // Participant meals are constructed with the reserved groups in their occupied
  // participant geometry, so validating the same witness a second time here would
  // both duplicate exact work and (historically) pay for a repair after the meal
  // authority had selected a conflicting compactness tie-break.
  const reservedValid=reserved.length>0;
  const arrival=reservedValid?{ feasible:true,groups:reserved,exhausted:false }
    :findTransportDirectionWitness(problem,"arrival",arrivalTasks,virtualProductive,consume,participantMeals,false,arrivalDeadlines);
  if(!arrival.feasible)return {status:arrival.exhausted?"BUDGET_EXHAUSTED":"NO_WITNESS",scheduled:[],entryBranches:0,exitBranches:0,arrivalWitnessReused:false,arrivalWitnessRepaired:false,materializedEntryCount:0,materializedExitCount:0};
  const arrivals=arrival.groups.flat();
  const entry=scheduleBoundary(problem,entries,[...virtualProductive,...arrivals],spaceMeals,participantMeals,"ENTRY_PREREQUISITE",consume);
  if(entry.status!=="FEASIBLE")return {status:entry.status,scheduled:[],entryBranches:entry.branches,exitBranches:0,arrivalWitnessReused:reservedValid,arrivalWitnessRepaired:reserved.length>0&&!reservedValid,materializedEntryCount:0,materializedExitCount:0};
  const afterEntry=[...virtualProductive,...arrivals,...entry.scheduled];
  const exit=scheduleBoundary(problem,exits,afterEntry,spaceMeals,participantMeals,"EXIT_PREREQUISITE",consume);
  if(exit.status!=="FEASIBLE")return {status:exit.status,scheduled:[],entryBranches:entry.branches,exitBranches:exit.branches,arrivalWitnessReused:reservedValid,arrivalWitnessRepaired:reserved.length>0&&!reservedValid,materializedEntryCount:entry.scheduled.length,materializedExitCount:0};
  const departure=findTransportDirectionWitness(problem,"departure",departureTasks,[...afterEntry,...exit.scheduled],consume,participantMeals);
  if(!departure.feasible)return {status:departure.exhausted?"BUDGET_EXHAUSTED":"NO_WITNESS",scheduled:[],entryBranches:entry.branches,exitBranches:exit.branches,arrivalWitnessReused:reservedValid,arrivalWitnessRepaired:reserved.length>0&&!reservedValid,materializedEntryCount:entry.scheduled.length,materializedExitCount:exit.scheduled.length};
  return {status:"FEASIBLE",scheduled:[...arrivals,...entry.scheduled,...exit.scheduled,...departure.groups.flat()],entryBranches:entry.branches,exitBranches:exit.branches,arrivalWitnessReused:reservedValid,arrivalWitnessRepaired:reserved.length>0&&!reservedValid,materializedEntryCount:entry.scheduled.length,materializedExitCount:exit.scheduled.length};
}
