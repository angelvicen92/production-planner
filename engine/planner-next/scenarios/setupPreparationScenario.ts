import type { PlannerNextProblem } from "../contracts";
import { setupGroupingScenario } from "./setupGroupingScenario";

export function setupPreparationScenario(): PlannerNextProblem {
  const problem = setupGroupingScenario();
  const setupRoom = problem.spaces.find(space => space.id === "setup-room")!;
  setupRoom.setupPolicy = { ...setupRoom.setupPolicy!, preparationMinutesByFamily: { "family-a":10, "family-b":15, "family-c":5 } };
  return problem;
}
