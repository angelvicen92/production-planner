import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask, exactTaskDynamicStartDomain, exactTaskStaticStartDomain } from "./placement";
import { findTransportDirectionWitness, transportTaskIds } from "./transportGrouping";
import { validateParticipantPresenceReservation } from "./deferredPrerequisiteReservation";

export interface ParticipantBoundaryMaterialization {
  status: "FEASIBLE" | "NO_WITNESS" | "BUDGET_EXHAUSTED";
  scheduled: ScheduledTask[];
  entryBranches: number;
  exitBranches: number;
  arrivalWitnessReused: boolean;
  arrivalWitnessRepaired: boolean;
  materializedEntryCount: number;
  materializedExitCount: number;
  boundaryAnalyticChecks: number;
  boundaryCollectiveCapacityPrunes: number;
  boundaryExactRepairs: number;
}

const byId = (a: Task, b: Task) => a.id.localeCompare(b.id);

export interface PendingBoundaryCapacityProbe { feasible:boolean; checks:number; collectiveCapacityPrunes:number; blockingTaskIds:string[] }

/** Necessary-only interval/Hall probe. It inspects domain envelopes, never grid starts. */
export function probePendingBoundaryCapacity(problem:PlannerNextProblem,tasks:readonly Task[],placed:readonly ScheduledTask[],
  meals:readonly ScheduledSpaceMeal[]=[]):PendingBoundaryCapacityProbe{
  const domains=tasks.map(task=>({task,domain:exactTaskDynamicStartDomain(problem,task,[...placed],exactTaskStaticStartDomain(problem,task,[...meals]))}));
  const empty=domains.filter(({domain})=>domain.intervals.length===0).map(({task})=>task.id).sort();
  if(empty.length)return {feasible:false,checks:domains.length,collectiveCapacityPrunes:0,blockingTaskIds:empty};
  const keys=(task:Task)=>[`space:${task.spaceId}`,...(task.requiredResourceIds??[]).map(id=>`resource:${id}`)];
  for(const key of new Set(tasks.flatMap(keys))){
    const scoped=domains.filter(({task})=>keys(task).includes(key));
    const endpoints=[...new Set(scoped.flatMap(({task,domain})=>domain.intervals.flatMap(interval=>[interval.start,interval.end+task.duration])))].sort((a,b)=>a-b);
    for(let left=0;left<endpoints.length;left++)for(let right=left+1;right<endpoints.length;right++){
      const start=endpoints[left]!,end=endpoints[right]!;
      const contained=scoped.filter(({task,domain})=>domain.intervals.every(interval=>interval.start>=start&&interval.end+task.duration<=end));
      if(contained.reduce((sum,{task})=>sum+task.duration,0)>end-start)return {feasible:false,checks:domains.length,
        collectiveCapacityPrunes:1,blockingTaskIds:contained.map(({task})=>task.id).sort()};
    }
  }
  return {feasible:true,checks:domains.length,collectiveCapacityPrunes:0,blockingTaskIds:[]};
}

function scheduleBoundary(problem: PlannerNextProblem, tasks: readonly Task[], placed: readonly ScheduledTask[],
  meals: readonly ScheduledSpaceMeal[], participantMeals:readonly ScheduledParticipantMeal[], direction: "ENTRY_PREREQUISITE" | "EXIT_PREREQUISITE",
  consume: () => boolean): { status: ParticipantBoundaryMaterialization["status"]; scheduled: ScheduledTask[]; branches: number; probe:PendingBoundaryCapacityProbe } {
  const probe=probePendingBoundaryCapacity(problem,tasks,placed,meals);
  if(!probe.feasible)return {status:"NO_WITNESS",scheduled:[],branches:0,probe};
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
    scheduled:result?result.slice(placed.length):[],branches,probe };
}

/** Exact terminal pipeline: arrival → latest entry → productive structure → earliest exit → departure. */
export function materializeParticipantBoundaries(problem:PlannerNextProblem,productive:readonly ScheduledTask[],
  participantMeals:readonly ScheduledParticipantMeal[]=[],spaceMeals:readonly ScheduledSpaceMeal[]=[],
  reservedArrival:readonly (readonly ScheduledTask[])[]=[],consume:()=>boolean=()=>true):ParticipantBoundaryMaterialization {
  const transportIds=transportTaskIds(problem);
  const emptyEvidence={boundaryAnalyticChecks:0,boundaryCollectiveCapacityPrunes:0,boundaryExactRepairs:0};
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
    Math.min(problem.day.end,...virtualProductive.filter(row=>row.participantId===task.participantId).map(row=>row.start),
      ...participantMeals.filter(row=>row.participantId===task.participantId).map(row=>row.start))
      -(entryMinutesByParticipant.get(task.participantId!)??0)]));
  // Existence is not validity: terminal authorities (notably operational meals)
  // may only now be concrete, so reuse requires the canonical cheap validator.
  const reservedValid=reserved.length>0&&validateParticipantPresenceReservation(problem,arrivalTasks,reserved,
    participantMeals,virtualProductive,arrivalDeadlines);
  const arrival=reservedValid?{ feasible:true,groups:reserved,exhausted:false }
    :findTransportDirectionWitness(problem,"arrival",arrivalTasks,virtualProductive,consume,participantMeals,false,arrivalDeadlines);
  if(!arrival.feasible)return {status:arrival.exhausted?"BUDGET_EXHAUSTED":"NO_WITNESS",scheduled:[],entryBranches:0,exitBranches:0,arrivalWitnessReused:false,arrivalWitnessRepaired:false,materializedEntryCount:0,materializedExitCount:0,...emptyEvidence};
  const arrivals=arrival.groups.flat();
  const entry=scheduleBoundary(problem,entries,[...virtualProductive,...arrivals],spaceMeals,participantMeals,"ENTRY_PREREQUISITE",consume);
  if(entry.status!=="FEASIBLE")return {status:entry.status,scheduled:[],entryBranches:entry.branches,exitBranches:0,arrivalWitnessReused:reservedValid,arrivalWitnessRepaired:reserved.length>0&&!reservedValid,materializedEntryCount:0,materializedExitCount:0,boundaryAnalyticChecks:entry.probe.checks,boundaryCollectiveCapacityPrunes:entry.probe.collectiveCapacityPrunes,boundaryExactRepairs:entry.branches};
  const afterEntry=[...virtualProductive,...arrivals,...entry.scheduled];
  const exit=scheduleBoundary(problem,exits,afterEntry,spaceMeals,participantMeals,"EXIT_PREREQUISITE",consume);
  if(exit.status!=="FEASIBLE")return {status:exit.status,scheduled:[],entryBranches:entry.branches,exitBranches:exit.branches,arrivalWitnessReused:reservedValid,arrivalWitnessRepaired:reserved.length>0&&!reservedValid,materializedEntryCount:entry.scheduled.length,materializedExitCount:0,boundaryAnalyticChecks:entry.probe.checks+exit.probe.checks,boundaryCollectiveCapacityPrunes:entry.probe.collectiveCapacityPrunes+exit.probe.collectiveCapacityPrunes,boundaryExactRepairs:entry.branches+exit.branches};
  const departure=findTransportDirectionWitness(problem,"departure",departureTasks,[...afterEntry,...exit.scheduled],consume,participantMeals);
  const boundaryEvidence={boundaryAnalyticChecks:entry.probe.checks+exit.probe.checks,boundaryCollectiveCapacityPrunes:entry.probe.collectiveCapacityPrunes+exit.probe.collectiveCapacityPrunes,boundaryExactRepairs:entry.branches+exit.branches};
  if(!departure.feasible)return {status:departure.exhausted?"BUDGET_EXHAUSTED":"NO_WITNESS",scheduled:[],entryBranches:entry.branches,exitBranches:exit.branches,arrivalWitnessReused:reservedValid,arrivalWitnessRepaired:reserved.length>0&&!reservedValid,materializedEntryCount:entry.scheduled.length,materializedExitCount:exit.scheduled.length,...boundaryEvidence};
  return {status:"FEASIBLE",scheduled:[...arrivals,...entry.scheduled,...exit.scheduled,...departure.groups.flat()],entryBranches:entry.branches,exitBranches:exit.branches,arrivalWitnessReused:reservedValid,arrivalWitnessRepaired:reserved.length>0&&!reservedValid,materializedEntryCount:entry.scheduled.length,materializedExitCount:exit.scheduled.length,...boundaryEvidence};
}
