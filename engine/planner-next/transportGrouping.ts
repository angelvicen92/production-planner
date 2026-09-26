import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledTask, Task, TransportGroupingPolicy } from "./contracts";
import { canPlaceTask } from "./placement";
import { createHash } from "node:crypto";

export type TransportDirection = "arrival" | "departure";

export interface TransportMaterializationDirectionEvidence {
  direction: TransportDirection;
  orderedTaskIds: string[];
  orderedParticipantIds: string[];
  orderedDeadlines: number[];
  packetSizes: number[];
  packetMembers: string[][];
  starts: number[];
  minGapMinutes: number;
  construction: "canonical" | "contiguous" | "fallback";
  alternativesExplored: number;
  classification: TransportContextClassification;
  classificationBreakers: string[];
  contiguousStatesExplored: number;
  membershipFallbackEntered: boolean;
  participantPressureOrder?: Array<{ taskId:string;participantId:string;availabilityEnd:number;minimumFutureLoad:number;
    slack:number;domainCardinality:number;requiredDependencyCount:number }>;
}

export interface TransportMaterializationEvidence {
  directions: TransportMaterializationDirectionEvidence[];
  fingerprint: string;
}

export interface TransportMaterializationOptions {
  consumeFallbackBranch?: () => boolean;
  onEvidence?: (evidence: TransportMaterializationEvidence) => void;
}

export type TransportContextClassification = "CONTIGUOUS_EXACT" | "MEMBERSHIP_REQUIRED";

export interface TransportArrivalFeasibility {
  status: "FEASIBLE" | "INFEASIBLE" | "INCONCLUSIVE";
  evidence: TransportMaterializationDirectionEvidence;
  scheduled: ScheduledTask[] | null;
}

const byId = (left: Task, right: Task): number => left.id.localeCompare(right.id);

function arrivalPressure(problem:PlannerNextProblem,task:Task,obligations:readonly ScheduledTask[],policy:TransportGroupingPolicy){
  const availabilityEnd=individualTransportBoundary(problem,task,"arrival",
    obligations.length?Math.min(...obligations.map(item=>item.start)):problem.day.end);
  const minimumFutureLoad=obligations.reduce((sum,item)=>sum+item.duration,0);
  const domainCardinality=transportGroupStarts(problem,[task],obligations,[],policy).filter(start=>start+task.duration<=availabilityEnd).length;
  const requiredDependencyCount=obligations.filter(item=>item.dependencies.includes(task.id)).length;
  return {taskId:task.id,participantId:task.participantId!,availabilityEnd,minimumFutureLoad,
    slack:availabilityEnd-problem.day.start-task.duration-minimumFutureLoad,domainCardinality,requiredDependencyCount};
}
const comparePressure=(left:ReturnType<typeof arrivalPressure>,right:ReturnType<typeof arrivalPressure>)=>
  left.availabilityEnd-right.availabilityEnd||left.slack-right.slack||left.domainCardinality-right.domainCardinality
  ||right.requiredDependencyCount-left.requiredDependencyCount||left.taskId.localeCompare(right.taskId);
const earliestHardStart=(problem:PlannerNextProblem,task:Task)=>Math.max(problem.day.start,
  task.availability?.length?Math.min(...task.availability.map(window=>window.start)):problem.day.start,
  problem.participants.find(item=>item.id===task.participantId)?.availability.length
    ?Math.min(...problem.participants.find(item=>item.id===task.participantId)!.availability.map(window=>window.start)):problem.day.start);

const lowerAndHolesKey = (windows: readonly { start: number; end: number }[] | undefined): string => {
  const ordered = [...(windows ?? [])].sort((left, right) => left.start - right.start || left.end - right.end);
  return JSON.stringify({ lower: ordered[0]?.start ?? null,
    holes: ordered.slice(0, -1).map((window, index) => [window.end, ordered[index + 1]!.start]) });
};

/** Deadlines come from placed obligations and deliberately are not part of this identity test. */
export function classifyTransportContext(problem: Readonly<PlannerNextProblem>, tasks: readonly Task[],
  fixedTaskIds: ReadonlySet<string> = new Set()): { classification: TransportContextClassification; breakers: string[] } {
  const first = tasks[0];
  if (!first) return { classification: "CONTIGUOUS_EXACT", breakers: [] };
  const participant = (task: Task) => problem.participants.find(({ id }) => id === task.participantId);
  const space = (task: Task) => problem.spaces.find(({ id }) => id === task.spaceId);
  const resources = (task: Task) => [...(task.requiredResourceIds ?? [])].sort().map((id) => {
    const resource = problem.resources.find((candidate) => candidate.id === id);
    return [id, lowerAndHolesKey(resource?.availability), resource?.assignedSpaceId ?? null];
  });
  const signature = (task: Task) => JSON.stringify({ duration: task.duration, spaceId: task.spaceId,
    resources: resources(task), taskAvailability: lowerAndHolesKey(task.availability),
    participantAvailability: lowerAndHolesKey(participant(task)?.availability),
    spaceAvailability: lowerAndHolesKey(space(task)?.availability), itinerantUnitId: task.itinerantUnitId ?? null });
  const reference = signature(first);
  const breakers: string[] = [];
  if (tasks.some((task) => fixedTaskIds.has(task.id))) breakers.push("FIXED_START_OR_LOCK");
  if (tasks.some((task) => signature(task) !== reference)) breakers.push("HARD_TRANSPORT_CONTEXT");
  return { classification: breakers.length ? "MEMBERSHIP_REQUIRED" : "CONTIGUOUS_EXACT", breakers };
}

function individualTransportBoundary(problem: Readonly<PlannerNextProblem>, task: Task,
  direction: TransportDirection, obligationBoundary: number): number {
  const participant = problem.participants.find(({ id }) => id === task.participantId);
  const space = problem.spaces.find(({ id }) => id === task.spaceId);
  const resources = (task.requiredResourceIds ?? []).map((id) => problem.resources.find((item) => item.id === id));
  const windows = [task.availability, participant?.availability, space?.availability,
    ...resources.map((resource) => resource?.availability)]
    .filter((item): item is Array<{ start: number; end: number }> => Boolean(item?.length));
  if (direction === "arrival") {
    const latestEnd = Math.min(problem.day.end, ...windows.map((items) => Math.max(...items.map(({ end }) => end))));
    return Math.min(obligationBoundary, latestEnd);
  }
  const earliestStart = Math.max(problem.day.start, ...windows.map((items) => Math.min(...items.map(({ start }) => start))));
  return Math.max(obligationBoundary, earliestStart);
}

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
function solveContiguousDirection(
  problem: PlannerNextProblem,
  direction: TransportDirection,
  tasks: readonly Task[],
  substantive: readonly ScheduledTask[],
  participantMeals: readonly ScheduledParticipantMeal[],
  alreadyPlaced: readonly ScheduledTask[],
  policy: Readonly<TransportGroupingPolicy>,
  consumeAlternative?: () => boolean,
): { scheduled: ScheduledTask[] | null; packetSizes: number[]; starts: number[]; states: number; alternatives: number } {
  const transportIds = transportTaskIds(problem);
  const obligationsFor = (participantId: string) => [
    ...substantive.filter((task) => task.participantId === participantId && !transportIds.has(task.id)),
    ...participantMeals.filter((meal) => meal.participantId === participantId),
  ];
  const boundary = (task: Task): number => {
    const obligations = obligationsFor(task.participantId!);
    const obligationBoundary = direction === "arrival"
      ? (obligations.length ? Math.min(...obligations.map(({ start }) => start)) : problem.day.end)
      : (obligations.length ? Math.max(...obligations.map(({ end }) => end)) : problem.day.start);
    return individualTransportBoundary(problem, task, direction, obligationBoundary);
  };
  const target = Math.max(policy.minimumGroupSize,
    Math.min(policy.targetGroupSize ?? (direction === "arrival" ? 3 : 1), policy.maximumGroupSize));
  const sizeCandidates = (remaining: number) => Array.from(
    { length: Math.min(policy.maximumGroupSize, remaining) - policy.minimumGroupSize + 1 },
    (_, index) => policy.minimumGroupSize + index,
  ).filter((size) => canPartitionTransportCount(remaining - size, policy.minimumGroupSize, policy.maximumGroupSize))
    .sort((left, right) => Math.abs(left - target) - Math.abs(right - target) || left - right);
  let states = 0, alternatives = 0;
  const failed = new Set<string>();
  const search = (index: number, temporalLimit: number, local: ScheduledTask[], sizes: number[], starts: number[]): boolean => {
    states += 1;
    if (index >= tasks.length) return true;
    const key = `${index}@${temporalLimit}`;
    if (failed.has(key)) return false;
    const remaining = tasks.length - index;
    for (const [candidateIndex, size] of sizeCandidates(remaining).entries()) {
      if (candidateIndex > 0) {
        alternatives += 1;
        if (consumeAlternative && !consumeAlternative()) return false;
      }
      const from = index;
      const group = tasks.slice(from, from + size);
      const deadline = direction === "arrival" ? Math.min(...group.map(boundary)) : Math.max(...group.map(boundary));
      const candidates = transportGroupStarts(problem, group, [...substantive, ...alreadyPlaced, ...local], [], policy)
        .filter((start) => direction === "arrival"
          ? start + group[0]!.duration <= deadline && start >= temporalLimit
          : start >= deadline && start >= temporalLimit)
        .sort((left, right) => left - right);
      for (const start of candidates) {
        const scheduled = scheduleTransportGroup(group, start);
        local.push(...scheduled);
        sizes.push(size); starts.push(start);
        const nextLimit = start + policy.minGapMinutes;
        if (search(index + size, nextLimit, local, sizes, starts)) return true;
        local.splice(local.length - scheduled.length, scheduled.length);
        sizes.pop(); starts.pop();
      }
    }
    failed.add(key);
    return false;
  };
  const scheduled: ScheduledTask[] = [], packetSizes: number[] = [], starts: number[] = [];
  const initialIndex = 0;
  const initialLimit = Number.NEGATIVE_INFINITY;
  return { scheduled: search(initialIndex, initialLimit, scheduled, packetSizes, starts) ? scheduled : null,
    packetSizes, starts, states, alternatives };
}

export function assessCoreArrivalTransportFeasibility(
  problem: PlannerNextProblem,
  coreTasks: readonly ScheduledTask[],
  options: Readonly<TransportMaterializationOptions> = {},
): TransportArrivalFeasibility {
  const policy = problem.transportPolicy?.arrival;
  const tasks = policy?.taskIds.map((id) => problem.tasks.find((task) => task.id === id)!).filter(Boolean) ?? [];
  const pressureById=new Map(tasks.map(task=>[task.id,arrivalPressure(problem,task,
    coreTasks.filter(placed=>placed.participantId===task.participantId),policy!)]));
  const ordered = [...tasks].sort((left, right) => {
    const deadline = (task: Task) => {
      const obligations = coreTasks.filter((placed) => placed.participantId === task.participantId);
      const obligationBoundary = obligations.length ? Math.min(...obligations.map(({ start }) => start)) : problem.day.end;
      return individualTransportBoundary(problem, task, "arrival", obligationBoundary);
    };
    return earliestHardStart(problem,left)-earliestHardStart(problem,right)||deadline(left)-deadline(right)
      ||comparePressure(pressureById.get(left.id)!,pressureById.get(right.id)!);
  });
  const classified = classifyTransportContext(problem, ordered);
  const base = { direction: "arrival" as const, orderedTaskIds: ordered.map(({ id }) => id),
    orderedParticipantIds: ordered.map(({ participantId }) => participantId!), packetSizes: [] as number[],
    orderedDeadlines: ordered.map((task) => {
      const obligations = coreTasks.filter((placed) => placed.participantId === task.participantId);
      return individualTransportBoundary(problem, task, "arrival",
        obligations.length ? Math.min(...obligations.map(({ start }) => start)) : problem.day.end);
    }),
    packetMembers: [] as string[][], starts: [] as number[], minGapMinutes: policy?.minGapMinutes ?? 0,
    construction: "contiguous" as const, alternativesExplored: 0, classification: classified.classification,
    classificationBreakers: classified.breakers, contiguousStatesExplored: 0, membershipFallbackEntered: false,
    participantPressureOrder:ordered.map(task=>pressureById.get(task.id)!) };
  if (!policy || classified.classification === "MEMBERSHIP_REQUIRED")
    return { status: "INCONCLUSIVE", evidence: base, scheduled: null };
  const solved = solveContiguousDirection(problem, "arrival", ordered, coreTasks, [], [], policy, options.consumeFallbackBranch);
  const groups: string[][] = []; let offset = 0;
  for (const size of solved.packetSizes) { groups.push(ordered.slice(offset, offset + size).map(({ id }) => id)); offset += size; }
  const evidence = { ...base, packetSizes: solved.packetSizes, packetMembers: groups, starts: solved.starts,
    alternativesExplored: solved.alternatives, contiguousStatesExplored: solved.states };
  return { status: solved.scheduled ? "FEASIBLE" : "INFEASIBLE", evidence, scheduled: solved.scheduled };
}

/** Exact contiguous scheduling for interchangeable identities, retaining membership fallback otherwise. */
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
    const boundary = (task: Task) => { const obligations = obligationsFor(task.participantId!);
      const obligationBoundary = direction === "arrival"
        ? (obligations.length ? Math.min(...obligations.map(({ start }) => start)) : problem.day.end)
        : (obligations.length ? Math.max(...obligations.map(({ end }) => end)) : problem.day.start);
      return individualTransportBoundary(problem, task, direction, obligationBoundary); };
    const sourceTasks=policy.taskIds.map((id) => problem.tasks.find((task) => task.id === id)!).filter(Boolean);
    const pressureById=direction==="arrival"?new Map(sourceTasks.map(task=>[task.id,arrivalPressure(problem,task,
      substantive.filter(item=>item.participantId===task.participantId&&!transportIds.has(item.id)),policy)]))
      :new Map<string,ReturnType<typeof arrivalPressure>>();
    const tasks = sourceTasks.sort((left, right) => direction==="arrival"
      ?earliestHardStart(problem,left)-earliestHardStart(problem,right)||boundary(left)-boundary(right)
        ||comparePressure(pressureById.get(left.id)!,pressureById.get(right.id)!)
      :boundary(left)-boundary(right)||left.participantId!.localeCompare(right.participantId!)||byId(left,right));
    const classified = classifyTransportContext(problem, tasks);
    if (classified.classification === "CONTIGUOUS_EXACT") {
      const solved = solveContiguousDirection(problem, direction, tasks, substantive, participantMeals, placed, policy,
        options.consumeFallbackBranch);
      if (!solved.scheduled) return null;
      const packetMembers: string[][] = []; let offset = 0;
      for (const size of solved.packetSizes) { packetMembers.push(tasks.slice(offset, offset + size).map(({ id }) => id)); offset += size; }
      directionEvidence.push({ direction, orderedTaskIds: tasks.map(({ id }) => id),
        orderedParticipantIds: tasks.map(({ participantId }) => participantId!), packetSizes: solved.packetSizes,
        orderedDeadlines: tasks.map(boundary),
        packetMembers, starts: solved.starts, minGapMinutes: policy.minGapMinutes, construction: "contiguous",
        alternativesExplored: solved.alternatives, classification: classified.classification,
        classificationBreakers: [], contiguousStatesExplored: solved.states, membershipFallbackEntered: false,
        ...(direction==="arrival"?{participantPressureOrder:tasks.map(task=>pressureById.get(task.id)!)}:{}) });
      placed.push(...solved.scheduled);
      continue;
    }
    let alternativesExplored = 0;
    const partitions = function* (remaining: readonly Task[], groups: Task[][] = []): Generator<Task[][]> {
      if (!remaining.length) { yield groups; return; }
      for (const group of transportGroupCandidates(remaining, policy)) {
        const ids = new Set(group.map(({ id }) => id));
        yield* partitions(remaining.filter(({ id }) => !ids.has(id)), [...groups, group]);
      }
    };
    let witness: ScheduledTask[] | null = null, witnessGroups: Task[][] = [], witnessStarts: number[] = [];
    for (const groups of partitions(tasks)) {
      alternativesExplored += 1;
      if (options.consumeFallbackBranch && !options.consumeFallbackBranch()) break;
      const local: ScheduledTask[] = [], starts: number[] = [];
      const indices = groups.map((_, index) => index);
      const place = (position: number): boolean => {
        if (position === indices.length) return true;
        const index = indices[position]!;
        const group = groups[index]!;
        const limit = direction === "arrival" ? (starts[index - 1] ?? Number.NEGATIVE_INFINITY) + policy.minGapMinutes
          : (starts[index - 1] ?? Number.NEGATIVE_INFINITY) + policy.minGapMinutes;
        const deadline = direction === "arrival" ? Math.min(...group.map(boundary)) : Math.max(...group.map(boundary));
        const candidates = transportGroupStarts(problem, group, [...substantive, ...placed, ...local], [], policy)
          .filter((candidate) => direction === "arrival" ? candidate + group[0]!.duration <= deadline && candidate >= limit : candidate >= deadline && candidate >= limit)
          .sort((left, right) => left - right);
        for (const start of candidates) {
          const scheduled = scheduleTransportGroup(group, start);
          starts[index] = start; local.push(...scheduled);
          if (place(position + 1)) return true;
          local.splice(local.length - scheduled.length, scheduled.length);
        }
        return false;
      };
      if (place(0)) { witness = local; witnessGroups = groups; witnessStarts = starts; break; }
    }
    if (!witness) return null;
    directionEvidence.push({ direction, orderedTaskIds: tasks.map(({ id }) => id), orderedParticipantIds: tasks.map(({ participantId }) => participantId!),
      orderedDeadlines: tasks.map(boundary),
      packetSizes: witnessGroups.map(({ length }) => length), packetMembers: witnessGroups.map((group) => group.map(({ id }) => id)),
      starts: witnessStarts, minGapMinutes: policy.minGapMinutes, construction: "fallback", alternativesExplored,
      classification: classified.classification, classificationBreakers: classified.breakers,
      contiguousStatesExplored: 0, membershipFallbackEntered: true,
      ...(direction==="arrival"?{participantPressureOrder:tasks.map(task=>pressureById.get(task.id)!)}:{}) });
    placed.push(...witness);
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
