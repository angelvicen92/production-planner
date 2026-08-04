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
import type { ScheduledParticipantMeal, ScheduledTask } from "./contracts";

function withParticipantMeals<T extends { complete: boolean; scheduledTasks: ScheduledTask[]; scheduledSpaceMeals: unknown[]; scheduledParticipantMeals?: ScheduledParticipantMeal[] }>(problem: PlannerNextProblem, result: T): T & { scheduledParticipantMeals: ScheduledParticipantMeal[] } {
  if (!result.complete) return { ...result, scheduledTasks: [], ...( "scheduledSetupPreparations" in result ? { scheduledSetupPreparations: [] } : {}), scheduledSpaceMeals: [], scheduledParticipantMeals: [] };
  if ((problem.participantMeals?.length ?? 0) > 0 && !result.scheduledParticipantMeals) throw new Error("Constructive search omitted the accepted participant-meal witness");
  return { ...result, scheduledParticipantMeals: result.scheduledParticipantMeals ?? [] };
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
