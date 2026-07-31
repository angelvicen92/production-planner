import type { PlanResult, PlannerNextProblem } from "./contracts";
import { planCompatibilityPreserving } from "./compatibilityPreservingSearch";

export type { GreedyFeederClosureResult } from "./compatibilityPreservingSearch";
export { diagnoseGreedyFeederClosure, tryGreedyFeederClosure } from "./compatibilityPreservingSearch";

export function planMainFlowAndFeeders(problem: PlannerNextProblem): PlanResult {
  return planCompatibilityPreserving(problem);
}
