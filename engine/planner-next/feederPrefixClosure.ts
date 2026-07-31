import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask } from "./contracts";
import { closeFeeders, diagnoseGreedyFeederClosure, type FeederClosureCandidate } from "./feederClosure";

export interface PlacedMainFeederClosureAssessment {
  feasible: boolean;
  exhausted: boolean;
  consumedBranches: number;
  completeClosureCount: number;
  blockingFeederIds: string[];
  blockingMainTaskIds: string[];
  maximumPartialStates: number;
  selectedFeederOrder: string[];
  witnessFeeders?: ScheduledTask[];
  closureCandidates: FeederClosureCandidate[];
  rejectedStateBlockerIds: string[];
}

/** Bounded prefix propagation. Only feeders belonging to already placed mains are considered. */
export function assessPlacedMainFeederClosure(
  problem: PlannerNextProblem,
  placedStructuralTasks: readonly ScheduledTask[],
  meals: readonly ScheduledSpaceMeal[],
  allowance: number,
  bestK: number,
): PlacedMainFeederClosureAssessment {
  const mains = [...placedStructuralTasks].filter(task => task.kind === "main");
  const greedy = bestK === 1 ? diagnoseGreedyFeederClosure(problem, [...placedStructuralTasks], [...meals]) : null;
  if (greedy?.complete) {
    return { feasible: true, exhausted: false, consumedBranches: 0, completeClosureCount: 1,
      blockingFeederIds: [], blockingMainTaskIds: [], maximumPartialStates: 1,
      selectedFeederOrder: greedy.scheduledFeeders.map(feeder => feeder.id), witnessFeeders: greedy.scheduledFeeders,
      closureCandidates: [{ feeders: greedy.scheduledFeeders, cost: 0, signature: greedy.scheduledFeeders.map(feeder => `${feeder.id}@${feeder.start}`).sort().join("|"), selectedFeederOrder: greedy.scheduledFeeders.map(feeder => feeder.id) }],
      rejectedStateBlockerIds: [] };
  }
  const closure = closeFeeders(problem, [...placedStructuralTasks], [...meals], allowance, bestK);
  const feederById = new Map(problem.tasks.filter(task => task.kind === "vocal").map(task => [task.id, task]));
  const blockingFeederIds = [...closure.diagnostics.rejectedStateBlockerIds].sort();
  const blockingParticipants = new Set(blockingFeederIds.map(id => feederById.get(id)?.participantId).filter((id): id is string => Boolean(id)));
  const blockingMainTaskIds = mains.filter(main => blockingParticipants.has(main.participantId)).map(main => main.id).sort();
  const witness = closure.candidates[0];
  return {
    feasible: closure.candidates.length > 0,
    exhausted: closure.diagnostics.exhausted,
    consumedBranches: closure.diagnostics.consumed,
    completeClosureCount: closure.diagnostics.completeClosuresGenerated,
    blockingFeederIds,
    blockingMainTaskIds,
    maximumPartialStates: closure.diagnostics.maximumPartialStates,
    selectedFeederOrder: witness?.selectedFeederOrder ?? [],
    witnessFeeders: witness?.feeders,
    closureCandidates: closure.candidates,
    rejectedStateBlockerIds: [...closure.diagnostics.rejectedStateBlockerIds],
  };
}
