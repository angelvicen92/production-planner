import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledTask, Task, TransportGroupingPolicy } from "./contracts";
import { canPlaceTask, exactTaskStartDomain } from "./placement";

export type TransportDirection = "arrival" | "departure";

const byId = (left: Task, right: Task): number => left.id.localeCompare(right.id);

export function transportTaskIds(problem: Readonly<PlannerNextProblem>): ReadonlySet<string> {
  return new Set(problem.transportPolicy
    ? [...problem.transportPolicy.arrival.taskIds, ...problem.transportPolicy.departure.taskIds]
    : []);
}

export function transportDirectionForTask(
  problem: Readonly<PlannerNextProblem>,
  taskId: string,
): TransportDirection | undefined {
  if (problem.transportPolicy?.arrival.taskIds.includes(taskId)) return "arrival";
  if (problem.transportPolicy?.departure.taskIds.includes(taskId)) return "departure";
  return undefined;
}

function combinations<T>(values: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  const result: T[][] = [];
  for (let index = 0; index <= values.length - size; index += 1) {
    const value = values[index]!;
    for (const tail of combinations(values.slice(index + 1), size - 1)) result.push([value, ...tail]);
  }
  return result;
}

export function canPartitionTransportCount(count: number, minimum: number, maximum: number): boolean {
  if (count === 0) return true;
  const minimumGroups = Math.ceil(count / maximum);
  const maximumGroups = Math.floor(count / minimum);
  return minimumGroups <= maximumGroups;
}

/** Canonical candidate groups containing the first remaining task; no invalid residual is emitted. */
export function transportGroupCandidates(
  tasks: readonly Task[],
  policy: Readonly<TransportGroupingPolicy>,
): Task[][] {
  const ordered = [...tasks].sort(byId);
  const [first, ...rest] = ordered;
  if (!first) return [];
  const sizes = Array.from(
    { length: Math.min(policy.maximumGroupSize, ordered.length) - policy.minimumGroupSize + 1 },
    (_, index) => policy.minimumGroupSize + index,
  ).filter((size) => canPartitionTransportCount(ordered.length - size, policy.minimumGroupSize, policy.maximumGroupSize));
  if (policy.groupingWeight > 0) sizes.sort((left, right) => right - left);
  return sizes.flatMap((size) => combinations(rest, size - 1).map((tail) => [first, ...tail]));
}

export function scheduleTransportGroup(tasks: readonly Task[], start: number): ScheduledTask[] {
  return [...tasks].sort(byId).map((task) => ({ ...task, start, end: start + task.duration }));
}

export function transportContiguousGroupSizes(
  count: number,
  policy: Readonly<TransportGroupingPolicy>,
  direction: TransportDirection,
): number[] | null {
  if (count < 0 || !Number.isInteger(count)) return null;
  const target = Math.min(policy.targetGroupSize ?? (direction === "arrival" ? 3 : 1), policy.maximumGroupSize);
  if (!canPartitionTransportCount(count, policy.minimumGroupSize, policy.maximumGroupSize)) return null;
  const choose = (remaining: number): number[] | null => {
    if (remaining === 0) return [];
    const sizes = Array.from({ length: Math.min(policy.maximumGroupSize, remaining) - policy.minimumGroupSize + 1 },
      (_, index) => policy.minimumGroupSize + index)
      .filter((size) => canPartitionTransportCount(remaining - size, policy.minimumGroupSize, policy.maximumGroupSize))
      .sort((left, right) => Math.abs(left - target) - Math.abs(right - target) || right - left);
    for (const size of sizes) { const residual = choose(remaining - size); if (residual) return [size, ...residual]; }
    return null;
  };
  return choose(count);
}

/** Result of deterministic, exact terminal transport materialization. */
export interface TerminalTransportMaterialization {
  status: "FEASIBLE" | "NO_WITNESS" | "BUDGET_EXHAUSTED";
  scheduled: ScheduledTask[];
  arrival: TransportDirectionWitnessResult;
  departure: TransportDirectionWitnessResult;
  arrivalReservedWitnessReused: boolean;
  arrivalRepaired: boolean;
  firstFailure: null | { direction: TransportDirection; remainingTaskIds: string[]; domainSummary: string; reason: "NO_WITNESS" | "BUDGET_EXHAUSTED" };
}

/** Exact terminal authority. A preserved ARRIVAL witness is reused only after final-state validation. */
export function materializeTerminalTransport(
  problem: PlannerNextProblem,
  substantive: readonly ScheduledTask[],
  participantMeals: readonly ScheduledParticipantMeal[] = [],
  reservedArrivalGroups: readonly (readonly ScheduledTask[])[] = [],
  consume: () => boolean = () => true,
): TerminalTransportMaterialization {
  const empty: TransportDirectionWitnessResult = emptyWitness();
  if (!problem.transportPolicy) return { status: "FEASIBLE", scheduled: [], arrival: empty, departure: empty,
    arrivalReservedWitnessReused: false, arrivalRepaired: false, firstFailure: null };
  const tasks = (direction: TransportDirection) => problem.transportPolicy![direction].taskIds
    .map((id) => problem.tasks.find((task) => task.id === id)!).filter(Boolean);
  const arrivals = tasks("arrival"), departures = tasks("departure");
  const reserved = reservedArrivalGroups.map((group) => [...group]);
  const reservedValid = reserved.length > 0
    && validateDirectionWitness(problem, "arrival", arrivals, reserved, substantive, participantMeals);
  const arrival = reservedValid ? { ...empty, groups: reserved } : findTransportDirectionWitness(problem, "arrival", arrivals,
    substantive, consume, participantMeals);
  if (!arrival.feasible) return failure("arrival", arrivals, arrival, !reservedValid && reserved.length > 0);
  const arrivalScheduled = arrival.groups.flat();
  const departure = findTransportDirectionWitness(problem, "departure", departures,
    [...substantive, ...arrivalScheduled], consume, participantMeals);
  if (!departure.feasible) return failure("departure", departures, departure, !reservedValid && reserved.length > 0, arrival);
  return { status: "FEASIBLE", scheduled: [...arrivalScheduled, ...departure.groups.flat()], arrival, departure,
    arrivalReservedWitnessReused: reservedValid, arrivalRepaired: !reservedValid && reserved.length > 0, firstFailure: null };

  function failure(direction: TransportDirection, remaining: readonly Task[], result: TransportDirectionWitnessResult,
    repaired: boolean, successfulArrival = result): TerminalTransportMaterialization {
    const policy = problem.transportPolicy![direction];
    const reason = result.exhausted ? "BUDGET_EXHAUSTED" : "NO_WITNESS";
    return { status: reason, scheduled: [], arrival: direction === "arrival" ? result : successfulArrival,
      departure: direction === "departure" ? result : empty, arrivalReservedWitnessReused: false, arrivalRepaired: repaired,
      firstFailure: { direction, remainingTaskIds: remaining.map(({ id }) => id).sort(), reason,
        domainSummary: `count=${remaining.length};min=${policy.minimumGroupSize};target=${policy.targetGroupSize ?? "default"};max=${policy.maximumGroupSize};gap=${policy.minGapMinutes}` } };
  }
}

export function canPlaceTransportGroup(
  problem: PlannerNextProblem,
  tasks: readonly Task[],
  start: number,
  placed: readonly ScheduledTask[],
  previousGroupStarts: readonly number[],
  policy: Readonly<TransportGroupingPolicy>,
): boolean {
  const first = tasks[0];
  const direction = first ? transportDirectionForTask(problem, first.id) : undefined;
  const effectiveSynchronizedCount = first && direction
    ? tasks.length + placed.filter((task) => transportDirectionForTask(problem, task.id) === direction
      && task.start === start && task.end === start + first.duration).length
    : tasks.length;
  return first !== undefined
    && tasks.every((task) => task.duration === first.duration)
    && new Set(tasks.map((task) => task.participantId)).size === tasks.length
    && effectiveSynchronizedCount <= policy.maximumGroupSize
    && previousGroupStarts.every((other) => Math.abs(start - other) >= policy.minGapMinutes)
    && tasks.every((task) => task.dependencies.every((dependencyId) => {
      const dependency = placed.find(({ id }) => id === dependencyId);
      return dependency !== undefined && dependency.end <= start;
    }))
    // Each member is checked against all external occupations. Members deliberately do not
    // become external occupations for one another because the synchronized group is one operation.
    && tasks.every((task) => canPlaceTask(problem, task, start, [...placed]));
}

export function transportGroupStarts(
  problem: PlannerNextProblem,
  tasks: readonly Task[],
  placed: readonly ScheduledTask[],
  previousGroupStarts: readonly number[],
  policy: Readonly<TransportGroupingPolicy>,
): number[] {
  const domains = tasks.map((task) => new Set(exactTaskStartDomain(problem, task, placed).starts()));
  return [...(domains[0] ?? [])].filter((start) => domains.every((domain) => domain.has(start))
    && canPlaceTransportGroup(problem, tasks, start, placed, previousGroupStarts, policy));
}

export interface TransportDirectionWitnessResult {
  feasible: boolean;
  groups: ScheduledTask[][];
  branchesExplored: number;
  backtracks: number;
  exhausted: boolean;
  slotLogicalStarts: number;
  slotAnalyticallyEliminatedStarts: number;
  slotStartSetsEvaluated: number;
  matchingChecks: number;
  matchingEdgeChecks: number;
  matchingAugmentTraversals: number;
  equivalentMembershipsCollapsed: number;
}

const emptyWitness = (): TransportDirectionWitnessResult => ({ feasible: true, groups: [], branchesExplored: 0,
  backtracks: 0, exhausted: false, slotLogicalStarts: 0, slotAnalyticallyEliminatedStarts: 0,
  slotStartSetsEvaluated: 0, matchingChecks: 0, matchingEdgeChecks: 0, matchingAugmentTraversals: 0,
  equivalentMembershipsCollapsed: 0 });

/** Exact, ledger-accounted grouped witness. It is read-only and does not materialize into the plan. */
export function findTransportDirectionWitness(problem: PlannerNextProblem, direction: TransportDirection,
  relevantTasks: readonly Task[], externalPlaced: readonly ScheduledTask[], consume: () => boolean,
  participantMeals: readonly ScheduledParticipantMeal[] = []): TransportDirectionWitnessResult {
  const policy = problem.transportPolicy?.[direction];
  if (!policy || relevantTasks.length === 0) return emptyWitness();
  const policyIds = new Set(policy.taskIds);
  const relevant = relevantTasks.filter(({ id }) => policyIds.has(id));
  if (relevant.length !== relevantTasks.length)
    return { ...emptyWitness(), feasible: false };
  let branchesExplored = 0, backtracks = 0, exhausted = false, slotStartSetsEvaluated = 0;
  let matchingChecks = 0, matchingEdgeChecks = 0, matchingAugmentTraversals = 0;
  const arrivalIds = new Set(relevant.map(({ id }) => id));
  const external = externalPlaced.filter(({ id }) => !arrivalIds.has(id));
  const boundary = (task: Task): number => {
    const obligations = [...external.filter((placed) => placed.participantId === task.participantId),
      ...participantMeals.filter((meal) => meal.participantId === task.participantId)];
    return direction === "arrival"
      ? Math.min(problem.day.end, ...obligations.map(({ start }) => start))
      : Math.max(problem.day.start, ...obligations.map(({ end }) => end));
  };
  const tasks = [...relevant].sort((left, right) => boundary(left) - boundary(right) || byId(left, right));
  const target = Math.min(policy.targetGroupSize ?? (direction === "arrival" ? 3 : 1), policy.maximumGroupSize);
  type Slot = { start: number; duration: number; eligible: boolean[] };
  const slotByKey = new Map<string, Slot>();
  for (const [taskIndex, task] of tasks.entries()) for (const start of exactTaskStartDomain(problem, task, external).starts()) {
    if (direction === "arrival" ? start + task.duration > boundary(task) : start < boundary(task)) continue;
    if (!canPlaceTransportGroup(problem, [task], start, external, [], policy)) continue;
    const key = `${start}:${task.duration}`;
    const slot = slotByKey.get(key) ?? { start, duration: task.duration, eligible: tasks.map(() => false) };
    slot.eligible[taskIndex] = true; slotByKey.set(key, slot);
  }
  // Boundary-safe order is also the cumulative-capacity order: early ARRIVAL slots can serve
  // every later deadline, while late DEPARTURE slots can serve every earlier release boundary.
  const slots = [...slotByKey.values()].sort((a, b) => direction === "arrival" ? a.start - b.start || a.duration - b.duration : b.start - a.start || a.duration - b.duration);
  const logicalStarts = slots.length;
  const groupCounts = Array.from({ length: Math.floor(tasks.length / policy.minimumGroupSize) - Math.ceil(tasks.length / policy.maximumGroupSize) + 1 },
    (_, index) => Math.ceil(tasks.length / policy.maximumGroupSize) + index)
    .sort((a, b) => Math.abs(tasks.length / a - target) - Math.abs(tasks.length / b - target) || a - b);

  const match = (active: readonly Slot[]): ScheduledTask[][] | null => {
    matchingChecks += 1;
    const copies = active.flatMap((slot, slotIndex) => Array.from({ length: policy.maximumGroupSize }, (_, copy) => ({ slot, slotIndex, mandatory: copy < policy.minimumGroupSize })));
    const dummyCount = copies.length - tasks.length;
    if (dummyCount < 0 || dummyCount > active.length * (policy.maximumGroupSize - policy.minimumGroupSize)) return null;
    const left = [...tasks.map((task, taskIndex) => ({ task, taskIndex, dummy: false })),
      ...Array.from({ length: dummyCount }, (_, taskIndex) => ({ task: undefined, taskIndex, dummy: true }))];
    const owner = copies.map(() => -1);
    const augment = (leftIndex: number, seen: Set<number>): boolean => {
      for (let copyIndex = 0; copyIndex < copies.length; copyIndex += 1) {
        matchingEdgeChecks += 1; const copy = copies[copyIndex]!; const item = left[leftIndex]!;
        if (seen.has(copyIndex) || (item.dummy ? copy.mandatory : !copy.slot.eligible[item.taskIndex])) continue;
        seen.add(copyIndex); matchingAugmentTraversals += 1;
        if (owner[copyIndex] < 0 || augment(owner[copyIndex]!, seen)) { owner[copyIndex] = leftIndex; return true; }
      }
      return false;
    };
    if (!left.every((_, index) => augment(index, new Set()))) return null;
    return active.map((slot, slotIndex) => owner.flatMap((leftIndex, copyIndex) => {
      const item = left[leftIndex]; return copies[copyIndex]!.slotIndex === slotIndex && item && !item.dummy ? [item.task!] : [];
    }).map((task) => ({ ...task, start: slot.start, end: slot.start + task.duration })).sort((a, b) => byId(a, b)));
  };
  let groups: ScheduledTask[][] | null = null;
  for (const groupCount of groupCounts) {
    if (!consume()) { exhausted = true; break; }
    branchesExplored += 1;
    const choose = (from: number, active: readonly Slot[]): boolean => {
      if (active.length === groupCount) {
        if (!consume()) { exhausted = true; return true; }
        branchesExplored += 1; slotStartSetsEvaluated += 1; groups = match(active); backtracks += groups ? 0 : 1;
        return groups !== null;
      }
      if (active.length + slots.length - from < groupCount) return false;
      for (let index = from; index < slots.length; index += 1) {
        const slot = slots[index]!;
        if (active.some((other) => Math.abs(slot.start - other.start) < policy.minGapMinutes)) continue;
        if (choose(index + 1, [...active, slot]) || exhausted) return true;
      }
      return false;
    };
    if (choose(0, []) || exhausted) break;
  }
  const signatureCounts = new Map<string, number>();
  for (const taskIndex of tasks.keys()) { const signature = slots.map((slot) => slot.eligible[taskIndex] ? "1" : "0").join(""); signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1); }
  const equivalentMembershipsCollapsed = [...signatureCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return { feasible: groups !== null, groups: groups ?? [], branchesExplored, backtracks, exhausted,
    slotLogicalStarts: logicalStarts, slotAnalyticallyEliminatedStarts: 0, slotStartSetsEvaluated,
    matchingChecks, matchingEdgeChecks, matchingAugmentTraversals, equivalentMembershipsCollapsed };
}

function validateDirectionWitness(problem: PlannerNextProblem, direction: TransportDirection, tasks: readonly Task[],
  groups: readonly (readonly ScheduledTask[])[], external: readonly ScheduledTask[], meals: readonly ScheduledParticipantMeal[]): boolean {
  const policy = problem.transportPolicy?.[direction];
  if (!policy) return tasks.length === 0;
  const expected = tasks.map(({ id }) => id).sort(), actual = groups.flat().map(({ id }) => id).sort();
  if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) return false;
  if (!canPartitionTransportCount(tasks.length, policy.minimumGroupSize, policy.maximumGroupSize)) return false;
  return groups.every((group, index) => group.length >= policy.minimumGroupSize && group.length <= policy.maximumGroupSize
    && group.every((item) => item.start === group[0]!.start && item.end === item.start + item.duration)
    && canPlaceTransportGroup(problem, group.map(({ id }) => tasks.find((task) => task.id === id)!), group[0]!.start,
      [...external, ...groups.filter((_, other) => other !== index).flat()], groups.slice(0, index).map((item) => item[0]!.start), policy)
    && group.every((item) => {
      const obligations = [...external.filter((task) => task.participantId === item.participantId),
        ...meals.filter((meal) => meal.participantId === item.participantId)];
      return direction === "arrival" ? item.end <= Math.min(problem.day.end, ...obligations.map(({ start }) => start))
        : item.start >= Math.max(problem.day.start, ...obligations.map(({ end }) => end));
    }));
}

export interface TransportValidation {
  violationCount: number;
  groupsByDirection: Readonly<Record<TransportDirection, readonly ScheduledTask[][]>>;
}

function participantBoundaryViolation(
  direction: TransportDirection,
  transportTask: ScheduledTask,
  scheduled: readonly ScheduledTask[],
  participantMeals: readonly ScheduledParticipantMeal[],
): boolean {
  const participantId = transportTask.participantId;
  if (!participantId) return true;
  const otherObligations = [
    ...scheduled.filter((task) => task.participantId === participantId && task.id !== transportTask.id),
    ...participantMeals.filter((meal) => meal.participantId === participantId),
  ];
  return direction === "arrival"
    ? otherObligations.some((obligation) => obligation.start < transportTask.end)
    : otherObligations.some((obligation) => obligation.end > transportTask.start);
}

/** Independent final validation: derives groups solely from direction plus executed interval. */
export function validateTransportGrouping(
  problem: Readonly<PlannerNextProblem>,
  scheduled: readonly ScheduledTask[],
  participantMeals: readonly ScheduledParticipantMeal[] = [],
): TransportValidation {
  const groupsByDirection = { arrival: [] as ScheduledTask[][], departure: [] as ScheduledTask[][] };
  let violationCount = 0;
  if (!problem.transportPolicy) return { violationCount, groupsByDirection };
  for (const direction of ["arrival", "departure"] as const) {
    const policy = problem.transportPolicy[direction];
    const expected = [...policy.taskIds].sort();
    const actual = scheduled.filter((task) => expected.includes(task.id));
    if (actual.length !== expected.length
      || expected.some((id) => actual.filter((task) => task.id === id).length !== 1)) violationCount += 1;
    if (actual.some((task) => !task.participantId)
      || new Set(actual.map((task) => task.participantId)).size !== actual.length) violationCount += 1;
    const byInterval = new Map<string, ScheduledTask[]>();
    for (const task of actual) {
      const key = `${task.start}:${task.end}`;
      byInterval.set(key, [...(byInterval.get(key) ?? []), task]);
    }
    const groups = [...byInterval.values()]
      .map((group) => group.sort((left, right) => left.id.localeCompare(right.id)))
      .sort((left, right) => left[0]!.start - right[0]!.start || left[0]!.id.localeCompare(right[0]!.id));
    groupsByDirection[direction].push(...groups);
    if (groups.some((group) => group.length < policy.minimumGroupSize || group.length > policy.maximumGroupSize
      || group.some((task) => task.start !== group[0]!.start || task.end !== group[0]!.end))) violationCount += 1;
    for (let index = 1; index < groups.length; index += 1) {
      if (groups[index]![0]!.start - groups[index - 1]![0]!.start < policy.minGapMinutes) violationCount += 1;
    }
    if (actual.some((task) => participantBoundaryViolation(direction, task, scheduled, participantMeals))) violationCount += 1;
  }
  return { violationCount, groupsByDirection };
}

export function synchronizedTransportTasks(
  problem: Readonly<PlannerNextProblem>,
  left: ScheduledTask,
  right: ScheduledTask,
): boolean {
  const direction = transportDirectionForTask(problem, left.id);
  return direction !== undefined && transportDirectionForTask(problem, right.id) === direction
    && left.start === right.start && left.end === right.end;
}
