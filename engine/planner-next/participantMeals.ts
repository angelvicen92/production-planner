import type { ParticipantMealObligation, PlannerNextProblem, ScheduledParticipantMeal, ScheduledTask, Window } from "./contracts";
import { contains, overlaps } from "./time";
import { PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES } from "./integration/plannerNextCapabilities";
import { createHash } from "node:crypto";

export interface ParticipantMealWitness {
  readonly complete: boolean;
  readonly scheduled: readonly ScheduledParticipantMeal[];
  readonly candidateCountByTaskId: Readonly<Record<string, number>>;
  readonly finalSelectionOrder: readonly string[];
  readonly attemptedSelectionTrace: readonly string[];
  readonly blockingMealTaskIds: readonly string[];
  readonly rejectedCandidateCount: number;
  readonly candidateOrderByTaskId: Readonly<Record<string, readonly { start:number; spanIncrease:number; internalGap:boolean; residualSlack:number; capacityFree:number }[]>>;
  readonly branchesExplored: number;
  readonly logicalGridStarts: number;
  readonly actuallyEvaluatedStarts: number;
  readonly backtracks: number;
  readonly maximumSimultaneous: number;
  readonly reasonCodes: readonly string[];
  readonly readOnly: true;
}
export interface ParticipantMealSearchBudget { remaining: number; consume?: (count?: number) => boolean }
export type ParticipantMealAssessmentMode = "PROBE" | "MATERIALIZE";
export interface ParticipantMealProbe {
  readonly feasible: boolean;
  readonly affectedObligationsChecked: number;
  readonly zeroDomainPrunes: number;
  readonly analyticCollectivePrunes: number;
  readonly analyticDomainBuilds: number;
  readonly logicalGridStarts: number;
  readonly analyticallyEliminatedStarts: number;
  readonly actuallyEvaluatedStarts: 0;
  readonly blockingMealTaskIds: readonly string[];
  readonly candidateCountByTaskId: Readonly<Record<string, number>>;
  readonly reasonCodes: readonly string[];
  readonly readOnly: true;
}

const byIdentity = (a: ParticipantMealObligation, b: ParticipantMealObligation): number => a.sourceTaskId.localeCompare(b.sourceTaskId, "en") || a.id.localeCompare(b.id, "en");
const intervalOverlaps = (a: Window, b: Window): boolean => a.start < b.end && b.start < a.end;
const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value as Record<string, unknown>).forEach(freeze); } return value; };
const GRID = PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES;

interface AnalyticStartDomain { ranges: { first:number; last:number }[]; logicalStarts:number; validStarts:number }
const rangeCount = ({first,last}:{first:number;last:number}):number => last < first ? 0 : Math.floor((last-first)/GRID)+1;
const firstGridAtOrAfter = (base:number, minute:number):number => base + Math.ceil((minute-base)/GRID)*GRID;
const lastGridAtOrBefore = (base:number, minute:number):number => base + Math.floor((minute-base)/GRID)*GRID;

/** Builds grid-aligned start ranges using interval arithmetic only; it never visits an individual start. */
function analyticParticipantMealDomain(problem:PlannerNextProblem, obligation:ParticipantMealObligation, tasks:readonly ScheduledTask[]):AnalyticStartDomain {
  const base=obligation.window.start, duration=obligation.duration;
  const initialFirst=obligation.fixedInterval?.start??base;
  const initialLast=obligation.fixedInterval?.start??lastGridAtOrBefore(base,obligation.window.end-duration);
  const logicalStarts=Math.max(0,rangeCount({first:initialFirst,last:initialLast}));
  const participant=problem.participants.find(({id})=>id===obligation.participantId);
  if(!participant||logicalStarts===0||initialFirst<obligation.window.start||initialLast+duration>obligation.window.end)return {ranges:[],logicalStarts,validStarts:0};
  const taskById=new Map(tasks.map(task=>[task.id,task]));
  let lower=initialFirst,upper=initialLast;
  for(const dependencyId of obligation.dependencies??[]){const dependency=taskById.get(dependencyId);if(dependency)lower=Math.max(lower,firstGridAtOrAfter(base,dependency.end));}
  for(const task of tasks)if(task.dependencies.includes(obligation.sourceTaskId))upper=Math.min(upper,lastGridAtOrBefore(base,task.start-duration));
  let ranges=participant.availability.map(available=>({
    first:Math.max(lower,firstGridAtOrAfter(base,available.start)),
    last:Math.min(upper,lastGridAtOrBefore(base,available.end-duration)),
  })).filter(range=>range.first<=range.last);
  for(const task of tasks.filter(task=>task.participantId===obligation.participantId)){
    // A meal overlaps the task exactly when start is in (task.start-duration, task.end).
    const blockedFirst=firstGridAtOrAfter(base,task.start-duration+1);
    const blockedLast=lastGridAtOrBefore(base,task.end-1);
    ranges=ranges.flatMap(range=>{
      if(blockedLast<range.first||blockedFirst>range.last)return [range];
      const pieces:{first:number;last:number}[]=[];
      if(range.first<blockedFirst)pieces.push({first:range.first,last:blockedFirst-GRID});
      if(blockedLast<range.last)pieces.push({first:blockedLast+GRID,last:range.last});
      return pieces;
    });
  }
  ranges.sort((a,b)=>a.first-b.first||a.last-b.last);
  const merged:{first:number;last:number}[]=[];
  for(const range of ranges){const previous=merged.at(-1);if(previous&&range.first<=previous.last+GRID)previous.last=Math.max(previous.last,range.last);else merged.push({...range});}
  return {ranges:merged,logicalStarts,validStarts:merged.reduce((sum,range)=>sum+rangeCount(range),0)};
}

function maximumConcurrent(meals: readonly ScheduledParticipantMeal[]): number {
  const points = meals.flatMap((meal) => [{ minute: meal.start, delta: 1 }, { minute: meal.end, delta: -1 }])
    .sort((a, b) => a.minute - b.minute || a.delta - b.delta);
  let current = 0, maximum = 0;
  for (const point of points) { current += point.delta; maximum = Math.max(maximum, current); }
  return maximum;
}
export function participantMealWitnessFingerprint(meals: readonly ScheduledParticipantMeal[]): string { return createHash("sha256").update(JSON.stringify([...meals].sort((a,b)=>a.sourceTaskId.localeCompare(b.sourceTaskId)).map(({id,sourceTaskId,participantId,duration,start,end})=>({id,sourceTaskId,participantId,duration,start,end})))).digest("hex"); }

export function participantMealCandidates(problem: PlannerNextProblem, obligation: ParticipantMealObligation, tasks: readonly ScheduledTask[], placed: readonly ScheduledParticipantMeal[]): ScheduledParticipantMeal[] {
  const participant = problem.participants.find(({ id }) => id === obligation.participantId);
  if (!participant) return [];
  const capacity = problem.participantMealCapacity?.maxSimultaneous ?? 0;
  const ownTasks = tasks.filter((task) => task.participantId === obligation.participantId);
  const ownMeals = placed.filter((meal) => meal.participantId === obligation.participantId);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const mealBySourceTaskId = new Map(placed.map((meal) => [meal.sourceTaskId, meal]));
  const obligationBySourceTaskId = new Map((problem.participantMeals ?? []).map((meal) => [meal.sourceTaskId, meal]));
  const result: ScheduledParticipantMeal[] = [];
  const starts = obligation.fixedInterval ? [obligation.fixedInterval.start] : Array.from(
    { length: Math.max(0, Math.floor((obligation.window.end - obligation.duration - obligation.window.start) / PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES) + 1) },
    (_, index) => obligation.window.start + index * PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES,
  );
  for (const start of starts) {
    const end = start + obligation.duration;
    const candidate = { id: obligation.id, sourceTaskId: obligation.sourceTaskId, participantId: obligation.participantId, duration: obligation.duration, start, end };
    if (end > obligation.window.end || !contains(participant.availability, start, end)) continue;
    if ((obligation.dependencies ?? []).some((dependencyId) => {
      const dependencyTask = taskById.get(dependencyId);
      if (dependencyTask) return dependencyTask.end > start;
      const dependencyMeal = mealBySourceTaskId.get(dependencyId);
      return dependencyMeal ? dependencyMeal.end > start : false;
    })) continue;
    if (tasks.some((task) => task.dependencies.includes(obligation.sourceTaskId) && end > task.start)) continue;
    if (placed.some((meal) => (obligationBySourceTaskId.get(meal.sourceTaskId)?.dependencies ?? []).includes(obligation.sourceTaskId) && end > meal.start)) continue;
    if (ownTasks.some((task) => overlaps(task, candidate)) || ownMeals.some((meal) => intervalOverlaps(meal, candidate))) continue;
    if (maximumConcurrent([...placed, candidate]) > capacity) continue;
    result.push(candidate);
  }
  const existing=ownTasks.length?[Math.min(...ownTasks.map(x=>x.start)),Math.max(...ownTasks.map(x=>x.end))] as const:null;
  const components=(candidate:ScheduledParticipantMeal)=>{const spanIncrease=existing?Math.max(existing[1],candidate.end)-Math.min(existing[0],candidate.start)-(existing[1]-existing[0]):candidate.duration;const internalGap=Boolean(existing&&existing[0]<=candidate.start&&candidate.end<=existing[1]);const concurrent=placed.filter(x=>intervalOverlaps(x,candidate)).length;return {start:candidate.start,spanIncrease,internalGap,residualSlack:obligation.window.end-obligation.window.start-obligation.duration,capacityFree:capacity-concurrent-1};};
  return result.sort((a,b)=>{const x=components(a),y=components(b);return x.spanIncrease-y.spanIncrease||Number(y.internalGap)-Number(x.internalGap)||y.residualSlack-x.residualSlack||y.capacityFree-x.capacityFree||a.start-b.start||a.sourceTaskId.localeCompare(b.sourceTaskId)});
}

/** Sound, non-searching construction probe; inconclusive means feasible/unknown. */
export function probeParticipantMealFutureFeasibility(problem: PlannerNextProblem, tasks: readonly ScheduledTask[], addedTasks?: readonly ScheduledTask[]): ParticipantMealProbe {
  const obligations = [...(problem.participantMeals ?? [])].sort(byIdentity);
  const affected = addedTasks === undefined ? obligations : obligations.filter((obligation) => addedTasks.some((task) =>
    task.participantId === obligation.participantId || task.id === obligation.sourceTaskId
    || task.dependencies.includes(obligation.sourceTaskId) || (obligation.dependencies ?? []).includes(task.id)));
  const capacity = problem.participantMealCapacity?.maxSimultaneous;
  if (!Number.isInteger(capacity) || capacity! <= 0) return freeze({ feasible:false, affectedObligationsChecked:affected.length,
    zeroDomainPrunes:0, analyticCollectivePrunes:1, analyticDomainBuilds:0,logicalGridStarts:0,analyticallyEliminatedStarts:0,actuallyEvaluatedStarts:0,blockingMealTaskIds:obligations.map(x=>x.sourceTaskId), candidateCountByTaskId:{},
    reasonCodes:["INVALID_PARTICIPANT_MEAL_CAPACITY"], readOnly:true });
  const domains = affected.map((obligation) => ({ obligation, domain:analyticParticipantMealDomain(problem,obligation,tasks) }));
  const logicalGridStarts=domains.reduce((sum,{domain})=>sum+domain.logicalStarts,0);
  const validStarts=domains.reduce((sum,{domain})=>sum+domain.validStarts,0);
  const counts = Object.fromEntries(domains.map(({obligation,domain})=>[obligation.sourceTaskId,domain.validStarts]));
  const empty = domains.filter(({domain})=>domain.validStarts===0).map(({obligation})=>obligation.sourceTaskId);
  if (empty.length) return freeze({ feasible:false, affectedObligationsChecked:affected.length, zeroDomainPrunes:1,
    analyticCollectivePrunes:0,analyticDomainBuilds:domains.length,logicalGridStarts,analyticallyEliminatedStarts:logicalGridStarts-validStarts,actuallyEvaluatedStarts:0,blockingMealTaskIds:empty, candidateCountByTaskId:counts, reasonCodes:["PARTICIPANT_MEAL_ZERO_DOMAIN"], readOnly:true });
  const envelopes=domains.map(({obligation,domain})=>({obligation,start:domain.ranges[0]!.first,end:domain.ranges.at(-1)!.last+obligation.duration}));
  const endpoints = [...new Set(envelopes.flatMap(({start,end})=>[start,end]))].sort((a,b)=>a-b);
  for (let left=0; left<endpoints.length; left++) for (let right=left+1; right<endpoints.length; right++) {
    const start=endpoints[left]!,end=endpoints[right]!,contained=envelopes.filter((domain)=>domain.start>=start&&domain.end<=end);
    const duration=contained.reduce((sum,{obligation})=>sum+obligation.duration,0), participantDuration=new Map<string,number>();
    for(const {obligation} of contained) participantDuration.set(obligation.participantId,(participantDuration.get(obligation.participantId)??0)+obligation.duration);
    if(duration>capacity!*(end-start)||[...participantDuration.values()].some(value=>value>end-start)) return freeze({ feasible:false,
      affectedObligationsChecked:affected.length, zeroDomainPrunes:0, analyticCollectivePrunes:1,
      analyticDomainBuilds:domains.length,logicalGridStarts,analyticallyEliminatedStarts:logicalGridStarts-validStarts,actuallyEvaluatedStarts:0,blockingMealTaskIds:contained.map(x=>x.obligation.sourceTaskId).sort(), candidateCountByTaskId:counts,
      reasonCodes:["PARTICIPANT_MEALS_ANALYTICALLY_INFEASIBLE"], readOnly:true });
  }
  return freeze({ feasible:true, affectedObligationsChecked:affected.length, zeroDomainPrunes:0, analyticCollectivePrunes:0,
    analyticDomainBuilds:domains.length,logicalGridStarts,analyticallyEliminatedStarts:logicalGridStarts-validStarts,actuallyEvaluatedStarts:0,blockingMealTaskIds:[], candidateCountByTaskId:counts, reasonCodes:[], readOnly:true });
}

/** Exact deterministic joint witness; smallest-domain-first and ID only as final tie-break. */
export function assessParticipantMealFutureFeasibility(problem: PlannerNextProblem, tasks: readonly ScheduledTask[], budget: ParticipantMealSearchBudget, mode: ParticipantMealAssessmentMode): ParticipantMealWitness {
  const obligations = [...(problem.participantMeals ?? [])].sort(byIdentity);
  if (obligations.length === 0) return freeze({ complete: true, scheduled: [], candidateCountByTaskId: {}, finalSelectionOrder: [], attemptedSelectionTrace: [], blockingMealTaskIds: [], rejectedCandidateCount: 0, candidateOrderByTaskId:{}, branchesExplored: 0, logicalGridStarts:0,actuallyEvaluatedStarts:0,backtracks: 0, maximumSimultaneous: 0, reasonCodes: [], readOnly: true });
  const capacity = problem.participantMealCapacity?.maxSimultaneous;
  if (!Number.isInteger(capacity) || capacity! <= 0) return freeze({ complete: false, scheduled: [], candidateCountByTaskId: {}, finalSelectionOrder: [], attemptedSelectionTrace: [], blockingMealTaskIds: obligations.map(x=>x.sourceTaskId), rejectedCandidateCount: 0, candidateOrderByTaskId:{}, branchesExplored: 0,logicalGridStarts:0,actuallyEvaluatedStarts:0,backtracks: 0, maximumSimultaneous: 0, reasonCodes: ["INVALID_PARTICIPANT_MEAL_CAPACITY"], readOnly: true });
  let branches = 0, backtracks = 0, logicalGridStarts=0, actuallyEvaluatedStarts=0;
  const counts: Record<string, number> = {}, candidateOrders:Record<string,{start:number;spanIncrease:number;internalGap:boolean;residualSlack:number;capacityFree:number}[]>= {}, trace: string[] = [], blockers = new Set<string>();
  let acceptedOrder: string[] = [], exhausted = false, rejected = 0;
  const consume = (): boolean => { if (budget.remaining <= 0) { exhausted = true; return false; } if (budget.consume && !budget.consume(1)) { exhausted = true; return false; } budget.remaining -= 1; branches += 1; return true; };
  const search = (pending: ParticipantMealObligation[], placed: ScheduledParticipantMeal[], path: string[]): ScheduledParticipantMeal[] | null => {
    if (pending.length === 0) { acceptedOrder = path; return placed; }
    const domains = pending.map((obligation) => {const logical=obligation.fixedInterval?1:Math.max(0,Math.floor((obligation.window.end-obligation.duration-obligation.window.start)/GRID)+1);logicalGridStarts+=logical;actuallyEvaluatedStarts+=logical;return { obligation, candidates: participantMealCandidates(problem, obligation, tasks, placed) };})
      .sort((a, b) => a.candidates.length - b.candidates.length || byIdentity(a.obligation, b.obligation));
    const selected = domains[0]!;
    counts[selected.obligation.sourceTaskId] = selected.candidates.length;
    candidateOrders[selected.obligation.sourceTaskId]=selected.candidates.map(candidate=>{const own=tasks.filter(x=>x.participantId===candidate.participantId),span=own.length?{start:Math.min(...own.map(x=>x.start)),end:Math.max(...own.map(x=>x.end))}:null;return {start:candidate.start,spanIncrease:span?Math.max(span.end,candidate.end)-Math.min(span.start,candidate.start)-(span.end-span.start):candidate.duration,internalGap:Boolean(span&&span.start<=candidate.start&&candidate.end<=span.end),residualSlack:selected.obligation.window.end-selected.obligation.window.start-selected.obligation.duration,capacityFree:(problem.participantMealCapacity?.maxSimultaneous??0)-placed.filter(x=>intervalOverlaps(x,candidate)).length-1};});
    trace.push(selected.obligation.sourceTaskId);
    if (selected.candidates.length === 0) { blockers.add(selected.obligation.sourceTaskId); backtracks += 1; return null; }
    const remaining = pending.filter((item) => item !== selected.obligation);
    for (const candidate of selected.candidates) {
      if (!consume()) return null;
      const result = search(remaining, [...placed, candidate], [...path, selected.obligation.sourceTaskId]);
      if (result) return result;
      backtracks += 1; rejected += 1;
    }
    return null;
  };
  const scheduled = search(obligations, [], []);
  if (!scheduled && !exhausted && blockers.size === 0) obligations.forEach(x=>blockers.add(x.sourceTaskId));
  return freeze({ complete: scheduled !== null, scheduled: mode === "MATERIALIZE" ? (scheduled ?? []).sort((a, b) => a.start - b.start || a.sourceTaskId.localeCompare(b.sourceTaskId, "en")) : [], candidateCountByTaskId: counts, finalSelectionOrder: acceptedOrder, attemptedSelectionTrace: trace, blockingMealTaskIds: [...blockers].sort(), rejectedCandidateCount: rejected, candidateOrderByTaskId:candidateOrders, branchesExplored: branches,logicalGridStarts,actuallyEvaluatedStarts,backtracks, maximumSimultaneous: maximumConcurrent(scheduled ?? []), reasonCodes: scheduled ? [] : [exhausted ? "PARTICIPANT_MEAL_BRANCH_BUDGET_EXHAUSTED" : "PARTICIPANT_MEALS_JOINTLY_INFEASIBLE"], readOnly: true });
}

export function scheduleParticipantMeals(problem: PlannerNextProblem, tasks: readonly ScheduledTask[], branchAllowance: number): ParticipantMealWitness {
  return assessParticipantMealFutureFeasibility(problem, tasks, { remaining: branchAllowance }, "MATERIALIZE");
}
