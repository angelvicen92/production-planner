import type { PlannerNextProblem } from "../contracts";
import { secondaryFutureFeasibilityScenario } from "./secondaryFutureFeasibilityScenario";

/** NEXT-008 algorithmic benchmark variant; it changes only the fresh scenario's beam width. */
export function boundedFutureFeasibilityScenario(): PlannerNextProblem {
  const problem = secondaryFutureFeasibilityScenario();
  problem.budget = { ...problem.budget, bestK: 1 };
  return problem;
}
