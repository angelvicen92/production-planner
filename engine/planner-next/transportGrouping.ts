import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledTask, Task, TransportGroupingPolicy } from "./contracts";
import { canPlaceTask } from "./placement";
import { createHash } from "node:crypto";

export type TransportDirection = "arrival" | "departure";

export interface TransportMaterializationDirectionEvidence {
  direction: TransportDirection;
  orderedTaskIds: string[];
  orderedParticipantIds: string[];
  packetSizes: number[];
  packetMembers: string[][];
  starts: number[];
  minGapMinutes: number;
  construction: "canonical" | "fallback";
  alternativesExplored: number;
}

export interface TransportMaterializationEvidence {
  directions: TransportMaterializationDirectionEvidence[];
  fingerprint: string;
}

export interface TransportMaterializationOptions {
  consumeFallbackBranch?: () => boolean;
  onEvidence?: (evidence: TransportMaterializationEvidence) => void;
}

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
  const ordered = [...tasks];
  const [first, ...rest] = ordered;
  if (!first) return [];
  const sizes = Array.from(
    { length: Math.min(policy.maximumGroupSize, ordered.length) - policy.minimumGroupSize + 1 },
    (_, index) => policy.minimumGroupSize + index,
  ).filter((size) => canPartitionTransportCount(ordered.length - size, policy.minimumGroupSize, policy.maximumGroupSize));
  const target = Math.max(policy.minimumGroupSize, Math.min(policy.targetGroupSize ?? 1, policy.maximumGroupSize));
  sizes.sort((left, right) => Math.abs(left - target) - Math.abs(right - target) || left - right);
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
  if (!canPartitionTransportCount(count, policy.minimumGroupSize, policy.maximumGroupSize)) return null;
  const target = Math.max(policy.minimumGroupSize,
    Math.min(policy.targetGroupSize ?? (direction === "arrival" ? 3 : 1), policy.maximumGroupSize));
  const memo = new Map<number, number[] | null>();
  const best = (remaining: number): number[] | null => {
    if (remaining === 0) return [];
    if (memo.has(remaining)) return memo.get(remaining)!;
    const candidates = Array.from({ length: Math.min(policy.maximumGroupSize, remaining) - policy.minimumGroupSize + 1 },
      (_, index) => policy.minimumGroupSize + index)
      .filter((size) => canPartitionTransportCount(remaining - size, policy.minimumGroupSize, policy.maximumGroupSize))
      .map((size) => ({ size, tail: best(remaining - size) }))
      .filter((candidate): candidate is { size: number; tail: number[] } => candidate.tail !== null)
      .map(({ size, tail }) => [size, ...tail])
      .sort((left, right) => {
        const leftCost = left.reduce((sum, size) => sum + Math.abs(size - target), 0);
        const rightCost = right.reduce((sum, size) => sum + Math.abs(size - target), 0);
        const difference = left.findIndex((size, index) => size !== right[index]);
        return leftCost - rightCost || left.length - right.length
          || (difference >= 0 ? left[difference]! - right[difference]! : 0);
      });
    const result = candidates[0] ?? null;
    memo.set(remaining, result);
    return result;
  };
  return best(count);
}

/**
 * Deterministic terminal logistics. The preferred witness uses contiguous boundary-ordered
 * packets; an exact fallback explores hard-valid packet sizes and memberships.
 */
export function materializeTerminalTransport(
  problem: PlannerNextProblem,
  substantive: readonly ScheduledTask[],
  participantMeals: readonly ScheduledParticipantMeal[] = [],
  options: Readonly<TransportMaterializationOptions> = {},
): ScheduledTask[] | null {
  if (!problem.transportPolicy) return [];
  const transportIds = transportTaskIds(problem);
  const obligationsFor = (participantId: string) => [
    ...substantive.filter((task) => task.participantId === participantId && !transportIds.has(task.id)),
    ...participantMeals.filter((meal) => meal.participantId === participantId),
  ];
  const placed: ScheduledTask[] = [];
  const directionEvidence: TransportMaterializationDirectionEvidence[] = [];
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
    const canonicalGroups: Task[][] = [];
    let offset = 0;
    for (const size of sizes) { canonicalGroups.push(tasks.slice(offset, offset + size)); offset += size; }
    let alternativesExplored = 0;
    const scheduleGroups = (groups: readonly Task[][], construction: "canonical" | "fallback"): ScheduledTask[] | null => {
      const local: ScheduledTask[] = [];
      const groupStarts = new Array<number>(groups.length);
      const indices = direction === "arrival"
        ? groups.map((_, index) => index).reverse()
        : groups.map((_, index) => index);
      const visit = (position: number): boolean => {
        if (position === indices.length) return true;
        const index = indices[position]!;
        const group = groups[index]!;
        const boundary = direction === "arrival"
        ? Math.min(...group.map((task) => {
          const obligations = obligationsFor(task.participantId!);
          return obligations.length ? Math.min(...obligations.map(({ start }) => start)) : problem.day.end;
        }))
        : Math.max(...group.map((task) => {
          const obligations = obligationsFor(task.participantId!);
          return obligations.length ? Math.max(...obligations.map(({ end }) => end)) : problem.day.start;
        }));
        const directionalLimit = direction === "arrival"
          ? (index + 1 < groups.length ? groupStarts[index + 1]! - policy.minGapMinutes : Number.POSITIVE_INFINITY)
          : (index > 0 ? groupStarts[index - 1]! + policy.minGapMinutes : Number.NEGATIVE_INFINITY);
        const candidates = transportGroupStarts(problem, group, [...substantive, ...placed, ...local], [], policy)
          .filter((start) => direction === "arrival" ? start + group[0]!.duration <= boundary : start >= boundary)
          .filter((start) => direction === "arrival" ? start <= directionalLimit : start >= directionalLimit)
          .sort((left, right) => direction === "arrival" ? right - left : left - right);
        for (const start of candidates) {
          if (construction === "fallback") {
            alternativesExplored += 1;
            if (options.consumeFallbackBranch && !options.consumeFallbackBranch()) return false;
          }
          const scheduled = scheduleTransportGroup(group, start);
          local.push(...scheduled); groupStarts[index] = start;
          if (visit(position + 1)) return true;
          local.splice(local.length - scheduled.length, scheduled.length);
        }
        return false;
      };
      if (!visit(0)) return null;
      directionEvidence.push({ direction, orderedTaskIds: tasks.map(({ id }) => id),
        orderedParticipantIds: tasks.map(({ participantId }) => participantId!),
        packetSizes: groups.map(({ length }) => length), packetMembers: groups.map((group) => group.map(({ id }) => id)),
        starts: groupStarts, minGapMinutes: policy.minGapMinutes, construction, alternativesExplored });
      return local;
    };
    let scheduledDirection = scheduleGroups(canonicalGroups, "canonical");
    if (!scheduledDirection) {
      const partitions = function* (remaining: readonly Task[], groups: Task[][] = []): Generator<Task[][]> {
        if (remaining.length === 0) { yield groups; return; }
        for (const group of transportGroupCandidates(remaining, policy)) {
          const ids = new Set(group.map(({ id }) => id));
          yield* partitions(remaining.filter(({ id }) => !ids.has(id)), [...groups, group]);
        }
      };
      for (const groups of partitions(tasks)) {
        if (groups.length === canonicalGroups.length
          && groups.every((group, index) => group.map(({ id }) => id).join() === canonicalGroups[index]!.map(({ id }) => id).join())) continue;
        alternativesExplored += 1;
        if (options.consumeFallbackBranch && !options.consumeFallbackBranch()) break;
        scheduledDirection = scheduleGroups(groups, "fallback");
        if (scheduledDirection) break;
      }
    }
    if (!scheduledDirection) return null;
    placed.push(...scheduledDirection);
  }
  const fingerprint = createHash("sha256").update(JSON.stringify(directionEvidence)).digest("hex");
  options.onEvidence?.({ directions: directionEvidence, fingerprint });
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
