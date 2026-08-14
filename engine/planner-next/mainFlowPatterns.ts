import type { PlannerNextProblem, Task } from "./contracts";

export type MainFeederStructuralRejection = "LOAD_CAPACITY" | "FEEDER_CAPACITY" | "RESOURCE_WINDOW";

export interface MainFeederArchitecture {
  pattern: readonly string[];
  slots: readonly number[];
}

const covers = (windows: readonly { start: number; end: number }[] | undefined, start: number, end: number): boolean =>
  windows === undefined || windows.length === 0 || windows.some((window) => window.start <= start && end <= window.end);

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

  // A bipartite cover is necessary: each main must own a distinct compatible architecture slot.
  const owner = new Map<number, string>();
  const augment = (task: Task, seen: Set<number>): boolean => {
    for (let position = 0; position < architecture.slots.length; position += 1) {
      if (seen.has(position) || task.blockKey !== architecture.pattern[position]
        || !fits(task, architecture.slots[position]!)) continue;
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
    if (!augment(main, new Set())) return "RESOURCE_WINDOW";

  // Feeders in a configured contiguous run are constructed serially. Even with zero
  // transitions, their total processing load must fit before the latest main slot in the run.
  for (let start = 0; start < architecture.pattern.length;) {
    let end = start + 1;
    while (end < architecture.pattern.length && architecture.pattern[end] === architecture.pattern[start]) end += 1;
    const runLength = end - start;
    const cohortMains = mains.filter((main) => main.blockKey === architecture.pattern[start]);
    const feederLoad = cohortMains.map((main) => feederByMain.get(main.id)?.duration ?? 0)
      .sort((a, b) => a - b).slice(0, runLength).reduce((sum, duration) => sum + duration, 0);
    const latestMainStart = Math.max(...architecture.slots.slice(start, end));
    if (feederLoad > latestMainStart - problem.day.start) return "FEEDER_CAPACITY";
    start = end;
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
