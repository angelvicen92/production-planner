import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { exactTaskStartDomain } from "./placement";

export interface ParticipantPresenceFeasibility {
  feasible: boolean;
  individualDomainChecks: number;
  collectiveCapacityChecks: number;
  collectiveCapacityPrunes: number;
  blockingTaskIds: string[];
  candidateCountByTaskId: Record<string, number>;
  readOnly: true;
}

/**
 * Necessary-only boundary reservation.  It deliberately retains intervals/counts,
 * never a selected start.  A positive result therefore means only "not disproved".
 */
export function probeParticipantBoundaryFutureFeasibility(
  problem: PlannerNextProblem,
  boundaryPending: readonly Task[],
  productivePlaced: readonly ScheduledTask[],
): ParticipantPresenceFeasibility {
  const boundaries = [...boundaryPending]
    .filter((task) => task.participantBoundaryRole !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
  const domains = boundaries.map((task) => {
    // Ignore still-pending boundary/transport predecessors: their end is represented
    // by the release/deadline envelope, rather than by an invented exact witness.
    const starts = [...exactTaskStartDomain(problem, { ...task, dependencies: task.dependencies.filter((id) =>
      productivePlaced.some((placed) => placed.id === id)) }, productivePlaced).starts()];
    return { task, starts };
  });
  const counts = Object.fromEntries(domains.map(({ task, starts }) => [task.id, starts.length]));
  const empty = domains.filter(({ starts }) => starts.length === 0).map(({ task }) => task.id);
  let checks = 0;
  const blocking = new Set(empty);
  // Hall overload on every domain endpoint interval. This is necessary-only and
  // works for both spaces and each required resource without choosing grid starts.
  const keys = [...new Set(boundaries.flatMap((task) => [task.spaceId, ...(task.requiredResourceIds ?? [])]))].sort();
  for (const key of keys) {
    const relevant = domains.filter(({ task }) => task.spaceId === key || task.requiredResourceIds?.includes(key));
    const endpoints = [...new Set(relevant.flatMap(({ task, starts }) => starts.length
      ? [Math.min(...starts), Math.max(...starts) + task.duration] : []))].sort((a, b) => a - b);
    for (let left = 0; left < endpoints.length; left++) for (let right = left + 1; right < endpoints.length; right++) {
      checks += 1;
      const start = endpoints[left]!, end = endpoints[right]!;
      const forced = relevant.filter(({ task, starts }) => starts.length > 0
        && Math.min(...starts) >= start && Math.max(...starts) + task.duration <= end);
      if (forced.reduce((sum, { task }) => sum + task.duration, 0) > end - start)
        forced.forEach(({ task }) => blocking.add(task.id));
    }
  }
  return Object.freeze({ feasible: blocking.size === 0, individualDomainChecks: domains.length,
    collectiveCapacityChecks: checks, collectiveCapacityPrunes: blocking.size > empty.length ? 1 : 0,
    blockingTaskIds: [...blocking].sort(), candidateCountByTaskId: counts, readOnly: true as const });
}
