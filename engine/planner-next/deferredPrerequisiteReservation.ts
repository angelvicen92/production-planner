import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask, exactTaskStartDomain } from "./placement";
import { assessTransportFutureFeasibility } from "./transportGrouping";

export interface DeferredArrivalCausalCertificate {
  causingTaskId:string|null;arrivalTaskId:string;participantId:string|null;previousBoundary:number;currentBoundary:number;
  previousWitnessFingerprint:string;previousWitnessSummary:readonly {start:number;taskIds:string[]}[];
  repair:import("./transportGrouping").TransportWitnessCausalDiagnostic|null;
}

export interface DeferredPrerequisiteReservation {
  taskIds: readonly string[];
  witness: readonly ScheduledTask[];
  arrivalTaskIds: readonly string[];
  arrivalGroups: readonly (readonly ScheduledTask[])[];
}

export interface DeferredPrerequisiteReservationResult {
  feasible: boolean;
  reservation: DeferredPrerequisiteReservation | null;
  repaired: boolean;
  branchesExplored: number;
  exhausted: boolean;
  arrivalChecks: number;
  arrivalBranchesExplored: number;
  arrivalBacktracks: number;
  arrivalRepaired: boolean;
  arrivalPruned: boolean;
  arrivalWitnessDropped: boolean;
  transportEvidence: { slotLogicalStarts:number;slotAnalyticallyEliminatedStarts:number;slotStartSetsEvaluated:number;
    matchingChecks:number;matchingEdgeChecks:number;matchingAugmentTraversals:number;equivalentMembershipsCollapsed:number;
    monotoneFastPathChecks:number;monotoneFastPathHits:number;monotoneFastPathWitnesses:number;monotoneFastPathAbstentions:number;
    cumulativeCapacityChecks:number;cumulativeCapacityPrunes:number;futureChecks:number;futureIntervalCalculations:number;
    futureEnumeratedStarts:number;futureCapacityPrunes:number };
  causalDiagnostic:DeferredArrivalCausalCertificate|null;
}

const noTransportEvidence = () => ({ slotLogicalStarts:0,slotAnalyticallyEliminatedStarts:0,slotStartSetsEvaluated:0,
  matchingChecks:0,matchingEdgeChecks:0,matchingAugmentTraversals:0,equivalentMembershipsCollapsed:0,
  monotoneFastPathChecks:0,monotoneFastPathHits:0,monotoneFastPathWitnesses:0,monotoneFastPathAbstentions:0,
  cumulativeCapacityChecks:0,cumulativeCapacityPrunes:0,futureChecks:0,futureIntervalCalculations:0,
  futureEnumeratedStarts:0,futureCapacityPrunes:0 });

const futureEvidence = (future: ReturnType<typeof assessTransportFutureFeasibility>) => ({
  futureChecks: future.checks, futureIntervalCalculations: future.intervalCalculations,
  futureEnumeratedStarts: future.enumeratedStarts, futureCapacityPrunes: future.capacityPrunes,
});

const byId = <T extends { id: string }>(left: T, right: T) => left.id.localeCompare(right.id);

function pendingHardPredecessors(problem: PlannerNextProblem, pending: readonly Task[], placed: readonly ScheduledTask[]): Task[] {
  const placedIds = new Set(placed.map(({ id }) => id));
  const taskById = new Map(problem.tasks.map((task) => [task.id, task]));
  const eligibleById = new Map(pending.map((task) => [task.id, task]));
  for (const id of problem.transportPolicy?.arrival.taskIds ?? []) {
    const task = taskById.get(id);
    if (placedIds.has(id)) eligibleById.delete(id);
    else if (task) eligibleById.set(id, task);
  }
  const result = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const task = taskById.get(id);
    for (const dependency of task?.dependencies ?? []) {
      if (eligibleById.has(dependency)) result.add(dependency);
      visit(dependency);
    }
  };
  for (const task of placed) visit(task.id);
  return [...result].map((id) => eligibleById.get(id)!).sort(byId);
}

function predecessorDeadlines(problem: PlannerNextProblem, reserved: readonly Task[], placed: readonly ScheduledTask[]): Map<string, number> {
  const reservedIds = new Set(reserved.map(({ id }) => id));
  const placedById = new Map(placed.map((task) => [task.id, task]));
  const successors = new Map<string, string[]>();
  for (const task of problem.tasks) for (const dependency of task.dependencies)
    successors.set(dependency, [...(successors.get(dependency) ?? []), task.id]);
  const taskById = new Map(reserved.map((task) => [task.id, task]));
  const memo = new Map<string, number>();
  const deadline = (id: string, visiting = new Set<string>()): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return problem.day.end;
    const next = new Set(visiting).add(id);
    const limits = (successors.get(id) ?? []).flatMap((successorId) => {
      const fixed = placedById.get(successorId);
      if (fixed) return [fixed.start];
      const successor = taskById.get(successorId);
      return successor && reservedIds.has(successorId) ? [deadline(successorId, next) - successor.duration] : [];
    });
    const value = Math.min(problem.day.end, ...limits);
    memo.set(id, value);
    return value;
  };
  for (const task of reserved) deadline(task.id);
  return memo;
}

function ordinaryWitnessStillValid(problem: PlannerNextProblem, tasks: readonly Task[], witness: readonly ScheduledTask[],
  placed: readonly ScheduledTask[], meals: readonly ScheduledSpaceMeal[], deadlines: ReadonlyMap<string, number>): boolean {
  const witnessIds = new Set(tasks.map(({ id }) => id));
  if (witness.length !== tasks.length || witness.some((item) => !witnessIds.has(item.id))) return false;
  for (const scheduled of witness) {
    const task = tasks.find(({ id }) => id === scheduled.id)!;
    if (scheduled.end > (deadlines.get(task.id) ?? problem.day.end)) return false;
    if (!canPlaceTask(problem, task, scheduled.start, [...placed, ...witness.filter(({ id }) => id !== scheduled.id)], [...meals])) return false;
  }
  return true;
}

/** Maintains an exact ordinary-predecessor witness plus a necessary-only transport certificate. */
export function maintainDeferredPrerequisiteReservation(problem: PlannerNextProblem, pending: readonly Task[],
  placed: readonly ScheduledTask[], meals: readonly ScheduledSpaceMeal[], previous: DeferredPrerequisiteReservation | null,
  consume: () => boolean, causalDiagnostic=false, causingTaskIds:readonly string[]=[]): DeferredPrerequisiteReservationResult {
  const predecessors = pendingHardPredecessors(problem, pending, placed);
  const arrivalIds = new Set(problem.transportPolicy?.arrival.taskIds ?? []);
  const arrivals = predecessors.filter(({ id }) => arrivalIds.has(id));
  const tasks = predecessors.filter(({ id }) => !arrivalIds.has(id));
  const deadlines = predecessorDeadlines(problem, tasks, placed);
  const taskIds = tasks.map(({ id }) => id), arrivalTaskIds = arrivals.map(({ id }) => id);
  const sameIds = previous && JSON.stringify(previous.taskIds) === JSON.stringify(taskIds)
    && JSON.stringify(previous.arrivalTaskIds) === JSON.stringify(arrivalTaskIds);
  const futureTransport = assessTransportFutureFeasibility(problem, placed);
  if (!futureTransport.feasible) return { feasible: false, reservation: null, repaired: previous !== null,
    branchesExplored: 0, exhausted: false, arrivalChecks: futureTransport.checks, arrivalBranchesExplored: 0,
    arrivalBacktracks: 0, arrivalRepaired: false, arrivalPruned: true, arrivalWitnessDropped: false,
    transportEvidence: { ...noTransportEvidence(), cumulativeCapacityChecks: futureTransport.checks,
      cumulativeCapacityPrunes: futureTransport.capacityPrunes, ...futureEvidence(futureTransport) }, causalDiagnostic: null };
  if (sameIds && previous.arrivalGroups.length === 0
    && ordinaryWitnessStillValid(problem, tasks, previous.witness, placed, meals, deadlines))
    return { feasible: true, reservation: previous, repaired: false, branchesExplored: 0, exhausted: false,
      arrivalChecks: futureTransport.checks, arrivalBranchesExplored: 0, arrivalBacktracks: 0, arrivalRepaired: false, arrivalPruned: false,
      arrivalWitnessDropped: false,
      transportEvidence:{...noTransportEvidence(),...futureEvidence(futureTransport)},causalDiagnostic:null };
  let branchesExplored = 0, exhausted = false;
  const arrivalChecks = futureTransport.checks, arrivalBranchesExplored = 0, arrivalBacktracks = 0;
  const transportEvidence={ ...noTransportEvidence(), cumulativeCapacityChecks: futureTransport.checks,
    cumulativeCapacityPrunes: futureTransport.capacityPrunes, ...futureEvidence(futureTransport) };
  void causalDiagnostic; void causingTaskIds;
  const reservedIds = new Set(taskIds);
  const search = (remaining: readonly Task[], witness: readonly ScheduledTask[]): DeferredPrerequisiteReservation | null => {
    if (!remaining.length) {
      return { taskIds, witness: [...witness].sort(byId), arrivalTaskIds,
        arrivalGroups: [] };
    }
    const ready = remaining.filter((task) => task.dependencies
      .filter((id) => reservedIds.has(id)).every((id) => witness.some((item) => item.id === id)));
    if (!ready.length) return null;
    const choices = ready.map((task) => ({ task, starts: [...exactTaskStartDomain(problem, task, [...placed, ...witness], [...meals]).starts()]
      .filter((start) => start + task.duration <= (deadlines.get(task.id) ?? problem.day.end)).sort((a, b) => b - a) }))
      .sort((left, right) => left.starts.length - right.starts.length || left.task.id.localeCompare(right.task.id));
    const choice = choices[0]!;
    for (const start of choice.starts) {
      if (!consume()) { exhausted = true; return null; }
      branchesExplored += 1;
      if (!canPlaceTask(problem, choice.task, start, [...placed, ...witness], [...meals])) continue;
      const scheduled: ScheduledTask = { ...choice.task, start, end: start + choice.task.duration };
      const found = search(remaining.filter(({ id }) => id !== choice.task.id), [...witness, scheduled]);
      if (found || exhausted) return found;
    }
    return null;
  };
  const reservation = search(tasks, []);
  return { feasible: reservation !== null, reservation, repaired: previous !== null, branchesExplored, exhausted,
    arrivalChecks, arrivalBranchesExplored, arrivalBacktracks, arrivalRepaired: previous !== null && arrivalBranchesExplored > 0,
    arrivalPruned: false,
    arrivalWitnessDropped: (previous?.arrivalTaskIds.length ?? 0) > 0 && arrivalTaskIds.length === 0, transportEvidence,causalDiagnostic:null };
}
