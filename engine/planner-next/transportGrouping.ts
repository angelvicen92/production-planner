import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledTask, Task, TransportGroupingPolicy } from "./contracts";
import { canPlaceTask } from "./placement";
import { createHash } from "node:crypto";

export type TransportDirection = "arrival" | "departure";

export interface ArrivalFutureFeasibilityResult {
  feasible: boolean;
  conclusive: boolean;
  cacheHit: boolean;
  groupsChecked: number;
  startsChecked: number;
  witnessFingerprint: string | null;
  blockingParticipantIds: string[];
}
export type ArrivalFutureFeasibilityCache = Map<string, Omit<ArrivalFutureFeasibilityResult, "cacheHit">>;

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
  const sizes: number[] = [];
  let remaining = count;
  while (remaining > 0) {
    const size = Math.min(target, remaining);
    sizes.push(size);
    remaining -= size;
  }
  return sizes;
}

/**
 * Deterministic terminal logistics. Membership is fixed by participant boundary order and
 * contiguous slicing; only the canonical latest-IN/earliest-OUT starts are considered.
 */
export function materializeTerminalTransport(
  problem: PlannerNextProblem,
  substantive: readonly ScheduledTask[],
  participantMeals: readonly ScheduledParticipantMeal[] = [],
): ScheduledTask[] | null {
  if (!problem.transportPolicy) return [];
  const transportIds = transportTaskIds(problem);
  const obligationsFor = (participantId: string) => [
    ...substantive.filter((task) => task.participantId === participantId && !transportIds.has(task.id)),
    ...participantMeals.filter((meal) => meal.participantId === participantId),
  ];
  const placed: ScheduledTask[] = [];
  for (const direction of ["arrival", "departure"] as const) {
    const policy = problem.transportPolicy[direction];
    const tasks = policy.taskIds.map((id) => problem.tasks.find((task) => task.id === id)!)
      .sort((left, right) => {
        const leftObligations = obligationsFor(left.participantId!);
        const rightObligations = obligationsFor(right.participantId!);
        const boundary = direction === "arrival"
          ? (values: typeof leftObligations) => values.length ? Math.min(...values.map(({ start }) => start)) : problem.day.end
          : (values: typeof leftObligations) => values.length ? Math.max(...values.map(({ end }) => end)) : problem.day.start;
        return boundary(leftObligations) - boundary(rightObligations)
          || left.participantId!.localeCompare(right.participantId!) || left.id.localeCompare(right.id);
      });
    const sizes = transportContiguousGroupSizes(tasks.length, policy, direction);
    if (!sizes) return null;
    let offset = 0;
    const starts: number[] = [];
    for (const size of sizes) {
      const group = tasks.slice(offset, offset + size);
      offset += size;
      const boundary = direction === "arrival"
        ? Math.min(...group.map((task) => {
          const obligations = obligationsFor(task.participantId!);
          return obligations.length ? Math.min(...obligations.map(({ start }) => start)) : problem.day.end;
        }))
        : Math.max(...group.map((task) => {
          const obligations = obligationsFor(task.participantId!);
          return obligations.length ? Math.max(...obligations.map(({ end }) => end)) : problem.day.start;
        }));
      const candidates = transportGroupStarts(problem, group, [...substantive, ...placed], starts, policy)
        .filter((start) => direction === "arrival" ? start + group[0]!.duration <= boundary : start >= boundary)
        .sort((left, right) => direction === "arrival" ? right - left : left - right);
      const start = candidates[0];
      if (start === undefined) return null;
      placed.push(...scheduleTransportGroup(group, start));
      starts.push(start);
    }
  }
  return placed;
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
  return first !== undefined
    && tasks.every((task) => task.duration === first.duration)
    && new Set(tasks.map((task) => task.participantId)).size === tasks.length
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
  const duration = tasks[0]?.duration ?? 0;
  const starts: number[] = [];
  for (let start = problem.day.start; start + duration <= problem.day.end; start += 5) {
    if (canPlaceTransportGroup(problem, tasks, start, placed, previousGroupStarts, policy)) starts.push(start);
  }
  return starts;
}

/**
 * Read-only probe of the canonical arrival materializer. It never returns a
 * negative certificate while a participant boundary is unknown: a later
 * substantive placement could reorder the canonical contiguous groups.
 */
export function assessArrivalTransportFutureFeasibility(
  problem: PlannerNextProblem,
  substantive: readonly ScheduledTask[],
  cache?: ArrivalFutureFeasibilityCache,
): ArrivalFutureFeasibilityResult {
  const policy = problem.transportPolicy?.arrival;
  if (!policy || policy.taskIds.length === 0) return { feasible: true, conclusive: true, cacheHit: false, groupsChecked: 0, startsChecked: 0, witnessFingerprint: null, blockingParticipantIds: [] };
  const transportIds = transportTaskIds(problem);
  const tasks = policy.taskIds.map((id) => problem.tasks.find((task) => task.id === id)).filter((task): task is Task => task !== undefined);
  const boundaryFor = (participantId: string): number | undefined => {
    const obligations = substantive.filter((task) => task.participantId === participantId && !transportIds.has(task.id));
    return obligations.length ? Math.min(...obligations.map(({ start }) => start)) : undefined;
  };
  const unknown = tasks.map((task) => task.participantId!).filter((id) => boundaryFor(id) === undefined).sort();
  if (unknown.length) return { feasible: true, conclusive: false, cacheHit: false, groupsChecked: 0, startsChecked: 0, witnessFingerprint: null, blockingParticipantIds: [] };
  const ordered = [...tasks].sort((left, right) => boundaryFor(left.participantId!)! - boundaryFor(right.participantId!)!
    || left.participantId!.localeCompare(right.participantId!) || left.id.localeCompare(right.id));
  const canAffectArrival = (placed: ScheduledTask): boolean => tasks.some((arrival) =>
    placed.participantId !== undefined && placed.participantId === arrival.participantId
    || placed.coachId !== undefined && placed.coachId === arrival.coachId
    || placed.spaceId === arrival.spaceId
    || (placed.requiredResourceIds ?? []).some((id) => (arrival.requiredResourceIds ?? []).includes(id))
    || placed.dependencies.includes(arrival.id) || arrival.dependencies.includes(placed.id));
  const transportRelevantPlaced = [...substantive].filter(canAffectArrival).sort((a, b) => a.id.localeCompare(b.id));
  const key = createHash("sha256").update(JSON.stringify({
    policy: { ...policy, taskIds: [...policy.taskIds].sort() },
    tasks: ordered.map((task) => ({ id: task.id, participantId: task.participantId, duration: task.duration, boundary: boundaryFor(task.participantId!), availability: task.availability ?? [] })),
    placed: transportRelevantPlaced.map(({ id, start, end, participantId, spaceId, coachId, requiredResourceIds }) => ({ id, start, end, participantId, spaceId, coachId, requiredResourceIds: [...(requiredResourceIds ?? [])].sort() })),
    day: problem.day,
  })).digest("hex");
  const cached = cache?.get(key); if (cached) return { ...cached, cacheHit: true };
  const sizes = transportContiguousGroupSizes(ordered.length, policy, "arrival");
  let groupsChecked = 0, startsChecked = 0, offset = 0;
  const placed: ScheduledTask[] = [], starts: number[] = [];
  if (sizes) for (const size of sizes) {
    const group = ordered.slice(offset, offset + size); offset += size; groupsChecked += 1;
    const boundary = Math.min(...group.map((task) => boundaryFor(task.participantId!)!));
    const candidates = transportGroupStarts(problem, group, [...transportRelevantPlaced, ...placed], starts, policy)
      .filter((start) => start + group[0]!.duration <= boundary).sort((a, b) => b - a);
    startsChecked += candidates.length;
    const start = candidates[0];
    if (start === undefined) {
      const result = { feasible: false, conclusive: true, groupsChecked, startsChecked, witnessFingerprint: null,
        blockingParticipantIds: group.map((task) => task.participantId!).sort() };
      cache?.set(key, result); return { ...result, cacheHit: false };
    }
    placed.push(...scheduleTransportGroup(group, start)); starts.push(start);
  }
  const witnessFingerprint = createHash("sha256").update(JSON.stringify(placed.map(({ id, start, end }) => ({ id, start, end })))).digest("hex");
  const result = { feasible: sizes !== null, conclusive: true, groupsChecked, startsChecked, witnessFingerprint, blockingParticipantIds: [] as string[] };
  cache?.set(key, result); return { ...result, cacheHit: false };
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
    if (groups.some((group) => group.length === 0 || group.length > policy.maximumGroupSize
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
