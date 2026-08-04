import type { ParticipantMealObligation, PlannerNextProblem, ScheduledParticipantMeal, ScheduledTask, Window } from "./contracts";
import { contains, overlaps } from "./time";

export interface ParticipantMealWitness {
  readonly complete: boolean;
  readonly scheduled: readonly ScheduledParticipantMeal[];
  readonly candidateCountByTaskId: Readonly<Record<string, number>>;
  readonly selectionOrder: readonly string[];
  readonly branchesExplored: number;
  readonly backtracks: number;
  readonly maximumSimultaneous: number;
  readonly reasonCodes: readonly string[];
  readonly readOnly: true;
}

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

export function participantMealCandidates(problem: PlannerNextProblem, obligation: ParticipantMealObligation, tasks: readonly ScheduledTask[], placed: readonly ScheduledParticipantMeal[]): ScheduledParticipantMeal[] {
  const participant = problem.participants.find(({ id }) => id === obligation.participantId);
  if (!participant) return [];
  const capacity = problem.participantMealCapacity?.maxSimultaneous ?? 0;
  const ownTasks = tasks.filter((task) => task.participantId === obligation.participantId);
  const ownMeals = placed.filter((meal) => meal.participantId === obligation.participantId);
  const result: ScheduledParticipantMeal[] = [];
  const starts = obligation.fixedInterval ? [obligation.fixedInterval.start] : Array.from(
    { length: Math.max(0, Math.floor((obligation.window.end - obligation.duration - obligation.window.start) / 5) + 1) },
    (_, index) => obligation.window.start + index * 5,
  );
  for (const start of starts) {
    const end = start + obligation.duration;
    const candidate = { id: obligation.id, sourceTaskId: obligation.sourceTaskId, participantId: obligation.participantId, duration: obligation.duration, start, end };
    if (end > obligation.window.end || !contains(participant.availability, start, end)) continue;
    if (ownTasks.some((task) => overlaps(task, candidate)) || ownMeals.some((meal) => intervalOverlaps(meal, candidate))) continue;
    if (maximumConcurrent([...placed, candidate]) > capacity) continue;
    result.push(candidate);
  }
  return result;
}

/** Exact deterministic joint witness; smallest-domain-first and ID only as final tie-break. */
export function scheduleParticipantMeals(problem: PlannerNextProblem, tasks: readonly ScheduledTask[]): ParticipantMealWitness {
  const obligations = [...(problem.participantMeals ?? [])].sort(byIdentity);
  if (obligations.length === 0) return freeze({ complete: true, scheduled: [], candidateCountByTaskId: {}, selectionOrder: [], branchesExplored: 0, backtracks: 0, maximumSimultaneous: 0, reasonCodes: [], readOnly: true });
  const capacity = problem.participantMealCapacity?.maxSimultaneous;
  if (!Number.isInteger(capacity) || capacity! <= 0) return freeze({ complete: false, scheduled: [], candidateCountByTaskId: {}, selectionOrder: [], branchesExplored: 0, backtracks: 0, maximumSimultaneous: 0, reasonCodes: ["INVALID_PARTICIPANT_MEAL_CAPACITY"], readOnly: true });
  let branches = 0, backtracks = 0;
  const counts: Record<string, number> = {}, order: string[] = [];
  const search = (pending: ParticipantMealObligation[], placed: ScheduledParticipantMeal[]): ScheduledParticipantMeal[] | null => {
    if (pending.length === 0) return placed;
    const domains = pending.map((obligation) => ({ obligation, candidates: participantMealCandidates(problem, obligation, tasks, placed) }))
      .sort((a, b) => a.candidates.length - b.candidates.length || byIdentity(a.obligation, b.obligation));
    const selected = domains[0]!;
    counts[selected.obligation.sourceTaskId] = selected.candidates.length;
    order.push(selected.obligation.sourceTaskId);
    if (selected.candidates.length === 0) { backtracks += 1; return null; }
    const remaining = pending.filter((item) => item !== selected.obligation);
    for (const candidate of selected.candidates) {
      branches += 1;
      if (branches > problem.budget.maxBranchExpansions) return null;
      const result = search(remaining, [...placed, candidate]);
      if (result) return result;
      backtracks += 1;
    }
    return null;
  };
  const scheduled = search(obligations, []);
  return freeze({ complete: scheduled !== null, scheduled: (scheduled ?? []).sort((a, b) => a.start - b.start || a.sourceTaskId.localeCompare(b.sourceTaskId, "en")), candidateCountByTaskId: counts, selectionOrder: order, branchesExplored: branches, backtracks, maximumSimultaneous: maximumConcurrent(scheduled ?? []), reasonCodes: scheduled ? [] : [branches > problem.budget.maxBranchExpansions ? "PARTICIPANT_MEAL_BRANCH_BUDGET_EXHAUSTED" : "PARTICIPANT_MEALS_JOINTLY_INFEASIBLE"], readOnly: true });
}
