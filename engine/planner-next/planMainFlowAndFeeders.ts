import type { PlanResult, PlannerNextProblem } from "./contracts";
import { planCompatibilityPreserving } from "./compatibilityPreservingSearch";

export type { GreedyFeederClosureResult } from "./compatibilityPreservingSearch";
export { diagnoseGreedyFeederClosure, tryGreedyFeederClosure } from "./compatibilityPreservingSearch";

/**
 * Historical compatibility entrypoint retained during migration. This is not
 * the policy dispatcher: new callers must use executePlannerNext instead.
 */
export function planMainFlowAndFeeders(problem: PlannerNextProblem): PlanResult {
  return planCompatibilityPreserving(problem);
}
