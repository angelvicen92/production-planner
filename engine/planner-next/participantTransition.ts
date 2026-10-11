import type { PlannerNextProblem, Task } from "./contracts";
import { anchoredSequence } from "./anchoredAccompaniment";

/** Canonical hard participant gap for one concrete, temporally ordered boundary. */
export function participantGapMinutes(problem: PlannerNextProblem, previous: Task, next: Task): number {
  if (previous.participantId === undefined || previous.participantId !== next.participantId) return 0;
  if ((problem.anchoredAccompaniments ?? []).some((contract) => {
    const sequence = anchoredSequence(contract);
    const index = sequence.indexOf(previous.id);
    return contract.internalTransition === "INCLUDED" && index >= 0 && sequence[index + 1] === next.id;
  })) return 0;
  const explicit = [previous.participantMarginAfterMinutes, next.participantMarginBeforeMinutes]
    .filter((value): value is number => value !== undefined && value !== null);
  return explicit.length === 0 ? problem.participantTransitionMinutes : Math.max(...explicit);
}
