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
  readonly backtracks: number;
  readonly maximumSimultaneous: number;
  readonly reasonCodes: readonly string[];
  readonly readOnly: true;
}
export interface ParticipantMealSearchBudget { remaining: number; consume?: (count?: number) => boolean }
export type ParticipantMealAssessmentMode = "PROBE" | "MATERIALIZE";

const byIdentity = (a: ParticipantMealObligation, b: ParticipantMealObligation): number => a.sourceTaskId.localeCompare(b.sourceTaskId, "en") || a.id.localeCompare(b.id, "en");
const intervalOverlaps = (a: Window, b: Window): boolean => a.start < b.end && b.start < a.end;
const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value as Record<string, unknown>).forEach(freeze); } return value; };

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
  const result: ScheduledParticipantMeal[] = [];
  const starts = obligation.fixedInterval ? [obligation.fixedInterval.start] : Array.from(
    { length: Math.max(0, Math.floor((obligation.window.end - obligation.duration - obligation.window.start) / PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES) + 1) },
    (_, index) => obligation.window.start + index * PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES,
  );
  for (const start of starts) {
    const end = start + obligation.duration;
    const candidate = { id: obligation.id, sourceTaskId: obligation.sourceTaskId, participantId: obligation.participantId, duration: obligation.duration, start, end };
    if (end > obligation.window.end || !contains(participant.availability, start, end)) continue;
    if (ownTasks.some((task) => overlaps(task, candidate)) || ownMeals.some((meal) => intervalOverlaps(meal, candidate))) continue;
    if (maximumConcurrent([...placed, candidate]) > capacity) continue;
    result.push(candidate);
  }
  const existing=ownTasks.length?[Math.min(...ownTasks.map(x=>x.start)),Math.max(...ownTasks.map(x=>x.end))] as const:null;
  const components=(candidate:ScheduledParticipantMeal)=>{const spanIncrease=existing?Math.max(existing[1],candidate.end)-Math.min(existing[0],candidate.start)-(existing[1]-existing[0]):candidate.duration;const internalGap=Boolean(existing&&existing[0]<=candidate.start&&candidate.end<=existing[1]);const concurrent=placed.filter(x=>intervalOverlaps(x,candidate)).length;return {start:candidate.start,spanIncrease,internalGap,residualSlack:obligation.window.end-obligation.window.start-obligation.duration,capacityFree:capacity-concurrent-1};};
  return result.sort((a,b)=>{const x=components(a),y=components(b);return x.spanIncrease-y.spanIncrease||Number(y.internalGap)-Number(x.internalGap)||y.residualSlack-x.residualSlack||y.capacityFree-x.capacityFree||a.start-b.start||a.sourceTaskId.localeCompare(b.sourceTaskId)});
}

/** Exact deterministic joint witness; smallest-domain-first and ID only as final tie-break. */
export function assessParticipantMealFutureFeasibility(problem: PlannerNextProblem, tasks: readonly ScheduledTask[], budget: ParticipantMealSearchBudget, mode: ParticipantMealAssessmentMode): ParticipantMealWitness {
  const obligations = [...(problem.participantMeals ?? [])].sort(byIdentity);
  if (obligations.length === 0) return freeze({ complete: true, scheduled: [], candidateCountByTaskId: {}, finalSelectionOrder: [], attemptedSelectionTrace: [], blockingMealTaskIds: [], rejectedCandidateCount: 0, candidateOrderByTaskId:{}, branchesExplored: 0, backtracks: 0, maximumSimultaneous: 0, reasonCodes: [], readOnly: true });
  const capacity = problem.participantMealCapacity?.maxSimultaneous;
  if (!Number.isInteger(capacity) || capacity! <= 0) return freeze({ complete: false, scheduled: [], candidateCountByTaskId: {}, finalSelectionOrder: [], attemptedSelectionTrace: [], blockingMealTaskIds: obligations.map(x=>x.sourceTaskId), rejectedCandidateCount: 0, candidateOrderByTaskId:{}, branchesExplored: 0, backtracks: 0, maximumSimultaneous: 0, reasonCodes: ["INVALID_PARTICIPANT_MEAL_CAPACITY"], readOnly: true });
  let branches = 0, backtracks = 0;
  const counts: Record<string, number> = {}, candidateOrders:Record<string,{start:number;spanIncrease:number;internalGap:boolean;residualSlack:number;capacityFree:number}[]>= {}, trace: string[] = [], blockers = new Set<string>();
  let acceptedOrder: string[] = [], exhausted = false, rejected = 0;
  const consume = (): boolean => { if (budget.remaining <= 0) { exhausted = true; return false; } if (budget.consume && !budget.consume(1)) { exhausted = true; return false; } budget.remaining -= 1; branches += 1; return true; };
  const search = (pending: ParticipantMealObligation[], placed: ScheduledParticipantMeal[], path: string[]): ScheduledParticipantMeal[] | null => {
    if (pending.length === 0) { acceptedOrder = path; return placed; }
    const domains = pending.map((obligation) => ({ obligation, candidates: participantMealCandidates(problem, obligation, tasks, placed) }))
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
  return freeze({ complete: scheduled !== null, scheduled: mode === "MATERIALIZE" ? (scheduled ?? []).sort((a, b) => a.start - b.start || a.sourceTaskId.localeCompare(b.sourceTaskId, "en")) : [], candidateCountByTaskId: counts, finalSelectionOrder: acceptedOrder, attemptedSelectionTrace: trace, blockingMealTaskIds: [...blockers].sort(), rejectedCandidateCount: rejected, candidateOrderByTaskId:candidateOrders, branchesExplored: branches, backtracks, maximumSimultaneous: maximumConcurrent(scheduled ?? []), reasonCodes: scheduled ? [] : [exhausted ? "PARTICIPANT_MEAL_BRANCH_BUDGET_EXHAUSTED" : "PARTICIPANT_MEALS_JOINTLY_INFEASIBLE"], readOnly: true });
}

export function scheduleParticipantMeals(problem: PlannerNextProblem, tasks: readonly ScheduledTask[], branchAllowance: number): ParticipantMealWitness {
  return assessParticipantMealFutureFeasibility(problem, tasks, { remaining: branchAllowance }, "MATERIALIZE");
}
