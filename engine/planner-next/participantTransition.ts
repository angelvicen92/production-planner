import type { PlannerNextProblem, Task } from "./contracts";

/** Canonical participant gap for the directed boundary `before -> after`. */
export function effectiveParticipantTransitionMinutes(problem: PlannerNextProblem, before: Task, after: Task): number {
  const explicit = [before.participantMarginAfterMinutes, after.participantMarginBeforeMinutes]
    .filter((value): value is number => value !== undefined);
  return explicit.length ? Math.max(...explicit) : problem.participantTransitionMinutes;
}
