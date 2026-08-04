import type { PlanResult, PlannerNextProblem } from "./contracts";
import { planCompatibilityPreserving } from "./compatibilityPreservingSearch";
import {
  constructExactItinerantPlan,
  type ExactItinerantPlanResult,
} from "./exactItinerantPlan";
import {
  resolvePlannerSearchPolicy,
  type PlannerSearchPolicyResolution,
} from "./searchPolicy";
import { scheduleParticipantMeals } from "./participantMeals";
import type { ScheduledParticipantMeal, ScheduledTask } from "./contracts";

function withParticipantMeals<T extends { complete: boolean; scheduledTasks: ScheduledTask[] }>(problem: PlannerNextProblem, result: T): T & { scheduledParticipantMeals: ScheduledParticipantMeal[] } {
  if ((problem.participantMeals?.length ?? 0) === 0) return result as T & { scheduledParticipantMeals: ScheduledParticipantMeal[] };
  if (!result.complete) return { ...result, scheduledParticipantMeals: [] };
  const witness = scheduleParticipantMeals(problem, result.scheduledTasks);
  if (!witness.complete) {
    if ("metrics" in result) {
      const metrics = (result as unknown as { metrics: PlanResult["metrics"] }).metrics;
      return { ...result, complete: false, scheduledTasks: [], scheduledParticipantMeals: [], metrics: { ...metrics, complete: false, hardValid: false, plannedTaskCount: 0, unplannedTaskCount: problem.tasks.length + (problem.participantMeals?.length ?? 0), reasonCodes: [...new Set([...metrics.reasonCodes, ...witness.reasonCodes])].sort(), participantMealCount: problem.participantMeals?.length ?? 0, participantMealPlannedCount: 0, participantMealBranchesExplored: witness.branchesExplored, participantMealFutureFeasibilityChecks: 1, participantMealFutureInfeasibleBranches: 1 } } as T & { scheduledParticipantMeals: [] };
    }
    const evidence = (result as unknown as { evidence?: { reasonCodes: string[] } }).evidence;
    return { ...result, complete: false, scheduledTasks: [], scheduledParticipantMeals: [], ...(evidence ? { evidence: { ...evidence, reasonCodes: [...new Set([...evidence.reasonCodes, ...witness.reasonCodes])].sort() } } : {}) } as T & { scheduledParticipantMeals: [] };
  }
  if ("metrics" in result) {
    const metrics = (result as unknown as { metrics: PlanResult["metrics"] }).metrics;
    return { ...result, scheduledParticipantMeals: [...witness.scheduled], metrics: { ...metrics, plannedTaskCount: metrics.plannedTaskCount + witness.scheduled.length, participantMealCount: problem.participantMeals?.length ?? 0, participantMealPlannedCount: witness.scheduled.length, participantMealProtectedCount: (problem.participantMeals ?? []).filter((meal) => meal.fixedInterval).length, participantMealCandidateCount: Object.values(witness.candidateCountByTaskId).reduce((a, b) => a + b, 0), participantMealBranchesExplored: witness.branchesExplored, participantMealFutureFeasibilityChecks: 1, participantMealFutureInfeasibleBranches: 0, participantMealMaximumSimultaneous: witness.maximumSimultaneous, participantMealCapacityLimit: problem.participantMealCapacity?.maxSimultaneous ?? 0, participantMealStartByTaskId: Object.fromEntries(witness.scheduled.map((meal) => [meal.sourceTaskId, meal.start])), participantMealEndByTaskId: Object.fromEntries(witness.scheduled.map((meal) => [meal.sourceTaskId, meal.end])), participantMealRejectedReasonCountByCode: {} } } as T & { scheduledParticipantMeals: ScheduledParticipantMeal[] };
  }
  return { ...result, scheduledParticipantMeals: [...witness.scheduled] };
}

export type PlannerNextExecution =
  | {
      kind: "POLICY_REJECTED";
      policyResolution: PlannerSearchPolicyResolution;
      result: null;
    }
  | {
      kind: "COMPATIBILITY_PRESERVING";
      policyResolution: PlannerSearchPolicyResolution;
      result: PlanResult;
    }
  | {
      kind: "EXACT_CONSTRUCTIVE";
      policyResolution: PlannerSearchPolicyResolution;
      result: ExactItinerantPlanResult;
    };

export function executePlannerNext(problem: PlannerNextProblem): PlannerNextExecution {
  const policyResolution = resolvePlannerSearchPolicy(problem);

  if (!policyResolution.compatible) {
    return { kind: "POLICY_REJECTED", policyResolution, result: null };
  }

  if (policyResolution.effectivePolicy === "COMPATIBILITY_PRESERVING") {
    return {
      kind: "COMPATIBILITY_PRESERVING",
      policyResolution,
      result: withParticipantMeals(problem, planCompatibilityPreserving(problem)),
    };
  }

  return {
    kind: "EXACT_CONSTRUCTIVE",
    policyResolution,
    result: withParticipantMeals(problem, constructExactItinerantPlan(problem)),
  };
}
