import type { PlannerNextProblem, PreferenceLevel, Task } from "../contracts";
import { hm } from "../time";
import { mainFlowVocalScenario } from "./mainFlowVocalScenario";

export function auxiliaryScarcityScenario(preference: PreferenceLevel): PlannerNextProblem {
  const problem = mainFlowVocalScenario();
  problem.spaces.push(
    { id: "fixed-auxiliary-space", availability: [{ ...problem.day }] },
    { id: "flexible-auxiliary-space", availability: [{ ...problem.day }] },
  );
  problem.resources.push({ id: "limited-availability-resource", availability: [{ start: hm("09:00"), end: hm("10:00") }], presencePreference: "HIGH" });
  const auxiliary: Task[] = [
    { id: "a-flexible-1", kind: "auxiliary", participantId: "participant-a", duration: 5, spaceId: "flexible-auxiliary-space", dependencies: [] },
    { id: "b-flexible-2", kind: "auxiliary", participantId: "participant-h", duration: 5, spaceId: "flexible-auxiliary-space", dependencies: [] },
    { id: "z-scarce-1", kind: "auxiliary", participantId: "participant-c", duration: 15, spaceId: "fixed-auxiliary-space", dependencies: [], requiredResourceIds: ["limited-availability-resource"] },
    { id: "y-scarce-2", kind: "auxiliary", participantId: "participant-d", duration: 15, spaceId: "fixed-auxiliary-space", dependencies: [], requiredResourceIds: ["limited-availability-resource"] },
  ];
  problem.tasks.push(...auxiliary);
  problem.auxiliaryPolicy = { participantPresencePreference: preference };
  problem.budget.maxBranchExpansions = 50_000;
  return problem;
}
