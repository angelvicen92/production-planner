import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledTask, Task } from "./contracts";
import { participantMealCandidates } from "./participantMeals";
import { canPlaceTask } from "./placement";
import { findTransportDirectionWitness } from "./transportGrouping";

export interface ParticipantPresenceClosureEvidence {
  arrivalWitnessesTried: number; exactEntryBranches: number; exactMealBranches: number;
  exactExitBranches: number; departureWitnessesTried: number; terminalBacktracks: number;
  deepestTerminalStage: "ARRIVAL" | "ENTRY_MEAL" | "EXIT" | "DEPARTURE" | "COMPLETE";
  firstExactTerminalFailure: string | null;
}
export interface ParticipantPresenceClosureResult {
  status: "COMPLETE" | "NO_WITNESS" | "BUDGET_EXHAUSTED";
  scheduledTasks: ScheduledTask[]; participantMeals: ScheduledParticipantMeal[];
  evidence: ParticipantPresenceClosureEvidence; readOnly: true;
}

/** One exact, terminal search. Productive tasks are immutable and no witness escapes a failed branch. */
export function closeParticipantPresence(problem: PlannerNextProblem, productive: readonly ScheduledTask[],
  consume: () => boolean): ParticipantPresenceClosureResult {
  productive = productive.map((scheduled) => ({ ...(problem.tasks.find(({id})=>id===scheduled.id) ?? scheduled),
    start:scheduled.start,end:scheduled.end } as ScheduledTask));
  const evidence: ParticipantPresenceClosureEvidence = { arrivalWitnessesTried:0, exactEntryBranches:0,
    exactMealBranches:0, exactExitBranches:0, departureWitnessesTried:0, terminalBacktracks:0,
    deepestTerminalStage:"ARRIVAL", firstExactTerminalFailure:null };
  let exhausted = false;
  const spend = () => { if (!consume()) { exhausted = true; return false; } return true; };
  const transport = (direction: "arrival"|"departure", placed: readonly ScheduledTask[], meals: readonly ScheduledParticipantMeal[]) => {
    direction === "arrival" ? evidence.arrivalWitnessesTried++ : evidence.departureWitnessesTried++;
    const ids = problem.transportPolicy?.[direction].taskIds ?? [];
    return findTransportDirectionWitness(problem, direction, ids.map((id) => problem.tasks.find((task) => task.id === id)!).filter(Boolean), placed, spend, meals);
  };
  const arrival = transport("arrival", productive, []);
  if (arrival.exhausted) exhausted = true;
  if (!arrival.feasible) return result(exhausted ? "BUDGET_EXHAUSTED" : "NO_WITNESS", [], [], "ARRIVAL_NO_WITNESS");
  const arrivals = arrival.groups.flat();
  evidence.deepestTerminalStage = "ENTRY_MEAL";
  const entries = problem.tasks.filter((task) => task.participantBoundaryRole === "ENTRY_PREREQUISITE").sort(byId);
  const exits = problem.tasks.filter((task) => task.participantBoundaryRole === "EXIT_PREREQUISITE").sort(byId);
  const mealObligations = [...(problem.participantMeals ?? [])].sort((a,b)=>a.sourceTaskId.localeCompare(b.sourceTaskId,"en"));
  let answerTasks: ScheduledTask[] | null = null, answerMeals: ScheduledParticipantMeal[] = [];
  const searchPresence = (pendingEntries: Task[], pendingMeals: typeof mealObligations, placed: ScheduledTask[], meals: ScheduledParticipantMeal[]): boolean => {
    if (exhausted) return false;
    if (!pendingEntries.length && !pendingMeals.length) return searchExits(exits, placed, meals);
    const variables = [
      ...pendingEntries.map((task) => ({ kind:"ENTRY" as const, id:task.id, task,
        candidates: starts(task, placed).sort((a,b)=>b-a) })),
      ...pendingMeals.map((meal) => ({ kind:"MEAL" as const, id:meal.sourceTaskId, meal,
        candidates: participantMealCandidates(problem, meal, placed, meals) })),
    ].sort((a,b)=>a.candidates.length-b.candidates.length||a.id.localeCompare(b.id,"en"));
    const selected = variables[0]!;
    if (!selected.candidates.length) { evidence.firstExactTerminalFailure ??= `${selected.kind}_ZERO_DOMAIN:${selected.id}`; return false; }
    for (const candidate of selected.candidates as any[]) {
      if (!spend()) return false;
      if (selected.kind === "ENTRY") {
        evidence.exactEntryBranches++; const scheduled={...selected.task,start:candidate,end:candidate+selected.task.duration};
        if (searchPresence(pendingEntries.filter((x)=>x!==selected.task), pendingMeals, [...placed,scheduled], meals)) return true;
      } else {
        evidence.exactMealBranches++;
        if (searchPresence(pendingEntries, pendingMeals.filter((x)=>x!==selected.meal), placed, [...meals,candidate])) return true;
      }
      evidence.terminalBacktracks++;
    }
    return false;
  };
  const searchExits = (pending: Task[], placed: ScheduledTask[], meals: ScheduledParticipantMeal[]): boolean => {
    evidence.deepestTerminalStage="EXIT";
    if (!pending.length) {
      evidence.deepestTerminalStage="DEPARTURE"; const departure=transport("departure",placed,meals);
      if (departure.exhausted) exhausted=true;
      if (!departure.feasible) { evidence.firstExactTerminalFailure ??="DEPARTURE_NO_WITNESS"; return false; }
      answerTasks=[...placed,...departure.groups.flat()]; answerMeals=[...meals]; evidence.deepestTerminalStage="COMPLETE"; return true;
    }
    const domains=pending.map(task=>({task,candidates:starts(task,placed).sort((a,b)=>a-b)})).sort((a,b)=>a.candidates.length-b.candidates.length||byId(a.task,b.task));
    const selected=domains[0]!;
    for(const start of selected.candidates){if(!spend())return false;evidence.exactExitBranches++;const scheduled={...selected.task,start,end:start+selected.task.duration};
      if(searchExits(pending.filter(x=>x!==selected.task),[...placed,scheduled],meals))return true;evidence.terminalBacktracks++;}
    evidence.firstExactTerminalFailure ??=`EXIT_ZERO_DOMAIN:${selected.task.id}`;return false;
  };
  searchPresence(entries, mealObligations, [...productive,...arrivals], []);
  return answerTasks ? result("COMPLETE", answerTasks, answerMeals, null)
    : result(exhausted ? "BUDGET_EXHAUSTED" : "NO_WITNESS", [], [], evidence.firstExactTerminalFailure ?? "PRESENCE_NO_WITNESS");
  function starts(task:Task, placed:readonly ScheduledTask[]):number[]{const out:number[]=[];for(let start=problem.day.start;start+task.duration<=problem.day.end;start+=5)if(canPlaceTask(problem,task,start,placed))out.push(start);return out;}
  function result(status:ParticipantPresenceClosureResult["status"],scheduledTasks:ScheduledTask[],participantMeals:ScheduledParticipantMeal[],failure:string|null):ParticipantPresenceClosureResult {
    evidence.firstExactTerminalFailure ??= failure; return Object.freeze({status,scheduledTasks,participantMeals,evidence:{...evidence},readOnly:true});
  }
}
const byId=(a:{id:string},b:{id:string})=>a.id.localeCompare(b.id,"en");
