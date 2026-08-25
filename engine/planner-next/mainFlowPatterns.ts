import type { PlannerNextProblem, Task } from "./contracts";
import { effectiveCoachTransitionMinutes } from "./coachRouteTransitions";

export type MainFeederStructuralRejection = "LOAD_CAPACITY" | "FEEDER_CAPACITY" | "RESOURCE_WINDOW"
  | "TRANSITION_CAPACITY" | "FEEDER_CONTIGUOUS_CAPACITY" | "FEEDER_MULTI_RUN_CONTIGUOUS_CAPACITY"
  | "PREREQUISITE_WINDOW";

export interface MainFeederArchitecture {
  pattern: readonly string[];
  slots: readonly number[];
}

const covers = (windows: readonly { start: number; end: number }[] | undefined, start: number, end: number): boolean =>
  windows === undefined || windows.length === 0 || windows.some((window) => window.start <= start && end <= window.end);

interface ProvenCoachRun {
  start: number;
  end: number;
  coachId: string;
  eligible: Array<{ main: Task; feeder: Task }>;
}

interface ContiguousFeederPlacement {
  duration: number;
  starts: Array<{ start: number; end: number }>;
}

const availableIntervalsBefore = (
  day: { start: number; end: number },
  availability: readonly { start: number; end: number }[] | undefined,
  deadline: number,
  occupied: readonly { start: number; end: number }[],
): Array<{ start: number; end: number }> => {
  const windows = availability === undefined || availability.length === 0
    ? [{ start: day.start, end: day.end }]
    : availability;
  const horizonEnd = Math.min(day.end, deadline);
  const boundaries = [...new Set([
    day.start, horizonEnd,
    ...windows.flatMap(({ start, end }) => [Math.max(day.start, start), Math.min(horizonEnd, end)]),
    ...occupied.flatMap(({ start, end }) => [Math.max(day.start, start), Math.min(horizonEnd, end)]),
  ])].filter((point) => day.start <= point && point <= horizonEnd).sort((a, b) => a - b);
  const available: Array<{ start: number; end: number }> = [];
  for (let index = 1; index < boundaries.length; index += 1) {
    const start = boundaries[index - 1]!, end = boundaries[index]!;
    if (start === end || !windows.some((window) => window.start <= start && end <= window.end)
      || occupied.some((interval) => interval.start < end && start < interval.end)) continue;
    const previous = available.at(-1);
    if (previous?.end === start) previous.end = end;
    else available.push({ start, end });
  }
  return available;
};

const availableMinutesBefore = (...parameters: Parameters<typeof availableIntervalsBefore>): number =>
  availableIntervalsBefore(...parameters).reduce((sum, interval) => sum + interval.end - interval.start, 0);

/**
 * Conservative structural proof for one main/feeder architecture.  Every rejection is a
 * necessary condition of the exact construction; anything not proved impossible passes.
 * In particular, this function never chooses a participant or a feeder order.
 */
export function proveMainFeederArchitectureImpossible(
  problem: PlannerNextProblem,
  mains: readonly Task[],
  feederByMain: ReadonlyMap<string, Task>,
  architecture: MainFeederArchitecture,
): MainFeederStructuralRejection | null {
  if (architecture.pattern.length !== mains.length || architecture.slots.length !== mains.length)
    return "LOAD_CAPACITY";

  const spaceById = new Map(problem.spaces.map((space) => [space.id, space]));
  const resourceById = new Map(problem.resources.map((resource) => [resource.id, resource]));
  const participantById = new Map(problem.participants.map((participant) => [participant.id, participant]));
  const coachById = new Map(problem.coaches.map((coach) => [coach.id, coach]));
  const fits = (task: Task, start: number): boolean => {
    const end = start + task.duration;
    return problem.day.start <= start && end <= problem.day.end
      && covers(task.availability, start, end)
      && covers(spaceById.get(task.spaceId)?.availability, start, end)
      && covers(participantById.get(task.participantId ?? "")?.availability, start, end)
      && covers(coachById.get(task.coachId ?? "")?.availability, start, end)
      && (task.requiredResourceIds ?? []).every((id) => covers(resourceById.get(id)?.availability, start, end));
  };

  // Analytic, continuous-time relaxation of one participant's prerequisite closure.
  // It performs no grid scan and chooses no order between independent ancestors.
  // Omitted coexistence constraints only enlarge domains, so rejection remains sound.
  const closureCache = new Map<string, boolean>();
  const participantClosureFits = (main: Task, mainStart: number): boolean => {
    const cacheKey = `${main.id}@${mainStart}`;
    const cached = closureCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const byId = new Map(problem.tasks.map((task) => [task.id, task]));
    const ancestors = new Map<string, Task>();
    const collect = (id: string): void => {
      const task = byId.get(id);
      if (!task || task.participantId !== main.participantId || ancestors.has(id)) return;
      ancestors.set(id, task);
      for (const dependency of task.dependencies) collect(dependency);
    };
    for (const dependency of main.dependencies) collect(dependency);
    // Unknown/non-participant ancestors require an exact authority: abstain.
    if (main.dependencies.some((id) => !ancestors.has(id))) return true;
    const intersect = (left: readonly { start:number;end:number }[], right: readonly { start:number;end:number }[]) =>
      left.flatMap((a) => right.flatMap((b) => {
        const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
        return start < end ? [{ start, end }] : [];
      }));
    const domain = (task: Task, deadline: number): Array<{start:number;end:number}> => {
      let windows = [{ start: problem.day.start, end: Math.min(problem.day.end, deadline) }];
      const authorities = [task.availability,
        participantById.get(task.participantId ?? "")?.availability,
        spaceById.get(task.spaceId)?.availability,
        task.coachId === undefined ? undefined : coachById.get(task.coachId)?.availability,
        ...(task.requiredResourceIds ?? []).map((id) => resourceById.get(id)?.availability)];
      for (const authority of authorities) {
        if (authority === undefined || authority.length === 0) continue;
        windows = intersect(windows, authority);
      }
      return windows.filter(({ start, end }) => start + task.duration <= end);
    };
    const completion = new Map<string, number>();
    const unresolved = new Set(ancestors.keys());
    while (unresolved.size > 0) {
      let progressed = false;
      for (const id of [...unresolved].sort()) {
        const task = ancestors.get(id)!;
        const localDependencies = task.dependencies.filter((dependency) => ancestors.has(dependency));
        if (localDependencies.some((dependency) => !completion.has(dependency))) continue;
        const earliest = Math.max(problem.day.start,
          ...localDependencies.map((dependency) => completion.get(dependency)!));
        const transition = task.id === feederByMain.get(main.id)?.id && task.coachId !== undefined
          ? effectiveCoachTransitionMinutes(problem, task.coachId, task.spaceId, main.spaceId) : 0;
        const deadline = mainStart - transition;
        const firstEnd = Math.min(...domain(task, deadline)
          .map(({ start, end }) => Math.max(start, earliest) + task.duration <= end
            ? Math.max(start, earliest) + task.duration : Infinity));
        if (!Number.isFinite(firstEnd)) { closureCache.set(cacheKey, false); return false; }
        completion.set(id, firstEnd); unresolved.delete(id); progressed = true;
      }
      // Cycles/unsupported closure shapes are left to exact search.
      if (!progressed) return true;
    }
    const participantWindows = participantById.get(main.participantId ?? "")?.availability;
    const capacity = (participantWindows?.length ? participantWindows : [problem.day])
      .reduce((sum, window) => sum + Math.max(0, Math.min(window.end, mainStart) - Math.max(window.start, problem.day.start)), 0);
    const result = [...ancestors.values()].reduce((sum, task) => sum + task.duration, 0) <= capacity;
    closureCache.set(cacheKey, result);
    return result;
  };

  // A bipartite cover is necessary: each main must own a distinct compatible architecture slot.
  const owner = new Map<number, string>();
  const augment = (task: Task, seen: Set<number>): boolean => {
    for (let position = 0; position < architecture.slots.length; position += 1) {
      if (seen.has(position) || task.blockKey !== architecture.pattern[position]
        || !fits(task, architecture.slots[position]!)
        || !participantClosureFits(task, architecture.slots[position]!)) continue;
      seen.add(position);
      const previous = owner.get(position);
      if (previous === undefined || augment(mains.find(({ id }) => id === previous)!, seen)) {
        owner.set(position, task.id);
        return true;
      }
    }
    return false;
  };
  for (const main of [...mains].sort((a, b) => a.id.localeCompare(b.id)))
    if (!augment(main, new Set())) {
      const hasMainOnlyEdge = architecture.slots.some((slot, position) =>
        main.blockKey === architecture.pattern[position] && fits(main, slot));
      const feeder = feederByMain.get(main.id);
      const hasFeederEdge = feeder !== undefined && architecture.slots.some((slot, position) =>
        main.blockKey === architecture.pattern[position] && [...new Set([
          problem.day.start,
          ...(feeder.availability ?? []).map(({ start }) => start),
          ...(participantById.get(feeder.participantId ?? "")?.availability ?? []).map(({ start }) => start),
          ...(spaceById.get(feeder.spaceId)?.availability ?? []).map(({ start }) => start),
          ...(coachById.get(feeder.coachId ?? "")?.availability ?? []).map(({ start }) => start),
          ...(feeder.requiredResourceIds ?? []).flatMap((id) =>
            (resourceById.get(id)?.availability ?? []).map(({ start }) => start)),
        ])].some((start) => start + feeder.duration <= slot && fits(feeder, start)));
      return hasMainOnlyEdge && hasFeederEdge ? "PREREQUISITE_WINDOW" : "RESOURCE_WINDOW";
    }

  // Only a proven shared coach makes the run serial independently of participant choice.
  // Otherwise parallel feeder work may exist, so capacity remains deliberately unknown.
  const provenRuns: ProvenCoachRun[] = [];
  for (let start = 0; start < architecture.pattern.length;) {
    let end = start + 1;
    while (end < architecture.pattern.length && architecture.pattern[end] === architecture.pattern[start]) end += 1;
    const runLength = end - start;
    const cohortMains = mains.filter((main) => main.blockKey === architecture.pattern[start]);
    const eligible = cohortMains.flatMap((main) => {
      const feeder = feederByMain.get(main.id);
      return feeder ? [{ main, feeder }] : [];
    });
    const coachIds = new Set(eligible.map(({ main }) => main.coachId));
    const sharedCoachId = coachIds.size === 1 ? eligible[0]?.main.coachId : undefined;
    const provenSharedCoach = eligible.length >= runLength && sharedCoachId !== undefined
      && eligible.every(({ main, feeder }) => main.coachId === sharedCoachId && feeder.coachId === sharedCoachId);
    if (provenSharedCoach) {
      provenRuns.push({ start, end, coachId: sharedCoachId, eligible });
      const selected = [...eligible].sort((left, right) => left.feeder.duration - right.feeder.duration
        || left.main.id.localeCompare(right.main.id)).slice(0, runLength);
      const feederLoad = selected.reduce((sum, { feeder }) => sum + feeder.duration, 0);
      const firstMainStart = architecture.slots[start]!;
      const priorCapacity = firstMainStart - problem.day.start;
      if (feederLoad > priorCapacity) return "FEEDER_CAPACITY";
      const terminalTransition = Math.min(...eligible.map(({ main, feeder }) =>
        effectiveCoachTransitionMinutes(problem, sharedCoachId, feeder.spaceId, main.spaceId)));
      if (feederLoad + terminalTransition > priorCapacity) return "TRANSITION_CAPACITY";
    }
    start = end;
  }
  // Across separate runs, earlier main work cannot be reused as feeder time. For each coach
  // prefix, use the globally cheapest distinct eligible feeders: this can only understate the
  // required load when cohort membership is still open. Likewise, subtract only the shortest
  // main interval that every compatible assignment must occupy at each earlier position.
  const runsByCoach = new Map<string, ProvenCoachRun[]>();
  for (const run of provenRuns)
    runsByCoach.set(run.coachId, [...(runsByCoach.get(run.coachId) ?? []), run]);
  for (const [coachId, runs] of runsByCoach) {
    let requiredPositions = 0;
    const eligibleByMain = new Map<string, { main: Task; feeder: Task }>();
    const occupied: Array<{ start: number; end: number }> = [];
    const contiguousPlacements: ContiguousFeederPlacement[] = [];
    for (const run of runs) {
      requiredPositions += run.end - run.start;
      for (const pair of run.eligible) eligibleByMain.set(pair.main.id, pair);
      const cheapest = [...eligibleByMain.values()].sort((left, right) =>
        left.feeder.duration - right.feeder.duration || left.main.id.localeCompare(right.main.id))
        .slice(0, requiredPositions);
      if (cheapest.length === requiredPositions) {
        const minimumLoad = cheapest.reduce((sum, { feeder }) => sum + feeder.duration, 0);
        const deadline = architecture.slots[run.start]!;
        const capacity = availableMinutesBefore(problem.day, coachById.get(coachId)?.availability, deadline, occupied);
        if (minimumLoad > capacity) return "FEEDER_CAPACITY";
      }

      // A feeder cohort is one uninterrupted block.  This certificate deliberately asks only
      // whether the optimistic N-shortest block for this run fits in one real coach interval;
      // it neither assigns participants nor explores possible placements.  Authorities which
      // can insert work inside that block make the simple continuity premise inapplicable.
      const runLength = run.end - run.start;
      const cheapestRun = [...run.eligible].sort((left, right) =>
        left.feeder.duration - right.feeder.duration || left.main.id.localeCompare(right.main.id))
        .slice(0, runLength);
      const feederSpaces = [...new Set(run.eligible.map(({ feeder }) => feeder.spaceId))];
      const transitionMaySplitBlock = feederSpaces.some((from) => feederSpaces.some((to) =>
        from !== to && effectiveCoachTransitionMinutes(problem, coachId, from, to) > 0));
      const authorizedMealMaySplitBlock = problem.spaces.some((space) =>
        feederSpaces.includes(space.id) && space.mealPolicy !== undefined);
      if (cheapestRun.length === runLength && !transitionMaySplitBlock && !authorizedMealMaySplitBlock) {
        const minimumBlock = cheapestRun.reduce((sum, { feeder }) => sum + feeder.duration, 0);
        const terminalTransition = Math.min(...run.eligible.map(({ main, feeder }) =>
          effectiveCoachTransitionMinutes(problem, coachId, feeder.spaceId, main.spaceId)));
        const deadline = architecture.slots[run.start]! - terminalTransition;
        const intervals = availableIntervalsBefore(problem.day,
          coachById.get(coachId)?.availability, deadline, occupied);
        const largestGap = Math.max(0, ...intervals.map(({ start, end }) => end - start));
        if (minimumBlock > largestGap) return "FEEDER_CONTIGUOUS_CAPACITY";

        // Each range contains every optimistic start for this run's uninterrupted block.
        // Comparing its earliest and latest starts with every prior run admits either order;
        // rejection is therefore limited to pairs whose relaxed placements must overlap.
        const placement = { duration: minimumBlock, starts: intervals
          .filter(({ start, end }) => end - start >= minimumBlock)
          .map(({ start, end }) => ({ start, end: end - minimumBlock })) };
        for (const prior of contiguousPlacements) {
          const priorBefore = Math.min(...prior.starts.map(({ start }) => start)) + prior.duration
            <= Math.max(...placement.starts.map(({ end }) => end));
          const currentBefore = Math.min(...placement.starts.map(({ start }) => start)) + placement.duration
            <= Math.max(...prior.starts.map(({ end }) => end));
          if (!priorBefore && !currentBefore) return "FEEDER_MULTI_RUN_CONTIGUOUS_CAPACITY";
        }
        contiguousPlacements.push(placement);
      }
      for (let position = run.start; position < run.end; position += 1) {
        const slot = architecture.slots[position]!;
        const minimumDuration = Math.min(...run.eligible
          .filter(({ main }) => fits(main, slot)).map(({ main }) => main.duration));
        if (Number.isFinite(minimumDuration)) occupied.push({ start: slot, end: slot + minimumDuration });
      }
    }
  }
  // Every feeder must have at least one legal grid placement before the latest compatible
  // main position. This deliberately ignores all other tasks, so failure is conclusive.
  for (const main of mains) {
    const feeder = feederByMain.get(main.id);
    if (!feeder) continue;
    const latestMainStart = Math.max(...architecture.slots.filter((_, position) =>
      architecture.pattern[position] === main.blockKey));
    const possible = Array.from({ length: Math.max(0,
      Math.floor((latestMainStart - feeder.duration - problem.day.start) / 5) + 1) },
    (_, index) => problem.day.start + index * 5).some((candidate) => fits(feeder, candidate));
    if (!possible) return "RESOURCE_WINDOW";
  }
  return null;
}

/** Canonical generator for the block-key sequences admitted by the main-flow contract. */
export function generateMainFlowPatterns(
  mains: Task[],
  minimumRun: number,
  maximumRunsByKey: number,
  maximumPatterns: number,
): { patterns: string[][]; exhausted: boolean } {
  const counts = new Map<string, number>();
  for (const task of mains) counts.set(task.blockKey ?? "", (counts.get(task.blockKey ?? "") ?? 0) + 1);
  const keys = [...counts.keys()].sort();
  const output: string[][] = [];
  let exhausted = false;

  function visit(remaining: Map<string, number>, runs: Array<{ key: string; count: number }>): void {
    if (exhausted) return;
    const left = [...remaining.values()].reduce((sum, count) => sum + count, 0);
    if (left === 0) {
      if (output.length >= maximumPatterns) {
        exhausted = true;
        return;
      }
      output.push(runs.flatMap((run) => Array(run.count).fill(run.key) as string[]));
      return;
    }
    for (const key of keys) {
      const available = remaining.get(key) ?? 0;
      const sameAsPrevious = runs.at(-1)?.key === key;
      const runsForKey = runs.filter((run) => run.key === key).length;
      if (available === 0 || sameAsPrevious || runsForKey >= maximumRunsByKey) continue;
      for (let take = minimumRun; take <= available; take += 1) {
        remaining.set(key, available - take);
        visit(remaining, [...runs, { key, count: take }]);
        remaining.set(key, available);
        if (exhausted) return;
      }
    }
  }

  visit(new Map(counts), []);
  const runCount = (pattern: string[]): number => pattern.reduce(
    (count, key, index) => count + (index === 0 || pattern[index - 1] !== key ? 1 : 0), 0,
  );
  output.sort((a, b) => runCount(a) - runCount(b) || a.join("|").localeCompare(b.join("|")));
  return { patterns: output, exhausted };
}
