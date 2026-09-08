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
  reservedArrivalValidation: null | {
    validBeforeParticipantMeals: boolean;
    validAfterParticipantMeals: boolean;
    firstParticipantMealBoundaryConflict: null | {
      arrivalTaskId: string; participantId: string; arrivalEnd: number;
      mealId: string; mealStart: number; mealEnd: number;
    };
  };
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
    arrivalReservedWitnessReused: false, arrivalRepaired: false, reservedArrivalValidation: null, firstFailure: null };
  const tasks = (direction: TransportDirection) => problem.transportPolicy![direction].taskIds
    .map((id) => problem.tasks.find((task) => task.id === id)!).filter(Boolean);
  const arrivals = tasks("arrival"), departures = tasks("departure");
  const reserved = reservedArrivalGroups.map((group) => [...group]);
  const reservedValidBeforeParticipantMeals = reserved.length > 0
    && validateDirectionWitness(problem, "arrival", arrivals, reserved, substantive, []);
  const reservedValid = reserved.length > 0
    && validateDirectionWitness(problem, "arrival", arrivals, reserved, substantive, participantMeals);
  const firstParticipantMealBoundaryConflict = reservedValidBeforeParticipantMeals && !reservedValid
    ? reserved.flat().sort(byId).flatMap((arrival) => participantMeals
      .filter((meal) => meal.participantId === arrival.participantId && meal.start < arrival.end)
      .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id))
      .map((meal) => ({ arrivalTaskId: arrival.id, participantId: arrival.participantId!, arrivalEnd: arrival.end,
        mealId: meal.id, mealStart: meal.start, mealEnd: meal.end })))[0] ?? null
    : null;
  const reservedArrivalValidation = reserved.length === 0 ? null : {
    validBeforeParticipantMeals: reservedValidBeforeParticipantMeals,
    validAfterParticipantMeals: reservedValid,
    firstParticipantMealBoundaryConflict,
  };
  const arrival = reservedValid ? { ...empty, groups: reserved } : findTransportDirectionWitness(problem, "arrival", arrivals,
    substantive, consume, participantMeals);
  if (!arrival.feasible) return failure("arrival", arrivals, arrival, !reservedValid && reserved.length > 0);
  const arrivalScheduled = arrival.groups.flat();
  const departure = findTransportDirectionWitness(problem, "departure", departures,
    [...substantive, ...arrivalScheduled], consume, participantMeals);
  if (!departure.feasible) return failure("departure", departures, departure, !reservedValid && reserved.length > 0, arrival);
  return { status: "FEASIBLE", scheduled: [...arrivalScheduled, ...departure.groups.flat()], arrival, departure,
    arrivalReservedWitnessReused: reservedValid, arrivalRepaired: !reservedValid && reserved.length > 0,
    reservedArrivalValidation, firstFailure: null };

  function failure(direction: TransportDirection, remaining: readonly Task[], result: TransportDirectionWitnessResult,
    repaired: boolean, successfulArrival = result): TerminalTransportMaterialization {
    const policy = problem.transportPolicy![direction];
    const reason = result.exhausted ? "BUDGET_EXHAUSTED" : "NO_WITNESS";
    return { status: reason, scheduled: [], arrival: direction === "arrival" ? result : successfulArrival,
      departure: direction === "departure" ? result : empty, arrivalReservedWitnessReused: false, arrivalRepaired: repaired,
      reservedArrivalValidation,
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
  monotoneFastPathChecks: number;
  monotoneFastPathHits: number;
  monotoneFastPathWitnesses: number;
  monotoneFastPathAbstentions: number;
  cumulativeCapacityChecks: number;
  cumulativeCapacityPrunes: number;
  causalDiagnostic: TransportWitnessCausalDiagnostic | null;
}

export interface TransportWitnessCausalDiagnostic {
  monotoneAbstentionReason: "NOT_MONOTONE" | "NO_CONTIGUOUS_SIZES" | "PACKET_NO_COMMON_START" | "CANDIDATE_VALIDATION_FAILED" | null;
  canonicalCandidateFingerprint: string | null;
  canonicalCandidateSummary: readonly { start:number; taskIds:string[] }[] | null;
  firstValidationFailure: null | { reason:"BOUNDARY"|"DEPENDENCY"|"PLACEMENT_RESOURCE_SPACE"|"GROUP_SIZE"|"MIN_GAP"|"MEMBERSHIP"|"SYNCHRONIZATION";taskId:string|null;participantId:string|null;boundary:number|null;start:number|null;end:number|null };
  firstCumulativeCapacityPrune: null | { prefix:number; demand:number; capacity:number; activeSlots:number[]; participantIds:string[]; taskIds:string[] };
}

const emptyWitness = (): TransportDirectionWitnessResult => ({ feasible: true, groups: [], branchesExplored: 0,
  backtracks: 0, exhausted: false, slotLogicalStarts: 0, slotAnalyticallyEliminatedStarts: 0,
  slotStartSetsEvaluated: 0, matchingChecks: 0, matchingEdgeChecks: 0, matchingAugmentTraversals: 0,
  equivalentMembershipsCollapsed: 0, monotoneFastPathChecks: 0, monotoneFastPathHits: 0,
  monotoneFastPathWitnesses: 0, monotoneFastPathAbstentions: 0, cumulativeCapacityChecks: 0,
  cumulativeCapacityPrunes: 0, causalDiagnostic:null });

/** Exact, ledger-accounted grouped witness. It is read-only and does not materialize into the plan. */
export function findTransportDirectionWitness(problem: PlannerNextProblem, direction: TransportDirection,
  relevantTasks: readonly Task[], externalPlaced: readonly ScheduledTask[], consume: () => boolean,
  participantMeals: readonly ScheduledParticipantMeal[] = [], causalDiagnostic = false): TransportDirectionWitnessResult {
  const policy = problem.transportPolicy?.[direction];
  if (!policy || relevantTasks.length === 0) return emptyWitness();
  const policyIds = new Set(policy.taskIds);
  const relevant = relevantTasks.filter(({ id }) => policyIds.has(id));
  if (relevant.length !== relevantTasks.length)
    return { ...emptyWitness(), feasible: false };
  let branchesExplored = 0, backtracks = 0, exhausted = false, slotStartSetsEvaluated = 0;
  let slotAnalyticallyEliminatedStarts = 0;
  let matchingChecks = 0, matchingEdgeChecks = 0, matchingAugmentTraversals = 0;
  let monotoneFastPathChecks = 1, monotoneFastPathHits = 0, monotoneFastPathWitnesses = 0;
  let monotoneFastPathAbstentions = 0, cumulativeCapacityChecks = 0, cumulativeCapacityPrunes = 0;
  const diagnostic:TransportWitnessCausalDiagnostic|null=causalDiagnostic?{monotoneAbstentionReason:null,
    canonicalCandidateFingerprint:null,canonicalCandidateSummary:null,firstValidationFailure:null,firstCumulativeCapacityPrune:null}:null;
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

  // In directional order a continuous arrival-prefix/departure-suffix domain becomes a prefix
  // of this slot array. Homogeneous duration and hole-free domains let the canonical construction
  // reason only from participant boundaries; otherwise the exact slot+matching authority decides.
  const monotone = new Set(tasks.map(({ duration }) => duration)).size === 1 && tasks.every((_, taskIndex) => {
    let sawIneligible = false;
    for (const slot of slots) {
      if (!slot.eligible[taskIndex]) sawIneligible = true;
      else if (sawIneligible) return false;
    }
    return true;
  });

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
  const jointlyValid = (candidate: ScheduledTask[][] | null): candidate is ScheduledTask[][] => candidate !== null
    && validateDirectionWitness(problem, direction, tasks, candidate, external, participantMeals,diagnostic);
  const hasCumulativeCapacity = (active: readonly Slot[]): boolean => {
    for (let prefix = 1; prefix <= slots.length; prefix += 1) {
      cumulativeCapacityChecks += 1;
      const demand = tasks.reduce((sum, _, taskIndex) => sum + (slots.slice(0, prefix).some((slot) => slot.eligible[taskIndex])
        && !slots.slice(prefix).some((slot) => slot.eligible[taskIndex]) ? 1 : 0), 0);
      const capacity = active.filter((slot) => slots.indexOf(slot) < prefix).length * policy.maximumGroupSize;
      if (demand > capacity) { cumulativeCapacityPrunes += 1;if(diagnostic&&!diagnostic.firstCumulativeCapacityPrune){const forced=tasks.filter((_,taskIndex)=>slots.slice(0,prefix).some(slot=>slot.eligible[taskIndex])&&!slots.slice(prefix).some(slot=>slot.eligible[taskIndex]));diagnostic.firstCumulativeCapacityPrune={prefix,demand,capacity,activeSlots:active.filter(slot=>slots.indexOf(slot)<prefix).map(slot=>slot.start),participantIds:[...new Set(forced.map(task=>task.participantId).filter((id):id is string=>Boolean(id)))].sort(),taskIds:forced.map(task=>task.id).sort()};} return false; }
    }
    return true;
  };
  let groups: ScheduledTask[][] | null = null;
  if (monotone) {
    monotoneFastPathHits += 1;
    if (!consume()) exhausted = true;
    else branchesExplored += 1;
    if (!exhausted) {
      if (!consume()) exhausted = true;
      else branchesExplored += 1;
    }
    const sizes = exhausted ? null : transportContiguousGroupSizes(tasks.length, policy, direction);
    if(!sizes&&diagnostic)diagnostic.monotoneAbstentionReason="NO_CONTIGUOUS_SIZES";
    if (sizes) {
      const canonicalTasks: Task[][] = [];
      let offset = 0;
      for (const size of sizes) { canonicalTasks.push(tasks.slice(offset, offset + size)); offset += size; }
      const canonical: (ScheduledTask[] | undefined)[] = canonicalTasks.map(() => undefined);
      const scheduleAt = (index: number, limit: number): boolean => {
        const members = canonicalTasks[index]!;
        const possible = slots.filter((slot) => members.every((task) => slot.eligible[tasks.indexOf(task)]))
          .map(({ start }) => start)
          .filter((start) => direction === "arrival" ? start <= limit : start >= limit);
        const start = possible.length === 0 ? undefined
          : direction === "arrival" ? Math.max(...possible) : Math.min(...possible);
        if (start === undefined) return false;
        canonical[index] = scheduleTransportGroup(members, start);
        return true;
      };
      let constructed = true;
      if (direction === "arrival") {
        let latest = Number.POSITIVE_INFINITY;
        for (let index = canonicalTasks.length - 1; index >= 0; index -= 1) {
          if (!scheduleAt(index, latest)) { constructed = false;if(diagnostic)diagnostic.monotoneAbstentionReason="PACKET_NO_COMMON_START"; break; }
          latest = canonical[index]![0]!.start - policy.minGapMinutes;
        }
      } else {
        let earliest = Number.NEGATIVE_INFINITY;
        for (let index = 0; index < canonicalTasks.length; index += 1) {
          if (!scheduleAt(index, earliest)) { constructed = false;if(diagnostic)diagnostic.monotoneAbstentionReason="PACKET_NO_COMMON_START"; break; }
          earliest = canonical[index]![0]!.start + policy.minGapMinutes;
        }
      }
      const candidate = constructed ? canonical as ScheduledTask[][] : null;
      if(candidate&&diagnostic){diagnostic.canonicalCandidateSummary=candidate.map(group=>({start:group[0]!.start,taskIds:group.map(task=>task.id).sort()}));diagnostic.canonicalCandidateFingerprint=diagnostic.canonicalCandidateSummary.map(group=>`${group.start}:${group.taskIds.join(",")}`).join("|");}
      slotAnalyticallyEliminatedStarts += candidate ? Math.max(0, slots.length - candidate.length) : 0;
      if (jointlyValid(candidate)) { groups = candidate; monotoneFastPathWitnesses += 1; }
      else if(candidate&&diagnostic)diagnostic.monotoneAbstentionReason="CANDIDATE_VALIDATION_FAILED";
    }
    if (!groups) monotoneFastPathAbstentions += 1;
  } else {monotoneFastPathAbstentions += 1;if(diagnostic)diagnostic.monotoneAbstentionReason="NOT_MONOTONE";}
  for (const groupCount of groupCounts) {
    if (groups || exhausted) break;
    if (!consume()) { exhausted = true; break; }
    branchesExplored += 1;
    const choose = (from: number, active: readonly Slot[]): boolean => {
      if (active.length === groupCount) {
        if (!consume()) { exhausted = true; return true; }
        branchesExplored += 1; slotStartSetsEvaluated += 1;
        if (!hasCumulativeCapacity(active)) { backtracks += 1; return false; }
        const candidate = match(active); groups = jointlyValid(candidate) ? candidate : null; backtracks += groups ? 0 : 1;
        return groups !== null;
      }
      if (active.length + slots.length - from < groupCount) { cumulativeCapacityPrunes += 1; return false; }
      for (let index = from; index < slots.length; index += 1) {
        const slot = slots[index]!;
        if (active.some((other) => Math.abs(slot.start - other.start) < policy.minGapMinutes)) continue;
        if (!consume()) { exhausted = true; return true; }
        branchesExplored += 1;
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
    slotLogicalStarts: logicalStarts, slotAnalyticallyEliminatedStarts, slotStartSetsEvaluated,
    matchingChecks, matchingEdgeChecks, matchingAugmentTraversals, equivalentMembershipsCollapsed,
    monotoneFastPathChecks, monotoneFastPathHits, monotoneFastPathWitnesses, monotoneFastPathAbstentions,
    cumulativeCapacityChecks, cumulativeCapacityPrunes,causalDiagnostic:diagnostic };
}

function validateDirectionWitness(problem: PlannerNextProblem, direction: TransportDirection, tasks: readonly Task[],
  groups: readonly (readonly ScheduledTask[])[], external: readonly ScheduledTask[], meals: readonly ScheduledParticipantMeal[],diagnostic:TransportWitnessCausalDiagnostic|null=null): boolean {
  const policy = problem.transportPolicy?.[direction];
  if (!policy) return tasks.length === 0;
  const expected = tasks.map(({ id }) => id).sort(), actual = groups.flat().map(({ id }) => id).sort();
  const fail=(reason:NonNullable<TransportWitnessCausalDiagnostic["firstValidationFailure"]>["reason"],item?:ScheduledTask,boundaryValue:number|null=null)=>{if(diagnostic&&!diagnostic.firstValidationFailure)diagnostic.firstValidationFailure={reason,taskId:item?.id??null,participantId:item?.participantId??null,boundary:boundaryValue,start:item?.start??null,end:item?.end??null};return false;};
  if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) return fail("MEMBERSHIP");
  if (!canPartitionTransportCount(tasks.length, policy.minimumGroupSize, policy.maximumGroupSize)) return fail("GROUP_SIZE");
  return groups.every((group, index) => {
    if(group.length < policy.minimumGroupSize || group.length > policy.maximumGroupSize)return fail("GROUP_SIZE",group[0]);
    if(group.some(item=>item.start!==group[0]!.start||item.end!==item.start+item.duration))return fail("SYNCHRONIZATION",group.find(item=>item.start!==group[0]!.start||item.end!==item.start+item.duration));
    if(groups.slice(0,index).some(other=>Math.abs(group[0]!.start-other[0]!.start)<policy.minGapMinutes))return fail("MIN_GAP",group[0]);
    const definitions=group.map(({id})=>tasks.find(task=>task.id===id)!);const placed=[...external,...groups.filter((_,other)=>other!==index).flat()];
    const dependencyFailure=definitions.find(task=>task.dependencies.some(id=>{const dependency=placed.find(item=>item.id===id);return !dependency||dependency.end>group[0]!.start;}));
    if(dependencyFailure)return fail("DEPENDENCY",group.find(item=>item.id===dependencyFailure.id));
    const boundariesValid=group.every((item) => {
      const obligations = [...external.filter((task) => task.participantId === item.participantId),
        ...meals.filter((meal) => meal.participantId === item.participantId)];
      const limit=direction === "arrival" ? Math.min(problem.day.end, ...obligations.map(({ start }) => start)):Math.max(problem.day.start, ...obligations.map(({ end }) => end));
      return (direction === "arrival" ? item.end <= limit:item.start >= limit)||fail("BOUNDARY",item,limit);
    });
    if(!boundariesValid)return false;
    return canPlaceTransportGroup(problem,definitions,group[0]!.start,placed,groups.slice(0,index).map(item=>item[0]!.start),policy)
      ||fail("PLACEMENT_RESOURCE_SPACE",group[0]);
  });
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
