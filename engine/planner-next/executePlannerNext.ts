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
      result: planCompatibilityPreserving(problem),
    };
  }

  return {
    kind: "EXACT_CONSTRUCTIVE",
    policyResolution,
    result: constructExactItinerantPlan(problem),
  };
}
