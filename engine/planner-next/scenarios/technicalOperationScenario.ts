import type { PlannerNextProblem, Task } from "../contracts";
import { hm } from "../time";
import { jointAuxiliaryTasksScenario } from "./jointAuxiliaryTasksScenario";

export function technicalOperationScenario(): PlannerNextProblem {
  const problem = jointAuxiliaryTasksScenario();
  const availability = [{ start: hm("09:00"), end: hm("09:30") }];
  problem.spaces.push({ id: "technical-room", availability });
  problem.resources.push({ id: "technical-unit", availability, presencePreference: "HIGH", transitionMinutes: 0 });
  const operation: Task = { id: "technical-camera-positioning", kind: "technical", duration: 20, spaceId: "technical-room", dependencies: [], requiredResourceIds: ["technical-unit"] };
  problem.tasks.push(operation);
  return problem;
}
